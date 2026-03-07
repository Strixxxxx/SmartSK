const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const templateService = require('../utils/templateService');
const { authMiddleware } = require('../session/session');

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
        const filePath = require('path').join(__dirname, '..', 'File_Storage', 'project-batch', projName);
        const exists = require('fs').existsSync(filePath);

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
        const fs = require('fs');
        const path = require('path');
        const projectBatchDir = path.join(__dirname, '..', 'File_Storage', 'project-batch');

        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .execute('sp_GetBarangayDashboard');

        const batches = result.recordset.map((batch) => {
            const filePath = path.join(projectBatchDir, batch.projName || '');
            return {
                ...batch,
                fileExists: batch.projName ? fs.existsSync(filePath) : false
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
    try {
        const { fileName } = req.params;
        const path = require('path');
        const axios = require('axios');

        const filePath = path.join(__dirname, '..', 'File_Storage', 'project-batch', fileName);
        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Excel file not found.' });
        }

        // Call Python service
        const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/xlsx-to-json`;
        const response = await axios.post(pythonUrl, { filePath });

        if (response.data && response.data.status === 'ok') {
            res.json({
                success: true,
                data: response.data.data
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to convert XLSX via Python service.' });
        }
    } catch (error) {
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
                           performanceIndicator, period, PS, MOOE, CO, total, personResponsible, centerOfParticipation
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
                           target1, target2, target3, PPAs, budget, personResponsible, centerOfParticipation, sectionType
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
        const { center, sectionType } = req.body;

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
                .query(`
                    INSERT INTO projectABYIP (projbatchID, centerOfParticipation)
                    OUTPUT INSERTED.abyipID as rowID
                    VALUES (@batchID, @center)
                `);
            newRow = result.recordset[0];
        } else {
            const result = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('center', sql.NVarChar, center || null)
                .input('sectionType', sql.NVarChar, sectionType || 'FROM')
                .query(`
                    INSERT INTO projectCBYDP (projbatchID, centerOfParticipation, sectionType)
                    OUTPUT INSERTED.cbydpID as rowID
                    VALUES (@batchID, @center, @sectionType)
                `);
            newRow = result.recordset[0];
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

        if (projType === 'ABYIP') {
            await pool.request()
                .input('value', sql.NVarChar, String(value ?? ''))
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectABYIP SET [${field}] = @value WHERE abyipID = @rowID AND projbatchID = @batchID`);
        } else {
            await pool.request()
                .input('value', sql.NVarChar, String(value ?? ''))
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectCBYDP SET [${field}] = @value WHERE cbydpID = @rowID AND projbatchID = @batchID`);
        }

        res.json({ success: true, message: 'Cell updated.' });
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
