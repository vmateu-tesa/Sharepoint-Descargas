import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'data', 'app.db'));
const jobId = 6;

try {
    const stmt = db.prepare("SELECT * FROM files WHERE job_id = ? AND selected = 1 AND status IN ('PENDING', 'SELECTED', 'RETRYING') ORDER BY size_bytes ASC LIMIT ?");
    const files = stmt.all(jobId, 50);
    console.log(`STMT RETURNED ${files.length} FILES`);
    if (files.length > 0) {
        console.log("FIRST FILE:", files[0].name, "STATUS:", files[0].status, "SELECTED:", files[0].selected);
    } else {
        // Debug why 0
        const totalJobFiles = db.prepare("SELECT COUNT(*) as count FROM files WHERE job_id = ?").get(jobId).count;
        const selectedFiles = db.prepare("SELECT COUNT(*) as count FROM files WHERE job_id = ? AND selected = 1").get(jobId).count;
        const statusCounts = db.prepare("SELECT status, COUNT(*) as count FROM files WHERE job_id = ? GROUP BY status").all(jobId);
        
        console.log("Total for Job 6:", totalJobFiles);
        console.log("Selected for Job 6:", selectedFiles);
        console.log("Status counts:", statusCounts);
    }
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
