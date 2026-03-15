const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../session/session');
const { getConnection, sql } = require('../database/database');
const {
    docContainerName,
    listBlobsWithProperties,
    uploadBlob,
    deleteFile,
    generateSasUrl
} = require('../Storage/storage');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper to get project details
 */
async function getProjectDetails(batchID) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('batchID', sql.Int, batchID)
        .query('SELECT projName, projType FROM projectBatch WHERE batchID = @batchID');
    
    if (result.recordset.length === 0) {
        throw new Error('Project not found');
    }
    return result.recordset[0];
}

/**
 * Project Categories Definition
 */
const PROJECT_CATEGORIES = {
    ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution'],
    CBYDP: ['LYDP', 'KK_Minutes', 'Youth_Profile'],
};

/**
 * GET /api/project-documents/:batchID
 * List all documents for a project, organized by category.
 */
router.get('/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { projName, projType } = await getProjectDetails(batchID);
        
        const PROJECT_CATEGORIES = {
            ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution'],
            CBYDP: ['LYDP', 'KK_Minutes', 'Youth_Profile'],
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
            let prefix = `${projType}/${category}/${projName}/`;
            let blobs = await listBlobsWithProperties(docContainerName, { prefix });
            
            // Fallback 1: If no blobs found and projName has NO extension, try with .xlsx suffix
            if (blobs.length === 0 && !projName.includes('.')) {
                const altPrefix = `${projType}/${category}/${projName}.xlsx/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix });
            }
            
            // Fallback 2: If still no blobs and projName HAS an extension, try stripping it
            if (blobs.length === 0 && projName.includes('.')) {
                const strippedName = projName.split('.').slice(0, -1).join('.');
                const altPrefix2 = `${projType}/${category}/${strippedName}/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix2 });
            }
            
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

        res.json({ success: true, data: { projName, projType, categories: documents } });
    } catch (error) {
        console.error('Error fetching project documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

/**
 * POST /api/project-documents/:batchID/upload
 * Upload a document to a specific category.
 */
router.post('/:batchID/upload', authMiddleware, upload.single('document'), async (req, res) => {
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

        const { projName, projType } = await getProjectDetails(batchID);

        // Match normalized type
        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';
        else if (projType.includes('CBYDP')) mappedType = 'CBYDP';

        const allowedCategories = PROJECT_CATEGORIES[mappedType];
        if (!allowedCategories || !allowedCategories.includes(category)) {
            return res.status(400).json({ success: false, message: 'Invalid category for this project type' });
        }

        const blobName = `${projType}/${category}/${projName}/${file.originalname}`;
        
        await uploadBlob(docContainerName, blobName, file.buffer, file.mimetype);

        res.json({ success: true, message: 'Document uploaded successfully', fileName: file.originalname });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ success: false, message: 'Failed to upload document' });
    }
});

/**
 * DELETE /api/project-documents/:batchID/delete
 * Delete a document by its full path.
 */
router.delete('/:batchID/delete', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const { documentPath } = req.body;

        if (!documentPath) {
            return res.status(400).json({ success: false, message: 'Document path is required' });
        }

        // Verify the document belongs to this project
        const { projName } = await getProjectDetails(batchID);
        if (!documentPath.includes(`/${projName}/`)) {
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
        const { projName } = await getProjectDetails(batchID);
        if (!documentPath.includes(`/${projName}/`)) {
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
