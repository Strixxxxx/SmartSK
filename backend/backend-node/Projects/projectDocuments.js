const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../session/session');
const { hasAccessControl } = require('../routeGuard/routeGuard');
const { getConnection, sql } = require('../database/database');
const {
    docContainerName,
    listBlobsWithProperties,
    uploadBlob,
    deleteFile,
    generateSasUrl
} = require('../Storage/storage');
const { broadcast } = require('../websockets/websocket');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper to get project details
 */
async function getProjectDetails(batchID) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('batchID', sql.Int, batchID)
        .query(`
            SELECT pb.projName, pb.projType, pb.cycleID, pb.barangayID, pc.currentStatusID 
            FROM projectBatch pb
            JOIN projectCycles pc ON pb.cycleID = pc.cycleID
            WHERE pb.batchID = @batchID
        `);
    
    if (result.recordset.length === 0) {
        throw new Error('Project not found');
    }
    return result.recordset[0];
}

/**
 * Project Categories Definition
 */
const PROJECT_CATEGORIES = {
    ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution', 'EstIncomeCert', 'IncomeCert', 'LYDP', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'QCYDO_Review_Doc', 'QC_SK_Fed_Review_Doc', 'City_Budget_Review_Doc', 'City_Council_Hearing_Doc', 'Procurement_Doc', 'SK_Session_Docs'],
    CBYDP: ['LYDP', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'SK_Session_Docs'],
};

/**
 * GET /api/project-documents/:batchID
 * List all documents for a project, organized by category.
 */
router.get('/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { projName, projType, cycleID, barangayID, currentStatusID } = await getProjectDetails(batchID);
        
        const PROJECT_CATEGORIES = {
            ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution', 'EstIncomeCert', 'IncomeCert', 'LYDP', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'QCYDO_Review_Doc', 'QC_SK_Fed_Review_Doc', 'City_Budget_Review_Doc', 'City_Council_Hearing_Doc', 'Procurement_Doc', 'SK_Session_Docs'],
            CBYDP: ['LYDP', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'SK_Session_Docs'],
        };

        // Match normalized type
        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';
        else if (projType.includes('CBYDP')) mappedType = 'CBYDP';

        const categories = PROJECT_CATEGORIES[mappedType];
        if (!categories) {
            return res.status(400).json({ success: false, message: `Invalid project type for documents: ${projType}` });
        }

        const documents = {};
        for (const category of categories) {
            let blobs = [];

            const useNewStructure = ['LYDP', 'EstIncomeCert', 'IncomeCert', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'QCYDO_Review_Doc', 'QC_SK_Fed_Review_Doc', 'City_Budget_Review_Doc', 'City_Council_Hearing_Doc', 'Procurement_Doc', 'SK_Session_Docs'].includes(category);
            
            // Primary Check: New brgyID/cycleID structure
            if (useNewStructure) {
                const baseType = (category === 'LYDP' || category.startsWith('KK_') || category.startsWith('YP_') || category === 'SK_Session_Docs') ? 'CBYDP' : projType;
                let newPrefix = `${baseType}/${category}/${barangayID}/${cycleID}/`;
                
                if (category === 'QCYDO_Review_Doc') {
                    newPrefix = `Checkpoints/eight/${barangayID}/${cycleID}/`;
                } else if (category === 'QC_SK_Fed_Review_Doc') {
                    newPrefix = `Checkpoints/nine/${barangayID}/${cycleID}/`;
                } else if (category === 'City_Budget_Review_Doc') {
                    newPrefix = `Checkpoints/ten/${barangayID}/${cycleID}/`;
                } else if (category === 'City_Council_Hearing_Doc') {
                    newPrefix = `Checkpoints/eleven/${barangayID}/${cycleID}/`;
                } else if (category === 'Procurement_Doc') {
                    newPrefix = `Checkpoints/twelve/${barangayID}/${cycleID}/`;
                } else if (category === 'YP_Notice_Letter') {
                    newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Notice_Letter/`;
                } else if (category === 'YP_Campaign_Proof') {
                    newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Campaign_Proof/`;
                } else if (category === 'YP_Master_Dataset') {
                    newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Master_Dataset/`;
                } else if (category === 'KK_Minutes') {
                    newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Minutes/`;
                } else if (category === 'KK_Attendance') {
                    newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Attendance/`;
                } else if (category === 'KK_Photo_Doc') {
                    newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Photos/`;
                } else if (category === 'SK_Session_Docs') {
                    newPrefix = `CBYDP/SK_Session/${barangayID}/${cycleID}/`;
                }
                
                blobs = await listBlobsWithProperties(docContainerName, { prefix: newPrefix });
            }

            // Legacy Check: If empty (or not LYDP), check old projName prefix
            if (blobs.length === 0) {
                const baseType = category === 'LYDP' ? 'CBYDP' : projType;
                let prefix = `${baseType}/${category}/${projName}/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix });
                
                // Fallback 1: If no blobs found and projName has NO extension, try with .xlsx suffix
                if (blobs.length === 0 && !projName.includes('.')) {
                    const altPrefix = `${baseType}/${category}/${projName}.xlsx/`;
                    blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix });
                }
                
                // Fallback 2: If still no blobs and projName HAS an extension, try stripping it
                if (blobs.length === 0 && projName.includes('.')) {
                    const strippedName = projName.split('.').slice(0, -1).join('.');
                    const altPrefix2 = `${baseType}/${category}/${strippedName}/`;
                    blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix2 });
                }
            }

            // Filter out directory blobs
            blobs = blobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);
            
            documents[category] = blobs.map(blob => {
                const parts = blob.name.split('/');
                const fileName = parts[parts.length - 1];
                return {
                    name: fileName,
                    path: blob.name,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified
                };
            });
        }

        res.json({ success: true, data: { projName, projType, currentStatusID, categories: documents } });
    } catch (error) {
        console.error('Error fetching project documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

/**
 * GET /api/project-documents/:batchID/check-lydp
 * Lightweight check if LYDP exists for a CBYDP project.
 */
router.get('/:batchID/check-lydp', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { projName, projType, cycleID, barangayID } = await getProjectDetails(batchID);

        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';
        else if (projType.includes('CBYDP')) mappedType = 'CBYDP';

        if (mappedType !== 'CBYDP') {
            return res.json({ success: true, hasLYDP: true }); // Not applicable to non-CBYDP
        }

        const category = 'LYDP';
        
        // Primary Check: New brgyID/cycleID structure
        const newPrefix = `${projType}/${category}/${barangayID}/${cycleID}/`;
        let blobs = await listBlobsWithProperties(docContainerName, { prefix: newPrefix });

        // Legacy Check: Fallback to old projName structure
        if (blobs.length === 0) {
            let prefix = `${projType}/${category}/${projName}/`;
            blobs = await listBlobsWithProperties(docContainerName, { prefix });

            if (blobs.length === 0 && !projName.includes('.')) {
                const altPrefix = `${projType}/${category}/${projName}.xlsx/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix });
            }

            if (blobs.length === 0 && projName.includes('.')) {
                const strippedName = projName.split('.').slice(0, -1).join('.');
                const altPrefix2 = `${projType}/${category}/${strippedName}/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix2 });
            }
        }

        const validBlobs = blobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);

        res.json({ success: true, hasLYDP: validBlobs.length > 0 });
    } catch (error) {
        console.error('Error checking LYDP:', error);
        res.status(500).json({ success: false, message: 'Failed to check LYDP status' });
    }
});

/**
 * GET /api/project-documents/:batchID/check-income-certs
 * Lightweight check if Income Certifications exist for Checkpoint 5 ABYIP.
 */
router.get('/:batchID/check-income-certs', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { projType, cycleID, barangayID } = await getProjectDetails(batchID);

        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';

        if (mappedType !== 'ABYIP') {
            return res.json({ success: true, hasEstIncomeCert: true, hasIncomeCert: true });
        }

        const estPrefix = `${projType}/EstIncomeCert/${barangayID}/${cycleID}/`;
        const incomePrefix = `${projType}/IncomeCert/${barangayID}/${cycleID}/`;

        const estBlobs = await listBlobsWithProperties(docContainerName, { prefix: estPrefix });
        const validEstBlobs = estBlobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);

        const incomeBlobs = await listBlobsWithProperties(docContainerName, { prefix: incomePrefix });
        const validIncomeBlobs = incomeBlobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);

        res.json({ 
            success: true, 
            hasEstIncomeCert: validEstBlobs.length > 0,
            hasIncomeCert: validIncomeBlobs.length > 0
        });
    } catch (error) {
        console.error('Error checking Income Certs:', error);
        res.status(500).json({ success: false, message: 'Failed to check Income Certifications status' });
    }
});

/**
 * POST /api/project-documents/:batchID/ocr-preview
 * Sends document to Python OCR service without saving to Azure Blob Storage
 */
router.post('/:batchID/ocr-preview', authMiddleware, hasAccessControl('docsControl'), upload.single('document'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const axios = require('axios');
        const FormData = require('form-data');
        
        const form = new FormData();
        form.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
        });

        const pythonUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/automation/ocr/extract-budget`;
        
        const response = await axios.post(pythonUrl, form, {
            headers: {
                ...form.getHeaders()
            }
        });

        if (response.data && response.data.success) {
            res.json({
                success: true,
                extractedBudget: response.data.extracted_budget
            });
        } else {
            res.json({ success: false, message: 'OCR failed' });
        }
    } catch (error) {
        console.error('OCR Preview Error:', error.response?.data || error.message);
        res.json({
            success: false,
            message: 'OCR extraction failed. Please enter budget manually.',
            ocrFailed: true,
            extractedBudget: null
        });
    }
});

/**
 * POST /api/project-documents/:batchID/upload
 * Upload a document to a specific category.
 */
router.post('/:batchID/upload', authMiddleware, hasAccessControl('docsControl'), upload.single('document'), async (req, res) => {
    try {
        const { batchID } = req.params;
        const { category } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        // Backend Validation: Allowed types (PDF, DOCS, Images)
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const fileName = file.originalname.toLowerCase();
        const isAllowedExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
        const isAllowedMimeType = 
            file.mimetype === 'application/pdf' || 
            file.mimetype === 'application/msword' || 
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            file.mimetype.startsWith('image/');

        if (!isAllowedExtension || !isAllowedMimeType) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid file type. Only PDF, DOCS, and image formats are allowed.' 
            });
        }

        const { projName, projType, cycleID, barangayID } = await getProjectDetails(batchID);

        // Match normalized type
        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';
        else if (projType.includes('CBYDP')) mappedType = 'CBYDP';

        const allowedCategories = PROJECT_CATEGORIES[mappedType];
        if (!allowedCategories || !allowedCategories.includes(category)) {
            return res.status(400).json({ success: false, message: 'Invalid category for this project type' });
        }

        const useNewStructure = ['LYDP', 'EstIncomeCert', 'IncomeCert', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'QCYDO_Review_Doc', 'QC_SK_Fed_Review_Doc', 'City_Budget_Review_Doc', 'City_Council_Hearing_Doc', 'Procurement_Doc', 'SK_Session_Docs'].includes(category);

        let blobName = '';
        if (useNewStructure) {
            const baseType = (category === 'LYDP' || category.startsWith('KK_') || category.startsWith('YP_') || category === 'SK_Session_Docs') ? 'CBYDP' : projType;
            let newPrefix = `${baseType}/${category}/${barangayID}/${cycleID}/`;

            let isCheckpointDoc = false;
            let checkptID = 0;

            if (category === 'QCYDO_Review_Doc') {
                newPrefix = `Checkpoints/eight/${barangayID}/${cycleID}/`;
                isCheckpointDoc = true; checkptID = 8;
            } else if (category === 'QC_SK_Fed_Review_Doc') {
                newPrefix = `Checkpoints/nine/${barangayID}/${cycleID}/`;
                isCheckpointDoc = true; checkptID = 9;
            } else if (category === 'City_Budget_Review_Doc') {
                newPrefix = `Checkpoints/ten/${barangayID}/${cycleID}/`;
                isCheckpointDoc = true; checkptID = 10;
            } else if (category === 'City_Council_Hearing_Doc') {
                newPrefix = `Checkpoints/eleven/${barangayID}/${cycleID}/`;
                isCheckpointDoc = true; checkptID = 11;
            } else if (category === 'Procurement_Doc') {
                newPrefix = `Checkpoints/twelve/${barangayID}/${cycleID}/`;
                isCheckpointDoc = true; checkptID = 12;
            } else if (category === 'YP_Notice_Letter') {
                newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Notice_Letter/`;
            } else if (category === 'YP_Campaign_Proof') {
                newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Campaign_Proof/`;
            } else if (category === 'YP_Master_Dataset') {
                newPrefix = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Master_Dataset/`;
            } else if (category === 'KK_Minutes') {
                newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Minutes/`;
            } else if (category === 'KK_Attendance') {
                newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Attendance/`;
            } else if (category === 'KK_Photo_Doc') {
                newPrefix = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Photos/`;
            } else if (category === 'SK_Session_Docs') {
                newPrefix = `CBYDP/SK_Session/${barangayID}/${cycleID}/session_docs/`;
            }

            if (isCheckpointDoc) {
                const pool = await getConnection();
                const trackerCheck = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .input('statusID', sql.Int, checkptID)
                    .query(`SELECT COUNT(*) as count FROM projectTracker pt JOIN projectBatch pb ON pt.cycleID = pb.cycleID WHERE pb.batchID = @batchID AND pt.statusID = @statusID`);
                const arrivalsCount = trackerCheck.recordset[0].count;
                
                const num = Math.max(0, arrivalsCount - 1) + 1;
                let attemptSuffix = '';
                if (num === 1) attemptSuffix = '1st';
                else if (num === 2) attemptSuffix = '2nd';
                else if (num === 3) attemptSuffix = '3rd';
                else attemptSuffix = `${num}th`;
                
                const timestamp = Date.now();
                const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                blobName = `${newPrefix}${attemptSuffix}/${timestamp}-${safeFilename}`;
            } else {
                blobName = `${newPrefix}${file.originalname}`;
            }
        } else {
            blobName = `${projType}/${category}/${projName}/${file.originalname}`;
        }
        
        await uploadBlob(docContainerName, blobName, file.buffer, file.mimetype);

        res.json({ 
            success: true, 
            message: 'Document uploaded successfully', 
            fileName: file.originalname
        });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ success: false, message: 'Failed to upload document' });
    }
});

/**
 * DELETE /api/project-documents/:batchID/delete
 * Delete a document by its full path.
 */
router.delete('/:batchID/delete', authMiddleware, hasAccessControl('docsControl'), async (req, res) => {
    try {
        const { batchID } = req.params;
        const { documentPath } = req.body;

        if (!documentPath) {
            return res.status(400).json({ success: false, message: 'Document path is required' });
        }

        // Verify the document belongs to this project
        const { projName, barangayID, cycleID } = await getProjectDetails(batchID);
        const hasLegacyAuth = documentPath.includes(`/${projName}/`) || documentPath.includes(`/${projName}.xlsx/`);
        const hasNewAuth = documentPath.includes(`/${barangayID}/${cycleID}/`);
        
        if (!hasLegacyAuth && !hasNewAuth) {
            return res.status(403).json({ success: false, message: 'Unauthorized file deletion' });
        }

        // isPublic = true because docs container is the public docs
        await deleteFile(documentPath, null, true);

        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document' });
    }
});

/**
 * GET /api/project-documents/:batchID/download
 * Generate a SAS URL to download the document.
 */
router.get('/:batchID/download', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { documentPath } = req.query;

        if (!documentPath) {
            return res.status(400).json({ success: false, message: 'Document path is required' });
        }

        // Verify the document belongs to this project
        const { projName, barangayID, cycleID } = await getProjectDetails(batchID);
        const hasLegacyAuth = documentPath.includes(`/${projName}/`) || documentPath.includes(`/${projName}.xlsx/`);
        const hasNewAuth = documentPath.includes(`/${barangayID}/${cycleID}/`);
        
        if (!hasLegacyAuth && !hasNewAuth) {
            return res.status(403).json({ success: false, message: 'Unauthorized file access' });
        }

        const sasUrl = await generateSasUrl(docContainerName, documentPath);
        res.json({ success: true, url: sasUrl });
    } catch (error) {
        console.error('Error generating download URL:', error);
        res.status(500).json({ success: false, message: 'Failed to generate download URL' });
    }
});

module.exports = router;
