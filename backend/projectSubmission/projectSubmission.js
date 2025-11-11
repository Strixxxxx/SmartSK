const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');
const { uploadFile, getFileSasUrl } = require('../Storage/storage');
const { encrypt, decrypt } = require('../utils/crypto');

const { spawn } = require('child_process');

// Multer configuration for in-memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedFileTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedFileTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, PPT, and PPTX files are allowed.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

const handleAIProjectJobCompletion = async (projectId) => {
    console.log(`AI project analysis job completed for projectID: ${projectId}.`);
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query(`
                SELECT 
                    p.title,
                    s.StatusName
                FROM projects p
                JOIN StatusLookup s ON p.status = s.StatusID
                WHERE p.projectID = @projectID
            `);

        if (result.recordset.length > 0) {
            const { title, StatusName } = result.recordset[0];
            const decryptedTitle = decrypt(title);
            console.log(`Final status for project '${decryptedTitle}' (ID: ${projectId}) is '${StatusName}'.`);

            // In the future, a WebSocket broadcast could be added here to inform the user.
        } else {
             console.error(`Could not find status for projectID ${projectId} after AI job completion.`);
        }
    } catch (error) {
        console.error(`Error in handleAIProjectJobCompletion for projectID ${projectId}:`, error);
    }
};

// Submit a new project
router.post('/submit', authMiddleware, upload.single('projectFile'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const userIdInt = req.user.userID; // Use secure user ID from session
    
    if (!title || !description || !userIdInt) {
      return res.status(400).json({ success: false, message: 'Missing required fields or user authentication' });
    }

    let filePath = null;
    if (req.file) {
        filePath = await uploadFile(req.file, true);
    }

    const referenceNumber = `PRJ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    const pool = await getConnection();

    // Encrypt project data
    const encryptedTitle = encrypt(title);
    const encryptedDescription = encrypt(description);

    const result = await pool.request()
      .input('referenceNumber', sql.VarChar, referenceNumber)
      .input('title', sql.NVarChar, encryptedTitle)
      .input('description', sql.NVarChar, encryptedDescription)
      .input('userID', sql.Int, userIdInt)
      .input('status', sql.Int, 1) // Set default status to 'Pending Review'
      .input('filePath', sql.VarChar, filePath)
      .input('fileName', sql.VarChar, req.file ? req.file.originalname : null)
      .query(`
        INSERT INTO projects (reference_number, title, description, userID, status, submittedDate, file_path, file_name) 
        VALUES (@referenceNumber, @title, @description, @userID, @status, GETDATE(), @filePath, @fileName);
        SELECT SCOPE_IDENTITY() AS projectID;
      `);
    
    const projectId = result.recordset[0].projectID;

    // --- Trigger AI Analysis ---
    if (projectId) {
        const pythonScriptPath = path.join(__dirname, '..', 'AI', 'projectAIJobs.py');
        const childProcess = spawn('python', [pythonScriptPath, projectId]);

        childProcess.stdout.on('data', (data) => console.log(`[AI_PROJ_JOB_${projectId}] stdout: ${data}`));
        childProcess.stderr.on('data', (data) => console.error(`[AI_PROJ_JOB_${projectId}] stderr: ${data}`));

        childProcess.on('close', (code) => {
            console.log(`[AI_PROJ_JOB_${projectId}] child process exited with code ${code}`);
            if (code === 0) {
                handleAIProjectJobCompletion(projectId);
            }
        });
        
        childProcess.on('error', (err) => {
            console.error(`[AI_PROJ_JOB_${projectId}] Failed to start subprocess:`, err);
        });
    }
    // --- End AI Trigger ---

    // Immediately respond that the project is being processed
    res.status(202).json({ 
        success: true, 
        message: 'Project submitted successfully and is now being processed by AI.',
        projectId: projectId
    });

    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: userIdInt,
        actions: 'submit-project',
        oldValue: null,
        newValue: `Title: ${title}`,
        descriptions: `User ${req.user.fullName} submitted a new project: ${title}`
    });

  } catch (error) {
    console.error('Project submission error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred during project submission: ' + error.message });
  }
});

// Get projects for a specific user
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, p.description, 
               s.StatusName as status, p.submittedDate, p.file_path as fileUrl, p.file_name as fileName,
               p.remarks, p.userID as userId, p.reviewedBy
        FROM projects p
        JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.userID = @userId AND p.isArchived = 0
        ORDER BY p.submittedDate DESC
      `);

    const decryptedProjects = result.recordset.map(p => ({
        ...p,
        title: decrypt(p.title),
        description: decrypt(p.description),
        remarks: decrypt(p.remarks),
        reviewedBy: decrypt(p.reviewedBy),
    }));
    
    return res.json({ success: true, projects: decryptedProjects });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch projects', error: error.message });
  }
});

// Generate a SAS URL for downloading a project file
router.get('/download/:filename', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.params;
    const sanitizedFilename = path.basename(filename);

    const pool = await getConnection();
    const projectResult = await pool.request()
        .input('filename', sql.VarChar, sanitizedFilename)
        .query('SELECT userID FROM projects WHERE file_path = @filename');

    if (projectResult.recordset.length === 0) {
        return res.status(404).json({ success: false, message: 'File not found.' });
    }

    const projectOwnerId = projectResult.recordset[0].userID;
    const requesterId = req.user.userID;
    const requesterPosition = req.user.position;

    if (requesterId !== projectOwnerId && !['SKC', 'MA', 'SA'].includes(requesterPosition)) {
        return res.status(403).json({ success: false, message: 'You are not authorized to download this file.' });
    }

    const sasUrl = await getFileSasUrl(sanitizedFilename);

    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: req.user.userID,
        actions: 'download-project-file',
        oldValue: null,
        newValue: `filename: ${filename}`,
        descriptions: `User ${req.user.fullName} requested a download link for ${filename}`
    });

    return res.json({ success: true, url: sasUrl });

  } catch (error) {
    console.error('Error generating SAS URL:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while generating the file link.' });
  }
});

module.exports = router;