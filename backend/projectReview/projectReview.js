const express = require('express');
const router = express.Router();
const sql = require('mssql');
// Fix the database import path
const { getConnection } = require('../database/database');
// Import the email service
const { sendProjectStatusEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');

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
    
    return res.json({
      success: true,
      projects: result.recordset
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
    
    // Get database connection
    const pool = await getConnection();
    
    // Query to get project details with status name
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
    
    return res.json({ success: true, project: result.recordset[0] });
  } catch (error) {
    console.error('Error fetching project details');
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

    // Get the StatusID from the StatusName provided by the frontend
    const statusResult = await pool.request()
        .input('statusName', sql.NVarChar, status)
        .query('SELECT StatusID FROM StatusLookup WHERE StatusName = @statusName');

    if (statusResult.recordset.length === 0) {
        return res.status(400).json({ success: false, message: `Invalid status value: ${status}` });
    }
    const statusId = statusResult.recordset[0].StatusID;

    // Get project and user info for email notification
    const projectInfo = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.title, u.emailAddress, p.status as oldStatus FROM projects p
        JOIN userInfo u ON p.userID = u.userID WHERE p.projectID = @id
      `);
    
    if (projectInfo.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const oldStatus = projectInfo.recordset[0].oldStatus;

    // Update the project with the integer status ID
    await pool.request()
      .input('id', sql.Int, id)
      .input('statusId', sql.Int, statusId)
      .input('remarks', sql.Text, remarks || '')
      .input('reviewedBy', sql.NVarChar(50), reviewerName || 'Unknown Reviewer')
      .query(`
        UPDATE projects SET status = @statusId, remarks = @remarks, reviewedBy = @reviewedBy
        WHERE projectID = @id;
      `);

    // Get the updated project to return in the response
    const updateResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.projectID as id, p.reference_number as referenceNumber, p.title, s.StatusName as status, p.remarks
        FROM projects p
        JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.projectID = @id;
      `);

    // Send email notification
    await sendProjectStatusEmail(id, status, remarks);
    addAuditTrail({
        actor: 'C',
        module: 'P',
        userID: req.user.userId,
        actions: 'update-project-status',
        oldValue: `status: ${oldStatus}`,
        newValue: `status: ${statusId}`,
        descriptions: 'Project status updated'
    });
      
    return res.json({
      success: true,
      message: 'Project status updated successfully',
      project: updateResult.recordset[0]
    });
  } catch (error) {
    console.error('Error updating project status');
    return res.status(500).json({
      success: false,
      message: 'Failed to update project status',
      error: error.message
    });
  }
});

module.exports = router;