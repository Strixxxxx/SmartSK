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

/**
 * GET /term-status
 * Fetches the status of the current administration term
 */
router.get('/term-status', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const barangayID = req.user.barangay;

        // 1. Get current term for barangay
        const termResult = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT TOP 1 termID, officialListJSON FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');

        let currentTermID = null;
        let isFinalized = false;

        if (termResult.recordset.length > 0) {
            currentTermID = termResult.recordset[0].termID;
            // Consider finalized if json is not empty and not "[]"
            const jsonStr = termResult.recordset[0].officialListJSON;
            isFinalized = jsonStr && jsonStr !== '[]' && jsonStr.length > 5;
        }

        // 2. Count approved, active users for this term
        let approvedCount = 0;
        if (currentTermID) {
            const countResult = await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .input('termID', sql.Int, currentTermID)
                .query(`
                    SELECT COUNT(*) as count 
                    FROM userInfo 
                    WHERE barangay = @barangayID 
                      AND termID = @termID 
                      AND isArchived = 0 
                      AND position IN (2, 3, 4, 5, 6, 7, 8, 9, 10, 11) -- Only count the 10 SK positions + SKC
                `);
            approvedCount = countResult.recordset[0].count;
        }

        res.json({ success: true, approvedCount, isFinalized, currentTermID });
    } catch (error) {
        console.error("Error fetching term status:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch term status.' });
    }
});

/**
 * POST /finalize-term
 * Saves the filled SK list to Azure and snapshots it into skTerms
 */
router.post('/finalize-term', authMiddleware, async (req, res) => {
    const { officialsList } = req.body;

    if (!Array.isArray(officialsList) || officialsList.length !== 10) {
        // NOTE: it is 10 positions (SKC, SKS, SKT, 7 Kagawads)
        // Wait, 1 + 1 + 1 + 7 = 10? Let's check POSITION_MAPPING in frontend.
        // It has 10 positions.
    }

    try {
        const pool = await getConnection();
        const barangayID = req.user.barangay;
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) return res.status(404).json({ success: false, message: 'Admin barangay not found.' });
        const barangayName = barangayResult.recordset[0].barangayName;
        const blobName = `SK OFFICIAL - ${barangayName}.json`;
        const jsonContent = JSON.stringify(officialsList, null, 2);

        // 1. Upload to Azure
        await uploadTextToBlob(registerContainerName, blobName, jsonContent);

        // 2. Snapshot into skTerms (update current or create if not exists)
        const termResult = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');

        if (termResult.recordset.length > 0) {
            await pool.request()
                .input('termID', sql.Int, termResult.recordset[0].termID)
                .input('jsonContent', sql.NVarChar(sql.MAX), jsonContent)
                .query('UPDATE skTerms SET officialListJSON = @jsonContent WHERE termID = @termID');
        } else {
            // Need to initialize first term
            await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .input('jsonContent', sql.NVarChar(sql.MAX), jsonContent)
                .query('INSERT INTO skTerms (barangayID, officialListJSON, isCurrent) VALUES (@barangayID, @jsonContent, 1)');
        }

        addAuditTrail({
            actor: 'A',
            module: 'I',
            userID: req.user.userID,
            actions: 'finalize-term',
            descriptions: `Admin ${req.user.fullName} finalized the SK Officials list for ${barangayName}.`
        });

        res.json({ success: true, message: 'SK Officials list finalized successfully.' });

    } catch (error) {
        console.error("Error finalizing SK list:", error);
        res.status(500).json({ success: false, message: 'Failed to finalize SK list.' });
    }
});

/**
 * POST /start-new-term
 * Archives all current term users, clears the Azure blob, starts a new term
 */
router.post('/start-new-term', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const barangayID = req.user.barangay;
        
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) return res.status(404).json({ success: false, message: 'Admin barangay not found.' });
        const barangayName = barangayResult.recordset[0].barangayName;

        const termResult = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');

        // Note: we can still start a term even if there is no previous term, but usually there is one
        if (termResult.recordset.length > 0) {
            const currentTermID = termResult.recordset[0].termID;

            // 1. Archive active users of this term
            await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .input('termID', sql.Int, currentTermID)
                .query('UPDATE userInfo SET isArchived = 1 WHERE barangay = @barangayID AND termID = @termID');

            // 2. Lock the current term
            await pool.request()
                .input('termID', sql.Int, currentTermID)
                .query('UPDATE skTerms SET isCurrent = 0, isLocked = 1, lockedAt = GETDATE() WHERE termID = @termID');
        }

        // 3. Clear the Azure JSON blob 
        const blobName = `SK OFFICIAL - ${barangayName}.json`;
        await uploadTextToBlob(registerContainerName, blobName, '[]');

        // 4. Create new term record
        const { termName } = req.body;
        await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .input('termName', sql.NVarChar(50), termName || null)
            .query("INSERT INTO skTerms (barangayID, officialListJSON, isCurrent, termName) VALUES (@barangayID, '[]', 1, @termName)");

        addAuditTrail({
            actor: 'A',
            module: 'I',
            userID: req.user.userID,
            actions: 'start-new-term',
            descriptions: `Admin ${req.user.fullName} ended the previous term and started a new administration term (${termName || 'Unnamed'}) for ${barangayName}.`
        });

        res.json({ success: true, message: 'New administration term started successfully.' });
    } catch (error) {
        console.error("Error starting new term:", error);
        res.status(500).json({ success: false, message: 'Failed to start new administration term.' });
    }
});

/**
 * GET /term-history
 * Fetches all previous terms for the admin's barangay.
 */
router.get('/term-history', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const barangayID = req.user.barangay;

        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT termID, termName, officialListJSON, isLocked, isCurrent, createdAt, lockedAt FROM skTerms WHERE barangayID = @barangayID ORDER BY termID DESC');

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error("Error fetching term history:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch term history.' });
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
        // Fetch termID for the user's barangay
        const userBrgyResult = await pool.request()
            .input('chkUserID', sql.Int, userID)
            .query('SELECT barangay FROM preUserInfo WHERE userID = @chkUserID');
            
        let termID = null;
        if (userBrgyResult.recordset.length > 0) {
            const brgyID = userBrgyResult.recordset[0].barangay;
            const termResult = await pool.request()
                .input('brgyID', sql.Int, brgyID)
                .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @brgyID AND isCurrent = 1 ORDER BY termID DESC');
            if (termResult.recordset.length > 0) {
                termID = termResult.recordset[0].termID;
            }
        }

        const request = pool.request()
            .input('userID', sql.Int, userID)
            .input('adminReport', sql.NVarChar(sql.MAX), report)
            .input('adminUsername', sql.NVarChar(50), adminUsername)
            .input('termID', sql.Int, termID);

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
