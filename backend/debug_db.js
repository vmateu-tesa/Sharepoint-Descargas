import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'data', 'app.db'));
const jobId = 6;

try {
    const files = db.prepare("SELECT id, name, folder_url, selected, status FROM files WHERE job_id = ? LIMIT 20").all(jobId);
    console.log("FILES (Job 6):");
    console.table(files);

    const stats = db.prepare("SELECT status, COUNT(*) as count FROM files WHERE job_id = ? GROUP BY status").all(jobId);
    console.log("STATS:");
    console.table(stats);

    const selectedCount = db.prepare("SELECT COUNT(*) as count FROM files WHERE job_id = ? AND selected = 1").get(jobId);
    console.log("SELECTED=1 COUNT:", selectedCount.count);

    const downloadReady = db.prepare("SELECT COUNT(*) as count FROM files WHERE job_id = ? AND selected = 1 AND status IN ('PENDING', 'SELECTED', 'RETRYING')").get(jobId);
    console.log("DOWNLOAD READY COUNT:", downloadReady.count);
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
