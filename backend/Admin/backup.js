const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DefaultAzureCredential } = require('@azure/identity');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { uploadBackupFile, listBackups, downloadBackupFile } = require('../Storage/storage');
const archiver = require('archiver');
const multer = require('multer');

// --- Backup Directory Setup ---
const backupDir = path.join(__dirname, '..', '..', 'database_backup');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory at: ${backupDir}`);
}

// --- Multer setup for local restore ---
const upload = multer({ dest: backupDir });

// --- Environment Variable Validation ---
const requiredEnv = ['DB_SERVER', 'DB_DATABASE', 'EMAIL_USER', 'EMAIL_PASS'];
for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}. Please check your .env file.`);
    }
}

const dbServer = process.env.AZURE_DB_SERVER;
const dbName = process.env.AZURE_DB_NAME;

// --- Helper function to get Azure AD Token ---
async function getAzureAdToken() {
    try {
        const credential = new DefaultAzureCredential();
        const tokenResponse = await credential.getToken("https://database.windows.net/.default");
        console.log("Successfully acquired Azure AD token.");
        return tokenResponse.token;
    } catch (error) {
        console.error("Failed to acquire Azure AD token:", error);
        throw new Error("Azure AD token acquisition failed. Ensure your environment is configured for DefaultAzureCredential (e.g., logged in with Azure CLI, Managed Identity, etc.).");
    }
}

// --- GET / : List available backups ---
router.get('/', authMiddleware, async (req, res) => {
    try {
        console.log("Fetching list of backups from Azure Storage...");
        const backups = await listBackups();
        console.log(`Found ${backups.length} backups.`);
        res.status(200).json(backups);
    } catch (error) {
        console.error('Failed to list backups:', error);
        res.status(500).json({ message: 'Failed to list backups.' });
    }
});

// --- POST / : Create a new database backup (Cloud-Only or Hybrid) ---
router.post('/', authMiddleware, async (req, res) => {
    const { backupType } = req.body; // 'hybrid' or 'cloud-only'

    if (!backupType || !['hybrid', 'cloud-only'].includes(backupType)) {
        return res.status(400).json({ message: "Backup type ('hybrid' or 'cloud-only') is required." });
    }
    if (backupType === 'hybrid' && !process.env.ZIP_LOCK) {
        return res.status(500).json({ message: 'ZIP_LOCK environment variable is not set for hybrid backup.' });
    }

    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
    const date = phTime.toISOString().slice(0, 10);
    const time = phTime.toTimeString().slice(0, 8).replace(/:/g, '-');
    const backupFileName = `smartSK_${date}_${time}.bacpac`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        console.log('Acquiring Azure AD token for database export...');
        const token = await getAzureAdToken();

        const command = `sqlpackage /a:Export /ssn:${dbServer} /sdn:${dbName} /tf:"${backupFilePath}" /uat:true`;

        console.log('Starting database backup using sqlpackage...');
        console.log(`Executing command: sqlpackage /a:Export /ssn:*** /sdn:*** /tf:"${backupFilePath}" /uat:true`);

        exec(command, { env: { ...process.env, SQLPACKAGE_ACCESSTOKEN: token } }, async (error, stdout, stderr) => {
            if (error) {
                console.error(`sqlpackage export failed: ${error.message}`);
                console.error(`stderr: ${stderr}`);
                return res.status(500).json({ message: 'Database backup failed.', error: stderr });
            }

            console.log('Database export to .bacpac completed successfully.');
            console.log(`stdout: ${stdout}`);

            try {
                console.log(`Uploading ${backupFileName} to Azure Storage...`);
                await uploadBackupFile(backupFilePath, backupFileName);
                console.log('Backup file uploaded to Azure Storage successfully.');

                addAuditTrail({
                    actor: 'A',
                    module: 'B',
                    userID: req.user.userId,
                    actions: `backup-database-${backupType}`,
                    oldValue: null,
                    newValue: backupFileName,
                    descriptions: `Admin ${req.user.fullName} created a ${backupType} database backup.`
                });

                if (backupType === 'hybrid') {
                    const zipFileName = backupFileName.replace('.bacpac', '.zip');
                    const zipFilePath = path.join(backupDir, zipFileName);
                    const output = fs.createWriteStream(zipFilePath);
                    
                    const archive = archiver('zip-encrypted', {
                        zlib: { level: 8 },
                        encryptionMethod: 'aes256',
                        password: process.env.ZIP_LOCK
                    });

                    output.on('close', () => {
                        console.log(`Archive created: ${zipFileName} (${archive.pointer()} total bytes)`);
                        res.download(zipFilePath, zipFileName, (err) => {
                            if (err) {
                                console.error('Error sending zip file to user:', err);
                            }
                            // Cleanup both zip and bacpac
                            fs.unlinkSync(zipFilePath);
                            fs.unlinkSync(backupFilePath);
                            console.log(`Cleaned up local files: ${zipFilePath} and ${backupFilePath}`);
                        });
                    });

                    archive.on('error', (err) => {
                        console.error('Archiving failed:', err);
                        if (!res.headersSent) {
                            res.status(500).json({ message: 'Failed to create zip archive.' });
                        }
                        fs.unlinkSync(backupFilePath); // Clean up bacpac on archive failure
                    });

                    archive.pipe(output);
                    archive.file(backupFilePath, { name: backupFileName });
                    await archive.finalize();
                    console.log('Archiving process finalized.');

                } else { // cloud-only
                    fs.unlinkSync(backupFilePath);
                    console.log(`Cleaned up local backup file: ${backupFilePath}`);
                    res.status(200).json({ message: 'Database backup created and uploaded successfully.' });
                }

            } catch (processError) {
                console.error('Failed to process backup file:', processError);
                if (!res.headersSent) {
                    res.status(500).json({ message: 'Database backup was created but failed during post-processing.' });
                }
                if (fs.existsSync(backupFilePath)) {
                    fs.unlinkSync(backupFilePath);
                }
            }
        });
    } catch (error) {
        console.error('Backup process failed:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
});

// --- POST /restore : Restore a database from a backup (Cloud or Local) ---
router.post('/restore', authMiddleware, upload.single('backupFile'), async (req, res) => {
    const { restoreType, fileName } = req.body; // 'cloud' or 'local'

    let downloadPath;
    let originalFileName;

    try {
        if (!restoreType || !['cloud', 'local'].includes(restoreType)) {
            if (req.file) fs.unlinkSync(req.file.path); // Clean up uploaded file if restoreType is invalid
            return res.status(400).json({ message: "Restore type ('cloud' or 'local') is required." });
        }

        if (restoreType === 'local') {
            if (!req.file) {
                return res.status(400).json({ message: 'No backup file uploaded for local restore.' });
            }
            downloadPath = req.file.path;
            originalFileName = req.file.originalname;
            console.log(`Using uploaded local file for restore: ${originalFileName} at ${downloadPath}`);
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

        console.log('Acquiring Azure AD token for database import...');
        const token = await getAzureAdToken();

        const command = `sqlpackage /a:Import /tsn:${dbServer} /tdn:${dbName} /sf:"${downloadPath}" /uat:true`;
        
        console.log('Starting database restore using sqlpackage...');
        console.log(`Executing command: sqlpackage /a:Import /tsn:*** /tdn:*** /sf:"${downloadPath}" /uat:true`);

        exec(command, { env: { ...process.env, SQLPACKAGE_ACCESSTOKEN: token } }, (error, stdout, stderr) => {
            // Clean up the downloaded/uploaded file regardless of outcome
            if (fs.existsSync(downloadPath)) {
                fs.unlinkSync(downloadPath);
                console.log(`Cleaned up local backup file: ${downloadPath}`);
            }

            if (error) {
                console.error(`sqlpackage import failed: ${error.message}`);
                console.error(`stderr: ${stderr}`);
                return res.status(500).json({ message: 'Database restore failed.', error: stderr });
            }

            console.log('Database import/restore completed successfully.');
            console.log(`stdout: ${stdout}`);

            addAuditTrail({
                actor: 'A',
                module: 'B',
                userID: req.user.userId,
                actions: 'restore-database',
                oldValue: null,
                newValue: originalFileName,
                descriptions: `Admin ${req.user.fullName} restored the database from ${originalFileName} (${restoreType}).`
            });

            res.status(200).json({ message: 'Database restored successfully.' });
        });

    } catch (error) {
        console.error('Restore process failed:', error.message);
        // Clean up if download failed or something else went wrong before exec
        if (downloadPath && fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
            console.log(`Cleaned up local backup file after error: ${downloadPath}`);
        }
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
});

module.exports = router;
