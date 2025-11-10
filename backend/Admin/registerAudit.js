const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');
const { uploadTextToBlob, downloadBlobAsText, generateSasUrl, registerContainerName } = require('../Storage/storage');

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
        const blobName = `SK OFFICIAL - ${barangayName}.txt`;

        const content = await downloadBlobAsText(registerContainerName, blobName);
        res.json({ success: true, content: content || '' });

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

    if (typeof officialsList !== 'string') {
        return res.status(400).json({ success: false, message: 'officialsList must be a string.' });
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
        const blobName = `SK OFFICIAL - ${barangayName}.txt`;

        // Upload the text content to Azure Blob Storage
        await uploadTextToBlob(registerContainerName, blobName, officialsList);

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
 * Fetches the registration audit trail.
 */
router.get('/registrations', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const userBarangay = req.user.barangay; // Get barangay from authenticated user

        const result = await pool.request()
            .input('userBarangay', sql.Int, userBarangay)
            .query(`
                SELECT 
                    ra.auditID,
                    ra.userID,
                    pui.username,
                    pui.fullName,
                    pui.emailAddress,
                    ra.verificationReport,
                    ra.attachmentPath,
                    ra.processedAt,
                    puie.status,
                    puie.rejectionReason,
                    puie.registeredAt
                FROM registrationAudit ra
                JOIN preUserInfo pui ON ra.userID = pui.userID
                JOIN preUserInfoEx puie ON ra.userID = puie.userID
                WHERE pui.barangay = @userBarangay
                ORDER BY ra.processedAt DESC
            `);

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
            .query('SELECT attachmentPath FROM registrationAudit WHERE userID = @userID');

        if (result.recordset.length === 0 || !result.recordset[0].attachmentPath) {
            return res.status(404).json({ success: false, message: 'Attachment not found for this user.' });
        }

        const blobName = result.recordset[0].attachmentPath;
        const sasUrl = await generateSasUrl(registerContainerName, blobName);

        res.json({ success: true, url: sasUrl });

    } catch (error) {
        console.error(`Error generating SAS URL for user ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Could not generate file URL.' });
    }
});


module.exports = router;
