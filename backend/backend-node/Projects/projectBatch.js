const express = require('express');
const { broadcastToRoom } = require('../websockets/websocket');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const templateService = require('../utils/templateService');
const { authMiddleware } = require('../session/session');
const { getBlobProperties, listBlobs, downloadBlobToBuffer, projectBatchContainerName } = require('../Storage/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Phase 3: Project Batch Management Router
 */

// 1. Initialize New Project Batch (SKC Only)
router.post('/initialize', authMiddleware, async (req, res) => {
    try {
        const { projType, targetYear, budget, governance_pct, active_citizenship_pct, economic_empowerment_pct, global_mobility_pct, agriculture_pct, environment_pct, PBS_pct, SIE_pct, education_pct, health_pct } = req.body;
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
            health_pct
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
        const { userID } = req.user;

        // sp_UpdateProjectStatus should be defined in database_query.txt/Query.txt
        const pool = await getConnection();
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, statusID)
            .input('userID', sql.Int, userID)
            .execute('sp_UpdateProjectStatus');

        res.json({
            success: true,
            message: `Project status updated to Step ${statusID}`
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
                    SELECT cbydpID as rowID, YDC, objective, performanceIndicator,
                           target1, target2, target3, PPAs, budget, personResponsible, centerOfParticipation, sectionType, sheetRowIndex
                    FROM projectCBYDP
                    WHERE projbatchID = @batchID
                    AND (@center IS NULL OR centerOfParticipation = @center)
                    ORDER BY cbydpID ASC
                `);
        }

        res.json({ success: true, data: result.recordset, projType });
    } catch (error) {
        console.error('Error fetching rows:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 9. Add a new blank row for a project batch
router.post('/:batchID/rows', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { center, sectionType, sheetRowIndex } = req.body;

        const pool = await getConnection();

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
                .input('sheetRowIndex', sql.Int, sheetRowIndex || null)
                .query(`
                    INSERT INTO projectABYIP (projbatchID, centerOfParticipation, sheetRowIndex)
                    OUTPUT INSERTED.abyipID as rowID
                    VALUES (@batchID, @center, @sheetRowIndex)
                `);
            newRow = result.recordset[0];

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('rowID', sql.Int, newRow.rowID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, 'ADD_ROW')
                .input('oldValue', sql.NVarChar, null)
                .input('newValue', sql.NVarChar, 'User added a new row.')
                .query(`
                    INSERT INTO projectAuditTrail (batchID, rowID, userID, action, oldValue, newValue)
                    VALUES (@batchID, @rowID, @userID, @action, @oldValue, @newValue)
                `);

            // Trigger real-time audit update
            broadcastToRoom(batchID, { type: 'audit_update', batchID });

        } else {
            const result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .input('sectionType', sql.NVarChar, sectionType || 'FROM')
                .input('sheetRowIndex', sql.Int, sheetRowIndex || null)
                .query(`
                    INSERT INTO projectCBYDP (projbatchID, centerOfParticipation, sectionType, sheetRowIndex)
                    OUTPUT INSERTED.cbydpID as rowID
                    VALUES (@batchID, @center, @sectionType, @sheetRowIndex)
                `);
            newRow = result.recordset[0];

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('rowID', sql.Int, newRow.rowID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, 'ADD_ROW')
                .input('oldValue', sql.NVarChar, null)
                .input('newValue', sql.NVarChar, 'User added a new row.')
                .query(`
                    INSERT INTO projectAuditTrail (batchID, rowID, userID, action, oldValue, newValue)
                    VALUES (@batchID, @rowID, @userID, @action, @oldValue, @newValue)
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

// 10. Update a specific cell in a row
router.patch('/:batchID/rows/:rowID', authMiddleware, async (req, res) => {
    try {
        const { batchID, rowID } = req.params;
        const { field, value, projType } = req.body;

        // Whitelist allowed fields to prevent SQL injection
        const abyipFields = ['referenceCode', 'PPA', 'Description', 'expectedResult', 'performanceIndicator', 'period', 'PS', 'MOOE', 'CO', 'total', 'personResponsible'];
        const cbydpFields = ['YDC', 'objective', 'performanceIndicator', 'target1', 'target2', 'target3', 'PPAs', 'budget', 'personResponsible'];
        const allowedFields = projType === 'ABYIP' ? abyipFields : cbydpFields;

        if (!allowedFields.includes(field)) {
            return res.status(400).json({ success: false, message: `Invalid field: ${field}` });
        }

        const pool = await getConnection();

        // Let's get the old value to log in Audit Trail
        let oldValue = null;
        let visualIdentifier = '';

        if (projType === 'ABYIP') {
            const oldRes = await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query(`SELECT [${field}], sheetRowIndex FROM projectABYIP WHERE abyipID = @rowID AND projbatchID = @batchID`);
            if (oldRes.recordset.length) {
                oldValue = oldRes.recordset[0][field];
                visualIdentifier = `MAIN Row ${oldRes.recordset[0].sheetRowIndex || ''}`;
            }

            await pool.request()
                .input('value', sql.NVarChar, String(value ?? ''))
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectABYIP SET [${field}] = @value WHERE abyipID = @rowID AND projbatchID = @batchID`);
        } else {
            const oldRes = await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query(`SELECT [${field}], sectionType, sheetRowIndex FROM projectCBYDP WHERE cbydpID = @rowID AND projbatchID = @batchID`);
            if (oldRes.recordset.length) {
                oldValue = oldRes.recordset[0][field];
                visualIdentifier = `${oldRes.recordset[0].sectionType || 'FROM'} Row ${oldRes.recordset[0].sheetRowIndex || ''}`;
            }

            await pool.request()
                .input('value', sql.NVarChar, String(value ?? ''))
                .input('rowID', sql.Int, rowID)
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

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('rowID', sql.Int, rowID)
                .input('userID', sql.Int, req.user.userID)
                .input('action', sql.NVarChar, safeOldValue ? 'EDIT' : 'ADD_TEXT')
                .input('oldValue', sql.NVarChar, safeOldValue || null)
                .input('newValue', sql.NVarChar, auditSummary)
                .query(`
                    INSERT INTO projectAuditTrail (batchID, rowID, userID, action, oldValue, newValue)
                    VALUES (@batchID, @rowID, @userID, @action, @oldValue, @newValue)
                `);

            // Trigger real-time audit update
            broadcastToRoom(batchID, { type: 'audit_update', batchID });
        }

        res.json({ success: true, message: 'Cell updated.' });
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
