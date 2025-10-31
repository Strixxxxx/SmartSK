const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl } = require('../Storage/storage');
const { decrypt } = require('../utils/crypto');
const { authMiddleware } = require('../session/session');

// GET /api/posts/barangays - Fetch all barangay names
router.get('/barangays', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT barangayName FROM barangays ORDER BY barangayName ASC');
        const barangayNames = result.recordset.map(row => row.barangayName);
        res.status(200).json(barangayNames);
    } catch (error) {
        console.error('Error fetching barangays:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch barangays.' });
    }
});

// GET /api/posts - Fetch All PUBLIC Posts, optionally filtered by barangay
router.get('/', async (req, res) => {
    try {
        const { barangay } = req.query;
        const pool = await getConnection();
        const request = pool.request();

        let query = `
            SELECT 
                p.postID, p.title, p.description,
                u.fullName AS author,
                b.barangayName,
                pa.attachmentID, pa.fileType, pa.filePath, pa.isPublic,
                proj.projectID as taggedProjectID, proj.title as taggedProjectTitle,
                vo.opforPubProj, vo.opforPubEAttach
            FROM posts p
            JOIN userInfo u ON p.userID = u.userID
            JOIN barangays b ON u.barangay = b.barangayID
            LEFT JOIN viewOption vo ON p.postID = vo.postID
            LEFT JOIN postAttachments pa ON p.postID = pa.postID
            LEFT JOIN tagProjOnPost tpp ON p.postID = tpp.postID
            LEFT JOIN projects proj ON tpp.projectID = proj.projectID
        `;

        if (barangay) {
            request.input('barangayName', sql.NVarChar, barangay);
            query += ' WHERE b.barangayName = @barangayName';
        }

        query += ' ORDER BY p.postID DESC;';

        const result = await request.query(query);

        const postsMap = {};

        result.recordset.forEach(row => {
            if (!postsMap[row.postID]) {
                postsMap[row.postID] = {
                    postID: row.postID,
                    title: row.title,
                    description: row.description,
                    author: decrypt(row.author),
                    barangayName: row.barangayName,
                    publicAttachments: [],
                    secureAttachments: [],
                    taggedProjects: [],
                    viewOptions: {
                        opforPubEAttach: row.opforPubEAttach
                    }
                };
            }

            if (row.attachmentID) {
                const attachment = {
                    attachmentID: row.attachmentID,
                    fileType: row.fileType,
                    filePath: row.filePath,
                    isPublic: row.isPublic
                };

                if (row.isPublic) {
                    const attachmentExists = postsMap[row.postID].publicAttachments.some(a => a.attachmentID === row.attachmentID);
                    if (!attachmentExists) {
                        postsMap[row.postID].publicAttachments.push(attachment);
                    }
                } else if (row.opforPubEAttach) { // Only add secure if opforPubEAttach is true
                    const attachmentExists = postsMap[row.postID].secureAttachments.some(a => a.attachmentID === row.attachmentID);
                    if (!attachmentExists) {
                        postsMap[row.postID].secureAttachments.push(attachment);
                    }
                }
            }

            // Handle public tagged projects
            if (row.taggedProjectID && row.opforPubProj) {
                const projectExists = postsMap[row.postID].taggedProjects.some(p => p.projectID === row.taggedProjectID);
                if (!projectExists) {
                    postsMap[row.postID].taggedProjects.push({
                        projectID: row.taggedProjectID,
                        title: decrypt(row.taggedProjectTitle)
                    });
                }
            }
        });

        const posts = Object.values(postsMap);

        for (const post of posts) {
            post.publicAttachments = await Promise.all(post.publicAttachments.map(async (attachment) => {
                const sasUrl = await getFileSasUrl(attachment.filePath, attachment.fileType, attachment.isPublic);
                return { ...attachment, filePath: sasUrl };
            }));
            post.secureAttachments = await Promise.all(post.secureAttachments.map(async (attachment) => {
                const sasUrl = await getFileSasUrl(attachment.filePath, attachment.fileType, attachment.isPublic);
                return { ...attachment, filePath: sasUrl };
            }));
        }

        res.status(200).json(posts);

    } catch (error) {
        console.error('Error fetching public posts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch posts.', error: error.message });
    }
});

// GET /api/posts/feed - Fetch posts for authenticated users
router.get('/feed', authMiddleware, async (req, res) => {
    try {
        const userBarangayId = req.user.barangay; // Assuming barangay ID is in the user token
        const pool = await getConnection();
        const request = pool.request();

        const query = `
            SELECT 
                p.postID, p.title, p.description,
                p.userID as authorUserID,
                u.fullName AS author,
                b.barangayID as authorBarangayID,
                b.barangayName,
                pa.attachmentID, pa.fileType, pa.filePath, pa.isPublic,
                proj.projectID as taggedProjectID, proj.title as taggedProjectTitle,
                vo.opforBrgyEAttach, vo.opforAllBrgyEAttach, vo.opforPubEAttach, vo.opforBrgyProj, vo.opforAllBrgyProj, vo.opforPubProj
            FROM posts p
            JOIN userInfo u ON p.userID = u.userID
            JOIN barangays b ON u.barangay = b.barangayID
            LEFT JOIN viewOption vo ON p.postID = vo.postID
            LEFT JOIN postAttachments pa ON p.postID = pa.postID
            LEFT JOIN tagProjOnPost tpp ON p.postID = tpp.postID
            LEFT JOIN projects proj ON tpp.projectID = proj.projectID
            ORDER BY p.postID DESC;
        `;

        const result = await request.query(query);
        const postsMap = {};

        result.recordset.forEach(row => {
            if (!postsMap[row.postID]) {
                postsMap[row.postID] = {
                    postID: row.postID,
                    title: row.title,
                    description: row.description,
                    author: decrypt(row.author),
                    barangayName: row.barangayName,
                    publicAttachments: [],
                    secureAttachments: [],
                    taggedProjects: [],
                    authorBarangayID: row.authorBarangayID,
                    viewOptions: row // Store all view options
                };
            }

            if (row.attachmentID) {
                const attachment = {
                    attachmentID: row.attachmentID,
                    fileType: row.fileType,
                    filePath: row.filePath,
                    isPublic: row.isPublic
                };

                if (attachment.isPublic) {
                    const exists = postsMap[row.postID].publicAttachments.some(a => a.attachmentID === attachment.attachmentID);
                    if (!exists) postsMap[row.postID].publicAttachments.push(attachment);
                } else {
                    // Secure attachment visibility logic
                    let canView = false;
                    if (row.opforBrgyEAttach === true && userBarangayId === row.authorBarangayID) canView = true;
                    else if (row.opforAllBrgyEAttach === true) canView = true;
                    else if (row.opforPubEAttach === true) canView = true; // Publicly visible secure docs

                    if (canView) {
                        const exists = postsMap[row.postID].secureAttachments.some(a => a.attachmentID === attachment.attachmentID);
                        if (!exists) postsMap[row.postID].secureAttachments.push(attachment);
                    }
                }
            }

            // Tagged project processing
            if (row.taggedProjectID && !postsMap[row.postID].taggedProjects.some(p => p.projectID === row.taggedProjectID)) {
                let canView = false;
                if (row.opforBrgyProj === true) {
                    canView = (userBarangayId === row.authorBarangayID);
                } else if (row.opforAllBrgyProj === true) {
                    canView = true;
                } else if (row.opforPubProj === true || (row.opforBrgyProj === null && row.opforAllBrgyProj === null && row.opforPubProj === null)) {
                    canView = true; // Default to public
                }

                if (canView) {
                    postsMap[row.postID].taggedProjects.push({
                        projectID: row.taggedProjectID,
                        title: decrypt(row.taggedProjectTitle),
                    });
                }
            }
        });

        const posts = Object.values(postsMap);

        for (const post of posts) {
            // Generate SAS URLs for all viewable attachments
            post.publicAttachments = await Promise.all(post.publicAttachments.map(async (attachment) => {
                const sasUrl = await getFileSasUrl(attachment.filePath, attachment.fileType, attachment.isPublic);
                return { ...attachment, filePath: sasUrl };
            }));
            post.secureAttachments = await Promise.all(post.secureAttachments.map(async (attachment) => {
                const sasUrl = await getFileSasUrl(attachment.filePath, attachment.fileType, attachment.isPublic);
                return { ...attachment, filePath: sasUrl };
            }));
        }

        res.status(200).json(posts);

    } catch (error) {
        console.error('Error fetching authenticated posts feed:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch feed.', error: error.message });
    }
});

module.exports = router;