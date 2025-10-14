const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const routeGuard = require('../routeGuard/routeGuard');
const { addAuditTrail } = require('../audit/auditService');

// Get all users with their roles
router.get('/users', routeGuard.verifyToken, routeGuard.isAdmin, async (req, res) => {
  try {
    const pool = await getConnection();
    
    // First check if the userInfo table exists
    try {
      const tableCheck = await pool.request()
        .query(`
          SELECT OBJECT_ID('userInfo') AS TableExists
        `);
      
      if (!tableCheck.recordset[0].TableExists) {
        return res.status(500).json({
          success: false,
          message: 'userInfo table does not exist'
        });
      }
    } catch (tableError) {
      console.error('Error checking table existence');
      return res.status(500).json({
        success: false,
        message: 'Error checking database tables'
      });
    }
    
    // Get all users from userInfo table
    const result = await pool.request()
      .query(`
        SELECT 
          u.userID, 
          u.userName, 
          u.fullName, 
          r.roleName as position, 
          b.barangayName as barangay, 
          u.emailAddress, 
          u.phoneNumber,
          u.isArchived
        FROM userInfo u
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN barangays b ON u.barangay = b.barangayID
        WHERE u.isArchived = 0
        ORDER BY u.fullName
      `);
    
    return res.json({
      success: true,
      users: result.recordset
    });
  } catch (error) {
    console.error('Error fetching users with roles');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching users: ' + error.message
    });
  }
});

// Get all available roles - FIXED VERSION
router.get('/all', routeGuard.verifyToken, routeGuard.isAdmin, async (req, res) => {
  try {
    // Return static roles that match what the frontend expects
    const roles = [
      { 
        roleID: 1, 
        roleName: 'MA', // Frontend filters by this
        description: 'Master Admin' 
      },
      { 
        roleID: 2, 
        roleName: 'SA', // Frontend filters by this
        description: 'System Admin' 
      },
      { 
        roleID: 3, 
        roleName: 'SKC', // Frontend filters by this
        description: 'SK Chairman' 
      },
      { 
        roleID: 4, 
        roleName: 'SKO', // Frontend filters by this
        description: 'SK Official' 
      }
    ];
    
    return res.json({
      success: true,
      roles: roles
    });
  } catch (error) {
    console.error('Error fetching roles');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching roles: ' + error.message
    });
  }
});

// Get role permissions
router.get('/:roleId/permissions', async (req, res) => {
  try {
    const { roleId } = req.params;
    
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('roleId', sql.Int, roleId)
      .query(`
        SELECT p.permissionID, p.permissionName, p.description
        FROM rolePermissions rp
        JOIN permissions p ON rp.permissionID = p.permissionID
        WHERE rp.roleID = @roleId
      `);
    
    return res.json({
      success: true,
      permissions: result.recordset
    });
  } catch (error) {
    console.error('Error fetching role permissions');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching role permissions'
    });
  }
});

// Assign role to user
router.post('/assignRole', routeGuard.verifyToken, routeGuard.isAdmin, async (req, res) => {
  try {
    const { userId, position } = req.body; // position is the roleName like 'SKC'

    if (!userId || !position) {
      return res.status(400).json({
        success: false,
        message: 'User ID and position are required'
      });
    }

    const pool = await getConnection();

    // Find the roleID from the roles table based on the position (roleName)
    const roleResult = await pool.request()
      .input('roleName', sql.NVarChar, position)
      .query('SELECT roleID FROM roles WHERE roleName = @roleName');

    if (roleResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid position: ${position}. Role not found.`
      });
    }

    const roleId = roleResult.recordset[0].roleID;

    // Check if user exists and get current position and username
    const userCheck = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT position, userName FROM userInfo WHERE userID = @userId');

    if (userCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const oldPositionId = userCheck.recordset[0].position;
    const userName = userCheck.recordset[0].userName;

    // Get the old role name for audit trail
    const oldRoleResult = await pool.request()
      .input('roleId', sql.Int, oldPositionId)
      .query('SELECT roleName FROM roles WHERE roleID = @roleId');
    
    const oldRoleName = oldRoleResult.recordset.length > 0 ? oldRoleResult.recordset[0].roleName : oldPositionId;

    // Update the user's position in userInfo table with the roleId
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('roleId', sql.Int, roleId) // Use the integer roleId
      .query(`
        UPDATE userInfo 
        SET position = @roleId
        WHERE userID = @userId
      `);

    // Add audit trail
    addAuditTrail({
        actor: 'A',
        module: 'R',
        userID: req.user.userId,
        actions: 'assign-role',
        oldValue: `position: ${oldRoleName}`,
        newValue: `position: ${position}`,
        descriptions: `Admin ${req.user.fullName} assigned role ${position} to user ${userName}`
    });
    
    return res.json({
      success: true,
      message: 'Role assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning role');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while assigning role: ' + error.message
    });
  }
});


// Create a new role
router.post('/create', routeGuard.verifyToken, routeGuard.isAdmin, async (req, res) => {
  try {
    const { userId, position } = req.body;
    
    if (!position) {
      return res.status(400).json({
        success: false,
        message: 'Position is required'
      });
    }
    
    const pool = await getConnection();
    
    // Begin transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      // Insert new role with correct table structure
      const roleResult = await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('position', sql.NVarChar, position)
        .query(`
          INSERT INTO roleInfo (userID, position)
          OUTPUT INSERTED.roleID
          VALUES (@userId, @position)
        `);
      
      const roleId = roleResult.recordset[0].roleID;
      
      // Commit transaction
      await transaction.commit();
      
      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        roleId
      });
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating role');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating role'
    });
  }
});

// Delete a role
router.delete('/:roleId', routeGuard.verifyToken, routeGuard.isAdmin, async (req, res) => {
  try {
    const { roleId } = req.params;
    
    const pool = await getConnection();
    
    // Begin transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      // Remove role permissions (if table exists)
      try {
        await new sql.Request(transaction)
          .input('roleId', sql.Int, roleId)
          .query('DELETE FROM rolePermissions WHERE roleID = @roleId');
      } catch (e) {
        console.log('rolePermissions table may not exist');
      }
      
      // Remove user role assignments (if table exists)
      try {
        await new sql.Request(transaction)
          .input('roleId', sql.Int, roleId)
          .query('DELETE FROM userRoles WHERE roleID = @roleId');
      } catch (e) {
        console.log('userRoles table may not exist');
      }
      
      // Delete the role
      await new sql.Request(transaction)
        .input('roleId', sql.Int, roleId)
        .query('DELETE FROM roleInfo WHERE roleID = @roleId');
      
      // Commit transaction
      await transaction.commit();
      
      return res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting role');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting role'
    });
  }
});

module.exports = router;