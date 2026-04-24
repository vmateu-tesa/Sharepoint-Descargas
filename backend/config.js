/**
 * SharePoint Mirror — Central Configuration
 *
 * All tunables live here with sensible defaults.
 * CLI arguments (parsed in index.js) override these values at runtime.
 */

import { resolve } from 'path';

const config = {
    // ── Browser / CDP ──────────────────────────────────────────────
    /** Chrome DevTools Protocol port for connectOverCDP */
    cdpPort: 9222,

    // ── Concurrency & Throttling ───────────────────────────────────
    /** Max parallel downloads (1 is safest for SP throttling) */
    concurrency: 1,
    /** Milliseconds to wait between consecutive API requests */
    delayBetweenRequests: 1000,
    /** Milliseconds to wait between consecutive file downloads */
    delayBetweenDownloads: 1500,

    // ── Timeouts ───────────────────────────────────────────────────
    /** Per-file download timeout in milliseconds */
    downloadTimeout: 120_000,
    /** Per API call timeout in milliseconds */
    apiTimeout: 30_000,

    // ── Retry ──────────────────────────────────────────────────────
    /** Maximum retry attempts per file */
    maxRetries: 3,
    /** Exponential backoff base in milliseconds */
    backoffBase: 5_000,
    /** Maximum backoff cap in milliseconds */
    maxBackoff: 60_000,
    /** Minimum wait when receiving a 429 Too Many Requests */
    throttleMinWait: 30_000,

    // ── Download Strategy ──────────────────────────────────────────
    /**
     * Files smaller than this threshold (bytes) are downloaded via
     * page.evaluate() → base64.  Larger files use cookie-forwarding
     * and Node.js native fetch for streaming.
     */
    largeFileThreshold: 10 * 1024 * 1024, // 10 MB

    // ── Discovery ──────────────────────────────────────────────────
    /** SharePoint system folders to skip during traversal */
    systemFolders: ['Forms', '_catalogs', '_cts', '_private', '_vti_pvt'],
    /** Max items per page when paginating REST responses */
    pageSize: 5000,

    // ── Checkpoint ─────────────────────────────────────────────────
    /** Interval between artifact snapshot flushes (ms) */
    checkpointInterval: 60_000,

    // ── Output Paths ───────────────────────────────────────────────
    /** Root directory for all output artifacts */
    dataDir: resolve('./data'),
    /** Directory for the mirrored file hierarchy */
    mirrorDir: resolve('./data/mirror'),
    /** SQLite database path */
    dbPath: resolve('./data/state.db'),
    /** Inventory JSON path */
    inventoryPath: resolve('./data/inventory.json'),
    /** Manifest CSV path */
    manifestPath: resolve('./data/manifest.csv'),
    /** Log files directory */
    logsDir: resolve('./data/logs'),
    /** Screenshots directory */
    screenshotsDir: resolve('./data/screenshots'),

    // ── Filename Sanitization ──────────────────────────────────────
    /** Maximum filename length (characters) before truncation */
    maxFilenameLength: 200,
    /** Characters illegal on Windows that get replaced with '_' */
    illegalChars: /[<>:"/\\|?*\x00-\x1f]/g,
};

export default config;
