/**
 * SharePoint Mirror — Backend Entry Point
 *
 * Bootstraps the Express server, initialises the database,
 * mounts the API router, and keeps the process alive.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { StateStore } from './src/core/db.js';
import { createRouter } from './src/routes.js';
import logger from './src/logger.js';

// ── Global Error Handlers ─────────────────────────────────────────

process.on('uncaughtException', (err) => {
    logger.error(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
    logger.error(`UNHANDLED REJECTION: ${reason}`);
});

process.on('exit', (code) => {
    logger.info(`PROCESS EXITING WITH CODE ${code}`);
});

// ── Initialise App ────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const stateStore = new StateStore(path.join(process.cwd(), 'data', 'app.db'));

app.use('/api', createRouter(stateStore));

// ── Start Server ──────────────────────────────────────────────────

const PORT = 3000;
const server = app.listen(PORT, () => {
    logger.info(`Backend API running on http://localhost:${PORT}`);
});

// Keep the event loop alive — some native modules (better-sqlite3, Playwright)
// can unref all handles causing Node to exit prematurely.
const keepAlive = setInterval(() => {}, 30000);
server.on('close', () => clearInterval(keepAlive));
