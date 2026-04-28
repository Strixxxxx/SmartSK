const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl, generateSasUrl, docContainerName, listBlobsWithProperties } = require('../Storage/storage');
const { decrypt } = require('../utils/crypto');
const { authMiddleware } = require('../session/session');

// This route fetches project batches for the admin's barangay.
router.get('/', authMiddleware, async (req, res) => {
    if (!req.user || req.user.barangay === undefined || req.user.barangay === null) {
        return res.status(403).json({ success: false, message: 'Unauthorized: User barangay not specified.' });
    }

    const userBarangayId = req.user.barangay;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, userBarangayId)
            .execute('sp_GetBarangayDashboard');

        res.json({ success: true, projects: result.recordset });

    } catch (error) {
        console.error('Error fetching projects for admin:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch projects due to a server error.' });
    }
});

// Fetch detailed rows for a specific batch (Admin View)
router.get('/:batchID/details', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const userBarangayId = req.user.barangay;
        const pool = await getConnection();

        // Ensure the batch belongs to the admin's barangay
        const batchCheck = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, userBarangayId)
            .query(`
                SELECT pb.batchID, pb.projType, pb.projName, pb.targetYear, pb.budget, b.barangayName
                FROM projectBatch pb
                JOIN barangays b ON pb.barangayID = b.barangayID
                WHERE pb.batchID = @batchID AND pb.barangayID = @barangayID AND pb.isArchived = 0
            `);

        if (!batchCheck.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project not found or unauthorized.' });
        }

        const batchInfo = batchCheck.recordset[0];
        let details = {
            batchInfo,
            agenda: null,
            rows: []
        };

        if (batchInfo.projType === 'ABYIP') {
            const rowsRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query(`
                    SELECT referenceCode, centerOfParticipation, PPA, [Description], expectedResult,
                           performanceIndicator, period, PS, MOOE, CO, total, personResponsible
                    FROM projectABYIP
                    WHERE projbatchID = @batchID
                    ORDER BY abyipID ASC
                `);
            details.rows = rowsRes.recordset;
        } else {
            // CBYDP
            const agendaRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT * FROM projectAgenda WHERE batchID = @batchID');
            
            if (agendaRes.recordset.length) {
                details.agenda = agendaRes.recordset[0];
            }

            const rowsRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query(`
                    SELECT centerOfParticipation, sectionType, YDC, objective, performanceIndicator, 
                           target1, target2, target3, PPAs, budget, personResponsible
                    FROM projectCBYDP
                    WHERE projbatchID = @batchID
                    ORDER BY cbydpID ASC
                `);
            details.rows = rowsRes.recordset;
        }

        res.status(200).json({ success: true, data: details });

    } catch (error) {
        console.error('Error fetching admin project details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch project details.' });
    }
});

// Fetch documents for a specific batch (Admin View)
router.get('/:batchID/documents', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const userBarangayId = req.user.barangay;
        const pool = await getConnection();
        
        const projectRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, userBarangayId)
            .query('SELECT projName, projType FROM projectBatch WHERE batchID = @batchID AND barangayID = @barangayID');
        
        if (projectRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found or unauthorized.' });
        }
        
        const { projName, projType } = projectRes.recordset[0];
        
        const PROJECT_CATEGORIES = {
            ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution'],
            CBYDP: ['LYDP', 'KK_Minutes', 'Youth_Profile'],
        };

        let mappedType = projType.includes('ABYIP') ? 'ABYIP' : (projType.includes('CBYDP') ? 'CBYDP' : '');
        const categories = PROJECT_CATEGORIES[mappedType];
        if (!categories) {
            return res.status(400).json({ success: false, message: `Invalid project type: ${projType}` });
        }

        const documents = {};
        for (const category of categories) {
            let prefix = `${projType}/${category}/${projName}/`;
            let blobs = await listBlobsWithProperties(docContainerName, { prefix });
            
            if (blobs.length === 0 && !projName.includes('.')) {
                blobs = await listBlobsWithProperties(docContainerName, { prefix: `${projType}/${category}/${projName}.xlsx/` });
            }
            if (blobs.length === 0 && projName.includes('.')) {
                const strippedName = projName.split('.').slice(0, -1).join('.');
                blobs = await listBlobsWithProperties(docContainerName, { prefix: `${projType}/${category}/${strippedName}/` });
            }
            
            documents[category] = await Promise.all(blobs.map(async (blob) => {
                const url = await generateSasUrl(docContainerName, blob.name);
                return {
                    name: blob.name.split('/').pop(),
                    path: blob.name,
                    url: url,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified
                };
            }));
        }

        res.json({ success: true, data: { projName, projType, categories: documents } });
    } catch (error) {
        console.error('Error fetching admin project documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// Legacy route (kept for compatibility)
router.get('/file-url/:projectID', authMiddleware, async (req, res) => {
    const { projectID } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectID)
            .query('SELECT file_path FROM projects WHERE projectID = @projectID');

        if (result.recordset.length === 0 || !result.recordset[0].file_path) {
            return res.status(404).json({ success: false, message: 'File not found.' });
        }

        const sasUrl = await getFileSasUrl(result.recordset[0].file_path);
        res.json({ success: true, url: sasUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not generate file URL.' });
    }
});

module.exports = router;
