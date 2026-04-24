/**
 * SharePoint Mirror — StateStore Tests
 *
 * Unit tests for the active SQLite state persistence layer (core/db.js)
 * using an in-memory database.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// Ensure logs dir exists for logger initialisation
mkdirSync(resolve('./test-data-tmp/logs'), { recursive: true });

import { StateStore } from '../backend/src/core/db.js';

describe('StateStore', () => {
    let store;

    beforeEach(() => {
        store = new StateStore(':memory:');
    });

    // ── Jobs ──────────────────────────────────────────────────────

    describe('Jobs', () => {
        it('should create a job and retrieve it', () => {
            const id = store.createJob(
                'https://contoso.sharepoint.com/sites/test',
                '/sites/test/Shared Documents',
                'C:\\mirror'
            );
            assert.ok(id > 0);

            const job = store.getJob(id);
            assert.equal(job.site_url, 'https://contoso.sharepoint.com/sites/test');
            assert.equal(job.library, '/sites/test/Shared Documents');
            assert.equal(job.target_path, 'C:\\mirror');
            assert.equal(job.status, 'CREATED');
        });

        it('should list all jobs in descending order', () => {
            store.createJob('https://a.sharepoint.com', '/a', 'C:\\a');
            store.createJob('https://b.sharepoint.com', '/b', 'C:\\b');

            const jobs = store.getAllJobs();
            assert.equal(jobs.length, 2);
            assert.equal(jobs[0].site_url, 'https://b.sharepoint.com');
            assert.equal(jobs[1].site_url, 'https://a.sharepoint.com');
        });

        it('should update job status', () => {
            const id = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
            store.updateJobStatus(id, 'SCANNING');

            const job = store.getJob(id);
            assert.equal(job.status, 'SCANNING');
            assert.equal(job.finished_at, null);
        });

        it('should set finished_at when status is terminal', () => {
            const id = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
            store.updateJobStatus(id, 'COMPLETED');

            const job = store.getJob(id);
            assert.equal(job.status, 'COMPLETED');
            assert.ok(job.finished_at);
        });
    });

    // ── Folders ───────────────────────────────────────────────────

    describe('Folders', () => {
        let jobId;

        beforeEach(() => {
            jobId = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
        });

        it('should insert a folder', () => {
            store.insertFolder(jobId, '/docs/Reports', 'Reports', '/docs', 1);
            const folders = store.getPendingFolders(jobId);
            assert.equal(folders.length, 1);
            assert.equal(folders[0].name, 'Reports');
            assert.equal(folders[0].depth, 1);
            assert.equal(folders[0].selected, 0);
        });

        it('should not duplicate folders (upsert)', () => {
            store.insertFolder(jobId, '/docs/Reports', 'Reports', '/docs', 1);
            store.insertFolder(jobId, '/docs/Reports', 'Reports', '/docs', 1);
            const folders = store.getPendingFolders(jobId);
            assert.equal(folders.length, 1);
        });

        it('should mark a folder as DISCOVERED', () => {
            store.insertFolder(jobId, '/docs/Reports', 'Reports', '/docs', 1);
            store.updateFolderStatus(jobId, '/docs/Reports', 'DISCOVERED');

            const pending = store.getPendingFolders(jobId);
            assert.equal(pending.length, 0);

            const all = store.getAllFolders(jobId);
            assert.equal(all[0].status, 'DISCOVERED');
        });

        it('should mark a folder as FAILED with error', () => {
            store.insertFolder(jobId, '/docs/Reports', 'Reports', '/docs', 1);
            store.updateFolderStatus(jobId, '/docs/Reports', 'FAILED', 'Timeout');

            const all = store.getAllFolders(jobId);
            assert.equal(all[0].status, 'FAILED');
            assert.equal(all[0].error_message, 'Timeout');
        });

        it('should return pending folders ordered by depth (BFS)', () => {
            store.insertFolder(jobId, '/docs/Deep/Sub', 'Sub', '/docs/Deep', 2);
            store.insertFolder(jobId, '/docs/Shallow', 'Shallow', '/docs', 1);

            const folders = store.getPendingFolders(jobId);
            assert.equal(folders[0].depth, 1);
            assert.equal(folders[1].depth, 2);
        });

        it('should return all folders including discovered', () => {
            store.insertFolder(jobId, '/docs/A', 'A', '/docs', 1);
            store.insertFolder(jobId, '/docs/B', 'B', '/docs', 1);
            store.updateFolderStatus(jobId, '/docs/A', 'DISCOVERED');

            const all = store.getAllFolders(jobId);
            assert.equal(all.length, 2);
        });
    });

    // ── Files ─────────────────────────────────────────────────────

    describe('Files', () => {
        let jobId;

        beforeEach(() => {
            jobId = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
        });

        it('should insert a file', () => {
            store.insertFile(jobId, '/docs/file.pdf', 'file.pdf', '/docs', 1024, '2024-01-01', '"etag"');
            const files = store.getAllFiles(jobId);
            assert.equal(files.length, 1);
            assert.equal(files[0].name, 'file.pdf');
            assert.equal(files[0].size_bytes, 1024);
            assert.equal(files[0].status, 'PENDING');
            assert.equal(files[0].selected, 0);
        });

        it('should not duplicate files (upsert)', () => {
            store.insertFile(jobId, '/docs/file.pdf', 'file.pdf', '/docs', 1024, null, null);
            store.insertFile(jobId, '/docs/file.pdf', 'file.pdf', '/docs', 1024, null, null);
            const files = store.getAllFiles(jobId);
            assert.equal(files.length, 1);
        });

        it('should update file status', () => {
            store.insertFile(jobId, '/docs/file.pdf', 'file.pdf', '/docs', 1024, null, null);
            store.updateFileStatus(jobId, '/docs/file.pdf', 'RUNNING');

            const file = store.getAllFiles(jobId).find(f => f.server_relative_url === '/docs/file.pdf');
            assert.equal(file.status, 'RUNNING');
        });

        it('should mark file as downloaded with metadata', () => {
            const url = '/docs/file.pdf';
            store.insertFile(jobId, url, 'file.pdf', '/docs', 1024, null, null);
            store.markFileDownloaded(jobId, url, 'C:\\mirror\\file.pdf', 1024, 'abc123hash');

            const file = store.getAllFiles(jobId).find(f => f.server_relative_url === url);
            assert.equal(file.status, 'SUCCESS');
            assert.equal(file.local_path, 'C:\\mirror\\file.pdf');
            assert.equal(file.sha256, 'abc123hash');
            assert.ok(file.downloaded_at);
        });

        it('should only return selected files with PENDING/SELECTED/RETRYING status for download', () => {
            store.insertFile(jobId, '/docs/a.pdf', 'a.pdf', '/docs', 100, null, null);
            store.insertFile(jobId, '/docs/b.pdf', 'b.pdf', '/docs', 200, null, null);

            // Neither is selected — should return 0
            let files = store.getFilesToDownload(jobId, 50);
            assert.equal(files.length, 0);

            // Select folder → selects files and changes status to SELECTED
            store.insertFolder(jobId, '/docs', 'docs', null, 0);
            store.selectFolder(jobId, '/docs', true);

            files = store.getFilesToDownload(jobId, 50);
            assert.equal(files.length, 2);
            assert.equal(files[0].status, 'SELECTED');
        });
    });

    // ── Folder Selection ──────────────────────────────────────────

    describe('Folder Selection', () => {
        let jobId;

        beforeEach(() => {
            jobId = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
        });

        it('should select a folder and all its children recursively', () => {
            store.insertFolder(jobId, '/docs', 'docs', null, 0);
            store.insertFolder(jobId, '/docs/A', 'A', '/docs', 1);
            store.insertFolder(jobId, '/docs/A/Sub', 'Sub', '/docs/A', 2);
            store.insertFile(jobId, '/docs/A/file1.pdf', 'file1.pdf', '/docs/A', 100, null, null);
            store.insertFile(jobId, '/docs/A/Sub/file2.pdf', 'file2.pdf', '/docs/A/Sub', 200, null, null);

            store.selectFolder(jobId, '/docs/A', true);

            const folders = store.getAllFolders(jobId);
            const selectedFolders = folders.filter(f => f.selected === 1);
            // Should select /docs/A and /docs/A/Sub (but NOT /docs root)
            assert.equal(selectedFolders.length, 2);

            const files = store.getAllFiles(jobId);
            const selectedFiles = files.filter(f => f.selected === 1);
            assert.equal(selectedFiles.length, 2);
        });

        it('should deselect a folder and its children', () => {
            store.insertFolder(jobId, '/docs/A', 'A', '/docs', 1);
            store.insertFile(jobId, '/docs/A/file.pdf', 'file.pdf', '/docs/A', 100, null, null);

            store.selectFolder(jobId, '/docs/A', true);
            store.selectFolder(jobId, '/docs/A', false);

            const folders = store.getAllFolders(jobId);
            assert.equal(folders[0].selected, 0);

            const files = store.getAllFiles(jobId);
            assert.equal(files[0].selected, 0);
            assert.equal(files[0].status, 'PENDING'); // reverted from SELECTED
        });
    });

    // ── Stats ─────────────────────────────────────────────────────

    describe('Stats', () => {
        it('should compute file stats grouped by status', () => {
            const jobId = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
            store.insertFile(jobId, '/docs/a.pdf', 'a.pdf', '/docs', 100, null, null);
            store.insertFile(jobId, '/docs/b.pdf', 'b.pdf', '/docs', 200, null, null);
            store.insertFile(jobId, '/docs/c.pdf', 'c.pdf', '/docs', 300, null, null);

            store.markFileDownloaded(jobId, '/docs/a.pdf', 'a.pdf', 100, 'hash');
            store.updateFileStatus(jobId, '/docs/b.pdf', 'FAILED', 'err');

            const stats = store.getFileStats(jobId);
            assert.equal(stats.SUCCESS, 1);
            assert.equal(stats.FAILED, 1);
            assert.equal(stats.PENDING, 1);
            assert.equal(stats.total, 3);
        });
    });

    // ── Events ────────────────────────────────────────────────────

    describe('Events', () => {
        it('should log and retrieve events', () => {
            const jobId = store.createJob('https://test.sharepoint.com', '/docs', 'C:\\mirror');
            store.logEvent(jobId, 'discovery', '/docs/folder', 'info', 'Folder discovered');
            store.logEvent(jobId, 'download', '/docs/file.pdf', 'error', 'Download failed');

            const events = store.getEvents(jobId);
            assert.equal(events.length, 2);
            // Events are returned in descending order
            assert.equal(events[0].level, 'error');
            assert.equal(events[1].level, 'info');
        });
    });
});
