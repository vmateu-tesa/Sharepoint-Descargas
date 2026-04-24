/**
 * SharePoint Mirror — Structured Logger
 *
 * Winston-based logger with:
 *  - JSON format to console (colorized) and file
 *  - Timestamped, rotating log files under data/logs/
 *  - Separate error log file
 */

import { createLogger, format, transports } from 'winston';
import { mkdirSync } from 'fs';
import { join } from 'path';
import config from '../config.js';

const { combine, timestamp, printf, colorize, errors } = format;

// Ensure logs directory exists
mkdirSync(config.logsDir, { recursive: true });

// Human-readable format for console
const consoleFormat = printf(({ level, message, timestamp, phase, url, ...rest }) => {
    let line = `${timestamp} [${level}]`;
    if (phase) line += ` (${phase})`;
    line += ` ${message}`;
    if (url) line += `  → ${url}`;
    // Append any extra fields
    const extras = Object.keys(rest).filter(k => !['splat', 'Symbol(splat)'].includes(k));
    if (extras.length > 0) {
        const obj = {};
        extras.forEach(k => { obj[k] = rest[k]; });
        line += `  ${JSON.stringify(obj)}`;
    }
    return line;
});

// JSON format for file logs
const fileFormat = combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    errors({ stack: true }),
    format.json()
);

// Generate timestamped log filename
const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFilePath = join(config.logsDir, `mirror-${runTimestamp}.log`);
const errorLogPath = join(config.logsDir, `mirror-${runTimestamp}-errors.log`);

const logger = createLogger({
    level: 'debug',
    defaultMeta: { tool: 'sharepoint-mirror' },
    transports: [
        // Console: colorized, human-readable
        new transports.Console({
            level: 'info',
            format: combine(
                timestamp({ format: 'HH:mm:ss' }),
                colorize(),
                consoleFormat
            ),
        }),
        // File: all levels, JSON
        new transports.File({
            filename: logFilePath,
            format: fileFormat,
            maxsize: 50 * 1024 * 1024, // 50 MB per file
            maxFiles: 5,
        }),
        // Errors-only file
        new transports.File({
            filename: errorLogPath,
            level: 'error',
            format: fileFormat,
        }),
    ],
});

/**
 * Log an API call with timing information.
 */
logger.logApiCall = function (url, status, durationMs, responseSize) {
    this.debug('API call', {
        phase: 'api',
        url,
        status,
        durationMs,
        responseSize,
    });
};

/**
 * Log a download event.
 */
logger.logDownload = function (fileName, status, sizeBytes, durationMs) {
    this.info(`Download ${status}: ${fileName}`, {
        phase: 'download',
        sizeBytes,
        durationMs,
    });
};

/**
 * Log a discovery event.
 */
logger.logDiscovery = function (folderUrl, filesFound, subfoldersFound) {
    this.info(`Discovered: ${folderUrl}`, {
        phase: 'discovery',
        filesFound,
        subfoldersFound,
    });
};

export default logger;
export { logFilePath, errorLogPath };
