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

module.exports = router;
