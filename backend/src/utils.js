/**
 * SharePoint Mirror — Utility Functions
 *
 * Path sanitization, SHA-256 hashing, filename conflict resolution,
 * sleep helper, and other shared utilities.
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync } from 'fs';
import { basename, extname, dirname, resolve, join, relative } from 'path';
import config from '../config.js';

// ── Sleep ──────────────────────────────────────────────────────────

/**
 * Promise-based delay.
 * @param {number} ms Milliseconds to wait
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Hashing ────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hex digest of a file on disk.
 * @param {string} filePath Absolute path to the file
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function sha256File(filePath) {
    const data = readFileSync(filePath);
    return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute the SHA-256 hex digest of a Buffer.
 * @param {Buffer} buffer
 * @returns {string}
 */
export function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

// ── Filename Sanitization ──────────────────────────────────────────

/**
 * Sanitize a filename for safe use on Windows/macOS/Linux filesystems.
 *
 * - Replaces illegal characters with `_`
 * - Truncates overly long names (preserving extension)
 * - Returns both the sanitized name and whether any changes were made
 *
 * @param {string} name Original filename
 * @returns {{ sanitized: string, wasModified: boolean }}
 */
export function sanitizeFilename(name) {
    if (!name) return { sanitized: '_unnamed_', wasModified: true };

    let sanitized = name.replace(config.illegalChars, '_');

    // Trim trailing dots and spaces (Windows issue)
    sanitized = sanitized.replace(/[. ]+$/, '');

    // Handle overly long names
    let wasModified = sanitized !== name;
    if (sanitized.length > config.maxFilenameLength) {
        const ext = extname(sanitized);
        const stem = sanitized.slice(0, config.maxFilenameLength - ext.length - 9); // leave room for hash
        const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
        sanitized = `${stem}_${hash}${ext}`;
        wasModified = true;
    }

    // Prevent empty name after sanitization
    if (sanitized.length === 0) {
        sanitized = '_unnamed_';
        wasModified = true;
    }

    return { sanitized, wasModified };
}

/**
 * Resolve a unique local filename, appending _2, _3, etc. if conflicts exist.
 *
 * @param {string} dirPath Directory where the file will live
 * @param {string} fileName Desired filename
 * @returns {string} Unique filename (just the name, not the full path)
 */
export function resolveUniqueFilename(dirPath, fileName) {
    const fullPath = join(dirPath, fileName);
    if (!existsSync(fullPath)) return fileName;

    const ext = extname(fileName);
    const stem = basename(fileName, ext);
    let counter = 2;
    let candidate;
    do {
        candidate = `${stem}_${counter}${ext}`;
        counter++;
    } while (existsSync(join(dirPath, candidate)));

    return candidate;
}

// ── Path Helpers ───────────────────────────────────────────────────

/**
 * Convert a SharePoint server-relative URL to a local mirror path.
 * Strips the library prefix so only the relative internal structure remains.
 *
 * Example:
 *   serverRelUrl = "/sites/marketing/Shared Documents/Reports/Q1/file.pdf"
 *   libraryPath  = "/sites/marketing/Shared Documents"
 *   result       = "Reports/Q1/file.pdf"
 *
 * @param {string} serverRelUrl Full server-relative URL from SharePoint
 * @param {string} libraryPath  Server-relative path of the document library root
 * @returns {string} Path relative to the mirror root
 */
export function toLocalRelativePath(serverRelUrl, libraryPath) {
    // Normalize: ensure no trailing slash on library path
    const normalizedLib = libraryPath.replace(/\/+$/, '');
    let rel = serverRelUrl;
    if (rel.startsWith(normalizedLib)) {
        rel = rel.slice(normalizedLib.length);
    }
    // Remove leading slash
    rel = rel.replace(/^\/+/, '');
    return rel;
}

/**
 * Build the full local path for a file, ensuring it stays inside the mirror root.
 *
 * @param {string} relativePath Path relative to mirror root
 * @returns {string} Absolute path inside the mirror directory
 * @throws {Error} If the resolved path escapes the mirror root
 */
export function toLocalAbsolutePath(relativePath) {
    const abs = resolve(config.mirrorDir, relativePath);
    const mirrorAbs = resolve(config.mirrorDir);
    if (!abs.startsWith(mirrorAbs)) {
        throw new Error(`Path traversal detected: "${relativePath}" resolves outside mirror root`);
    }
    return abs;
}

/**
 * Sanitize all segments in a relative path (each folder name and the filename).
 *
 * @param {string} relativePath e.g. "Reports/Q1 Summary/file<name>.pdf"
 * @returns {{ sanitized: string, modifications: Array<{original: string, replaced: string}> }}
 */
export function sanitizeRelativePath(relativePath) {
    const segments = relativePath.split('/');
    const modifications = [];
    const sanitizedSegments = segments.map(seg => {
        const { sanitized, wasModified } = sanitizeFilename(seg);
        if (wasModified) {
            modifications.push({ original: seg, replaced: sanitized });
        }
        return sanitized;
    });
    return {
        sanitized: sanitizedSegments.join('/'),
        modifications,
    };
}

// ── SharePoint URL helpers ─────────────────────────────────────────

/**
 * Build a SharePoint REST API URL for listing folder contents.
 *
 * @param {string} siteUrl  e.g. "https://contoso.sharepoint.com/sites/marketing"
 * @param {string} folderServerRelUrl e.g. "/sites/marketing/Shared Documents"
 * @returns {string} Full API URL
 */
export function buildFolderApiUrl(siteUrl, folderServerRelUrl) {
    const encoded = encodeURIComponent(folderServerRelUrl);
    return `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encoded}')?$expand=Folders,Files`;
}

/**
 * Build a SharePoint REST API URL for downloading a file's binary content.
 *
 * @param {string} siteUrl
 * @param {string} fileServerRelUrl
 * @returns {string}
 */
export function buildFileDownloadUrl(siteUrl, fileServerRelUrl) {
    const encoded = encodeURIComponent(fileServerRelUrl);
    return `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${encoded}')/$value`;
}

/**
 * Build API URL for listing only files in a folder (for pagination fallback).
 *
 * @param {string} siteUrl
 * @param {string} folderServerRelUrl
 * @param {number} top
 * @returns {string}
 */
export function buildFilesOnlyUrl(siteUrl, folderServerRelUrl, top = 5000) {
    const encoded = encodeURIComponent(folderServerRelUrl);
    return `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Files?$top=${top}`;
}

/**
 * Build API URL for listing only subfolders (for pagination fallback).
 *
 * @param {string} siteUrl
 * @param {string} folderServerRelUrl
 * @param {number} top
 * @returns {string}
 */
export function buildFoldersOnlyUrl(siteUrl, folderServerRelUrl, top = 5000) {
    const encoded = encodeURIComponent(folderServerRelUrl);
    return `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Folders?$top=${top}`;
}

// ── Formatting ─────────────────────────────────────────────────────

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2);
    return `${val} ${units[i]}`;
}

/**
 * Format milliseconds into a human-readable duration.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return `${mins}m ${secs}s`;
}
