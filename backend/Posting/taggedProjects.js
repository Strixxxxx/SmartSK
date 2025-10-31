const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { decrypt } = require('../utils/crypto');
const { getFileSasUrl } = require('../Storage/storage');

const getMimeType = (fileName) => {
    if (!fileName) return 'application/octet-stream';
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
        case 'pdf':
            return 'application/pdf';
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'doc':
            return 'application/msword';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'mp4':
            return 'video/mp4';
        default:
            return 'application/octet-stream';
    }
};

// Get projects for the currently authenticated user (for tagging)
router.get('/for-tagging', authMiddleware, async (req, res) => {
  try {
    const { userID } = req.user; // From authMiddleware
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('userID', sql.Int, userID)
      .query(`
        SELECT projectID, title, reference_number
        FROM projects
        WHERE userID = @userID
        ORDER BY submittedDate DESC
      `);

    const decryptedProjects = result.recordset.map(p => ({
        projectID: p.projectID,
        title: decrypt(p.title),
        reference_number: p.reference_number
    }));
    
    return res.json({ success: true, projects: decryptedProjects });
  } catch (error) {
    console.error('Error fetching user projects for tagging:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch projects for tagging' });
  }
});

router.get('/:projectId', authMiddleware, async (req, res) => {
    const { projectId } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query(`
                SELECT 
                    p.projectID, p.reference_number, p.title, p.description, p.file_path, p.file_name,
                    s.StatusName as status,
                    u.fullName as authorName
                FROM projects p
                LEFT JOIN StatusLookup s ON p.status = s.StatusID
                LEFT JOIN userInfo u ON p.userID = u.userID
                WHERE p.projectID = @projectID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const projectData = {
            projectID: result.recordset[0].projectID,
            reference_number: result.recordset[0].reference_number,
            title: decrypt(result.recordset[0].title),
            description: decrypt(result.recordset[0].description),
            author: decrypt(result.recordset[0].authorName),
            status: result.recordset[0].status,
            attachments: []
        };

        if (result.recordset[0].file_path) {
            const filePath = result.recordset[0].file_path;
            const fileName = result.recordset[0].file_name;
            const fileType = getMimeType(fileName);

            projectData.attachments.push({
                attachmentID: -1, // Placeholder ID
                fileType: fileType,
                filePath: await getFileSasUrl(filePath, fileType, true, 'project')
            });
        }

        res.json({ success: true, project: projectData });

    } catch (err) {
        console.error('Error fetching project details:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch project details.' });
    }
});

router.get('/:projectId/related-posts', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    const { currentPostId } = req.query;
    const userBarangayId = req.user.barangay;

    try {
        const pool = await getConnection();
        
        let queryText = `
            SELECT po.postID, po.title, u.barangay as authorBarangayID, vo.*
            FROM tagProjOnPost t
            JOIN posts po ON t.postID = po.postID
            JOIN userInfo u ON po.userID = u.userID
            LEFT JOIN viewOption vo ON po.postID = vo.postID
            WHERE t.projectID = @projectID
        `;
        
        const request = pool.request().input('projectID', sql.Int, projectId);

        if (currentPostId) {
            queryText += ` AND po.postID != @currentPostId`;
            request.input('currentPostId', sql.Int, currentPostId);
        }

        const result = await request.query(queryText);

        const decryptedPosts = result.recordset.filter(p => {
            let canView = false;
            if (p.postVOID === null) {
                canView = true; // Default to public if no options set
            } else if (p.opforPubProj) {
                canView = true;
            } else if (p.opforAllBrgyProj) {
                canView = true;
            } else if (p.opforBrgyProj) {
                canView = (userBarangayId === p.authorBarangayID);
            }
            return canView;
        }).map(p => ({
            postID: p.postID,
            title: p.title
        }));

        res.json({ success: true, relatedPosts: decryptedPosts });
    } catch (err) {
        console.error('Error fetching authenticated related posts:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch authenticated related posts.' });
    }
});

router.get('/post/:postId', authMiddleware, async (req, res) => {
    try {
        const { postId } = req.params;
        
        // Validate postId is a valid number
        const numericPostId = parseInt(postId, 10);
        if (isNaN(numericPostId)) {
            return res.status(400).json({ success: false, message: 'Invalid post ID' });
        }

        const pool = await getConnection();
        const result = await pool.request()
            .input('postID', sql.Int, numericPostId)
            .query(`
                SELECT 
                    p.postID, p.title, p.description,
                    u.fullName AS author,
                    b.barangayName,
                    pa.attachmentID, pa.fileType, pa.filePath, pa.isPublic,
                    proj.projectID as taggedProjectID, proj.title as taggedProjectTitle,
                    vo.*
                FROM posts p
                JOIN userInfo u ON p.userID = u.userID
                JOIN barangays b ON u.barangay = b.barangayID
                LEFT JOIN viewOption vo ON p.postID = vo.postID
                LEFT JOIN postAttachments pa ON p.postID = pa.postID
                LEFT JOIN tagProjOnPost tpp ON p.postID = tpp.postID
                LEFT JOIN projects proj ON tpp.projectID = proj.projectID
                WHERE p.postID = @postID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        const post = {
            postID: result.recordset[0].postID,
            title: result.recordset[0].title,
            description: result.recordset[0].description,
            author: decrypt(result.recordset[0].author),
            barangayName: result.recordset[0].barangayName,
            publicAttachments: [],
            secureAttachments: [],
            taggedProjects: [],
            viewOptions: result.recordset[0]
        };

        result.recordset.forEach(row => {
            if (row.attachmentID) {
                const attachment = {
                    attachmentID: row.attachmentID,
                    fileType: row.fileType,
                    filePath: row.filePath,
                    isPublic: row.isPublic
                };
                if (row.isPublic) {
                    if (!post.publicAttachments.some(a => a.attachmentID === row.attachmentID)) {
                        post.publicAttachments.push(attachment);
                    }
                } else {
                    if (!post.secureAttachments.some(a => a.attachmentID === row.attachmentID)) {
                        post.secureAttachments.push(attachment);
                    }
                }
            }
            if (row.taggedProjectID) {
                if (!post.taggedProjects.some(p => p.projectID === row.taggedProjectID)) {
                    post.taggedProjects.push({
                        projectID: row.taggedProjectID,
                        title: decrypt(row.taggedProjectTitle)
                    });
                }
            }
        });

        res.json({ success: true, post });

    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch post' });
    }
});

module.exports = router;