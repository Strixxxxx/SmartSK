const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt, encrypt } = require('../utils/crypto');
const { uploadTextToBlob, downloadBlobAsText, aiProjContainerName } = require('../Storage/storage');

// --- AI Project Rules Endpoints ---

/**
 * GET /ai-rules
 * Fetches the content of the Project AI Rules list for the chairperson's barangay.
 */
router.get('/ai-rules', authMiddleware, async (req, res) => {
    // Ensure user is SK Chairperson
    if (req.user.position !== 'SKC') {
        return res.status(403).json({ success: false, message: 'Forbidden: Only SK Chairpersons can access AI rules.' });
    }

    try {
        const pool = await getConnection();
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Chairperson barangay not found.' });
        }
        const barangayName = barangayResult.recordset[0].barangayName;
        const blobName = `PROJECT RULES - ${barangayName}.txt`;

        const content = await downloadBlobAsText(aiProjContainerName, blobName);
        res.json({ success: true, content: content || '' });

    } catch (error) {
        if (error.statusCode === 404) {
            return res.json({ success: true, content: '' });
        }
        console.error("Error fetching AI project rules:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch AI project rules.' });
    }
});

/**
 * POST /ai-rules
 * Creates or updates the Project AI Rules list for the chairperson's barangay.
 */
router.post('/ai-rules', authMiddleware, async (req, res) => {
    const { rules } = req.body;

    if (req.user.position !== 'SKC') {
        return res.status(403).json({ success: false, message: 'Forbidden: Only SK Chairpersons can modify AI rules.' });
    }
    if (typeof rules !== 'string') {
        return res.status(400).json({ success: false, message: 'Rules must be a string.' });
    }

    try {
        const pool = await getConnection();
        const barangayResult = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');

        if (barangayResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Chairperson barangay not found.' });
        }
        const barangayName = barangayResult.recordset[0].barangayName;
        const blobName = `PROJECT RULES - ${barangayName}.txt`;

        await uploadTextToBlob(aiProjContainerName, blobName, rules);

        addAuditTrail({
            actor: 'A',
            module: 'P',
            userID: req.user.userID,
            actions: 'update-project-ai-rules',
            descriptions: `SK Chairperson ${req.user.fullName} updated the AI Project Rules for ${barangayName}.`
        });

        res.json({ success: true, message: 'AI Project Rules updated successfully.' });

    } catch (error) {
        console.error("Error updating AI project rules:", error);
        res.status(500).json({ success: false, message: 'Failed to update AI project rules.' });
    }
});


// --- Project Audit Log Endpoints ---

/**
 * GET /audit
 * Fetches the combined project audit trail from both AI and manual sources.
 */
router.get('/audit', authMiddleware, async (req, res) => {
    if (req.user.position !== 'SKC') {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    try {
        const pool = await getConnection();
        const userBarangay = req.user.barangay;

        const query = `
            SELECT 
                pa.auditID,
                p.projectID,
                p.reference_number AS referenceNumber,
                p.title,
                u.fullName AS proposerName,
                pa.verificationReport,
                pa.decision,
                pa.processedAt,
                'Google Gemini AI' AS validatedBy,
                NULL AS justification,
                NULL AS overriddenAt
            FROM projectAudit pa
            JOIN projects p ON pa.projectID = p.projectID
            JOIN userInfo u ON p.userID = u.userID
            WHERE u.barangay = @userBarangay

            UNION ALL

            SELECT 
                pma.auditID,
                p.projectID,
                p.reference_number AS referenceNumber,
                p.title,
                submitter.fullName AS proposerName,
                pma.justification AS verificationReport, -- Show justification in the main report area
                pma.newDecision AS decision,
                pma.overriddenAt AS processedAt,
                overrider.fullName AS validatedBy,
                pma.justification,
                pma.overriddenAt
            FROM projectAuditManual pma
            JOIN projectAudit pa ON pma.auditID = pa.auditID
            JOIN projects p ON pa.projectID = p.projectID
            JOIN userInfo submitter ON p.userID = submitter.userID
            JOIN userInfo overrider ON pma.userID = overrider.userID
            WHERE submitter.barangay = @userBarangay

            ORDER BY processedAt DESC;
        `;

        const result = await pool.request()
            .input('userBarangay', sql.Int, userBarangay)
            .query(query);

        const decryptedLogs = result.recordset.map(log => ({
            ...log,
            title: decrypt(log.title),
            proposerName: decrypt(log.proposerName),
            validatedBy: log.validatedBy.startsWith('Google') ? log.validatedBy : decrypt(log.validatedBy)
        }));

        res.json({ success: true, data: decryptedLogs });

    } catch (error) {
        console.error("Error fetching project audit logs:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch project audit logs.' });
    }
});

/**
 * POST /manual-override
 * Allows a chairperson to manually override an AI decision for a project.
 */
router.post('/manual-override', authMiddleware, async (req, res) => {
    const { auditID, newDecision, justification } = req.body;
    const adminUserID = req.user.userID;

    if (req.user.position !== 'SKC') {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    if (!auditID || !newDecision || !justification) {
        return res.status(400).json({ success: false, message: 'Audit ID, new decision, and justification are required.' });
    }
    if (!['approved', 'rejected'].includes(newDecision)) {
        return res.status(400).json({ success: false, message: 'Invalid decision. Must be "approved" or "rejected".' });
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        // 1. Get projectID and previous decision from the original audit record
        const auditResult = await new sql.Request(transaction)
            .input('auditID', sql.Int, auditID)
            .query('SELECT projectID, decision FROM projectAudit WHERE auditID = @auditID');

        if (auditResult.recordset.length === 0) {
            throw new Error('Original AI audit record not found.');
        }
        const { projectID, decision: previousDecision } = auditResult.recordset[0];

        // 2. Insert the manual override record
        await new sql.Request(transaction)
            .input('auditID', sql.Int, auditID)
            .input('userID', sql.Int, adminUserID)
            .input('previousDecision', sql.VarChar, previousDecision)
            .input('newDecision', sql.VarChar, newDecision)
            .input('justification', sql.NVarChar, justification)
            .query(`
                INSERT INTO projectAuditManual (auditID, userID, previousDecision, newDecision, justification, overriddenAt)
                VALUES (@auditID, @userID, @previousDecision, @newDecision, @justification, GETDATE())
            `);

        // 3. Update the project's actual status
        const statusMap = { 'approved': 3, 'rejected': 4 }; // Assuming 3=Accepted, 4=Rejected
        const newStatusId = statusMap[newDecision];

        await new sql.Request(transaction)
            .input('projectID', sql.Int, projectID)
            .input('statusId', sql.Int, newStatusId)
            .input('remarks', sql.NVarChar, encrypt(`Manually overridden by SK Chairperson. Justification: ${justification}`))
            .input('reviewedBy', sql.NVarChar, encrypt(req.user.fullName))
            .query('UPDATE projects SET status = @statusId, remarks = @remarks, reviewedBy = @reviewedBy WHERE projectID = @projectID');
        
        // 4. Add to main audit trail
        addAuditTrail({
            actor: 'A',
            module: 'P',
            userID: adminUserID,
            actions: 'manual-override-project',
            oldValue: `ProjectID: ${projectID}, AI Decision: ${previousDecision}`,
            newValue: `New Decision: ${newDecision}`,
            descriptions: `SK Chairperson manually overrode AI decision for project ${projectID}.`
        });

        await transaction.commit();
        res.json({ success: true, message: 'Project status successfully overridden.' });

    } catch (error) {
        await transaction.rollback();
        console.error(`Error during manual override for audit ID ${auditID}:`, error);
        res.status(500).json({ success: false, message: 'An error occurred during the override process.', error: error.message });
    }
});

module.exports = router;
