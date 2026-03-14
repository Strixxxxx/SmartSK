const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { decrypt } = require('../utils/crypto');

/**
 * GET /:batchID/audit
 * Fetch all audit trail entries for a given project batch,
 * joined with user info (full name).
 */
/**
 * Helper: Insert a new audit entry into projectAuditTrail.
 * This can be used by other routes to log actions.
 */
async function createAuditEntry({
    pool,
    batchID,
    userID,
    action,
    oldValue = null,
    newValue = null,
    center = null,
    abyipID = null,
    cbydpID = null
}) {
    try {
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('action', sql.NVarChar, action)
            .input('oldValue', sql.NVarChar, oldValue)
            .input('newValue', sql.NVarChar, newValue)
            .input('center', sql.NVarChar, center)
            .input('abyipID', sql.Int, abyipID)
            .input('cbydpID', sql.Int, cbydpID)
            .query(`
                INSERT INTO projectAuditTrail 
                (batchID, userID, action, oldValue, newValue, centerOfParticipation, abyipID, cbydpID)
                VALUES 
                (@batchID, @userID, @action, @oldValue, @newValue, @center, @abyipID, @cbydpID)
            `);
        return true;
    } catch (error) {
        console.error('Error creating audit entry:', error);
        return false;
    }
}

router.get('/:batchID/audit', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { center } = req.query;

        const pool = await getConnection();
        const result = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('center', sql.NVarChar, center || null)
            .query(`
                SELECT
                    a.auditID,
                    a.batchID,
                    a.abyipID,
                    a.cbydpID,
                    a.action,
                    a.oldValue,
                    a.newValue,
                    a.timestamp,
                    a.centerOfParticipation,
                    u.fullName,
                    u.userID
                FROM projectAuditTrail a
                JOIN userInfo u ON a.userID = u.userID
                WHERE a.batchID = @batchID
                AND (@center IS NULL OR a.centerOfParticipation = @center)
                ORDER BY a.timestamp DESC
            `);

        // Decrypt full names
        const logs = result.recordset.map(row => {
            let decryptedName = row.fullName;
            try { decryptedName = decrypt(row.fullName); } catch { }
            return { ...row, fullName: decryptedName };
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('Error fetching audit trail:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = {
    router,
    createAuditEntry
};
