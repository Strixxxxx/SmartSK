const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const dbName = 'smartSK';
    
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const phTime = new Date(utc + (3600000 * 8));

    const date = phTime.toISOString().slice(0, 10);
    const time = phTime.toTimeString().slice(0, 8).replace(/:/g, '-');
    const backupFileName = `smartSK_${date}_${time}.bak`;

    const backupFilePath = path.join(__dirname, '..', '..', 'database_backup', backupFileName);

    // Ensure the backup directory exists
    const backupDir = path.dirname(backupFilePath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // SQL command to back up the database
    const backupQuery = `BACKUP DATABASE [${dbName}] TO DISK = '${backupFilePath}'`;

    console.log('Starting database backup...');
    await pool.request().query(backupQuery);
    console.log('Database backup completed successfully.');

    addAuditTrail({
        actor: 'A',
        module: 'B',
        userID: req.user.userId,
        actions: 'backup-database',
        oldValue: null,
        newValue: backupFileName,
        descriptions: `Admin ${req.user.fullName} created a database backup`
    });

    // Send an email notification after successful backup
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'luisalbertdeguzman@gmail.com',
        subject: 'Database Backup Completed',
        text: `The database backup for ${dbName} was completed successfully. The backup file is located at ${backupFilePath}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email');
        } else {
            console.log('Email sent');
        }
    });

    res.status(200).json({ message: 'Database backed up successfully.' });
  } catch (error) {
    console.error('Database backup failed');
    res.status(500).json({ message: 'Database backup failed. Please try again.' });
  }
});


router.post('/install', authMiddleware, async (req, res) => {
    const { file } = req.body;
    const dbName = 'smartSK';
    const backupFileName = `restore_${Date.now()}.bak`;
    const backupFilePath = path.join(__dirname, '..', '..', 'database_backup', backupFileName);

    let pool;

    try {
        if (!file) {
            console.log('No file uploaded.');
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        
        console.log('Writing backup file to disk...');
        fs.writeFileSync(backupFilePath, file, 'base64');
        console.log('Backup file written successfully.');

        console.log('Getting database connection pool...');
        pool = await getConnection();
        console.log('Database connection pool established.');

        // Step 1: Take the database OFFLINE with ROLLBACK IMMEDIATE to close all connections.
        console.log(`Setting database '${dbName}' to OFFLINE mode...`);
        await pool.request().query(`ALTER DATABASE [${dbName}] SET OFFLINE WITH ROLLBACK IMMEDIATE`);
        console.log('Database is now OFFLINE.');

        // Step 2: Restore the database from the backup file.
        console.log(`Starting restore of database '${dbName}'...`);
        await pool.request().query(`RESTORE DATABASE [${dbName}] FROM DISK = '${backupFilePath}' WITH REPLACE`);
        console.log('Database restore completed successfully.');

        addAuditTrail({
        actor: 'A',
        module: 'B',
        userID: req.user.userId,
        actions: 'restore-database',
        oldValue: null,
        newValue: backupFileName,
        descriptions: `Admin ${req.user.fullName} restored the database`
    });

        // Step 3: Bring the database back ONLINE.
        console.log(`Setting database '${dbName}' to ONLINE mode...`);
        await pool.request().query(`ALTER DATABASE [${dbName}] SET ONLINE`);
        console.log('Database is now ONLINE. Restore process finished.');

        res.status(200).json({ message: 'Database restored successfully.' });

    } catch (error) {
        console.error('Database restore failed');
        // Attempt to set the database back online even after a restore failure
        try {
            if (pool && pool.connected) {
                console.log('Attempting to set database back to ONLINE mode after failure...');
                await pool.request().query(`ALTER DATABASE [${dbName}] SET ONLINE`);
                console.log('Database successfully set to ONLINE mode after failure.');
            }
        } catch (onlineError) {
            console.error('Failed to set database to online mode after restore failure');
        }
        res.status(500).json({ message: 'Database restore failed. Please try again.' });
    } finally {
        // Clean up the uploaded file
        if (fs.existsSync(backupFilePath)) {
            console.log('Cleaning up temporary backup file...');
            fs.unlinkSync(backupFilePath);
            console.log('Temporary backup file removed.');
        }
        // getConnection() uses a singleton pool so no need to close it here
    }
});


module.exports = router;