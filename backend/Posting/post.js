const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { checkRole } = require('../routeGuard/permission');
const { uploadFile } = require('../Storage/storage');
const { compressVideo } = require('../FFmpeg/ffmpeg');
const { addAuditTrail } = require('../audit/auditService');
const { sendToUser } = require('../websockets/websocket');
const postJob = require('./postJob');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Multer configuration for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, videos, and documents are allowed.'), false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for initial upload
});

// Function to get current timestamp in GMT+8
const getPHTimestamp = () => {
    const now = new Date();
    const offset = 8 * 60; // GMT+8 in minutes
    const localNow = new Date(now.getTime() + (offset * 60 * 1000));
    return localNow;
};

// POST /api/create-post - Starts an asynchronous job to create a new post
router.post('/create-post', authMiddleware, checkRole(['SKC', 'SKO']), upload.fields([{ name: 'attachments' }, { name: 'secure_attachments' }]), async (req, res) => {
    const { title, description, taggedProjects, viewOptions } = req.body;
    const userID = req.user.userID; // Correctly get userID from req.user

    if (!title || !description) {
        return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    let tempDir;
    try {
        // 1. Create a job with all necessary data
        const jobId = await postJob.createJob({
            title,
            description,
            initiatedBy: req.user.fullName,
            userID: userID, // Pass the userID into the job payload
            taggedProjects: JSON.parse(taggedProjects || '[]'),
            viewOptions: JSON.parse(viewOptions || '{}')
        });

        // 2. Save files to a temporary location
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `post-upload-${jobId}-`));
        const tempFiles = [];
        
        const processFiles = async (files, storageClass) => {
            if (files && files.length > 0) {
                for (const file of files) {
                    const tempFilePath = path.join(tempDir, file.originalname);
                    await fs.writeFile(tempFilePath, file.buffer);
                    tempFiles.push({
                        path: tempFilePath,
                        originalname: file.originalname,
                        mimetype: file.mimetype,
                        storageClass: storageClass
                    });
                }
            }
        };

        await processFiles(req.files.attachments, 'public');
        await processFiles(req.files.secure_attachments, 'secure');

        // 3. Respond to client immediately
        res.status(202).json({ success: true, message: 'Post creation job accepted.', jobId });

        // 4. Start background processing (fire and forget)
        processPostUploadJob(jobId, tempFiles, tempDir);

    } catch (error) {
        console.error('Error initiating post creation job:', error);
        // Cleanup temp dir if it was created
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Failed to clean up temporary directory ${tempDir} after job initiation failure:`, cleanupError);
            }
        }
        res.status(500).json({ success: false, message: 'Failed to initiate post creation job.', error: error.message });
    }
});

// GET /api/post-status/:jobId - Checks the status of a post creation job
router.get('/post-status/:jobId', authMiddleware, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await postJob.getJob(jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found.' });
        }
        // Security check: ensure the user requesting status is the one who created the job
        if (job.UserID !== req.user.userID) { // Corrected to use userID from token
             return res.status(403).json({ success: false, message: 'You are not authorized to view this job status.' });
        }
        res.status(200).json({ success: true, job });
    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch job status.' });
    }
});

// Background processing function
async function processPostUploadJob(jobId, tempFiles, tempDir) {
    try {
        await postJob.updateJob(jobId, 'processing', 'Processing post and uploading files.');

        const job = await postJob.getJob(jobId);
        const { title, description, initiatedBy, taggedProjects, viewOptions } = JSON.parse(job.Payload);
        const userID = job.UserID; // Get userID from the job's own column

        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const timestamp = getPHTimestamp();
            const postReference = `G-${timestamp.toISOString().slice(0, 19).replace(/[-T:]/g, '')}`;

            const postRequest = new sql.Request(transaction);
            const postResult = await postRequest
                .input('userID', sql.Int, userID)
                .input('title', sql.NVarChar, title)
                .input('description', sql.NVarChar, description)
                .input('postReference', sql.NVarChar, postReference)
                .query(`
                    INSERT INTO posts (userID, title, description, postReference)
                    OUTPUT INSERTED.postID
                    VALUES (@userID, @title, @description, @postReference);
                `);

            const postID = postResult.recordset[0].postID;

            if (tempFiles && tempFiles.length > 0) {
                for (const file of tempFiles) {
                    let fileBuffer = await fs.readFile(file.path);
                    let finalMimeType = file.mimetype;

                    if (file.mimetype === 'video/mp4' && fileBuffer.length > 25 * 1024 * 1024) {
                        try {
                            fileBuffer = await compressVideo(fileBuffer, file.originalname);
                        } catch (compressionError) {
                            throw new Error(`Video compression failed for ${file.originalname}: ${compressionError.message}`);
                        }
                    }
                    
                    const azureBlobName = await uploadFile({
                        buffer: fileBuffer,
                        originalname: file.originalname,
                        mimetype: finalMimeType
                    }, file.storageClass);

                    const attachmentRequest = new sql.Request(transaction);
                    await attachmentRequest
                        .input('postID', sql.Int, postID)
                        .input('fileType', sql.NVarChar, finalMimeType)
                        .input('filePath', sql.NVarChar, azureBlobName)
                        .query(`
                            INSERT INTO postAttachments (postID, fileType, filePath)
                            VALUES (@postID, @fileType, @filePath);
                        `);
                }
            }

            // Insert tagged projects
            if (taggedProjects && taggedProjects.length > 0) {
                for (const projectID of taggedProjects) {
                    const tagRequest = new sql.Request(transaction);
                    await tagRequest
                        .input('postID', sql.Int, postID)
                        .input('projectID', sql.Int, projectID)
                        .query('INSERT INTO tagProjOnPost (postID, projectID) VALUES (@postID, @projectID)');
                }
            }

            // Insert view options
            if (viewOptions) {
                const viewRequest = new sql.Request(transaction);
                await viewRequest
                    .input('postID', sql.Int, postID)
                    .input('opforPubProj', sql.Bit, viewOptions.opforPubProj || 0)
                    .input('opforAllBrgyProj', sql.Bit, viewOptions.opforAllBrgyProj || 0)
                    .input('opforBrgyProj', sql.Bit, viewOptions.opforBrgyProj || 0)
                    .input('opforPubEAttach', sql.Bit, viewOptions.opforPubEAttach || 0)
                    .input('opforAllBrgyEAttach', sql.Bit, viewOptions.opforAllBrgyEAttach || 0)
                    .input('opforBrgyEAttach', sql.Bit, viewOptions.opforBrgyEAttach || 0)
                    .query(`
                        INSERT INTO viewOption (postID, opforPubProj, opforAllBrgyProj, opforBrgyProj, opforPubEAttach, opforAllBrgyEAttach, opforBrgyEAttach)
                        VALUES (@postID, @opforPubProj, @opforAllBrgyProj, @opforBrgyProj, @opforPubEAttach, @opforAllBrgyEAttach, @opforBrgyEAttach)
                    `);
            }

            await transaction.commit();
            
            addAuditTrail({
                actor: 'C',
                module: 'G',
                userID: userID,
                actions: 'create-post-async',
                oldValue: null,
                newValue: `Reference: ${postReference}`,
                descriptions: `User ${initiatedBy} created a new post via async job: ${title}`
            });

            await postJob.updateJob(jobId, 'completed', 'Post created successfully.', { Result: { postID } });
            sendToUser(userID, { type: 'job-update', status: 'completed', message: 'Post created successfully!' });

        } catch (innerError) {
            await transaction.rollback();
            throw innerError; // Propagate to outer catch
        }

    } catch (error) {
        console.error(`[Job ${jobId}] Failed to process post upload:`, error);
        await postJob.updateJob(jobId, 'failed', 'Failed to create post.', { ErrorMessage: error.message });
        sendToUser(job.UserID, { type: 'job-update', status: 'failed', message: error.message });
    } finally {
        // Cleanup temporary files
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error(`[Job ${jobId}] Failed to clean up temporary directory ${tempDir}:`, cleanupError);
        }
    }
}

module.exports = router;
