import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import config from '../../config.js';
import logger from '../logger.js';

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    site_url    TEXT NOT NULL,
    library     TEXT NOT NULL,
    target_path TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'CREATED'
                CHECK (status IN ('CREATED','SCANNING','READY','DOWNLOADING','PAUSED','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED')),
    stats_json  TEXT
);

CREATE TABLE IF NOT EXISTS folders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL REFERENCES jobs(id),
    server_relative_url TEXT NOT NULL,
    name                TEXT NOT NULL,
    parent_url          TEXT,
    depth               INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','DISCOVERED','FAILED')),
    selected            INTEGER NOT NULL DEFAULT 0,
    discovered_at       TEXT,
    item_count          INTEGER,
    error_message       TEXT,
    UNIQUE(job_id, server_relative_url)
);

CREATE TABLE IF NOT EXISTS files (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL REFERENCES jobs(id),
    server_relative_url TEXT NOT NULL,
    name                TEXT NOT NULL,
    folder_url          TEXT NOT NULL,
    size_bytes          INTEGER,
    sp_modified_at      TEXT,
    sp_etag             TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                            'PENDING','SELECTED','QUEUED','RUNNING','SUCCESS','FAILED','RETRYING','SKIPPED','VERIFIED'
                        )),
    selected            INTEGER NOT NULL DEFAULT 0,
    local_path          TEXT,
    downloaded_at       TEXT,
    download_size_bytes INTEGER,
    sha256              TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    UNIQUE(job_id, server_relative_url)
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER NOT NULL REFERENCES jobs(id),
    timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    phase       TEXT NOT NULL,
    entity_url  TEXT,
    level       TEXT NOT NULL,
    message     TEXT
);
`;

const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(job_id, status);
CREATE INDEX IF NOT EXISTS idx_files_status   ON files(job_id, status);
CREATE INDEX IF NOT EXISTS idx_events_job     ON events(job_id);
`;

export class StateStore {
    constructor(dbPath) {
        const path = dbPath || config.dbPath;
        mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path);
        this._migrate();
        this._prepareStatements();
        logger.info(`State DB opened: ${path}`);
    }

    _migrate() {
        this.db.exec(SCHEMA_SQL);
        this.db.exec(INDEX_SQL);
    }

    _prepareStatements() {
        this._stmts = {
            // Jobs
            insertJob: this.db.prepare(
                `INSERT INTO jobs (site_url, library, target_path) VALUES (?, ?, ?)`
            ),
            updateJobStatus: this.db.prepare(
                `UPDATE jobs SET status = ?, finished_at = CASE WHEN ? IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN datetime('now') ELSE finished_at END WHERE id = ?`
            ),
            getJob: this.db.prepare(`SELECT * FROM jobs WHERE id = ?`),
            getAllJobs: this.db.prepare(`SELECT * FROM jobs ORDER BY id DESC`),

            // Folders
            upsertFolder: this.db.prepare(`
                INSERT INTO folders (job_id, server_relative_url, name, parent_url, depth, status, selected)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 0)
                ON CONFLICT(job_id, server_relative_url) DO NOTHING
            `),
            updateFolderStatus: this.db.prepare(`
                UPDATE folders SET status = ?, error_message = ? WHERE job_id = ? AND server_relative_url = ?
            `),
            getPendingFolders: this.db.prepare(
                `SELECT * FROM folders WHERE job_id = ? AND status = 'PENDING' ORDER BY depth ASC`
            ),
            getAllFolders: this.db.prepare(`SELECT * FROM folders WHERE job_id = ?`),
            updateFolderSelection: this.db.prepare(`UPDATE folders SET selected = ? WHERE job_id = ? AND server_relative_url LIKE ?`),
            
            // Files
            upsertFile: this.db.prepare(`
                INSERT INTO files (job_id, server_relative_url, name, folder_url, size_bytes, sp_modified_at, sp_etag, status, selected)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)
                ON CONFLICT(job_id, server_relative_url) DO NOTHING
            `),
            updateFileStatus: this.db.prepare(`
                UPDATE files SET status = ?, error_message = ? WHERE job_id = ? AND server_relative_url = ?
            `),
            updateFileDownloaded: this.db.prepare(`
                UPDATE files SET status = 'SUCCESS', local_path = ?, downloaded_at = datetime('now'), download_size_bytes = ?, sha256 = ? 
                WHERE job_id = ? AND server_relative_url = ?
            `),
            updateFileSelection: this.db.prepare(`UPDATE files SET selected = ? WHERE job_id = ? AND folder_url LIKE ?`),
            getFilesToDownload: this.db.prepare(`
                SELECT * FROM files WHERE job_id = ? AND selected = 1 AND status IN ('PENDING', 'SELECTED', 'RETRYING', 'FAILED') ORDER BY size_bytes ASC LIMIT ?
            `),
            getAllFiles: this.db.prepare(`SELECT * FROM files WHERE job_id = ?`),
            
            // Events
            insertEvent: this.db.prepare(`
                INSERT INTO events (job_id, phase, entity_url, level, message) VALUES (?, ?, ?, ?, ?)
            `),
            getEvents: this.db.prepare(`SELECT * FROM events WHERE job_id = ? ORDER BY id DESC LIMIT 100`),
            
            // Stats
            fileStats: this.db.prepare(`SELECT status, COUNT(*) as count FROM files WHERE job_id = ? GROUP BY status`),

            // Cleanup
            clearFinishedJobs: this.db.prepare(`
                DELETE FROM jobs WHERE status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')
            `),
            clearOrphanedFolders: this.db.prepare(`DELETE FROM folders WHERE job_id NOT IN (SELECT id FROM jobs)`),
            clearOrphanedFiles: this.db.prepare(`DELETE FROM files WHERE job_id NOT IN (SELECT id FROM jobs)`),
            clearOrphanedEvents: this.db.prepare(`DELETE FROM events WHERE job_id NOT IN (SELECT id FROM jobs)`),
        };
    }

    createJob(siteUrl, library, targetPath) {
        const info = this._stmts.insertJob.run(siteUrl, library, targetPath);
        return info.lastInsertRowid;
    }
    updateJobStatus(jobId, status) { this._stmts.updateJobStatus.run(status, status, jobId); }
    getJob(jobId) { return this._stmts.getJob.get(jobId); }
    getAllJobs() { return this._stmts.getAllJobs.all(); }

    insertFolder(jobId, url, name, parentUrl, depth) { this._stmts.upsertFolder.run(jobId, url, name, parentUrl, depth); }
    updateFolderStatus(jobId, url, status, error = null) { this._stmts.updateFolderStatus.run(status, error, jobId, url); }
    getPendingFolders(jobId) { return this._stmts.getPendingFolders.all(jobId); }
    getAllFolders(jobId) { return this._stmts.getAllFolders.all(jobId); }
    
    // Select a folder and all its children recursively
    selectFolder(jobId, folderUrl, isSelected) {
        const likePattern = folderUrl + '%';
        this.transaction(() => {
            this._stmts.updateFolderSelection.run(isSelected ? 1 : 0, jobId, likePattern);
            this._stmts.updateFileSelection.run(isSelected ? 1 : 0, jobId, likePattern);
            
            if (isSelected) {
                // If selecting, move from PENDING or FAILED to SELECTED to allow retries
                this.db.prepare(`UPDATE files SET status = 'SELECTED' WHERE job_id = ? AND folder_url LIKE ? AND status IN ('PENDING', 'FAILED')`).run(jobId, likePattern);
            } else {
                // If deselecting, move from SELECTED back to PENDING
                this.db.prepare(`UPDATE files SET status = 'PENDING' WHERE job_id = ? AND folder_url LIKE ? AND status = 'SELECTED'`).run(jobId, likePattern);
            }
        });
    }

    insertFile(jobId, url, name, folderUrl, size, modAt, etag) { this._stmts.upsertFile.run(jobId, url, name, folderUrl, size, modAt, etag); }
    updateFileStatus(jobId, url, status, error = null) { this._stmts.updateFileStatus.run(status, error, jobId, url); }
    markFileDownloaded(jobId, url, localPath, size, sha256) { this._stmts.updateFileDownloaded.run(localPath, size, sha256, jobId, url); }
    getFilesToDownload(jobId, limit = 100) { return this._stmts.getFilesToDownload.all(jobId, limit); }
    getAllFiles(jobId) { return this._stmts.getAllFiles.all(jobId); }

    logEvent(jobId, phase, url, level, message) { this._stmts.insertEvent.run(jobId, phase, url, level, message); }
    getEvents(jobId) { return this._stmts.getEvents.all(jobId); }

    getFileStats(jobId) {
        const rows = this._stmts.fileStats.all(jobId);
        const stats = { PENDING: 0, SELECTED: 0, QUEUED: 0, RUNNING: 0, SUCCESS: 0, FAILED: 0, RETRYING: 0, SKIPPED: 0, VERIFIED: 0 };
        rows.forEach(r => { stats[r.status] = r.count; });
        stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
        return stats;
    }

    transaction(fn) { return this.db.transaction(fn)(); }

    clearFinishedJobs() {
        const statuses = "('COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')";
        this.transaction(() => {
            // Delete dependent records first to satisfy FK constraints
            this.db.prepare(`DELETE FROM events WHERE job_id IN (SELECT id FROM jobs WHERE status IN ${statuses})`).run();
            this.db.prepare(`DELETE FROM files WHERE job_id IN (SELECT id FROM jobs WHERE status IN ${statuses})`).run();
            this.db.prepare(`DELETE FROM folders WHERE job_id IN (SELECT id FROM jobs WHERE status IN ${statuses})`).run();
            // Finally delete the jobs
            this.db.prepare(`DELETE FROM jobs WHERE status IN ${statuses}`).run();
        });
    }

    close() { this.db.close(); }
}
