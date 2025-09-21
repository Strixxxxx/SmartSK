const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');

// Multer configuration (no changes needed)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join('D:', 'Projects', 'Projects', 'smartSK', 'projects');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueFilename = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

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
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Submit a new project
router.post('/submit', authMiddleware, upload.single('projectFile'), async (req, res) => {
  try {
    const { title, description, userId } = req.body;
    
    if (!title || !description || !userId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const referenceNumber = `PRJ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    const pool = await getConnection();
    const filePath = req.file ? req.file.filename : null;
    const userIdInt = parseInt(userId, 10);

    // Insert new project with status ID 1 ('Pending Review')
    const result = await pool.request()
      .input('referenceNumber', sql.VarChar, referenceNumber)
      .input('title', sql.VarChar, title)
      .input('description', sql.VarChar, description)
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

    // Fetch the newly created project with its status name
    const projectResult = await pool.request()
      .input('projectID', sql.Int, projectId)
      .query(`
        SELECT p.*, s.StatusName 
        FROM projects p
        JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.projectID = @projectID
      `);

    const project = {
      id: projectResult.recordset[0].projectID,
      referenceNumber: projectResult.recordset[0].reference_number,
      title: projectResult.recordset[0].title,
      description: projectResult.recordset[0].description,
      status: projectResult.recordset[0].StatusName, // Use the status name
      submittedDate: projectResult.recordset[0].submittedDate,
      fileUrl: projectResult.recordset[0].file_path,
      fileName: projectResult.recordset[0].file_name
    };
    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: userIdInt,
        actions: 'submit-project',
        oldValue: null,
        newValue: `Title: ${title}`,
        descriptions: 'User submitted a new project'
    });

    return res.status(201).json({ success: true, message: 'Project submitted successfully', project });

  } catch (dbError) {
    console.error('Database error');
    return res.status(500).json({ success: false, message: 'Database error: ' + dbError.message });
  }
});

// Get projects for a specific user
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getConnection();
    
    // Join with StatusLookup to get the status name
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, p.description, 
               s.StatusName as status, p.submittedDate, p.file_path as fileUrl, p.file_name as fileName,
               p.remarks, p.userID as userId, p.reviewedBy
        FROM projects p
        JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.userID = @userId
        ORDER BY p.submittedDate DESC
      `);
    
    return res.json({ success: true, projects: result.recordset });
  } catch (error) {
    console.error('Error fetching user projects');
    return res.status(500).json({ success: false, message: 'Failed to fetch projects', error: error.message });
  }
});

// Download a project file (no changes needed)
router.get('/download/:filename', authMiddleware, async (req, res) => {
  try {
    const { filename } = req.params;
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join('D:', 'Projects', 'Projects', 'smartSK', 'projects', sanitizedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: req.user.userId,
        actions: 'download-project-file',
        oldValue: null,
        newValue: `filename: ${filename}`,
        descriptions: 'User downloaded a project file'
    });
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file');
    return res.status(500).json({ success: false, message: 'An error occurred while serving the file' });
  }
});

module.exports = router;