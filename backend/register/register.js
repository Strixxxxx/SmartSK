const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { spawn } = require('child_process');
const path = require('path');
const { getConnection, sql } = require('../database/database');
const { uploadBlob, registerContainerName, downloadBlobToBuffer } = require('../Storage/storage');
const { sendRegistrationApprovalEmail, sendRegistrationRejectionEmail } = require('../Email/email');
const { encrypt, decrypt, generateUsernameHash, generateEmailHash, generatePhoneNumberHash } = require('../utils/crypto');
const { addAuditTrail } = require('../audit/auditService');
const { getPHTimestamp } = require('../utils/time');
const bcrypt = require('bcrypt');

// Use in-memory storage for multer to handle the file as a buffer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('File type not supported. Please upload a JPG, PNG, or PDF.'));
    }
});

/**
 * Event handler for when the AI processing script finishes.
 * @param {number} userID - The ID of the user whose registration was processed.
 */
const handleAIJobCompletion = async (userID) => {
    console.log(`AI job completed for userID: ${userID}. Checking final status.`);
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('userID', sql.Int, userID)
            .query(`
                SELECT 
                    pui.username, 
                    puie.status, 
                    puie.rejectionReason 
                FROM preUserInfo pui
                JOIN preUserInfoEx puie ON pui.userID = puie.userID
                WHERE pui.userID = @userID
            `);

        if (result.recordset.length > 0) {
            const { username, status, rejectionReason } = result.recordset[0];
            const decryptedUsername = decrypt(username);
            console.log(`Final status for userID ${userID} ('${decryptedUsername}') is '${status}'.`);

            // Add audit trail for system decision
            addAuditTrail({
                actor: 'S',
                module: 'I',
                userID: null, // User is not in userInfo table until after approval
                actions: `system-registration-${status}`,
                descriptions: `System ${status} registration for user '${decryptedUsername}' (Pending ID: ${userID}). Reason: ${rejectionReason || 'N/A'}`
            });

            if (status === 'approved') {
                await sendRegistrationApprovalEmail(userID);
            } else { // Covers 'rejected' and any other non-approved status
                await sendRegistrationRejectionEmail(userID, rejectionReason || 'Your application could not be approved at this time.');
            }
        } else {
             console.error(`Could not find status for userID ${userID} after AI job completion.`);
             await sendRegistrationRejectionEmail(userID, 'A record-keeping error occurred after processing your application. Please contact support.');
        }
    } catch (error) {
        console.error(`Error in handleAIJobCompletion for userID ${userID}:`, error);
        try {
            await sendRegistrationRejectionEmail(userID, 'An unexpected error occurred during the final processing of your application. Please contact support.');
        } catch (emailError) {
            console.error(`Failed to send fallback rejection email for userID ${userID}:`, emailError);
        }
    }
};

// POST /api/register/validate-field
router.post('/validate-field', async (req, res) => {
    const { field, value } = req.body;
    if (!field || !value) {
        return res.status(400).json({ success: false, message: 'Field and value are required.' });
    }

    let hash;
    let columnName;

    switch (field) {
        case 'username':
            hash = generateUsernameHash(value);
            columnName = 'usernameHash';
            break;
        case 'emailAddress':
            hash = generateEmailHash(value);
            columnName = 'emailHash';
            break;
        case 'phoneNumber':
            hash = generatePhoneNumberHash(value);
            columnName = 'phoneHash';
            break;
        default:
            return res.status(400).json({ success: false, message: 'Invalid field specified for validation.' });
    }

    if (!hash) {
        return res.status(400).json({ success: false, message: 'Invalid value provided.' });
    }

    try {
        const pool = await getConnection();
        const preUserCheck = await pool.request()
            .input('hash', sql.VarChar(64), hash)
            .query(`SELECT 1 FROM preUserInfo WHERE ${columnName} = @hash`);

        const mainUserCheck = await pool.request()
            .input('hash', sql.VarChar(64), hash)
            .query(`SELECT 1 FROM userInfo WHERE ${columnName} = @hash`);

        if (preUserCheck.recordset.length > 0 || mainUserCheck.recordset.length > 0) {
            return res.json({ exists: true });
        } else {
            return res.json({ exists: false });
        }
    } catch (error) {
        console.error(`Error checking ${field}:`, error);
        res.status(500).json({ success: false, message: `Error checking ${field}.` });
    }
});

// POST /api/register
router.post('/', upload.single('attachment'), async (req, res) => {
    const { username, fullName, barangay, emailAddress, phoneNumber, dateOfBirth, password } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, message: 'Attachment file is required.' });
    }

    let newUserId;

    try {
        // 1. Watermark the image (if it's an image)
        let fileBuffer = file.buffer;
        if (file.mimetype.startsWith('image/')) {
            const metadata = await sharp(file.buffer).metadata();
            const width = metadata.width;
            const height = metadata.height;

            const textWatermarkSvg = `
                <svg width="${width}" height="${height}">
                    <text x="50%" y="50%" text-anchor="middle" style="font-size: ${Math.max(40, width / 12)}px; fill: rgba(0, 0, 0, 0.3); font-weight: bold; font-family: Arial, sans-serif;">
                        FOR VERIFICATION ONLY
                    </text>
                    <text x="50%" y="50%" dy="1.8em" text-anchor="middle" style="font-size: ${Math.max(16, width / 35)}px; fill: rgba(0, 0, 0, 0.5); font-family: Arial, sans-serif;">
                        smartSK © 2025
                    </text>
                </svg>`;
            
            const textWatermarkBuffer = Buffer.from(textWatermarkSvg);

            // Composite only the text watermark on top
            fileBuffer = await sharp(file.buffer)
                .composite([
                    { input: textWatermarkBuffer, gravity: 'center' }
                ])
                .toBuffer();
        }

        // 2. Encrypt PII, hash password, and generate lookup hashes
        const encryptedUsername = encrypt(username);
        const encryptedFullName = encrypt(fullName);
        const encryptedEmail = encrypt(emailAddress);
        const encryptedPhone = encrypt(phoneNumber);
        const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt round

        const usernameHash = generateUsernameHash(username);
        const emailHash = generateEmailHash(emailAddress);
        const phoneHash = generatePhoneNumberHash(phoneNumber);

        // 3. Upload watermarked file to the correct Azure container
        const blobName = `${Date.now()}-${username}-${file.originalname}`;
        const attachmentPath = await uploadBlob(registerContainerName, blobName, fileBuffer, file.mimetype);
        console.log(`File uploaded to Azure container '${registerContainerName}'. Blob Name: ${attachmentPath}`);

        // 4. Insert all data into preUserInfo and preUserInfoEx
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const userResult = await transaction.request()
                .input('username', sql.NVarChar(sql.MAX), encryptedUsername)
                .input('passKey', sql.NVarChar(255), hashedPassword)
                .input('fullName', sql.NVarChar(sql.MAX), encryptedFullName)
                .input('position', sql.Int, 4) // Default to 'SKO' (SK Official)
                .input('barangay', sql.Int, barangay === 'San Bartolome' ? 1 : 2)
                .input('emailAddress', sql.NVarChar(sql.MAX), encryptedEmail)
                .input('phoneNumber', sql.NVarChar(sql.MAX), encryptedPhone)
                .input('emailHash', sql.VarChar(64), emailHash)
                .input('usernameHash', sql.VarChar(64), usernameHash)
                .input('phoneHash', sql.VarChar(64), phoneHash)
                .query(`
                    INSERT INTO preUserInfo (username, passKey, fullName, position, barangay, emailAddress, phoneNumber, emailHash, usernameHash, phoneHash)
                    OUTPUT INSERTED.userID
                    VALUES (@username, @passKey, @fullName, @position, @barangay, @emailAddress, @phoneNumber, @emailHash, @usernameHash, @phoneHash);
                `);
            
            newUserId = userResult.recordset[0].userID;

            const registeredAt = getPHTimestamp();

            await transaction.request()
                .input('userID', sql.Int, newUserId)
                .input('dateOfBirth', sql.Date, new Date(dateOfBirth))
                .input('attachmentPath', sql.NVarChar(sql.MAX), attachmentPath)
                .input('registeredAt', sql.DateTime, registeredAt)
                .query(`
                    INSERT INTO preUserInfoEx (userID, dateOfBirth, attachmentPath, registeredAt)
                    VALUES (@userID, @dateOfBirth, @attachmentPath, @registeredAt);
                `);

            await transaction.commit();
            console.log(`User pending data inserted for userID: ${newUserId}`);

            // Add audit trail for user submission
            addAuditTrail({
                actor: 'U',
                module: 'I',
                userID: null, // Pass null as the user is not in the main userInfo table yet
                actions: 'user-registration-submit',
                descriptions: `User '${username}' (Pending ID: ${newUserId}) submitted a registration application.`
            });

        } catch (dbError) {
            await transaction.rollback();
            console.error('Database insertion failed:', dbError);
            return res.status(500).json({ success: false, message: 'Failed to save registration data.' });
        }

        // 5. Spawn the Python AI job
        const pythonScriptPath = path.join(__dirname, '..', 'AI', 'accountAIJobs.py');
        const childProcess = spawn('python', [pythonScriptPath, newUserId]);

        // 6. Attach event listeners
        childProcess.stdout.on('data', (data) => console.log(`[AI_JOB_${newUserId}] stdout: ${data}`));
        childProcess.stderr.on('data', (data) => console.error(`[AI_JOB_${newUserId}] stderr: ${data}`));

        childProcess.on('close', (code) => {
            console.log(`[AI_JOB_${newUserId}] child process exited with code ${code}`);
            handleAIJobCompletion(newUserId);
        });
        
        childProcess.on('error', (err) => {
            console.error(`[AI_JOB_${newUserId}] Failed to start subprocess:`, err);
            handleAIJobCompletion(newUserId);
        });

        // 7. Immediately send a 202 Accepted response
        res.status(202).json({ success: true, message: 'Registration submitted. Please check your email for updates.' });

    } catch (error) {
        console.error('Registration process failed:', error);
        res.status(500).json({ success: false, message: 'An unexpected error occurred during registration.' });
    }
});

module.exports = router;
