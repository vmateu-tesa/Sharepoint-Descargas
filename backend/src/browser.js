/**
 * SharePoint Mirror — Browser Connection (Playwright CDP)
 *
 * Connects to an existing Chrome/Edge session via CDP,
 * finds the SharePoint tab, and provides API call helpers
 * that execute fetch() inside the authenticated page context.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import config from '../config.js';
import logger from './logger.js';

let globalBrowser = null;

/**
 * Connect to an existing browser via Chrome DevTools Protocol.
 * @param {number} [port] CDP port (default from config)
 * @returns {Promise<import('playwright').Browser>}
 */
export async function connectToBrowser(port) {
    if (globalBrowser && globalBrowser.isConnected()) {
        return globalBrowser;
    }
    const cdpPort = port || config.cdpPort;
    const endpoint = `http://127.0.0.1:${cdpPort}`;
    logger.info(`Connecting to browser at ${endpoint}...`);

    try {
        globalBrowser = await chromium.connectOverCDP(endpoint);
        logger.info('Connected to browser via CDP');
        return globalBrowser;
    } catch (err) {
        logger.error(`Failed to connect to browser. Ensure Chrome/Edge is running with --remote-debugging-port=${cdpPort}`);
        throw err;
    }
}

/**
 * Find the first tab that has a SharePoint URL open.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<import('playwright').Page>}
 */
export async function findSharePointTab(browser) {
    const contexts = browser.contexts();
    for (const ctx of contexts) {
        const pages = ctx.pages();
        for (const page of pages) {
            const url = page.url();
            if (url.includes('.sharepoint.com') || url.includes('.sharepoint.us') || url.includes('.deloitteonline.com')) {
                logger.info(`Found SharePoint tab: ${url}`);
                return page;
            }
        }
    }
    throw new Error('No SharePoint tab found. Please navigate to your SharePoint library first.');
}

/**
 * Detect the SharePoint site URL and library path from the current page URL.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ siteUrl: string, libraryPath: string, origin: string }>}
 */
export async function detectLibrary(page) {
    const pageUrl = page.url();
    const parsed = new URL(pageUrl);
    const origin = parsed.origin;

    // Extract site URL: everything up to and including /sites/sitename
    const siteMatch = parsed.pathname.match(/^(\/sites\/[^/]+)/i)
        || parsed.pathname.match(/^(\/teams\/[^/]+)/i);

    let sitePath = '';
    if (siteMatch) {
        sitePath = siteMatch[1];
    }
    const siteUrl = `${origin}${sitePath}`;

    // Detect the library path by querying the page for the current library
    let libraryPath;
    try {
        libraryPath = await page.evaluate(async (sUrl) => {
            // Check for explicit folder in URL
            const params = new URLSearchParams(window.location.search);
            const rootFolder = params.get('RootFolder') || params.get('id');
            if (rootFolder) {
                // If it's a specific folder, we can return it directly or find its library root
                // For mirroring, starting at the current folder is often desired
                return decodeURIComponent(rootFolder);
            }

            if (window.ctx && window.ctx.listUrlDir) {
                return decodeURIComponent(window.ctx.listUrlDir);
            }

            // Fallback: query API
            const resp = await fetch(`${sUrl}/_api/web/lists?$filter=Hidden eq false and BaseTemplate eq 101&$select=RootFolder/ServerRelativeUrl&$expand=RootFolder`, {
                headers: { 'Accept': 'application/json;odata=verbose' },
                credentials: 'include'
            });
            const data = await resp.json();
            const lists = data.d.results;
            const currentPath = window.location.pathname;
            for (const list of lists) {
                const rootUrl = list.RootFolder.ServerRelativeUrl;
                if (currentPath.includes(rootUrl.split('/').pop())) {
                    return rootUrl;
                }
            }
            if (lists.length > 0) return lists[0].RootFolder.ServerRelativeUrl;
            return null;
        }, siteUrl);
    } catch {
        libraryPath = null;
    }

    // If detection failed, try common defaults
    if (!libraryPath) {
        // Check if URL contains a known library path pattern
        const pathParts = parsed.pathname.split('/');
        const formsIdx = pathParts.indexOf('Forms');
        if (formsIdx > 0) {
            libraryPath = pathParts.slice(0, formsIdx).join('/');
        } else {
            // Default assumption: Shared Documents
            libraryPath = `${sitePath}/Shared Documents`;
        }
    }

    logger.info(`Detected SharePoint site: ${siteUrl}`);
    logger.info(`Detected library path: ${libraryPath}`);

    return { siteUrl, libraryPath, origin };
}

export async function detectLibraryFromUrl(urlStr, page) {
    const parsed = new URL(urlStr);
    const origin = parsed.origin;
    const siteMatch = parsed.pathname.match(/^(\/sites\/[^/]+)/i) || parsed.pathname.match(/^(\/teams\/[^/]+)/i);
    const sitePath = siteMatch ? siteMatch[1] : '';
    const siteUrl = `${origin}${sitePath}`;

    const params = parsed.searchParams;
    const rootFolder = params.get('RootFolder') || params.get('id');
    if (rootFolder) {
        const libPath = decodeURIComponent(rootFolder);
        logger.info(`Detected site from URL: ${siteUrl}, library: ${libPath}`);
        return { siteUrl, libraryPath: libPath, origin };
    }

    const pathParts = parsed.pathname.split('/');
    const formsIdx = pathParts.indexOf('Forms');
    if (formsIdx > 0) {
        const libPath = pathParts.slice(0, formsIdx).join('/');
        logger.info(`Detected site from URL: ${siteUrl}, library: ${libPath}`);
        return { siteUrl, libraryPath: libPath, origin };
    }

    // Try API fallback using existing page
    if (page) {
        try {
            const libPath = await page.evaluate(async ({ sUrl, pPath }) => {
                const resp = await fetch(`${sUrl}/_api/web/lists?$filter=Hidden eq false and BaseTemplate eq 101&$select=RootFolder/ServerRelativeUrl&$expand=RootFolder`, {
                    headers: { 'Accept': 'application/json;odata=verbose' },
                    credentials: 'include'
                });
                const data = await resp.json();
                for (const list of data.d.results) {
                    if (pPath.includes(list.RootFolder.ServerRelativeUrl.split('/').pop())) {
                        return list.RootFolder.ServerRelativeUrl;
                    }
                }
                return data.d.results.length > 0 ? data.d.results[0].RootFolder.ServerRelativeUrl : null;
            }, { sUrl: siteUrl, pPath: parsed.pathname });
            
            if (libPath) {
                logger.info(`Detected site from URL via API: ${siteUrl}, library: ${libPath}`);
                return { siteUrl, libraryPath: libPath, origin };
            }
        } catch (err) {}
    }

    const defaultLib = `${sitePath}/Shared Documents`;
    logger.info(`Fallback detected site: ${siteUrl}, library: ${defaultLib}`);
    return { siteUrl, libraryPath: defaultLib, origin };
}

/**
 * Execute a GET request to a SharePoint REST API endpoint via the page context.
 * Inherits the user's cookies and auth tokens automatically.
 *
 * @param {import('playwright').Page} page
 * @param {string} apiUrl Full API URL
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiGet(page, apiUrl) {
    const start = Date.now();

    const result = await page.evaluate(async (url) => {
        try {
            const resp = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json;odata=verbose' },
                credentials: 'include',
            });
            const status = resp.status;
            const statusText = resp.statusText;
            if (!resp.ok) {
                const body = await resp.text();
                return { error: true, status, statusText, body };
            }
            const data = await resp.json();
            return { error: false, status, data };
        } catch (err) {
            return { error: true, status: 0, statusText: err.message, body: '' };
        }
    }, apiUrl);

    const durationMs = Date.now() - start;

    if (result.error) {
        logger.logApiCall(apiUrl, result.status, durationMs, 0);
        const err = new Error(`API ${result.status} ${result.statusText}`);
        err.status = result.status;
        err.body = result.body;
        throw err;
    }

    logger.logApiCall(apiUrl, result.status, durationMs, JSON.stringify(result.data).length);
    return result.data;
}

/**
 * Download a file's binary content via the page context (for files < largeFileThreshold).
 * Returns the content as a base64-encoded string.
 *
 * @param {import('playwright').Page} page
 * @param {string} fileUrl Full download URL (_api/web/GetFileByServerRelativeUrl/.../$value)
 * @returns {Promise<{ base64: string, size: number }>}
 */
export async function downloadFileSmall(page, fileUrl) {
    return page.evaluate(async (url) => {
        const resp = await fetch(url, {
            method: 'GET',
            credentials: 'include',
        });
        if (!resp.ok) {
            throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
        }
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Convert to base64 in chunks to avoid call stack issues
        const chunkSize = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
        }
        return { base64: btoa(binary), size: bytes.length };
    }, fileUrl);
}

/**
 * Extract cookies from the browser context for use in Node.js-level HTTP requests.
 * Used for downloading large files via Node.js fetch/streams.
 *
 * @param {import('playwright').Page} page
 * @param {string} domain SharePoint domain
 * @returns {Promise<string>} Cookie header value
 */
export async function extractCookieHeader(page, domain) {
    const cookies = await page.context().cookies();
    const relevant = cookies.filter(c =>
        domain.includes(c.domain.replace(/^\./, ''))
    );
    return relevant.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * Capture a screenshot of the current page state (for failure diagnostics).
 *
 * @param {import('playwright').Page} page
 * @param {string} name Descriptive name (used in filename)
 * @returns {Promise<string>} Path to the saved screenshot
 */
export async function captureScreenshot(page, name) {
    mkdirSync(config.screenshotsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}_${ts}.png`;
    const filepath = join(config.screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    logger.info(`Screenshot saved: ${filepath}`);
    return filepath;
}
