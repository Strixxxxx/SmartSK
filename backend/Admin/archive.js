const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const routeGuard = require('../routeGuard/routeGuard');

// Middleware to ensure only admins can access these routes
router.use(authMiddleware, routeGuard.isAdmin);

// --- Account Archive Routes ---

// GET all archived accounts
router.get('/accounts', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        u.userID, 
        u.username, 
        u.fullName, 
        r.roleName as position, 
        b.barangayName as barangay, 
        u.emailAddress, 
        u.phoneNumber,
        u.isArchived
      FROM userInfo u
      LEFT JOIN roles r ON u.position = r.roleID
      LEFT JOIN barangays b ON u.barangay = b.barangayID
      WHERE u.isArchived = 1
      ORDER BY u.fullName
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching archived accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived accounts.' });
  }
});

// --- Project Archive Routes ---

// GET all archived projects
router.get('/projects', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
        SELECT 
            p.projectID, 
            p.reference_number, 
            p.title, 
            p.submittedDate,
            u.fullName as submittedBy
        FROM projectsARC p
        LEFT JOIN userInfoARC u ON p.userID = u.userID
        ORDER BY p.submittedDate DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching archived projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived projects.' });
  }
});

module.exports = router;
