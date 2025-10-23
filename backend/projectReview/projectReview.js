const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getConnection } = require('../database/database');
const { sendProjectStatusEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { encrypt, decrypt } = require('../utils/crypto');

// Get all projects for review
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const userBarangay = req.user.barangay;

    if (userBarangay === undefined || userBarangay === null) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an assigned barangay.',
      });
    }

    const result = await pool.request()
      .input('userBarangay', sql.Int, userBarangay)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, p.description, 
               s.StatusName as status, p.submittedDate, p.file_path as fileUrl, p.file_name as fileName,
               p.remarks, p.userID as userId, u.fullName as proposerName
        FROM projects p
        INNER JOIN userInfo u ON p.userID = u.userID
        INNER JOIN StatusLookup s ON p.status = s.StatusID
        WHERE u.barangay = @userBarangay
        ORDER BY p.submittedDate DESC
      `);
    
    const decryptedProjects = result.recordset.map(p => ({
        ...p,
        title: decrypt(p.title),
        description: decrypt(p.description),
        remarks: decrypt(p.remarks),
        proposerName: decrypt(p.proposerName),
    }));

    return res.json({
      success: true,
      projects: decryptedProjects
    });
  } catch (error) {
    console.error('Error fetching projects for review', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch projects for review',
      error: error.message
    });
  }
});

// Get a specific project by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, p.description, 
               s.StatusName as status, p.submittedDate, p.file_path as fileUrl, p.file_name as fileName,
               p.remarks, p.userID as userId, u.fullName as username
        FROM projects p
        LEFT JOIN userInfo u ON p.userID = u.userID
        LEFT JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.projectID = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    
    const project = result.recordset[0];
    const decryptedProject = {
        ...project,
        title: decrypt(project.title),
        description: decrypt(project.description),
        remarks: decrypt(project.remarks),
        username: decrypt(project.username),
    };

    return res.json({ success: true, project: decryptedProject });
  } catch (error) {
    console.error('Error fetching project details', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch project details' });
  }
});

// Update project status and add review
router.put('/status/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, reviewerName } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }
    
    const pool = await getConnection();

    const statusResult = await pool.request()
        .input('statusName', sql.NVarChar, status)
        .query('SELECT StatusID FROM StatusLookup WHERE StatusName = @statusName');

    if (statusResult.recordset.length === 0) {
        return res.status(400).json({ success: false, message: `Invalid status value: ${status}` });
    }
    const statusId = statusResult.recordset[0].StatusID;

    const projectInfoResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.title, u.emailAddress, p.status as oldStatus FROM projects p
        JOIN userInfo u ON p.userID = u.userID WHERE p.projectID = @id
      `);
    
    if (projectInfoResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const projectInfo = projectInfoResult.recordset[0];
    const decryptedTitle = decrypt(projectInfo.title);

    // Encrypt remarks and reviewer name before updating
    const encryptedRemarks = encrypt(remarks || '');
    const encryptedReviewerName = encrypt(reviewerName || 'Unknown Reviewer');

    await pool.request()
      .input('id', sql.Int, id)
      .input('statusId', sql.Int, statusId)
      .input('remarks', sql.NVarChar, encryptedRemarks)
      .input('reviewedBy', sql.NVarChar, encryptedReviewerName)
      .query(`
        UPDATE projects SET status = @statusId, remarks = @remarks, reviewedBy = @reviewedBy
        WHERE projectID = @id;
      `);

    const updateResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, s.StatusName as status, p.remarks
        FROM projects p
        JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.projectID = @id;
      `);

    // Decrypt for the response
    const decryptedUpdate = {
        ...updateResult.recordset[0],
        title: decrypt(updateResult.recordset[0].title),
        remarks: decrypt(updateResult.recordset[0].remarks),
    };

    await sendProjectStatusEmail(id, status, remarks);
    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: req.user.userID,
        actions: 'update-project-status',
        oldValue: `status: ${projectInfo.oldStatus}`,
        newValue: `status: ${statusId}`,
        descriptions: `Project '${decryptedTitle}' status updated to '${status}'`
    });
      
    return res.json({
      success: true,
      message: 'Project status updated successfully',
      project: decryptedUpdate
    });
  } catch (error) {
    console.error('Error updating project status', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update project status',
      error: error.message
    });
  }
});

module.exports = router;