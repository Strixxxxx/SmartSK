const express = require('express');
const { broadcastToRoom } = require('../websockets/websocket');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const templateService = require('../utils/templateService');
const { authMiddleware } = require('../session/session');
const { createAuditEntry } = require('./projectAudit');
const axios = require('axios');
const { getBlobProperties, listBlobs, downloadBlobToBuffer, projectBatchContainerName } = require('../Storage/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Phase 3: Project Batch Management Router
 */

// 1. Initialize New Project Batch (SKC Only)
router.post('/initialize', authMiddleware, async (req, res) => {
    try {
        const { projType, targetYear, budget, governance_pct, active_citizenship_pct, economic_empowerment_pct, global_mobility_pct, agriculture_pct, environment_pct, PBS_pct, SIE_pct, education_pct, health_pct, GAP_pct, MOOE_pct } = req.body;
        const { barangay: barangayID, userID, position } = req.user;

        if (position !== 'SKC' && position !== 'SK Chairperson') {
            return res.status(403).json({ success: false, message: 'Unauthorized: Only SK Chairperson can create projects.' });
        }

        // Initialize DB and Template
        const result = await templateService.initializeNewProject({
            barangayID,
            projType,
            targetYear,
            budget,
            userID,
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
            MOOE_pct
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

// 3. Update Project Status (Checkpoints)
router.post('/update-status', authMiddleware, async (req, res) => {
    try {
        const { batchID, statusID } = req.body;
        const { userID, position } = req.user;

        // RBAC: Only SK Chairperson (SKC) can update project milestones
        if (position !== 'SKC') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only the SK Chairperson can update project milestones.'
            });
        }

        const pool = await getConnection();

        // Fetch projType to check for ABYIP AI trigger
        const batchResult = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projType FROM projectBatch WHERE batchID = @batchID');

        if (!batchResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }

        const { projType } = batchResult.recordset[0];

        // Insert new status record into projectTracker
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, statusID)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (batchID, statusID, updatedBy) VALUES (@batchID, @statusID, @userID)');

        // City Approval (statusID = 6) on ABYIP only -> trigger AI job
        if (statusID === 6 && projType === 'ABYIP') {
            console.log(`[AI Trigger] ABYIP batch ${batchID} reached City Approval. Launching aiJobs.py...`);
            const aiJobsPath = path.join(__dirname, '..', '..', '..', 'backend-python', 'AI', 'aiJobs.py');
            const pyProcess = spawn('python', ['-m', 'backend-python.AI.aiJobs'], {
                cwd: path.join(__dirname, '..', '..', '..'),
                detached: true,
                stdio: 'ignore'
            });
            pyProcess.unref(); // Fire-and-forget

            // Insert AI_TRIGGERED notification
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('barangayID', sql.Int, req.user.barangay)
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
                .input('center', sql.NVarChar, finalCenter);

            if (projType === 'ABYIP') {
                await auditRequest
                    .input('abyipID', sql.Int, rowID)
                    .query(`
                        INSERT INTO projectAuditTrail (batchID, abyipID, userID, action, oldValue, newValue, centerOfParticipation)
                        VALUES (@batchID, @abyipID, @userID, @action, @oldValue, @newValue, @center)
                    `);
            } else {
                await auditRequest
                    .input('cbydpID', sql.Int, rowID)
                    .query(`
                        INSERT INTO projectAuditTrail (batchID, cbydpID, userID, action, oldValue, newValue, centerOfParticipation)
                        VALUES (@batchID, @cbydpID, @userID, @action, @oldValue, @newValue, @center)
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
        const { categoryMap, value } = req.body; 
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
            center: categoryMap 
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

module.exports = router;
