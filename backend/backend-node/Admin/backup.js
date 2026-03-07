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
const { getConnection } = require('../database/database');
const { broadcast } = require('../websockets/websocket'); // Import broadcast function
const { randomBytes } = require('crypto');
const sql = require('mssql');

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
const requiredEnv = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD', 'EMAIL_USER', 'EMAIL_PASS', 'ZIP_LOCK'];
for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}. Please check your .env file.`);
    }
}

const dbServer = process.env.DB_SERVER;
const dbName = process.env.DB_DATABASE;

// --- NEW HELPER: Drop Database with Retries (Azure SQL Compatible) ---
async function dropDatabaseWithRetries(sqlConnection, dbToDrop) {
    const maxAttempts = 60; // 5 minutes (60 attempts * 5 seconds)
    const delay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[Drop DB Attempt ${attempt}/${maxAttempts}] Dropping database: ${dbToDrop}`);
            await sqlConnection.request().query(`DROP DATABASE [${dbToDrop}];`);
            console.log(`[Drop DB] Successfully dropped database: ${dbToDrop}`);
            return; // Success, exit the loop
        } catch (error) {
            // Check if the error is the specific "database in use" error
            if (error.message.includes('because it is currently in use')) {
                if (attempt === maxAttempts) {
                    console.error(`[Drop DB] Final attempt failed. Could not drop database ${dbToDrop} as it is still in use.`);
                    throw error; // Rethrow the last error
                }
                console.warn(`[Drop DB Attempt ${attempt}] Failed to drop ${dbToDrop} as it is in use. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // If it's a different error, fail immediately
                throw error;
            }
        }
    }
}


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
            userID: req.user.userID // Corrected casing
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

        // 2. Prepare to stream an encrypted zip file to the.user
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


const cron = require('node-cron');

// --- Main Asynchronous Backup Execution Logic ---
async function executeBackup(jobId) {
    const startTime = Date.now();
    let job = await getJob(jobId);
    if (!job) {
        console.error(`[Job ${jobId}] Cannot execute non-existent job.`);
        return;
    }

    const { BackupType, UserID, CreatedBy, FileName } = job; // Destructure FileName
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const date = phTime.toISOString().slice(0, 10);
    const time = phTime.toTimeString().slice(0, 8).replace(/:/g, '-');

    // Use the job's FileName if it exists, otherwise generate a new one.
    const bacpacFileName = FileName ? FileName : `smartSK_${date}_${time}.bacpac`;
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

        const message = BackupType === 'hybrid' ? 'Backup complete. Ready for download.' : 'Backup complete. File uploaded to cloud storage.';
        await updateJob(jobId, 'completed', message, finalUpdateData);

        // Generate custom auditID based on the specified format
        const phTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const month = String(phTime.getMonth() + 1).padStart(2, '0');
        const day = String(phTime.getDate()).padStart(2, '0');
        const year = String(phTime.getFullYear()).slice(-2);
        const hours = String(phTime.getHours()).padStart(2, '0');
        const minutes = String(phTime.getMinutes()).padStart(2, '0');
        const seconds = String(phTime.getSeconds()).padStart(2, '0');
        const timestamp = `${month}${day}${year}${hours}${minutes}${seconds}`;

        // Determine actor: 'S' for System Scheduler, 'A' for Admin
        const actor = (CreatedBy === 'System Scheduler') ? 'S' : 'A';
        const auditID = `${timestamp}${actor}B`; // 'B' for Backup module

        const pool = await getConnection();
        await pool.request()
            .input('auditID', sql.NVarChar(16), auditID)
            .input('userID', sql.Int, UserID)
            .input('moduleName', sql.NVarChar(128), 'Backup')
            .input('actions', sql.NVarChar(50), `backup-database-${BackupType}`)
            .input('new_value', sql.NVarChar(sql.MAX), bacpacFileName)
            .input('descriptions', sql.NVarChar(255), `${CreatedBy} initiated a ${BackupType} database backup.`)
            .query("INSERT INTO [audit trail] (auditID, userID, moduleName, actions, old_value, new_value, descriptions, created_at) VALUES (@auditID, @userID, @moduleName, @actions, NULL, @new_value, @descriptions, GETDATE())");
        console.log(`[Job ${jobId}] Audit trail for backup created.`);

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

// --- Helper function to clean up orphaned restore databases ---
async function cleanupOrphanedRestoreDatabases() {
    const dbToCleanPattern = `${dbName}_restore_%`;
    console.log(`[Restore Cleanup] Searching for orphaned databases matching: ${dbToCleanPattern}`);
    let connection;
    try {
        // Centralized config for master DB connection
        const masterDbConfig = {
            server: dbServer,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'master',
            options: {
                encrypt: process.env.DB_ENCRYPT !== 'false', // Default to true
                trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' // Default to false
            }
        };
        connection = await sql.connect(masterDbConfig);

        const result = await connection.request()
            .input('pattern', sql.NVarChar, dbToCleanPattern)
            .query('SELECT name FROM sys.databases WHERE name LIKE @pattern');

        if (result.recordset.length === 0) {
            console.log('[Restore Cleanup] No orphaned databases found.');
            return;
        }

        console.log(`[Restore Cleanup] Found ${result.recordset.length} orphaned database(s): ${result.recordset.map(r => r.name).join(', ')}`);

        for (const row of result.recordset) {
            const orphanDbName = row.name;
            try {
                // Use the new retry logic to drop the database
                await dropDatabaseWithRetries(connection, orphanDbName);
            } catch (dropError) {
                console.error(`[Restore Cleanup] Failed to drop database ${orphanDbName} after multiple retries. It may require manual deletion. Full error object:`, dropError);
            }
        }
    } catch (error) {
        console.error(`[Restore Cleanup] An error occurred during the cleanup process: ${error.message}`);
    } finally {
        if (connection && connection.connected) {
            await connection.close();
        }
    }
}

// --- (REFACTORED) POST /restore : ASYNCHRONOUS ---
router.post('/restore', authMiddleware, upload.single('backupFile'), async (req, res) => {
    const { restoreType, fileName } = req.body; // 'cloud' or 'local'

    try {
        // --- Input Validation ---
        if (!restoreType || !['cloud', 'local'].includes(restoreType)) {
            if (req.file) fs.unlinkSync(req.file.path); // Clean up uploaded file on validation error
            return res.status(400).json({ message: "Restore type ('cloud' or 'local') is required." });
        }

        let backupType, jobFileName;
        if (restoreType === 'local') {
            if (!req.file) {
                return res.status(400).json({ message: 'No backup file uploaded for local restore.' });
            }
            backupType = 'local-restore';
            jobFileName = req.file.originalname;
        } else { // cloud
            if (!fileName) {
                return res.status(400).json({ message: 'Backup file name is required for cloud restore.' });
            }
            backupType = 'cloud-restore';
            jobFileName = fileName;
        }

        // --- Create Job ---
        const jobId = await createJob({
            backupType, // 'local-restore' or 'cloud-restore'
            initiatedBy: req.user.fullName,
            userId: req.user.userId,
            fileName: jobFileName
        });

        // --- ✅ CRITICAL: Create maintenance flag IMMEDIATELY ---
        const maintenanceFlagPath = path.join(__dirname, '..', 'maintenance.flag');
        try {
            fs.writeFileSync(maintenanceFlagPath, JSON.stringify({
                startedAt: new Date().toISOString(),
                jobId: jobId,
                reason: 'database_restore',
                initiatedBy: req.user.fullName
            }));
            console.log('[Maintenance] Maintenance mode activated for restore job:', jobId);
        } catch (flagError) {
            console.error('[Maintenance] CRITICAL: Failed to create maintenance flag.', flagError);
        }

        // --- ✅ Broadcast maintenance message IMMEDIATELY ---
        broadcast({ type: 'maintenance_starting' });
        console.log('[WebSocket] Broadcasted maintenance_starting for job:', jobId);

        // --- Respond Immediately ---
        res.status(202).json({
            jobId,
            message: `Database restore '${jobId}' initiated. System entering maintenance mode.`
        });

        // --- Run the actual restore process in the background ---
        executeRestore(jobId, req.file);

    } catch (error) {
        console.error("[Restore] Failed to create restore job:", error);

        // Clean up maintenance flag if job creation fails
        const maintenanceFlagPath = path.join(__dirname, '..', 'maintenance.flag');
        if (fs.existsSync(maintenanceFlagPath)) {
            fs.unlinkSync(maintenanceFlagPath);
        }

        res.status(500).json({ message: "Failed to initiate restore process." });
    }
});

async function synchronizeCriticalTables(jobId, tempDbName) {
    console.log(`[Job ${jobId}] Starting table synchronization...`);

    const mainDbConfig = {
        server: dbServer,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: dbName, // The original, main database
        options: {
            encrypt: process.env.DB_ENCRYPT !== 'false',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
        }
    };

    const tempDbConfig = {
        server: dbServer,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: tempDbName, // The newly restored temporary database
        options: {
            encrypt: process.env.DB_ENCRYPT !== 'false',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
        }
    };

    let mainPool, tempPool;

    try {
        mainPool = await new sql.ConnectionPool(mainDbConfig).connect();
        tempPool = await new sql.ConnectionPool(tempDbConfig).connect();
        console.log(`[Job ${jobId}] Connected to both source and destination databases for synchronization.`);

        // --- Sync BackupJobs ---
        try {
            console.log(`[Job ${jobId}] Synchronizing BackupJobs table...`);
            const sourceData = await mainPool.request().query('SELECT * FROM BackupJobs');
            const destPks = await tempPool.request().query('SELECT JobID FROM BackupJobs');
            const destPkSet = new Set(destPks.recordset.map(r => r.JobID));
            const missingRows = sourceData.recordset.filter(row => !destPkSet.has(row.JobID));

            if (missingRows.length > 0) {
                console.log(`[Job ${jobId}] Copying ${missingRows.length} rows to BackupJobs.`);
                const table = new sql.Table('BackupJobs');

                table.columns.add('JobID', sql.NVarChar(50), { nullable: false, primary: true });
                table.columns.add('BackupType', sql.NVarChar(20), { nullable: false });
                table.columns.add('Status', sql.NVarChar(20), { nullable: false });
                table.columns.add('Message', sql.NVarChar(500), { nullable: true });
                table.columns.add('ErrorMessage', sql.NVarChar(sql.MAX), { nullable: true });
                table.columns.add('FileName', sql.NVarChar(255), { nullable: true });
                table.columns.add('FilePath', sql.NVarChar(500), { nullable: true });
                table.columns.add('FileSize', sql.BigInt, { nullable: true });
                table.columns.add('BlobURL', sql.NVarChar(500), { nullable: true });
                table.columns.add('BlobName', sql.NVarChar(255), { nullable: true });
                table.columns.add('CreatedAt', sql.DateTime2, { nullable: false });
                table.columns.add('StartedAt', sql.DateTime2, { nullable: true });
                table.columns.add('CompletedAt', sql.DateTime2, { nullable: true });
                table.columns.add('UpdatedAt', sql.DateTime2, { nullable: false });
                table.columns.add('ExpiresAt', sql.DateTime2, { nullable: true });
                table.columns.add('CreatedBy', sql.NVarChar(100), { nullable: false });
                table.columns.add('UserID', sql.Int, { nullable: true });
                table.columns.add('Duration', sql.Int, { nullable: true });
                table.columns.add('Progress', sql.Int, { nullable: true });

                missingRows.forEach(row => {
                    table.rows.add(
                        row.JobID, row.BackupType, row.Status, row.Message, row.ErrorMessage,
                        row.FileName, row.FilePath, row.FileSize, row.BlobURL, row.BlobName,
                        row.CreatedAt, row.StartedAt, row.CompletedAt, row.UpdatedAt, row.ExpiresAt,
                        row.CreatedBy, row.UserID, row.Duration, row.Progress
                    );
                });

                const request = new sql.Request(tempPool);
                await request.bulk(table);
            }
        } catch (e) {
            console.warn(`[Job ${jobId}] WARNING: Could not synchronize BackupJobs. ${e.message}`);
        }

        // --- Sync Sessions ---
        try {
            console.log(`[Job ${jobId}] Synchronizing sessions table...`);
            const sourceData = await mainPool.request().query('SELECT * FROM sessions WHERE expires_at > GETDATE()');
            const destPks = await tempPool.request().query('SELECT sessionID FROM sessions');
            const destPkSet = new Set(destPks.recordset.map(r => r.sessionID));
            const missingRows = sourceData.recordset.filter(row => !destPkSet.has(row.sessionID));

            if (missingRows.length > 0) {
                console.log(`[Job ${jobId}] Copying ${missingRows.length} active sessions.`);
                const table = new sql.Table('sessions');
                table.columns.add('sessionID', sql.NVarChar(255), { nullable: false, primary: true });
                table.columns.add('userID', sql.Int, { nullable: true });
                table.columns.add('created_at', sql.DateTime, { nullable: false });
                table.columns.add('expires_at', sql.DateTime, { nullable: true });

                missingRows.forEach(row => {
                    table.rows.add(row.sessionID, row.userID, row.created_at, row.expires_at);
                });

                const request = new sql.Request(tempPool);
                await request.bulk(table);
            }
        } catch (e) {
            console.warn(`[Job ${jobId}] WARNING: Could not synchronize sessions. ${e.message}`);
        }

        // --- Sync Audit Trail ---
        try {
            console.log(`[Job ${jobId}] Synchronizing [audit trail] table...`);
            const maxTimestampResult = await tempPool.request().query('SELECT MAX(created_at) as max_ts FROM [audit trail]');
            const maxTimestamp = maxTimestampResult.recordset[0].max_ts;

            let sourceData;
            if (maxTimestamp) {
                const request = mainPool.request();
                request.input('max_ts', sql.DateTime, maxTimestamp);
                sourceData = await request.query('SELECT * FROM [audit trail] WHERE created_at > @max_ts');
            } else {
                sourceData = await mainPool.request().query('SELECT * FROM [audit trail]');
            }

            const missingRows = sourceData.recordset;

            if (missingRows.length > 0) {
                console.log(`[Job ${jobId}] Bulk inserting ${missingRows.length} new audit trail entries.`);

                const table = new sql.Table('[audit trail]');
                table.columns.add('auditID', sql.NVarChar(16), { nullable: false, primary: true });
                table.columns.add('userID', sql.Int, { nullable: true });
                table.columns.add('moduleName', sql.NVarChar(128), { nullable: true });
                table.columns.add('actions', sql.NVarChar(50), { nullable: false });
                table.columns.add('old_value', sql.NVarChar(sql.MAX), { nullable: true });
                table.columns.add('new_value', sql.NVarChar(sql.MAX), { nullable: true });
                table.columns.add('descriptions', sql.NVarChar(255), { nullable: false });
                table.columns.add('created_at', sql.DateTime, { nullable: false });

                missingRows.forEach(row => {
                    table.rows.add(
                        row.auditID,
                        row.userID,
                        row.moduleName,
                        row.actions,
                        row.old_value,
                        row.new_value,
                        row.descriptions,
                        row.created_at
                    );
                });

                const request = new sql.Request(tempPool);
                await request.bulk(table);
            }
        } catch (e) {
            console.warn(`[Job ${jobId}] WARNING: Could not synchronize [audit trail]. ${e.message}`);
        }

        console.log(`[Job ${jobId}] Table synchronization completed successfully.`);

    } catch (error) {
        console.error(`[Job ${jobId}] CRITICAL: Failed to synchronize critical tables. The restore will continue, but data might be inconsistent. Error: ${error.message}`);
        throw new Error(`Table synchronization failed: ${error.message}`);
    } finally {
        if (mainPool && mainPool.connected) await mainPool.close();
        if (tempPool && tempPool.connected) await tempPool.close();
    }
}

// --- (NEW) Asynchronous Restore Execution Logic ---
async function executeRestore(jobId, localFile) {
    const startTime = Date.now();
    const job = await getJob(jobId);
    if (!job) {
        console.error(`[Job ${jobId}] Cannot execute non-existent restore job.`);
        return;
    }

    const { BackupType, FileName, UserID, CreatedBy } = job;
    const restoreType = BackupType.includes('local') ? 'local' : 'cloud';

    let bacpacFilePath;
    let tempDirs = [];
    let tempFiles = [];
    const tempDbName = `${dbName}_restore_${Date.now()}`;

    const cleanup = () => {
        tempFiles.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        tempDirs.forEach(d => { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true }); });
    };

    try {
        await updateJob(jobId, 'processing', 'Starting restore process...', { processing: true });

        // --- Start: Proactive cleanup of OTHER orphaned databases ---
        await cleanupOrphanedRestoreDatabases();
        // --- End: Proactive cleanup ---

        await updateJob(jobId, 'processing', 'Preparing backup file...');

        if (restoreType === 'local') {
            const uploadedZipPath = localFile.path;
            tempFiles.push(uploadedZipPath);

            if (path.extname(localFile.originalname).toLowerCase() !== '.zip') {
                throw new Error('Invalid file type. Please upload a .zip backup file.');
            }

            const tempExtractDir = path.join(backupDir, `extract_${Date.now()}`);
            fs.mkdirSync(tempExtractDir);
            tempDirs.push(tempExtractDir);

            console.log(`[Job ${jobId}] Extracting ${FileName}...`);
            const unzipCommand = `7z x -o"${tempExtractDir}" -p"${process.env.ZIP_LOCK}" "${uploadedZipPath}"`;
            const { exec: execPromise } = require('child_process');
            await new Promise((resolve, reject) => {
                execPromise(unzipCommand, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Job ${jobId}] Unzip failed: ${stderr}`);
                        return reject(new Error('Failed to extract backup file. Check password or file integrity.'));
                    }
                    resolve(stdout);
                });
            });

            const files = fs.readdirSync(tempExtractDir);
            const bacpacFile = files.find(f => f.endsWith('.bacpac'));
            if (!bacpacFile) throw new Error('.bacpac file not found in the zip archive.');
            bacpacFilePath = path.join(tempExtractDir, bacpacFile);
            console.log(`[Job ${jobId}] Extracted ${bacpacFile}.`);

        } else { // cloud
            bacpacFilePath = path.join(backupDir, FileName);
            tempFiles.push(bacpacFilePath);

            console.log(`[Job ${jobId}] Downloading ${FileName} from Azure Storage...`);
            await updateJob(jobId, 'processing', 'Downloading backup from cloud...');
            await downloadBackupFile(FileName, bacpacFilePath);
            console.log(`[Job ${jobId}] Successfully downloaded backup to ${bacpacFilePath}.`);
        }

        await updateJob(jobId, 'processing', `Importing to temporary database: ${tempDbName}...`);
        const command = `sqlpackage /a:Import /tsn:${dbServer} /tdn:${tempDbName} /sf:"${bacpacFilePath}" /tu:${process.env.DB_USER} /tp:${process.env.DB_PASSWORD} /p:DatabaseEdition=Basic /p:DatabaseMaximumSize=2`;

        await new Promise((resolve, reject) => {
            const sqlPackageProcess = spawn(command, { shell: true });
            sqlPackageProcess.stdout.on('data', (data) => console.log(`[Job ${jobId}] sqlpackage stdout: ${data}`));
            sqlPackageProcess.stderr.on('data', (data) => console.error(`[Job ${jobId}] sqlpackage stderr: ${data}`));
            sqlPackageProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Job ${jobId}] Database import to temp DB completed.`);
                    resolve();
                } else {
                    reject(new Error(`sqlpackage process exited with code ${code}`));
                }
            });
            sqlPackageProcess.on('error', (err) => reject(err));
        });

        // --- NEW: Synchronize Critical Tables ---
        await updateJob(jobId, 'processing', 'Synchronizing critical system tables...');
        await synchronizeCriticalTables(jobId, tempDbName);
        // --- End of Synchronization ---

        await updateJob(jobId, 'processing', 'Finalizing database swap...');
        console.log(`[Job ${jobId}] Successfully imported to temporary database. Proceeding with swap.`);

        // --- Start of Critical Section: Database Swap ---
        console.log(`[Job ${jobId}] Closing application connection pool to begin database swap...`);
        const pool = await getConnection();
        await pool.close();
        console.log(`[Job ${jobId}] Main connection pool closed.`);

        let masterConnection;
        let finalDbConnection;

        try {
            // 1. Connect to the master database for administrative tasks
            const masterDbConfig = {
                server: dbServer,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: 'master',
                options: {
                    encrypt: process.env.DB_ENCRYPT !== 'false',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
                }
            };
            masterConnection = await new sql.ConnectionPool(masterDbConfig).connect();
            console.log(`[Job ${jobId}] Connected to master database for swap.`);

            // 2. Drop the old database
            const targetDbName = dbName;
            console.log(`[Job ${jobId}] Dropping old database: ${targetDbName}...`);
            await dropDatabaseWithRetries(masterConnection, targetDbName);

            // 3. Rename the new database
            console.log(`[Job ${jobId}] Renaming temporary database '${tempDbName}' to '${targetDbName}'...`);
            await masterConnection.request().query(`ALTER DATABASE [${tempDbName}] MODIFY NAME = [${targetDbName}];`);
            console.log(`[Job ${jobId}] Successfully renamed database to '${targetDbName}'.`);

            // 4. Disconnect from master; it's no longer needed.
            await masterConnection.close();
            masterConnection = null; // Prevent re-closing in finally block
            console.log(`[Job ${jobId}] Master connection closed.`);

            // 5. Connect to the newly restored database to finalize the job
            console.log(`[Job ${jobId}] Connecting to new database '${targetDbName}' to finalize job status.`);
            const finalDbConfig = {
                server: dbServer,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: targetDbName, // Connect to the renamed, final database
                options: {
                    encrypt: process.env.DB_ENCRYPT !== 'false',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
                }
            };
            finalDbConnection = await new sql.ConnectionPool(finalDbConfig).connect();
            console.log(`[Job ${jobId}] Connected to new database.`);

            // 6. Mark the job as completed using the correct database connection
            const duration = Math.round((Date.now() - startTime) / 1000);
            await finalDbConnection.request()
                .input('JobID', sql.NVarChar(50), jobId)
                .input('Status', sql.NVarChar(20), 'completed')
                .input('Message', sql.NVarChar(500), 'Database restore completed successfully.')
                .input('Duration', sql.Int, duration)
                .input('CompletedAt', sql.DateTime2, new Date())
                .query('UPDATE BackupJobs SET Status = @Status, Message = @Message, Duration = @Duration, CompletedAt = @CompletedAt WHERE JobID = @JobID');
            console.log(`[Job ${jobId}] Final status updated to 'completed'.`);

            // 7. Add audit trail for the successful restore
            const auditID = randomBytes(8).toString('hex');
            await finalDbConnection.request()
                .input('auditID', sql.NVarChar(16), auditID)
                .input('userID', sql.Int, UserID)
                .input('moduleName', sql.NVarChar(128), 'Backup')
                .input('actions', sql.NVarChar(50), 'restore-database')
                .input('new_value', sql.NVarChar(sql.MAX), FileName)
                .input('descriptions', sql.NVarChar(255), `Admin ${CreatedBy} restored the database from ${FileName} (${restoreType}).`)
                .query("INSERT INTO [audit trail] (auditID, userID, moduleName, actions, old_value, new_value, descriptions, created_at) VALUES (@auditID, @userID, @moduleName, @actions, NULL, @new_value, @descriptions, GETDATE())");
            console.log(`[Job ${jobId}] Audit trail for restore created.`);

            // 8. Create flag file for successful restore
            const flagPath = path.join(__dirname, 'maintenance_complete.flag');
            fs.writeFileSync(flagPath, 'Restore completed');
            console.log(`[Job ${jobId}] Maintenance completion flag created.`);

            console.log(`[Job ${jobId}] Restore complete. Application requires a restart to use the new database.`);

            // Trigger automated restart
            console.log(`[Restart] Triggering application restart in 3 seconds...`);
            setTimeout(() => {
                console.log('[Restart] Exiting process to trigger platform restart.');
                process.exit(0);
            }, 3000);

        } catch (swapError) {
            // --- CRITICAL FAILURE HANDLING ---
            console.error(`[Job ${jobId}] CRITICAL: The restore process failed during the final database swap.`, swapError);

            // Attempt to connect to the application DB to mark the job as failed.
            let errorUpdateConnection;
            try {
                console.log(`[Job ${jobId}] Attempting to connect to application DB to mark job as failed...`);
                const appDbConfig = {
                    server: dbServer,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: dbName, // Try to connect to the final DB name
                    options: {
                        encrypt: process.env.DB_ENCRYPT !== 'false',
                        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
                    }
                };
                errorUpdateConnection = await new sql.ConnectionPool(appDbConfig).connect();

                const duration = Math.round((Date.now() - startTime) / 1000);
                await errorUpdateConnection.request()
                    .input('JobID', sql.NVarChar(50), jobId)
                    .input('Status', sql.NVarChar(20), 'failed')
                    .input('Message', sql.NVarChar(500), `Restore failed during database swap: ${swapError.message}`)
                    .input('Duration', sql.Int, duration)
                    .input('ErrorMessage', sql.NVarChar(sql.MAX), swapError.stack)
                    .query('UPDATE BackupJobs SET Status = @Status, Message = @Message, Duration = @Duration, ErrorMessage = @ErrorMessage WHERE JobID = @JobID');
                console.log(`[Job ${jobId}] Successfully updated job status to 'failed' in application DB.`);
            } catch (updateError) {
                console.error(`[Job ${jobId}] FATAL: Could not update job status to 'failed' in any database.`, updateError);
            } finally {
                if (errorUpdateConnection && errorUpdateConnection.connected) {
                    await errorUpdateConnection.close();
                }
            }
            console.error(`[Job ${jobId}] Manual intervention may be required. The temporary database '${tempDbName}' might still exist.`);

        } finally {
            // 9. Always close any open connections and clean up files
            if (masterConnection && masterConnection.connected) {
                await masterConnection.close();
                console.log(`[Job ${jobId}] Master connection closed.`);
            }
            if (finalDbConnection && finalDbConnection.connected) {
                await finalDbConnection.close();
                console.log(`[Job ${jobId}] Final DB connection closed.`);
            }
            cleanup();
        }

    } catch (error) {
        const duration = Math.round((Date.now() - startTime) / 1000);
        await updateJob(jobId, 'failed', `Restore failed: ${error.message}`, { ErrorMessage: error.stack, Duration: duration });
        console.error(`[Job ${jobId}] Restore process failed:`, error);
        cleanup();

        // Clean up maintenance flag on failure
        const maintenanceFlagPath = path.join(__dirname, '..', 'maintenance.flag');
        if (fs.existsSync(maintenanceFlagPath)) {
            fs.unlinkSync(maintenanceFlagPath);
            console.log(`[Job ${jobId}] Maintenance flag removed after restore failure.`);
        }
    }
}

// --- POST /maintenance-start : Manually trigger maintenance mode ---
router.post('/maintenance-start', authMiddleware, async (req, res) => {
    try {
        const maintenanceFlagPath = path.join(__dirname, '..', 'maintenance.flag');
        fs.writeFileSync(maintenanceFlagPath, JSON.stringify({
            startedAt: new Date().toISOString(),
            startedBy: req.user.fullName,
            userId: req.user.userId
        }));

        console.log('[Maintenance] Maintenance mode activated by:', req.user.fullName);

        // Broadcast to all connected clients
        broadcast({ type: 'maintenance_starting' });

        res.status(200).json({
            success: true,
            message: 'Maintenance mode activated'
        });
    } catch (error) {
        console.error('[Maintenance] Failed to activate maintenance mode:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to activate maintenance mode'
        });
    }
});

module.exports = { router, executeBackup };
