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

// --- GET /download/:jobId : Download and stream the zip file on-the-fly ---
router.get('/download/:jobId', authMiddleware, async (req, res) => {
    const { jobId } = req.params;
    let tempBacpacPath = ''; // Keep track of the temp file for cleanup

    try {
        const job = await getJob(jobId);

        if (!job) {
            return res.status(404).json({ message: 'Job not found.' });
        }
        if (job.Status !== 'completed') {
            return res.status(400).json({ message: 'Job is not yet complete.' });
        }
        if (job.BackupType !== 'hybrid') {
            return res.status(400).json({ message: 'This job was not a hybrid backup and cannot be downloaded.' });
        }
        if (!job.BlobName) {
            return res.status(404).json({ message: 'Cloud backup file not found for this job.' });
        }

        // 1. Download the .bacpac from Azure to a temporary local file
        const bacpacFileName = job.BlobName;
        tempBacpacPath = path.join(backupDir, `temp_${bacpacFileName}`);
        console.log(`[Job ${jobId}] Downloading ${bacpacFileName} from Azure to ${tempBacpacPath} for zipping...`);
        await downloadBackupFile(bacpacFileName, tempBacpacPath);
        console.log(`[Job ${jobId}] Download complete.`);

        // 2. Prepare to stream an encrypted zip file to the user
        const zipFileName = bacpacFileName.replace('.bacpac', '.zip');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = archiver('zip-encrypted', {
            zlib: { level: 8 },
            encryptionMethod: 'aes256',
            password: process.env.ZIP_LOCK
        });

        // 3. Set up event handlers for the stream
        archive.on('error', (err) => {
            throw err; // Throw to be caught by the main catch block
        });

        // When the stream to the user finishes, clean up the temp file
        res.on('finish', () => {
            console.log(`[Job ${jobId}] Zip stream finished. Cleaning up temp file: ${tempBacpacPath}`);
            if (fs.existsSync(tempBacpacPath)) {
                fs.unlinkSync(tempBacpacPath);
            }
        });

        // 4. Pipe the archive stream to the response
        archive.pipe(res);

        // 5. Add the downloaded .bacpac file to the archive
        archive.file(tempBacpacPath, { name: bacpacFileName });

        // 6. Finalize the archive to send it to the user
        await archive.finalize();

    } catch (error) {
        console.error(`[Job ${jobId}] On-the-fly zip and download failed:`, error);
        // If an error occurs and the response hasn't been sent, send an error status
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to create and download backup zip.' });
        }
        // Ensure cleanup happens even on error
        if (tempBacpacPath && fs.existsSync(tempBacpacPath)) {
            fs.unlinkSync(tempBacpacPath);
            console.log(`[Job ${jobId}] Cleaned up temp file after error: ${tempBacpacPath}`);
        }
    }
});


// --- Main Asynchronous Backup Execution Logic ---
async function executeBackup(jobId) {
    const startTime = Date.now();
    let job = await getJob(jobId);
    if (!job) {
        console.error(`[Job ${jobId}] Cannot execute non-existent job.`);
        return;
    }

    const { BackupType, UserID, CreatedBy } = job;
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const date = phTime.toISOString().slice(0, 10);
    const time = phTime.toTimeString().slice(0, 8).replace(/:/g, '-');
    const bacpacFileName = `smartSK_${date}_${time}.bacpac`;
    const bacpacFilePath = path.join(backupDir, bacpacFileName);

    try {
        await updateJob(jobId, 'processing', 'Exporting database using sqlpackage...', { processing: true });

        const command = `sqlpackage /a:Export /ssn:${dbServer} /sdn:${dbName} /tf:"${bacpacFilePath}" /su:${process.env.DB_USER} /sp:${process.env.DB_PASSWORD}`;
        console.log(`[Job ${jobId}] Executing sqlpackage command...`);

        await new Promise((resolve, reject) => {
            const sqlPackageProcess = spawn(command, { shell: true });
            sqlPackageProcess.stdout.on('data', (data) => console.log(`[Job ${jobId}] sqlpackage stdout: ${data}`));
            sqlPackageProcess.stderr.on('data', (data) => console.error(`[Job ${jobId}] sqlpackage stderr: ${data}`));
            sqlPackageProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Job ${jobId}] Database export to .bacpac completed.`);
                    resolve();
                } else {
                    reject(new Error(`sqlpackage process exited with code ${code}`));
                }
            });
            sqlPackageProcess.on('error', (err) => reject(err));
        });

        await updateJob(jobId, 'processing', 'Uploading .bacpac file to Azure Storage...');
        const blobName = bacpacFileName;
        const blobURL = await uploadBackupFile(bacpacFilePath, blobName);
        const fileSize = fs.statSync(bacpacFilePath).size;

        const finalUpdateData = {
            FileName: bacpacFileName, // For both types, the primary file is the .bacpac
            BlobName: blobName,
            BlobURL: blobURL,
            FileSize: fileSize,
            Duration: Math.round((Date.now() - startTime) / 1000),
        };

        // For hybrid, the job is complete. The zip is created on-demand.
        // For cloud-only, the job is also complete.
        const message = BackupType === 'hybrid' ? 'Backup complete. Ready for download.' : 'Backup complete. File uploaded to cloud storage.';
        await updateJob(jobId, 'completed', message, finalUpdateData);

        addAuditTrail({
            actor: 'A',
            module: 'B',
            userID: UserID,
            actions: `backup-database-${BackupType}`,
            newValue: bacpacFileName,
            descriptions: `${CreatedBy} initiated a ${BackupType} database backup.`
        });

    } catch (error) {
        console.error(`[Job ${jobId}] Backup process failed:`, error.message);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await updateJob(jobId, 'failed', `Backup failed: ${error.message}`, { 
            ErrorMessage: error.stack,
            Duration: duration
        });
    } finally {
        // Clean up the local .bacpac file after it has been uploaded
        if (fs.existsSync(bacpacFilePath)) {
            fs.unlinkSync(bacpacFilePath);
            console.log(`[Job ${jobId}] Cleaned up local .bacpac file: ${bacpacFilePath}`);
        }
    }
}

// --- POST /restore : Restore a database from a backup ---
router.post('/restore', authMiddleware, upload.single('backupFile'), async (req, res) => {
    const { restoreType, fileName } = req.body; // 'cloud' or 'local'

    let bacpacFilePath; // This will be the path to the .bacpac file to restore
    let tempDirs = []; // Keep track of dirs to clean up
    let tempFiles = []; // Keep track of files to clean up
    let originalFileName;

    const cleanup = () => {
        tempFiles.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        tempDirs.forEach(d => { if (fs.existsSync(d)) fs.rmdirSync(d, { recursive: true }); });
    };

    try {
        if (!restoreType || !['cloud', 'local'].includes(restoreType)) {
            if (req.file) fs.unlinkSync(req.file.path); // cleanup multer file
            return res.status(400).json({ message: "Restore type ('cloud' or 'local') is required." });
        }

        if (restoreType === 'local') {
            if (!req.file) {
                return res.status(400).json({ message: 'No backup file uploaded for local restore.' });
            }
            const uploadedZipPath = req.file.path;
            tempFiles.push(uploadedZipPath);
            originalFileName = req.file.originalname;

            // Check if file is a zip
            if (path.extname(originalFileName).toLowerCase() !== '.zip') {
                cleanup();
                return res.status(400).json({ message: 'Invalid file type. Please upload a .zip backup file.' });
            }

            const tempExtractDir = path.join(backupDir, `extract_${Date.now()}`);
            fs.mkdirSync(tempExtractDir);
            tempDirs.push(tempExtractDir);

            console.log(`[Restore] Extracting ${originalFileName}...`);
            // Use 7z to extract the AES256-encrypted zip file
            const unzipCommand = `7z x -o"${tempExtractDir}" -p"${process.env.ZIP_LOCK}" "${uploadedZipPath}"`;

            const { exec: execPromise } = require('child_process');
            await new Promise((resolve, reject) => {
                execPromise(unzipCommand, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Restore] Unzip failed: ${stderr}`);
                        return reject(new Error('Failed to extract backup file. Is it a valid password-protected zip?'));
                    }
                    resolve(stdout);
                });
            });

            const files = fs.readdirSync(tempExtractDir);
            const bacpacFile = files.find(f => f.endsWith('.bacpac'));

            if (!bacpacFile) {
                throw new Error('.bacpac file not found in the zip archive.');
            }
            bacpacFilePath = path.join(tempExtractDir, bacpacFile);
            console.log(`[Restore] Extracted ${bacpacFile}.`);

        } else { // cloud
            if (!fileName) {
                return res.status(400).json({ message: 'Backup file name is required for cloud restore.' });
            }
            originalFileName = fileName;
            bacpacFilePath = path.join(backupDir, fileName);
            tempFiles.push(bacpacFilePath);

            console.log(`[Restore] Downloading ${fileName} from Azure Storage...`);
            await downloadBackupFile(fileName, bacpacFilePath);
            console.log(`[Restore] Successfully downloaded backup to ${bacpacFilePath}.`);
        }

        console.log('[Restore] Starting database restore using sqlpackage...');
        const command = `sqlpackage /a:Import /tsn:${dbServer} /tdn:${dbName} /sf:"${bacpacFilePath}" /tu:${process.env.DB_USER} /tp:${process.env.DB_PASSWORD}`;

        const { exec: execCallback } = require('child_process');
        execCallback(command, (error, stdout, stderr) => {
            cleanup(); // Clean up everything regardless of outcome

            if (error) {
                console.error(`[Restore] sqlpackage import failed: ${error.message}`);
                console.error(`[Restore] stderr: ${stderr}`);
                return res.status(500).json({ message: 'Database restore failed.', error: stderr });
            }

            console.log('[Restore] Database import/restore completed successfully.');
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
        console.error('[Restore] Process failed:', error.message);
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
});


module.exports = router;
