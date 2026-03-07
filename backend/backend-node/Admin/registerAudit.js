const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');
const { uploadTextToBlob, downloadBlobAsText, generateSasUrl, registerContainerName } = require('../Storage/storage');
const { sendRegistrationApprovalEmail, sendRegistrationRejectionEmail } = require('../Email/email');

// --- SK Official List Endpoints ---

/**
 * GET /officials
 * Fetches the content of the SK Officials list for the admin's barangay.
 */
router.get('/officials', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin barangay not found.' });
        }
        const barangayName = barangayResult.recordset[0].barangayName;
        const blobName = `SK OFFICIAL - ${barangayName}.json`;

        const content = await downloadBlobAsText(registerContainerName, blobName);
        let officialsArray = [];
        try {
            if (content) {
                officialsArray = JSON.parse(content);
            }
        } catch (e) {
            console.error("Error parsing officials JSON:", e);
        }
        res.json({ success: true, content: officialsArray });

    } catch (error) {
        if (error.statusCode === 404) {
            // If the blob doesn't exist, it's not an error, just return empty content
            return res.json({ success: true, content: '' });
        }
        console.error("Error fetching SK officials list:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch SK officials list.' });
    }
});

/**
 * POST /officials
 * Creates or updates the SK Officials list for the admin's barangay.
 */
router.post('/officials', authMiddleware, async (req, res) => {
    const { officialsList } = req.body;

    if (!Array.isArray(officialsList)) {
        return res.status(400).json({ success: false, message: 'officialsList must be an array.' });
    }

    try {
        const pool = await getConnection();
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin barangay not found.' });
        }
        const barangayName = barangayResult.recordset[0].barangayName;
        const blobName = `SK OFFICIAL - ${barangayName}.json`;

        // Upload the JSON content as a string to Azure Blob Storage
        await uploadTextToBlob(registerContainerName, blobName, JSON.stringify(officialsList, null, 2));

        // Add audit trail
        addAuditTrail({
            actor: 'A',
            module: 'I',
            userID: req.user.userID,
            actions: 'update-sk-officials',
            descriptions: `Admin ${req.user.fullName} updated the SK Officials list for ${barangayName}.`
        });

        res.json({ success: true, message: 'SK Officials list updated successfully.' });

    } catch (error) {
        console.error("Error updating SK officials list:", error);
        res.status(500).json({ success: false, message: 'Failed to update SK officials list.' });
    }
});


// --- Registration Audit Log Endpoints ---

/**
 * GET /registrations
 * Fetches the combined registration audit trail from both AI and manual sources.
 */
router.get('/registrations', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const userBarangay = req.user.barangay;

        const query = `
            -- AI Audits
            SELECT 
                ra.auditID,
                ra.userID,
                pui.username,
                pui.fullName,
                pui.emailAddress,
                puie.dateOfBirth,
                ra.verificationReport,
                ra.attachmentPath,
                ra.attachmentPathBack,
                ra.processedAt,
                puie.status AS currentUserStatus, -- The user's current overall status
                puie.registeredAt,
                'Google Gemini AI' AS validatedBy,
                CASE 
                    WHEN ra.isApprove = 1 THEN 'Approved'
                    WHEN ra.isApprove = 0 THEN 'Rejected'
                    ELSE 'Pending AI Review' 
                END AS verdict
            FROM registrationAudit ra
            JOIN preUserInfo pui ON ra.userID = pui.userID
            LEFT JOIN preUserInfoEx puie ON ra.userID = puie.userID -- LEFT JOIN to ensure AI records always show
            WHERE pui.barangay = @userBarangay

            UNION ALL

            -- Manual Admin Audits
            SELECT 
                ram.auditID,
                ram.userID,
                pui.username,
                pui.fullName,
                pui.emailAddress,
                puie.dateOfBirth,
                ram.verificationReport,
                ram.attachmentPath,
                ram.attachmentPathBack,
                ram.processedAt,
                puie.status AS currentUserStatus,
                puie.registeredAt,
                ram.processedBy AS validatedBy,
                CASE 
                    WHEN ram.isApprove = 1 THEN 'Approved'
                    WHEN ram.isApprove = 0 THEN 'Rejected'
                    ELSE 'Unknown'
                END AS verdict
            FROM registrationAuditManual ram
            JOIN preUserInfo pui ON ram.userID = pui.userID
            LEFT JOIN preUserInfoEx puie ON ram.userID = puie.userID
            WHERE pui.barangay = @userBarangay

            ORDER BY processedAt DESC;
        `;

        const result = await pool.request()
            .input('userBarangay', sql.Int, userBarangay)
            .query(query);

        const decryptedLogs = result.recordset.map(log => ({
            ...log,
            username: decrypt(log.username),
            fullName: decrypt(log.fullName),
            emailAddress: decrypt(log.emailAddress),
        }));

        res.json({ success: true, data: decryptedLogs });

    } catch (error) {
        console.error("Error fetching registration audit logs:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch registration audit logs.' });
    }
});

/**
 * POST /override
 * Allows an admin to manually approve or reject a registration application.
 */
router.post('/override', authMiddleware, async (req, res) => {
    const { userID, verdict, report } = req.body;
    const adminUsername = req.user.fullName; // The admin performing the action

    if (!userID || !verdict || !report) {
        return res.status(400).json({ success: false, message: 'User ID, verdict, and report are required.' });
    }

    if (!['approved', 'rejected'].includes(verdict)) {
        return res.status(400).json({ success: false, message: 'Invalid verdict. Must be "approved" or "rejected".' });
    }

    try {
        const pool = await getConnection();
        const request = pool.request()
            .input('userID', sql.Int, userID)
            .input('adminReport', sql.NVarChar(sql.MAX), report)
            .input('adminUsername', sql.NVarChar(50), adminUsername);

        if (verdict === 'approved') {
            await request.execute('sp_ManuallyApprovePendingUser');
            addAuditTrail({
                actor: 'A',
                module: 'I',
                userID: req.user.userID,
                actions: 'manual-approve-registration',
                descriptions: `Admin ${adminUsername} manually approved registration for user ID ${userID}.`
            });
            // Send email but don't block the response if it fails
            sendRegistrationApprovalEmail(userID).catch(err => console.error("Failed to send approval email:", err));
            res.json({ success: true, message: 'User successfully approved.' });
        } else { // verdict === 'rejected'
            await request.execute('sp_ManuallyRejectApprovedUser');
            addAuditTrail({
                actor: 'A',
                module: 'I',
                userID: req.user.userID,
                actions: 'manual-reject-registration',
                descriptions: `Admin ${adminUsername} manually rejected registration for user ID ${userID}.`
            });
            // Send email but don't block the response if it fails
            sendRegistrationRejectionEmail(userID, report).catch(err => console.error("Failed to send rejection email:", err));
            res.json({ success: true, message: 'User successfully rejected.' });
        }
    } catch (error) {
        console.error(`Error during manual override for user ID ${userID}:`, error);
        res.status(500).json({ success: false, message: 'An error occurred during the override process.', error: error.message });
    }
});


/**
 * GET /attachment/:userId
 * Generates a SAS URL for a specific user's registration attachment.
 */
router.get('/attachment/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    const userBarangay = req.user.barangay; // Admin's barangay

    try {
        const pool = await getConnection();

        // Security Check: Verify the requested user belongs to the admin's barangay
        const userCheckResult = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT barangay FROM preUserInfo WHERE userID = @userID');

        if (userCheckResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const targetUserBarangay = userCheckResult.recordset[0].barangay;

        // Deny access if barangays don't match
        if (targetUserBarangay !== userBarangay) {
            return res.status(403).json({ success: false, message: 'Forbidden: You can only access attachments for users in your own barangay.' });
        }

        // Proceed if check passes
        const result = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT attachmentPath, attachmentPathBack FROM preUserInfoEx WHERE userID = @userID');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Attachment record not found for this user.' });
        }

        const { attachmentPath, attachmentPathBack } = result.recordset[0];

        if (!attachmentPath) {
            return res.status(404).json({ success: false, message: 'Primary attachment not found.' });
        }

        const frontUrl = await generateSasUrl(registerContainerName, attachmentPath);
        let backUrl = null;

        if (attachmentPathBack) {
            backUrl = await generateSasUrl(registerContainerName, attachmentPathBack);
        }

        res.json({ success: true, frontUrl, backUrl });

    } catch (error) {
        console.error(`Error generating SAS URL for user ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Could not generate file URL.' });
    }
});


module.exports = router;
