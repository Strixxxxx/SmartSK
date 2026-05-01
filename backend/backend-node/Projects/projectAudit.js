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
    cbydpID = null,
    targetColumn = null
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
            .input('targetColumn', sql.NVarChar, targetColumn)
            .query(`
                INSERT INTO projectAuditTrail 
                (batchID, userID, action, oldValue, newValue, centerOfParticipation, abyipID, cbydpID, targetColumn)
                VALUES 
                (@batchID, @userID, @action, @oldValue, @newValue, @center, @abyipID, @cbydpID, @targetColumn)
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
                    a.targetColumn,
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

/**
 * POST /revert/:auditID
 * Revert a specific edit action to its oldValue.
 * Includes Security (Author only) and OCC (Warn if newer edits exist).
 */
router.post('/revert/:auditID', authMiddleware, async (req, res) => {
    try {
        const { auditID } = req.params;
        const { force } = req.body; // force = true skips OCC warning
        const currentUserID = req.user.userID;

        const pool = await getConnection();

        // 1. Fetch the target audit entry
        const auditRes = await pool.request()
            .input('auditID', sql.Int, auditID)
            .query('SELECT * FROM projectAuditTrail WHERE auditID = @auditID');

        if (!auditRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Audit entry not found.' });
        }

        const audit = auditRes.recordset[0];

        // 2. Security: Only author can revert
        if (audit.userID !== currentUserID) {
            return res.status(403).json({ success: false, message: 'Permission Denied: You can only undo your own actions.' });
        }

        // 3. Action Check: Only EDIT and EDIT_AGENDA are reversible
        if (!['EDIT', 'EDIT_AGENDA'].includes(audit.action)) {
            return res.status(400).json({ success: false, message: 'This action type cannot be reverted.' });
        }

        const { batchID, abyipID, cbydpID, targetColumn, oldValue, timestamp } = audit;

        if (!targetColumn) {
            return res.status(400).json({ success: false, message: 'Missing target column info. This entry might be too old.' });
        }

        // 4. Optimistic Concurrency Control (OCC)
        if (!force) {
            const newerAuditRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('abyipID', sql.Int, abyipID)
                .input('cbydpID', sql.Int, cbydpID)
                .input('targetColumn', sql.NVarChar, targetColumn)
                .input('targetTime', sql.DateTime, timestamp)
                .query(`
                    SELECT TOP 1 newValue, u.fullName 
                    FROM projectAuditTrail a
                    JOIN userInfo u ON a.userID = u.userID
                    WHERE a.batchID = @batchID 
                    AND (a.abyipID = @abyipID OR (a.abyipID IS NULL AND @abyipID IS NULL))
                    AND (a.cbydpID = @cbydpID OR (a.cbydpID IS NULL AND @cbydpID IS NULL))
                    AND a.targetColumn = @targetColumn
                    AND a.timestamp > @targetTime
                    ORDER BY a.timestamp DESC
                `);

            if (newerAuditRes.recordset.length) {
                const latest = newerAuditRes.recordset[0];
                let editorName = latest.fullName;
                try { editorName = decrypt(latest.fullName); } catch { }

                return res.status(409).json({
                    success: false,
                    collision: true,
                    message: `This value has been updated more recently by another user. Are you sure you want to overwrite it?`,
                    currentValue: latest.newValue,
                    lastEditor: editorName
                });
            }
        }

        // 5. Execute Reversion
        let updateQuery = '';
        let targetID = null;

        if (audit.action === 'EDIT_AGENDA') {
            updateQuery = `UPDATE projectAgenda SET [${targetColumn}] = @val WHERE batchID = @batchID`;
            targetID = batchID;
        } else if (abyipID) {
            updateQuery = `UPDATE projectABYIP SET [${targetColumn}] = @val WHERE abyipID = @abyipID`;
            targetID = abyipID;
        } else if (cbydpID) {
            updateQuery = `UPDATE projectCBYDP SET [${targetColumn}] = @val WHERE cbydpID = @cbydpID`;
            targetID = cbydpID;
        }

        await pool.request()
            .input('val', sql.NVarChar, oldValue)
            .input('batchID', sql.Int, batchID)
            .input('abyipID', sql.Int, abyipID)
            .input('cbydpID', sql.Int, cbydpID)
            .query(updateQuery);

        // 6. Log the REVERT action
        const revertSummary = `User restored ${targetColumn} to "${oldValue}" from an edit made at ${new Date(timestamp).toLocaleString()}.`;
        await createAuditEntry({
            pool,
            batchID,
            userID: currentUserID,
            action: 'REVERT',
            oldValue: 'N/A', // The current value before revert could be fetched, but usually REVERT is enough
            newValue: revertSummary,
            center: audit.centerOfParticipation,
            abyipID,
            cbydpID,
            targetColumn
        });

        // 7. Recalculate total if budget field changed (ABYIP)
        let newTotal = null;
        if (abyipID && ['PS', 'MOOE', 'CO'].includes(targetColumn)) {
            const totalRes = await pool.request()
                .input('abyipID', sql.Int, abyipID)
                .query(`
                    UPDATE projectABYIP 
                    SET total = ISNULL(CAST(NULLIF(PS, '') AS DECIMAL(18,2)), 0) + 
                                ISNULL(CAST(NULLIF(MOOE, '') AS DECIMAL(18,2)), 0) + 
                                ISNULL(CAST(NULLIF(CO, '') AS DECIMAL(18,2)), 0)
                    OUTPUT INSERTED.total
                    WHERE abyipID = @abyipID
                `);
            if (totalRes.recordset.length) {
                newTotal = totalRes.recordset[0].total;
            }
        }

        // 8. Broadcast update
        const { broadcastToRoom } = require('../websockets/websocket');
        broadcastToRoom(batchID, { type: 'audit_update', batchID });
        
        const broadcastChanges = [{ rowID: abyipID || cbydpID, field: targetColumn, value: oldValue }];
        if (newTotal !== null) {
            broadcastChanges.push({ rowID: abyipID, field: 'total', value: String(newTotal) });
        }

        broadcastToRoom(batchID, { 
            type: 'cell_change', 
            batchID, 
            changes: broadcastChanges
        });

        res.json({ success: true, message: 'Value successfully restored.' });

    } catch (error) {
        console.error('Error reverting audit action:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = {
    router,
    createAuditEntry
};
