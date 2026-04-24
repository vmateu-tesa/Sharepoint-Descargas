/**
 * SharePoint Mirror — Discovery Engine (Refactored for Backend)
 */

import { buildFolderApiUrl, sanitizeFilename } from './utils.js';
import logger from './logger.js';
import { apiGet } from './browser.js';
import config from '../config.js';

export async function discoverLibrary(page, siteUrl, libraryPath, state, jobId) {
    logger.info('(discovery) Starting discovery phase...', { jobId, libraryPath });
    state.insertFolder(jobId, libraryPath, libraryPath.split('/').pop() || 'Root', null, 0);

    let pendingFolders = state.getPendingFolders(jobId);
    while (pendingFolders.length > 0) {
        for (const folder of pendingFolders) {
            try {
                await processFolder(page, siteUrl, folder, state, jobId);
            } catch (err) {
                logger.error(`Failed to process folder ${folder.server_relative_url}: ${err.message}`);
                state.updateFolderStatus(jobId, folder.server_relative_url, 'FAILED', err.message);
                state.logEvent(jobId, 'discovery', folder.server_relative_url, 'error', err.message);
            }
        }
        pendingFolders = state.getPendingFolders(jobId);
    }

    logger.info('(discovery) Discovery phase complete', { jobId });
}

async function processFolder(page, siteUrl, folder, state, jobId) {
    const apiUrl = buildFolderApiUrl(siteUrl, folder.server_relative_url);
    const result = await fetchFolderContents(page, apiUrl);

    const folders = result.d?.Folders?.results || [];
    const files = result.d?.Files?.results || [];

    for (const f of folders) {
        if (f.Name === 'Forms') continue;
        state.insertFolder(jobId, f.ServerRelativeUrl, f.Name, folder.server_relative_url, folder.depth + 1);
    }

    for (const f of files) {
        const sizeBytes = parseInt(f.Length, 10) || 0;
        state.insertFile(
            jobId,
            f.ServerRelativeUrl,
            f.Name,
            folder.server_relative_url,
            sizeBytes,
            f.TimeLastModified,
            f.ETag
        );
    }

    state.updateFolderStatus(jobId, folder.server_relative_url, 'DISCOVERED');
    logger.info(`(discovery) Processed folder: ${folder.server_relative_url}`, {
        folders: folders.length,
        files: files.length
    });
}

async function fetchFolderContents(page, apiUrl) {
    return apiGet(page, apiUrl);
}
