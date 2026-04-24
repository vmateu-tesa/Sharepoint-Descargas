/**
 * SharePoint Mirror — Download Engine (Refactored for Backend)
 */

import { join } from 'path';
import { mkdirSync, writeFileSync, renameSync, rmSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { sha256File as generateSha256File, sanitizeFilename } from './utils.js';
import { downloadFileSmall, extractCookieHeader } from './browser.js';
import logger from './logger.js';
import config from '../config.js';

export async function downloadAll(page, siteUrl, targetBaseDir, state, jobId) {
    logger.info('(download) Starting download phase...', { jobId });

    let pendingFiles = state.getFilesToDownload(jobId, 50);
    logger.info(`(download) Found ${pendingFiles.length} files to download`, { jobId });

    while (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
            try {
                logger.info(`(download) Processing file: ${file.name}`, { jobId, url: file.server_relative_url });
                await downloadSingleFile(page, siteUrl, targetBaseDir, file, state, jobId);
                logger.info(`(download) Successfully processed: ${file.name}`, { jobId });
            } catch (err) {
                logger.error(`Failed to download ${file.name}: ${err.message}`, { stack: err.stack });
                state.updateFileStatus(jobId, file.server_relative_url, 'FAILED', err.message);
                state.logEvent(jobId, 'download', file.server_relative_url, 'error', err.message);
            }
        }
        pendingFiles = state.getFilesToDownload(jobId, 50);
        logger.info(`(download) Next batch: ${pendingFiles.length} files`, { jobId });
    }
    logger.info('(download) Download phase complete', { jobId });
}

async function downloadSingleFile(page, siteUrl, targetBaseDir, file, state, jobId) {
    state.updateFileStatus(jobId, file.server_relative_url, 'RUNNING');

    // Remove site/library prefix from folderUrl to mirror correctly
    // Simple heuristic: just use the folder structure after the library name
    const pathParts = file.folder_url.split('/');
    // e.g., /sites/site/Shared Documents/Folder/Subfolder -> Folder/Subfolder
    // This could be improved, but for now we'll just use the raw folder_url structure relative to C:
    // Actually, let's clean it by removing /sites/site/Library
    const libraryRootMatch = file.folder_url.match(/(\/sites\/[^/]+\/[^/]+)(.*)/i);
    let relativePath = file.folder_url;
    if (libraryRootMatch) {
        relativePath = libraryRootMatch[2];
        if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
    }
    
    const localDir = join(targetBaseDir, relativePath);
    const localFile = join(localDir, sanitizeFilename(file.name).sanitized);
    const localPartial = `${localFile}.partial`;

    mkdirSync(localDir, { recursive: true });

    const apiUrl = `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${file.server_relative_url}')/$value`;

    let downloadedSize = 0;

    if (file.size_bytes < config.largeFileThreshold) {
        const result = await downloadFileSmall(page, apiUrl);
        const buf = Buffer.from(result.base64, 'base64');
        writeFileSync(localPartial, buf);
        downloadedSize = result.size;
    } else {
        const parsedUrl = new URL(siteUrl);
        const cookieHeader = await extractCookieHeader(page, parsedUrl.hostname);
        
        const resp = await fetch(apiUrl, {
            headers: { 'Cookie': cookieHeader }
        });

        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);

        const fileStream = createWriteStream(localPartial);
        await pipeline(resp.body, fileStream);
        downloadedSize = file.size_bytes; // Approximate
    }

    const sha256 = await generateSha256File(localPartial);
    renameSync(localPartial, localFile);

    state.markFileDownloaded(jobId, file.server_relative_url, localFile, downloadedSize, sha256);
    logger.info(`Downloaded: ${file.name}`);
}
