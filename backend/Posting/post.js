const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { checkRole } = require('../routeGuard/permission');
const { uploadFile } = require('../Storage/storage');
const { compressVideo } = require('../FFmpeg/ffmpeg');
const { addAuditTrail } = require('../audit/auditService');

// Multer configuration for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and MP4 are allowed.'), false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for initial upload
});

// POST /api/posts - Create a New Post
router.post('/', authMiddleware, checkRole(['SKC', 'SKO']), upload.array('attachments'), async (req, res) => {
    const { title, description } = req.body;
    const userID = req.user.userId;

    if (!title || !description) {
        return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const postRequest = new sql.Request(transaction);
        const postResult = await postRequest
            .input('userID', sql.Int, userID)
            .input('title', sql.NVarChar, title)
            .input('description', sql.NVarChar, description)
            .query(`
                -- TODO: Clarify the purpose of postReference and replace the hardcoded value.
                INSERT INTO posts (userID, title, description, postReference)
                VALUES (@userID, @title, @description, 0);
                SELECT SCOPE_IDENTITY() AS postID;
            `);

        const postID = postResult.recordset[0].postID;

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                let fileBuffer = file.buffer;
                let finalMimeType = file.mimetype;

                // Video processing
                if (file.mimetype === 'video/mp4' && file.size > 25 * 1024 * 1024) {
                    try {
                        fileBuffer = await compressVideo(file.buffer, file.originalname);
                    } catch (compressionError) {
                        await transaction.rollback();
                        return res.status(500).json({ success: false, message: 'Video compression failed.', error: compressionError.message });
                    }
                }
                
                const azureBlobName = await uploadFile({
                    buffer: fileBuffer,
                    originalname: file.originalname,
                    mimetype: finalMimeType
                });

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

        await transaction.commit();
        
        addAuditTrail({
            actor: 'C',
            module: 'PO',
            userID: userID,
            actions: 'create-post',
            oldValue: null,
            newValue: `Title: ${title}`,
            descriptions: `User ${req.user.fullName} created a new post: ${title}`
        });

        res.status(201).json({ success: true, message: 'Post created successfully.', postID });

    } catch (error) {
        await transaction.rollback();
        console.error('Error creating post:', error);
        res.status(500).json({ success: false, message: 'Failed to create post.', error: error.message });
    }
});

module.exports = router;