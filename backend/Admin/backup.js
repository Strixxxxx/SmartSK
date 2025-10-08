const express = require('express');
const router = express.Router();
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { uploadBackupFile, listBackups, downloadBackupFile } = require('../Storage/storage');
const archiver = require('archiver');
const archiverZipEncrypted = require('archiver-zip-encrypted');
const multer = require('multer');
const { createJob, getJob, updateJob } = require('./backupJob');

// Register the zip-encrypted format
archiver.registerFormat('zip-encrypted', archiverZipEncrypted);

// --- Backup Directory Setup ---
const backupDir = path.join(__dirname, '..', '..', 'database_backup');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory at: ${backupDir}`);
}

// --- Multer setup for local restore ---
const upload = multer({ dest: backupDir });

// --- Environment Variable Validation ---
const requiredEnv = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD', 'EMAIL_USER', 'EMAIL_PASS', 'ZIP_LOCK', 'BACKUP_CONTAINER'];
for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}. Please check your .env file.`);
    }
}

const dbServer = process.env.DB_SERVER;
const dbName = process.env.DB_DATABASE;

// --- GET / : List available backups from Azure Storage ---
router.get('/', authMiddleware, async (req, res) => {
    try {
        const backups = await listBackups();
        res.status(200).json(backups);
    } catch (error) {
        console.error('Failed to list backups:', error);
        res.status(500).json({ message: 'Failed to list backups.' });
    }
});

// --- POST / : Initiate a new database backup ---
router.post('/', authMiddleware, async (req, res) => {
    const { backupType } = req.body; // 'hybrid' or 'cloud-only'

    if (!backupType || !['hybrid', 'cloud-only'].includes(backupType)) {
        return res.status(400).json({ message: "Backup type ('hybrid' or 'cloud-only') is required." });
    }

    try {
        const jobId = await createJob({
            backupType,
            initiatedBy: req.user.fullName,
            userId: req.user.userId
        });

        res.status(202).json({
            jobId,
            message: `Database backup '${jobId}' initiated. You can poll for status.`
        });

        // --- Run the actual backup process in the background (fire and forget) ---
        executeBackup(jobId);

    } catch (error) {
        console.error("Failed to create backup job:", error);
        res.status(500).json({ message: "Failed to initiate backup process." });
    }
});

// --- GET /status/:jobId : Get the status of a backup job ---
router.get('/status/:jobId', authMiddleware, async (req, res) => {
    const { jobId } = req.params;
    const job = await getJob(jobId);

    if (!job) {
        return res.status(404).json({ message: 'Job not found.' });
    }

    // Sanitize the job object before sending to client
    const { ErrorMessage, ...clientJob } = job;
    res.status(200).json(clientJob);
});

// --- GET /download/:jobId : Download the result of a completed hybrid backup ---
router.get('/download/:jobId', authMiddleware, async (req, res) => {
    const { jobId } = req.params;
    const job = await getJob(jobId);

    if (!job) {
        return res.status(404).json({ message: 'Job not found.' });
    }
    if (job.Status !== 'completed') {
        return res.status(400).json({ message: 'Job is not yet complete.' });
    }
    if (job.BackupType !== 'hybrid') {
        return res.status(400).json({ message: 'This job was not a hybrid backup and has no file to download.' });
    }
    if (!job.FilePath || !job.FileName) {
        return res.status(404).json({ message: 'Backup file not found for this job.' });
    }

    res.download(job.FilePath, job.FileName, (err) => {
        if (err) {
            console.error(`[Job ${jobId}] Error sending file to user:`, err);
        } else {
            console.log(`[Job ${jobId}] File ${job.FileName} successfully sent to user.`);
        }
        // Clean up the zip file after download attempt
        if (fs.existsSync(job.FilePath)) {
            fs.unlinkSync(job.FilePath);
            console.log(`[Job ${jobId}] Cleaned up downloaded zip file: ${job.FilePath}`);
        }
    });
});


// --- Main Asynchronous Backup Execution Logic ---
async function executeBackup(jobId) {
    let job = await getJob(jobId);
    if (!job) {
        console.error(`[Job ${jobId}] Cannot execute non-existent job.`);
        return;
    }

    const { BackupType, UserID } = job;
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const date = phTime.toISOString().slice(0, 10);
    const time = phTime.toTimeString().slice(0, 8).replace(/:/g, '-');
    const bacpacFileName = `smartSK_${date}_${time}.bacpac`;
    const bacpacFilePath = path.join(backupDir, bacpacFileName);

    try {
        const command = `sqlpackage /a:Export /ssn:${dbServer} /sdn:${dbName} /tf:"${bacpacFilePath}" /su:${process.env.DB_USER} /sp:${process.env.DB_PASSWORD}`;
        const sanitizedCommand = `sqlpackage /a:Export /ssn:*** /sdn:*** /tf:"${bacpacFilePath}" /su:${process.env.DB_USER} /sp:***`;

        await updateJob(jobId, 'processing', 'Exporting database using sqlpackage...', { processing: true });
        console.log(`[Job ${jobId}] Executing command: ${sanitizedCommand}`);

        await new Promise((resolve, reject) => {
            const sqlPackageProcess = spawn(command, {
                shell: true
            });

            sqlPackageProcess.stdout.on('data', (data) => {
                console.log(`[Job ${jobId}] sqlpackage stdout: ${data}`);
            });

            sqlPackageProcess.stderr.on('data', (data) => {
                console.error(`[Job ${jobId}] sqlpackage stderr: ${data}`);
            });

            sqlPackageProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Job ${jobId}] Database export to .bacpac completed.`);
                    resolve();
                } else {
                    console.error(`[Job ${jobId}] sqlpackage process exited with code ${code}`);
                    reject(new Error(`sqlpackage process exited with code ${code}`));
                }
            });

            sqlPackageProcess.on('error', (err) => {
                console.error(`[Job ${jobId}] Failed to start sqlpackage process:`, err);
                reject(err);
            });
        });

        await updateJob(jobId, 'processing', 'Uploading .bacpac file to Azure Storage...');
        const blobName = bacpacFileName;
        await uploadBackupFile(bacpacFilePath, blobName);

        if (BackupType === 'hybrid') {
            await updateJob(jobId, 'processing', 'Creating encrypted zip file for download...');
            const zipFileName = bacpacFileName.replace('.bacpac', '.zip');
            const zipFilePath = path.join(backupDir, zipFileName);

            await createEncryptedZip(bacpacFilePath, zipFilePath, bacpacFileName);

            await updateJob(jobId, 'completed', 'Backup complete. File is ready for download.', {
                FilePath: zipFilePath,
                FileName: zipFileName,
                BlobName: blobName
            });
        } else { // cloud-only
            await updateJob(jobId, 'completed', 'Backup complete. File uploaded to cloud storage.', {
                FileName: bacpacFileName,
                BlobName: blobName
            });
        }

        // Add audit trail
        addAuditTrail({
            actor: 'A',
            module: 'B',
            userID: UserID,
            actions: `backup-database-${BackupType}`,
            newValue: bacpacFileName,
            descriptions: `Admin user initiated a ${BackupType} database backup.`
        });

    } catch (error) {
        console.error(`[Job ${jobId}] Backup process failed:`, error.message);
        await updateJob(jobId, 'failed', `Backup failed: ${error.message}`, { ErrorMessage: error.stack });
    } finally {
        // Clean up the .bacpac file as it's either uploaded or zipped
        if (fs.existsSync(bacpacFilePath)) {
            fs.unlinkSync(bacpacFilePath);
            console.log(`[Job ${jobId}] Cleaned up local .bacpac file: ${bacpacFilePath}`);
        }
    }
}

// --- Helper to create encrypted zip ---
function createEncryptedZip(sourceFilePath, zipFilePath, fileNameInZip) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip-encrypted', {
            zlib: { level: 8 },
            encryptionMethod: 'aes256',
            password: process.env.ZIP_LOCK
        });

        output.on('close', () => {
            console.log(`Encrypted archive created: ${zipFilePath} (${archive.pointer()} total bytes)`);
            resolve();
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);
        archive.file(sourceFilePath, { name: fileNameInZip });
        archive.finalize();
    });
}


// --- POST /restore : Restore a database from a backup (Unchanged) ---
router.post('/restore', authMiddleware, upload.single('backupFile'), async (req, res) => {
    const { restoreType, fileName } = req.body; // 'cloud' or 'local'

    let downloadPath;
    let originalFileName;

    try {
        if (!restoreType || !['cloud', 'local'].includes(restoreType)) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: "Restore type ('cloud' or 'local') is required." });
        }

        if (restoreType === 'local') {
            if (!req.file) {
                return res.status(400).json({ message: 'No backup file uploaded for local restore.' });
            }
            downloadPath = req.file.path;
            originalFileName = req.file.originalname;
        } else { // cloud
            if (!fileName) {
                return res.status(400).json({ message: 'Backup file name is required for cloud restore.' });
            }
            originalFileName = fileName;
            downloadPath = path.join(backupDir, fileName);

            console.log(`Downloading ${fileName} from Azure Storage...`);
            await downloadBackupFile(fileName, downloadPath);
            console.log(`Successfully downloaded backup to ${downloadPath}.`);
        }

        console.log('Starting database restore using sqlpackage...');
        const sanitizedCommand = `sqlpackage /a:Import /tsn:*** /tdn:*** /sf:"${downloadPath}" /su:${process.env.DB_USER} /sp:***`;
        const command = `sqlpackage /a:Import /tsn:${dbServer} /tdn:${dbName} /sf:"${downloadPath}" /su:${process.env.DB_USER} /sp:${process.env.DB_PASSWORD}`;

        console.log(`Executing command: ${sanitizedCommand}`);

        // This restore process is still synchronous and can time out.
        // For now, leaving as-is since the request was about fixing backups.
        exec(command, (error, stdout, stderr) => {
            if (fs.existsSync(downloadPath)) {
                fs.unlinkSync(downloadPath);
            }

            if (error) {
                console.error(`sqlpackage import failed: ${error.message}`);
                console.error(`stderr: ${stderr}`);
                return res.status(500).json({ message: 'Database restore failed.', error: stderr });
            }

            console.log('Database import/restore completed successfully.');
            addAuditTrail({
                actor: 'A',
                module: 'B',
                userID: req.user.userId,
                actions: 'restore-database',
                newValue: originalFileName,
                descriptions: `Admin ${req.user.fullName} restored the database from ${originalFileName} (${restoreType}).`
            });

            res.status(200).json({ message: 'Database restored successfully.' });
        });

    } catch (error) {
        console.error('Restore process failed:', error.message);
        if (downloadPath && fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
        }
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
});


module.exports = router;