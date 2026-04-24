/**
 * SharePoint Mirror — Express Route Handlers
 *
 * All API endpoints grouped in a single Express router.
 * Mounted by main.js at /api.
 */

import { Router } from 'express';
import path from 'path';
import { discoverLibrary } from './discovery.js';
import { connectToBrowser, detectLibrary, detectLibraryFromUrl } from './browser.js';
import { downloadAll } from './downloader.js';
import logger from './logger.js';

/**
 * Create and return the API router.
 * @param {import('./core/db.js').StateStore} stateStore
 * @returns {Router}
 */
export function createRouter(stateStore) {
    const router = Router();

    // ── Helpers ────────────────────────────────────────────────────

    async function getSharePointPage() {
        const browser = await connectToBrowser(9222);
        const contexts = browser.contexts();
        for (const ctx of contexts) {
            for (const page of ctx.pages()) {
                const url = page.url();
                if (
                    url.includes('.sharepoint.com') ||
                    url.includes('.sharepoint.us') ||
                    url.includes('deloitteonline.com')
                ) {
                    return { browser, page };
                }
            }
        }
        throw new Error('No SharePoint tab found');
    }

    // ── Jobs CRUD ─────────────────────────────────────────────────

    router.post('/jobs', async (req, res) => {
        try {
            const { target_path, url } = req.body;
            const { page } = await getSharePointPage();

            let siteUrl, libraryPath;
            if (url) {
                const detected = await detectLibraryFromUrl(url, page);
                siteUrl = detected.siteUrl;
                libraryPath = detected.libraryPath;
            } else {
                const detected = await detectLibrary(page);
                siteUrl = detected.siteUrl;
                libraryPath = detected.libraryPath;
            }

            const defaultTarget = path.join(process.cwd(), 'data', 'mirror');
            const jobId = stateStore.createJob(siteUrl, libraryPath, target_path || defaultTarget);
            res.json({ jobId, siteUrl, libraryPath });
        } catch (err) {
            if (!res.headersSent) res.status(500).json({ error: err.message });
        }
    });

    router.get('/jobs', (_req, res) => {
        res.json(stateStore.getAllJobs());
    });

    router.get('/jobs/:id', (req, res) => {
        const job = stateStore.getJob(parseInt(req.params.id));
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json(job);
    });

    // ── Scan (Discovery) ──────────────────────────────────────────

    router.post('/jobs/:id/scan', async (req, res) => {
        const jobId = parseInt(req.params.id);
        const job = stateStore.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        stateStore.updateJobStatus(jobId, 'SCANNING');
        res.json({ status: 'SCANNING' });

        // Run discovery asynchronously
        setTimeout(async () => {
            try {
                const { page } = await getSharePointPage();
                await discoverLibrary(page, job.site_url, job.library, stateStore, jobId);
                stateStore.updateJobStatus(jobId, 'READY');
            } catch (err) {
                logger.error(err.message);
                stateStore.logEvent(jobId, 'discovery', job.library, 'error', err.message);
                stateStore.updateJobStatus(jobId, 'COMPLETED_WITH_ERRORS');
            }
        }, 0);
    });

    // ── Tree (Folders + Files) ────────────────────────────────────

    router.get('/jobs/:id/tree', (req, res) => {
        const jobId = parseInt(req.params.id);
        const folders = stateStore.getAllFolders(jobId);
        const files = stateStore.getAllFiles(jobId);
        res.json({ folders, files });
    });

    // ── Selection ─────────────────────────────────────────────────

    router.post('/jobs/:id/items/select', (req, res) => {
        const jobId = parseInt(req.params.id);
        const { folderUrl, selected } = req.body;
        stateStore.selectFolder(jobId, folderUrl, selected);
        res.json({ success: true });
    });

    // ── Download ──────────────────────────────────────────────────

    router.post('/jobs/:id/start', async (req, res) => {
        const jobId = parseInt(req.params.id);
        const job = stateStore.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        stateStore.updateJobStatus(jobId, 'DOWNLOADING');
        res.json({ status: 'DOWNLOADING' });

        // Run download asynchronously
        setTimeout(async () => {
            try {
                const { page } = await getSharePointPage();
                await downloadAll(page, job.site_url, job.target_path, stateStore, jobId);
                stateStore.updateJobStatus(jobId, 'COMPLETED');
            } catch (err) {
                logger.error(err.message);
                stateStore.updateJobStatus(jobId, 'COMPLETED_WITH_ERRORS');
            }
        }, 0);
    });

    // ── Progress ──────────────────────────────────────────────────

    router.get('/jobs/:id/progress', (req, res) => {
        const jobId = parseInt(req.params.id);
        const job = stateStore.getJob(jobId);
        const stats = stateStore.getFileStats(jobId);
        const events = stateStore.getEvents(jobId);
        res.json({ job, stats, events });
    });

    router.delete('/jobs/clear', (req, res) => {
        try {
            stateStore.clearFinishedJobs();
            res.json({ status: 'OK' });
        } catch (err) {
            logger.error(`Failed to clear jobs: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
