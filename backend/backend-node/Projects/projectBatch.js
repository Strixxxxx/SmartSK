const express = require('express');
const { broadcastToRoom } = require('../websockets/websocket');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const templateService = require('../utils/templateService');
const { authMiddleware } = require('../session/session');
const { hasAccessControl } = require('../routeGuard/routeGuard');
const { createAuditEntry } = require('./projectAudit');
const axios = require('axios');
const { getBlobProperties, listBlobs, downloadBlobToBuffer, projectBatchContainerName } = require('../Storage/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Phase 3: Project Batch Management Router
 */

// 1. Initialize New Project Batch (Access Control: templateControl)
router.post('/initialize', authMiddleware, hasAccessControl('templateControl'), async (req, res) => {
    try {
        const {
            projType, targetYear, budget,
            governance_pct, active_citizenship_pct, economic_empowerment_pct, global_mobility_pct, agriculture_pct, environment_pct, PBS_pct, SIE_pct, education_pct, health_pct, GAP_pct, MOOE_pct,
            governance_amount, active_citizenship_amount, economic_empowerment_amount, global_mobility_amount, agriculture_amount, environment_amount, PBS_amount, SIE_amount, education_amount, health_amount, GAP_amount, MOOE_amount
        } = req.body;
        const { barangay: barangayID, userID, position, termID } = req.user;

        // Initialize DB and Template
        const result = await templateService.initializeNewProject({
            barangayID,
            projType,
            targetYear,
            budget,
            userID,
            termID,
            governance_pct,
            active_citizenship_pct,
            economic_empowerment_pct,
            global_mobility_pct,
            agriculture_pct,
            environment_pct,
            PBS_pct,
            SIE_pct,
            education_pct,
            health_pct,
            GAP_pct,
            MOOE_pct,
            governance_amount,
            active_citizenship_amount,
            economic_empowerment_amount,
            global_mobility_amount,
            agriculture_amount,
            environment_amount,
            PBS_amount,
            SIE_amount,
            education_amount,
            health_amount,
            GAP_amount,
            MOOE_amount
        });

        res.json({
            success: true,
            message: 'Project batch initialized and template created.',
            data: result
        });

    } catch (error) {
        console.error('Error initializing project:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 2. Get Barangay Dashboard Data
router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const { barangay: barangayID } = req.user;

        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .execute('sp_GetBarangayDashboard');

        res.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 3. Update Project Status (Checkpoints) (Access Control: trackerControl)
router.post('/update-status', authMiddleware, hasAccessControl('trackerControl'), async (req, res) => {
    try {
        const { batchID, statusID } = req.body;
        const { userID, position } = req.user;

        const pool = await getConnection();

        // Fetch projType to check for ABYIP AI trigger
        const batchResult = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projType, barangayID FROM projectBatch WHERE batchID = @batchID');

        if (!batchResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }

        const { projType, barangayID } = batchResult.recordset[0];

        // --- CIRCUIT BREAKER: Pre-flight health check before City Approval AI trigger ---
        if (statusID === 6 && projType === 'ABYIP') {
            console.log(`[Circuit Breaker] Checkpoint 6 reached for batch ${batchID}. Checking AI service health...`);
            try {
                const aiHealthUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/health`;
                await axios.get(aiHealthUrl, { timeout: 3000 });
                console.log('[Circuit Breaker] AI Service is reachable. Allowing status transition.');
            } catch (healthErr) {
                console.error('[Circuit Breaker] TRIPPED — AI Service is unreachable. Blocking status transition.', healthErr.message);
                return res.status(503).json({
                    success: false,
                    message: 'AI Service is temporarily down. Cannot transition to City Approval. Please try again later.'
                });
            }
        }

        // Insert new status record into projectTracker
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, statusID)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (batchID, statusID, updatedBy) VALUES (@batchID, @statusID, @userID)');

        // City Approval (statusID = 6) on ABYIP only -> trigger AI job
        if (statusID === 6 && projType === 'ABYIP') {
            console.log(`[AI Trigger] ABYIP batch ${batchID} reached City Approval. Triggering AI Job via HTTP...`);

            // Fire-and-forget HTTP call to Python microservice
            const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/run-ai-batch-job`;

            axios.post(pythonUrl, { batch_id: batchID }).catch(err => {
                console.error('[AI Trigger] Failed to trigger AI job via HTTP:', err.message);
            });

            // Insert AI_TRIGGERED notification
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('barangayID', sql.Int, barangayID)
                .input('notifType', sql.NVarChar, 'AI_TRIGGERED')
                .input('message', sql.NVarChar,
                    `AI historical data sync triggered for ABYIP project (Batch #${batchID}) upon City Approval. Reports will be updated shortly.`)
                .query(`
                    INSERT INTO projectNotifications (batchID, barangayID, notifType, message)
                    VALUES (@batchID, @barangayID, @notifType, @message)
                `);

            // Broadcast real-time update
            broadcastToRoom(batchID, { type: 'ai_triggered', batchID });
        }

        res.json({
            success: true,
            message: `Project status updated to Step ${statusID}`,
            aiTriggered: statusID === 6 && projType === 'ABYIP'
        });

    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


// Webhook for Python AI Job Callback
router.post('/webhook/ai-status', async (req, res) => {
    try {
        const { status, batchID, error } = req.body;
        if (!batchID) return res.status(400).json({ success: false, message: 'Missing batchID' });

        const pool = await getConnection();
        
        // Find the barangayID for this batch
        const batchResult = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT barangayID FROM projectBatch WHERE batchID = @batchID');
            
        if (!batchResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        const barangayID = batchResult.recordset[0].barangayID;
        
        let message = '';
        let notifType = '';
        if (status === 'success') {
            notifType = 'AI_SUCCESS';
            message = `AI-Generated Reports for Batch #${batchID} are currently Updated. Try looking up the updated forecasts and analysis!`;
        } else {
            notifType = 'AI_FAILED';
            message = `AI-Generated Reports for Batch #${batchID} failed to update. Please contact the administrator or try again later.`;
        }

        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .input('notifType', sql.NVarChar, notifType)
            .input('message', sql.NVarChar, message)
            .query(`
                INSERT INTO projectNotifications (batchID, barangayID, notifType, message)
                VALUES (@batchID, @barangayID, @notifType, @message)
            `);
            
        // Broadcast via websocket
        broadcastToRoom(batchID, { 
            type: 'ai_report_status', 
            batchID, 
            status, 
            message 
        });

        res.json({ success: true, message: 'Callback received' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 4. Force Excel Sync (Before Export)
router.post('/sync/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const upToDate = await templateService.ensureExcelUpToDate(batchID);

        if (upToDate) {
            res.json({ success: true, message: 'Excel file synchronized.' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to synchronize Excel.' });
        }
    } catch (error) {
        console.error('Error syncing project:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 5. Get file info for a specific batch (for file explorer)
router.get('/files/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();

        const result = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName, projType, targetYear, batchID FROM projectBatch WHERE batchID = @batchID');

        if (!result.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }

        const { projName, projType, targetYear } = result.recordset[0];
        const blobProps = await getBlobProperties(projectBatchContainerName, projName);
        const exists = !!blobProps;

        res.json({
            success: true,
            data: { batchID: Number(batchID), projName, projType, targetYear, fileExists: exists }
        });
    } catch (error) {
        console.error('Error fetching batch file info:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 6. Get all batches with file existence info (for sidebar workspace explorer)
router.get('/all-files', authMiddleware, async (req, res) => {
    try {
        const { barangay: barangayID } = req.user;

        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .execute('sp_GetBarangayDashboard');

        // Fetch all blobs in the container once for efficiency
        const azureBlobs = await listBlobs(projectBatchContainerName);
        const blobSet = new Set(azureBlobs);

        const batches = result.recordset.map((batch) => {
            return {
                ...batch,
                fileExists: batch.projName ? blobSet.has(batch.projName) : false
            };
        });

        res.json({ success: true, data: batches });
    } catch (error) {
        console.error('Error fetching all batch files:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 7. Get high-fidelity JSON for an XLSX file (via Python bridge)
router.get('/excel-json/:fileName', authMiddleware, async (req, res) => {
    let tempFilePath = null;
    try {
        const { fileName } = req.params;
        const axios = require('axios');

        const blobProps = await getBlobProperties(projectBatchContainerName, fileName);
        if (!blobProps) {
            return res.status(404).json({ success: false, message: 'Excel file not found in Azure Storage.' });
        }

        // 1. Download from Azure to a temporary local file
        const fileBuffer = await downloadBlobToBuffer(projectBatchContainerName, fileName);
        tempFilePath = path.join(os.tmpdir(), `temp_${Date.now()}_${fileName}`);
        fs.writeFileSync(tempFilePath, fileBuffer);

        // 2. Call Python service
        const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/xlsx-to-json`;
        const response = await axios.post(pythonUrl, { filePath: tempFilePath });

        // 3. Cleanup local temp file
        fs.unlinkSync(tempFilePath);

        if (response.data && response.data.status === 'ok') {
            res.json({
                success: true,
                data: response.data.data
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to convert XLSX via Python service.' });
        }
    } catch (error) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
        }
        console.error('Error fetching Excel JSON:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


// 8. Get rows for a project batch filtered by center of participation
router.get('/:batchID/rows', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { center } = req.query;

        const pool = await getConnection();

        // Get projType for this batch
        const batchResult = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projType FROM projectBatch WHERE batchID = @batchID');

        if (!batchResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }

        const { projType } = batchResult.recordset[0];

        let result;
        if (projType === 'ABYIP') {
            result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .query(`
                    SELECT abyipID as rowID, referenceCode, PPA, [Description], expectedResult,
                           performanceIndicator, period, PS, MOOE, CO, total, personResponsible, centerOfParticipation, sheetRowIndex
                    FROM projectABYIP
                    WHERE projbatchID = @batchID
                    AND (@center IS NULL OR centerOfParticipation = @center)
                    ORDER BY abyipID ASC
                `);
        } else {
            result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .query(`
                    SELECT cbydpID as rowID, YDC, objective, performanceIndicator, target1, target2, target3, PPAs, budget, personResponsible, centerOfParticipation, sectionType, sheetRowIndex
                    FROM projectCBYDP
                    WHERE projbatchID = @batchID
                    AND (@center IS NULL OR centerOfParticipation = @center)
                    ORDER BY cbydpID ASC
                `);
        }

        res.json({ success: true, data: result.recordset });

    } catch (error) {
        console.error('Error fetching rows:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 9. Add a new row to a project batch
router.post('/:batchID/rows', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { center, sectionType, sheetRowIndex } = req.body;

        const pool = await getConnection();

        // Get projType
        const batchResult = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projType FROM projectBatch WHERE batchID = @batchID');

        if (!batchResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }
        const { projType } = batchResult.recordset[0];

        let newRow;
        if (projType === 'ABYIP') {
            const result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .input('sheetRowIndex', sql.Int, sheetRowIndex || 1)
                .query(`
                    INSERT INTO projectABYIP (projbatchID, centerOfParticipation, sheetRowIndex)
                    OUTPUT INSERTED.abyipID as rowID, INSERTED.sheetRowIndex
                    VALUES (@batchID, @center, @sheetRowIndex)
                `);
            newRow = result.recordset[0];

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('abyipID', sql.Int, newRow.rowID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, 'ADD_ROW')
                .input('oldValue', sql.NVarChar, null)
                .input('newValue', sql.NVarChar, 'User added a new row.')
                .input('center', sql.NVarChar, center || null)
                .query(`
                    INSERT INTO projectAuditTrail (batchID, abyipID, userID, action, oldValue, newValue, centerOfParticipation)
                    VALUES (@batchID, @abyipID, @userID, @action, @oldValue, @newValue, @center)
                `);

            // Trigger real-time audit update
            broadcastToRoom(batchID, { type: 'audit_update', batchID });

        } else {
            const result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .input('sectionType', sql.NVarChar, sectionType || 'FROM')
                .input('sheetRowIndex', sql.Int, sheetRowIndex || 1)
                .query(`
                    INSERT INTO projectCBYDP (projbatchID, centerOfParticipation, sectionType, sheetRowIndex)
                    OUTPUT INSERTED.cbydpID as rowID, INSERTED.sectionType, INSERTED.sheetRowIndex
                    VALUES (@batchID, @center, @sectionType, @sheetRowIndex)
                `);
            newRow = result.recordset[0];

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('cbydpID', sql.Int, newRow.rowID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, 'ADD_ROW')
                .input('oldValue', sql.NVarChar, null)
                .input('newValue', sql.NVarChar, 'User added a new row.')
                .input('center', sql.NVarChar, center || null)
                .query(`
                    INSERT INTO projectAuditTrail (batchID, cbydpID, userID, action, oldValue, newValue, centerOfParticipation)
                    VALUES (@batchID, @cbydpID, @userID, @action, @oldValue, @newValue, @center)
                `);

            // Trigger real-time audit update
            broadcastToRoom(batchID, { type: 'audit_update', batchID });
        }

        res.json({ success: true, data: newRow });
    } catch (error) {
        console.error('Error adding row:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 10. Update a cell in a row
router.patch('/:batchID/rows/:rowID', authMiddleware, async (req, res) => {
    try {
        const { batchID, rowID } = req.params;
        const { field, value, projType, center } = req.body;

        const pool = await getConnection();

        // Get row metadata for audit (including center if possible)
        let oldResult;
        let visualIdentifier = `Row ${rowID}`;
        let rowCenter = null;

        if (projType === 'ABYIP') {
            oldResult = await pool.request()
                .input('rowID', sql.Int, rowID)
                .query(`SELECT [${field}], sheetRowIndex, centerOfParticipation FROM projectABYIP WHERE abyipID = @rowID`);
            if (oldResult.recordset.length) {
                const r = oldResult.recordset[0];
                visualIdentifier = `Row ${r.sheetRowIndex}`;
                rowCenter = r.centerOfParticipation;
            }
        } else {
            oldResult = await pool.request()
                .input('rowID', sql.Int, rowID)
                .query(`SELECT [${field}], sectionType, sheetRowIndex, centerOfParticipation FROM projectCBYDP WHERE cbydpID = @rowID`);
            if (oldResult.recordset.length) {
                const r = oldResult.recordset[0];
                visualIdentifier = `${r.sectionType} Row ${r.sheetRowIndex}`;
                rowCenter = r.centerOfParticipation;
            }
        }

        // Use the center from DB if found; fallback to request center only if DB is NULL (unlikely for new rows)
        const finalCenter = rowCenter || center || null;
        const oldValue = oldResult.recordset.length ? oldResult.recordset[0][field] : null;

        // Update value
        if (projType === 'ABYIP') {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('value', sql.NVarChar, value)
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectABYIP SET [${field}] = @value WHERE abyipID = @rowID AND projbatchID = @batchID`);

            // Auto-calculate total if PS, MOOE, or CO are updated
            if (['PS', 'MOOE', 'CO'].includes(field)) {
                await pool.request()
                    .input('rowID', sql.Int, rowID)
                    .query(`UPDATE projectABYIP SET total = ISNULL(PS, 0) + ISNULL(MOOE, 0) + ISNULL(CO, 0) WHERE abyipID = @rowID`);
            }
        } else {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('value', sql.NVarChar, value)
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectCBYDP SET [${field}] = @value WHERE cbydpID = @rowID AND projbatchID = @batchID`);
        }

        // Insert Audit Log if value changed
        const safeOldValue = String(oldValue ?? '');
        const safeNewValue = String(value ?? '');
        if (safeOldValue !== safeNewValue) {
            // Determine sentence: new text (no old value) vs edit (had old value)
            let auditSummary;
            if (!safeOldValue) {
                // New text was added to an empty cell
                auditSummary = `User added a new text on ${visualIdentifier} of ${field} : ${safeNewValue}`;
            } else {
                // Existing text was changed
                auditSummary = `User changed a text on ${visualIdentifier} of ${field} from "${safeOldValue}" to "${safeNewValue}".`;
            }

            const auditRequest = pool.request()
                .input('batchID', sql.Int, batchID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, safeOldValue ? 'EDIT' : 'ADD_TEXT')
                .input('oldValue', sql.NVarChar, safeOldValue || null)
                .input('newValue', sql.NVarChar, auditSummary)
                .input('center', sql.NVarChar, finalCenter)
                .input('field', sql.NVarChar, field);

            if (projType === 'ABYIP') {
                await auditRequest
                    .input('abyipID', sql.Int, rowID)
                    .query(`
                        INSERT INTO projectAuditTrail (batchID, abyipID, userID, action, oldValue, newValue, centerOfParticipation, targetColumn)
                        VALUES (@batchID, @abyipID, @userID, @action, @oldValue, @newValue, @center, @field)
                    `);
            } else {
                await auditRequest
                    .input('cbydpID', sql.Int, rowID)
                    .query(`
                        INSERT INTO projectAuditTrail (batchID, cbydpID, userID, action, oldValue, newValue, centerOfParticipation, targetColumn)
                        VALUES (@batchID, @cbydpID, @userID, @action, @oldValue, @newValue, @center, @field)
                    `);
            }

            // Trigger real-time audit update
            broadcastToRoom(batchID, { type: 'audit_update', batchID });
        }

        res.json({ success: true, message: 'Cell updated.' });
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 11. Get project notifications for the logged-in user's barangay
router.get('/notifications', authMiddleware, async (req, res) => {
    try {
        const { barangay: barangayID } = req.user;
        const pool = await getConnection();

        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT
                    pn.notificationID, pn.batchID, pn.notifType, pn.message, pn.isRead, pn.createdAt,
                    pb.projName, pb.projType
                FROM projectNotifications pn
                JOIN projectBatch pb ON pn.batchID = pb.batchID
                WHERE pn.barangayID = @barangayID
                ORDER BY pn.createdAt DESC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 12. Mark a notification as read
router.patch('/notifications/:notificationID/read', authMiddleware, async (req, res) => {
    try {
        const { notificationID } = req.params;
        const { barangay: barangayID } = req.user;
        const pool = await getConnection();

        await pool.request()
            .input('notificationID', sql.Int, notificationID)
            .input('barangayID', sql.Int, barangayID)
            .query(`
                UPDATE projectNotifications
                SET isRead = 1
                WHERE notificationID = @notificationID AND barangayID = @barangayID
            `);

        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 13. Get Agenda Statement for a project batch
router.get('/:batchID/agenda', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();

        const result = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT * FROM projectAgenda WHERE batchID = @batchID');

        res.json({ success: true, data: result.recordset.length ? result.recordset[0] : null });
    } catch (error) {
        console.error('Error fetching agenda:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 14. Update/Create Agenda Statement for a specific category
router.patch('/:batchID/agenda', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { categoryMap, center, value } = req.body;
        const userID = req.user.userID;

        const pool = await getConnection();

        const allowedColumns = [
            'governance', 'active_citizenship', 'economic_empowerment', 'global_mobility',
            'agriculture', 'environment', 'PBS', 'SIE', 'education', 'health', 'GAP', 'MOOE'
        ];

        if (!allowedColumns.includes(categoryMap)) {
            return res.status(400).json({ success: false, message: 'Invalid category mapping' });
        }

        // 1. Fetch current value for auditing
        const currentRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`SELECT [${categoryMap}] FROM projectAgenda WHERE batchID = @batchID`);

        const oldValue = currentRes.recordset.length ? currentRes.recordset[0][categoryMap] : null;
        const action = !oldValue ? 'ADD_AGENDA' : 'EDIT_AGENDA';

        // 2. Perform UPSERT
        const query = `
            IF EXISTS (SELECT 1 FROM projectAgenda WHERE batchID = @batchID)
            BEGIN
                UPDATE projectAgenda SET [${categoryMap}] = @value WHERE batchID = @batchID
            END
            ELSE
            BEGIN
                INSERT INTO projectAgenda (batchID, [${categoryMap}]) VALUES (@batchID, @value)
            END
        `;

        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('value', sql.NVarChar, value || '')
            .query(query);

        // 3. Log to Audit Trail using the centralized helper
        const auditMessage = action === 'ADD_AGENDA'
            ? `User added a new agenda: "${value || ''}"`
            : `User changed the agenda from "${oldValue || ''}" to "${value || ''}"`;

        await createAuditEntry({
            pool,
            batchID,
            userID,
            action,
            oldValue: oldValue || 'N/A',
            newValue: auditMessage,
            center: center || categoryMap,
            targetColumn: categoryMap
        });

        broadcastToRoom(batchID, { type: 'audit_update', batchID });

        res.json({ success: true, message: 'Agenda statement updated' });
    } catch (error) {
        console.error('Error updating agenda:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 15. Export Project as Excel Workbook
router.get('/export/excel/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const axios = require('axios');

        // 1. Ensure Excel is up-to-date in Azure
        const upToDate = await templateService.ensureExcelUpToDate(batchID);
        if (!upToDate) {
            return res.status(500).json({ success: false, message: 'Failed to synchronize Excel data before export.' });
        }

        // 2. Fetch the Excel file from Python microservice
        const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/automation/export/excel/${batchID}`;

        const response = await axios({
            url: pythonUrl,
            method: 'GET',
            responseType: 'stream',
        });

        // 3. Forward the headers and stream
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        response.data.pipe(res);

    } catch (error) {
        console.error('Error exporting Excel:', error.message);
        res.status(500).json({ success: false, message: 'Internal Server Error during Excel Export' });
    }
});

// 14. Export Project as PDF
router.get('/export/pdf/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const axios = require('axios');

        // 1. Ensure Excel is up-to-date in Azure
        const upToDate = await templateService.ensureExcelUpToDate(batchID);
        if (!upToDate) {
            return res.status(500).json({ success: false, message: 'Failed to synchronize Excel data before export.' });
        }

        // 2. Fetch the PDF file from Python microservice
        const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/automation/export/pdf/${batchID}`;

        const response = await axios({
            url: pythonUrl,
            method: 'GET',
            responseType: 'stream',
        });

        // 3. Forward the headers and stream
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        response.data.pipe(res);

    } catch (error) {
        console.error('Error exporting PDF:', error.message);
        res.status(500).json({ success: false, message: 'Internal Server Error during PDF Export' });
    }
});

// 16. Delete a specific row from a project batch
router.delete('/:batchID/rows/:rowID', authMiddleware, async (req, res) => {
    try {
        const { batchID, rowID } = req.params;
        const { projType } = req.query; // Need projType to know which table to delete from
        const userID = req.user.userID;

        const pool = await getConnection();

        // 1. Fetch row data before deletion for auditing
        let rowData;
        if (projType === 'ABYIP') {
            const result = await pool.request()
                .input('rowID', sql.Int, rowID)
                .query('SELECT * FROM projectABYIP WHERE abyipID = @rowID');
            rowData = result.recordset[0];
        } else {
            const result = await pool.request()
                .input('rowID', sql.Int, rowID)
                .query('SELECT * FROM projectCBYDP WHERE cbydpID = @rowID');
            rowData = result.recordset[0];
        }

        if (!rowData) {
            return res.status(404).json({ success: false, message: 'Row not found.' });
        }

        const center = rowData.centerOfParticipation;
        const sheetRowIndex = rowData.sheetRowIndex;

        // 2. Check if the row is empty
        const isRowEmpty = (data, type) => {
            if (type === 'ABYIP') {
                const fields = ['referenceCode', 'PPA', 'Description', 'expectedResult', 'performanceIndicator', 'period', 'PS', 'MOOE', 'CO', 'total', 'personResponsible'];
                return fields.every(f => !data[f] || String(data[f]).trim() === '');
            } else {
                const fields = ['YDC', 'objective', 'performanceIndicator', 'target1', 'target2', 'target3', 'PPAs', 'budget', 'personResponsible'];
                return fields.every(f => !data[f] || String(data[f]).trim() === '');
            }
        };

        const isEmpty = isRowEmpty(rowData, projType);
        let auditMessage = '';

        if (isEmpty) {
            auditMessage = 'User deleted an empty row.';
        } else {
            // Priority: PPA/PPAs > First non-empty data > Row Index
            const ppaValue = projType === 'ABYIP' ? rowData.PPA : rowData.PPAs;
            if (ppaValue && String(ppaValue).trim()) {
                auditMessage = `User deleted row: ${ppaValue}`;
            } else {
                // Find first non-empty field
                let firstData = '';
                const fields = projType === 'ABYIP'
                    ? ['referenceCode', 'Description', 'expectedResult', 'performanceIndicator']
                    : ['YDC', 'objective', 'performanceIndicator'];

                for (const f of fields) {
                    if (rowData[f] && String(rowData[f]).trim()) {
                        firstData = rowData[f];
                        break;
                    }
                }

                if (firstData) {
                    auditMessage = `User deleted row: ${firstData} (Row #${sheetRowIndex})`;
                } else {
                    auditMessage = `User deleted row #${sheetRowIndex}`;
                }
            }
        }

        // 3. Delete the row
        if (projType === 'ABYIP') {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query('DELETE FROM projectABYIP WHERE abyipID = @rowID AND projbatchID = @batchID');
        } else {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query('DELETE FROM projectCBYDP WHERE cbydpID = @rowID AND projbatchID = @batchID');
        }

        // 4. Log to Audit Trail
        await createAuditEntry({
            pool,
            batchID,
            userID: req.user.userID,
            action: 'DELETE_ROW',
            oldValue: JSON.stringify(rowData),
            newValue: auditMessage,
            center: center
        });

        // 5. Broadcast real-time update
        broadcastToRoom(batchID, { type: 'audit_update', batchID });

        res.json({ success: true, message: 'Row deleted successfully.' });

    } catch (error) {
        console.error('Error deleting row:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 17. Get budget summary for a specific batch
router.get('/:batchID/budget-summary', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { center } = req.query;
        const pool = await getConnection();

        // 1. Get allocated budget and category amounts
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`
                SELECT 
                    projType, budget,
                    governance_amount, active_citizenship_amount, economic_empowerment_amount,
                    global_mobility_amount, agriculture_amount, environment_amount,
                    PBS_amount, SIE_amount, education_amount, health_amount,
                    GAP_amount, MOOE_amount,
                    governance_pct, active_citizenship_pct, economic_empowerment_pct,
                    global_mobility_pct, agriculture_pct, environment_pct,
                    PBS_pct, SIE_pct, education_pct, health_pct,
                    GAP_pct, MOOE_pct
                FROM projectBatch 
                WHERE batchID = @batchID
            `);

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }

        const batch = batchRes.recordset[0];
        const { projType, budget } = batch;

        // 2. Get used budget (Overall)
        let usedBatch = 0;
        if (projType === 'ABYIP') {
            const usedRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT SUM(total) as used FROM projectABYIP WHERE projbatchID = @batchID');
            usedBatch = usedRes.recordset[0].used || 0;
        } else {
            // For CBYDP, the budget column is NVARCHAR, we should try to parse it if it contains numbers
            const usedRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query("SELECT SUM(TRY_CAST(budget AS MONEY)) as used FROM projectCBYDP WHERE projbatchID = @batchID");
            usedBatch = usedRes.recordset[0].used || 0;
        }

        // 3. Category specific summary (if requested)
        let categorySummary = null;
        if (center && projType === 'ABYIP') {
            const catUsedRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center)
                .query('SELECT SUM(total) as used FROM projectABYIP WHERE projbatchID = @batchID AND centerOfParticipation = @center');

            const usedInCat = catUsedRes.recordset[0].used || 0;

            const thematicMap = {
                'Governance': 'governance',
                'Active Citizenship': 'active_citizenship',
                'Economic Empowerment': 'economic_empowerment',
                'Global Mobility': 'global_mobility',
                'Agriculture': 'agriculture',
                'Environment': 'environment',
                'Peace Building and Security': 'PBS',
                'Social Inclusion and Equity': 'SIE',
                'Education': 'education',
                'Health': 'health',
                'General Administration Program': 'GAP',
                'Maintenance and Other Operating Expenses': 'MOOE'
            };
            const colPrefix = thematicMap[center];
            let allocatedInCat = colPrefix ? (batch[`${colPrefix}_amount`] || 0) : 0;
            
            // Smart Fallback: If amount is 0 and percentage is set, calculate it
            if (allocatedInCat === 0 && colPrefix && batch[`${colPrefix}_pct`] > 0) {
                allocatedInCat = (budget * batch[`${colPrefix}_pct`]) / 100;
            }

            categorySummary = {
                center,
                allocated: allocatedInCat,
                used: usedInCat,
                remaining: allocatedInCat - usedInCat,
                percentUsed: allocatedInCat > 0 ? (usedInCat / allocatedInCat) * 100 : 0
            };
        }

        res.json({
            success: true,
            data: {
                totalBudget: budget,
                usedBudget: usedBatch,
                remainingBudget: budget - usedBatch,
                percentUsed: budget > 0 ? (usedBatch / budget) * 100 : 0,
                categorySummary,
                allocations: {
                    governance: (batch.governance_amount || 0) === 0 && batch.governance_pct > 0 ? (budget * batch.governance_pct / 100) : batch.governance_amount,
                    active_citizenship: (batch.active_citizenship_amount || 0) === 0 && batch.active_citizenship_pct > 0 ? (budget * batch.active_citizenship_pct / 100) : batch.active_citizenship_amount,
                    economic_empowerment: (batch.economic_empowerment_amount || 0) === 0 && batch.economic_empowerment_pct > 0 ? (budget * batch.economic_empowerment_pct / 100) : batch.economic_empowerment_amount,
                    global_mobility: (batch.global_mobility_amount || 0) === 0 && batch.global_mobility_pct > 0 ? (budget * batch.global_mobility_pct / 100) : batch.global_mobility_amount,
                    agriculture: (batch.agriculture_amount || 0) === 0 && batch.agriculture_pct > 0 ? (budget * batch.agriculture_pct / 100) : batch.agriculture_amount,
                    environment: (batch.environment_amount || 0) === 0 && batch.environment_pct > 0 ? (budget * batch.environment_pct / 100) : batch.environment_amount,
                    PBS: (batch.PBS_amount || 0) === 0 && batch.PBS_pct > 0 ? (budget * batch.PBS_pct / 100) : batch.PBS_amount,
                    SIE: (batch.SIE_amount || 0) === 0 && batch.SIE_pct > 0 ? (budget * batch.SIE_pct / 100) : batch.SIE_amount,
                    education: (batch.education_amount || 0) === 0 && batch.education_pct > 0 ? (budget * batch.education_pct / 100) : batch.education_amount,
                    health: (batch.health_amount || 0) === 0 && batch.health_pct > 0 ? (budget * batch.health_pct / 100) : batch.health_amount,
                    GAP: (batch.GAP_amount || 0) === 0 && batch.GAP_pct > 0 ? (budget * batch.GAP_pct / 100) : batch.GAP_amount,
                    MOOE: (batch.MOOE_amount || 0) === 0 && batch.MOOE_pct > 0 ? (budget * batch.MOOE_pct / 100) : batch.MOOE_amount
                }
            }
        });
    } catch (error) {
        console.error('Error fetching budget summary:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 18. Reallocate budget between categories
router.post('/:batchID/reallocate-budget', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { newAllocations, reason } = req.body;
        const { userID, position } = req.user;
        const ROLE_MAP = {
            "SKC": "SK Chairperson", "SKS": "SK Secretary", "SKT": "SK Treasurer",
            "SKK1": "SK Kagawad I", "SKK2": "SK Kagawad II", "SKK3": "SK Kagawad III",
            "SKK4": "SK Kagawad IV", "SKK5": "SK Kagawad V", "SKK6": "SK Kagawad VI",
            "SKK7": "SK Kagawad VII", "Admin": "Administrator"
        };
        const displayRole = ROLE_MAP[position] || position;

        // 1. Authorization check: Only SK Chairperson OR those with budgetControl permission
        const isAuthorized = position === 'SKC' || position === 'SK Chairperson' || req.user.permissions?.budgetControl;
        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Only SK Chairperson or authorized users can adjust budget.' });
        }

        const pool = await getConnection();

        // 2. Get current budget to validate
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projType, budget, governance_amount, active_citizenship_amount, economic_empowerment_amount, global_mobility_amount, agriculture_amount, environment_amount, PBS_amount, SIE_amount, education_amount, health_amount, GAP_amount, MOOE_amount FROM projectBatch WHERE batchID = @batchID');

        if (!batchRes.recordset.length) return res.status(404).json({ success: false, message: 'Batch not found.' });
        const currentBatch = batchRes.recordset[0];

        if (currentBatch.projType !== 'ABYIP') {
            return res.status(400).json({ success: false, message: 'Budget reallocation is only allowed for ABYIP projects.' });
        }

        const totalBudget = currentBatch.budget;

        // 3. Validate sum of new allocations
        const sum = Object.values(newAllocations).reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
        if (sum > totalBudget + 0.01) {
            return res.status(400).json({ success: false, message: `Total allocation (₱${sum.toLocaleString()}) exceeds total budget (₱${totalBudget.toLocaleString()}).` });
        }

        // 4. Create snapshot for log
        const oldAllocation = {
            governance: currentBatch.governance_amount,
            activeCitizenship: currentBatch.active_citizenship_amount,
            economicEmpowerment: currentBatch.economic_empowerment_amount,
            globalMobility: currentBatch.global_mobility_amount,
            agriculture: currentBatch.agriculture_amount,
            environment: currentBatch.environment_amount,
            peaceBuilding: currentBatch.PBS_amount,
            socialInclusion: currentBatch.SIE_amount,
            education: currentBatch.education_amount,
            health: currentBatch.health_amount,
            GAP: currentBatch.GAP_amount,
            MOOE: currentBatch.MOOE_amount
        };

        // 5. Update DB
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('gov', sql.Money, newAllocations.governance || 0)
            .input('ac', sql.Money, newAllocations.activeCitizenship || 0)
            .input('ee', sql.Money, newAllocations.economicEmpowerment || 0)
            .input('gm', sql.Money, newAllocations.globalMobility || 0)
            .input('ag', sql.Money, newAllocations.agriculture || 0)
            .input('en', sql.Money, newAllocations.environment || 0)
            .input('pb', sql.Money, newAllocations.peaceBuilding || 0)
            .input('si', sql.Money, newAllocations.socialInclusion || 0)
            .input('ed', sql.Money, newAllocations.education || 0)
            .input('he', sql.Money, newAllocations.health || 0)
            .input('gap', sql.Money, newAllocations.GAP || 0)
            .input('mooe', sql.Money, newAllocations.MOOE || 0)
            .input('gov_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.governance / totalBudget) * 100 : 0)
            .input('ac_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.activeCitizenship / totalBudget) * 100 : 0)
            .input('ee_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.economicEmpowerment / totalBudget) * 100 : 0)
            .input('gm_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.globalMobility / totalBudget) * 100 : 0)
            .input('ag_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.agriculture / totalBudget) * 100 : 0)
            .input('en_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.environment / totalBudget) * 100 : 0)
            .input('pb_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.peaceBuilding / totalBudget) * 100 : 0)
            .input('si_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.socialInclusion / totalBudget) * 100 : 0)
            .input('ed_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.education / totalBudget) * 100 : 0)
            .input('he_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.health / totalBudget) * 100 : 0)
            .input('gap_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.GAP / totalBudget) * 100 : 0)
            .input('mooe_pct', sql.Decimal(5, 2), totalBudget > 0 ? (newAllocations.MOOE / totalBudget) * 100 : 0)
            .query(`
                UPDATE projectBatch SET 
                    governance_amount = @gov, active_citizenship_amount = @ac, economic_empowerment_amount = @ee,
                    global_mobility_amount = @gm, agriculture_amount = @ag, environment_amount = @en,
                    PBS_amount = @pb, SIE_amount = @si, education_amount = @ed, health_amount = @he,
                    GAP_amount = @gap, MOOE_amount = @mooe,
                    governance_pct = @gov_pct, active_citizenship_pct = @ac_pct, economic_empowerment_pct = @ee_pct,
                    global_mobility_pct = @gm_pct, agriculture_pct = @ag_pct, environment_pct = @en_pct,
                    PBS_pct = @pb_pct, SIE_pct = @si_pct, education_pct = @ed_pct, health_pct = @he_pct,
                    GAP_pct = @gap_pct, MOOE_pct = @mooe_pct
                WHERE batchID = @batchID
            `);

        // 6. Log change to accountability table
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('old', sql.NVarChar, JSON.stringify(oldAllocation))
            .input('new', sql.NVarChar, JSON.stringify(newAllocations))
            .input('reason', sql.NVarChar, reason)
            .query(`
                INSERT INTO budgetAdjustmentLog (batchID, userID, oldAllocationJSON, newAllocationJSON, reasonForChange)
                VALUES (@batchID, @userID, @old, @new, @reason)
            `);

        // 7. Auto-post to Project Notes (Work Notes & Agenda)
        const noteContent = `${displayRole} ${req.user.fullName} changed the budget allocations within the project. The reason for change is as follows: ${reason}`;
        const noteRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('content', sql.NVarChar, noteContent)
            .query(`
                INSERT INTO projectNotes (batchID, userID, content) 
                OUTPUT INSERTED.noteID, INSERTED.batchID, INSERTED.userID, INSERTED.content, INSERTED.createdAt
                VALUES (@batchID, NULL, @content)
            `);
        
        const newNote = noteRes.recordset[0];
        const enrichedNote = {
            ...newNote,
            fullName: 'SmartSK System',
            position: 'Automated System'
        };

        broadcastToRoom(batchID, { type: 'budget_reallocated', batchID });
        broadcastToRoom(batchID, { type: 'project_note', note: enrichedNote });
        broadcastToRoom(batchID, { type: 'audit_update', batchID });

        res.json({ success: true, message: 'Budget reallocated successfully.' });
    } catch (error) {
        console.error('Error reallocating budget:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;

