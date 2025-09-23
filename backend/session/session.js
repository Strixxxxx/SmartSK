const jwt = require('jsonwebtoken');
const uuidv4 = require('uuid4');
const bcrypt = require('bcrypt');
const { getConnection, sql } = require('../database/database');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// JWT configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET_KEY,
  expiresIn: '24h' // Token expiration time
};

// In-memory store for active sessions
const activeSessions = new Map(); // sessionID -> { lastSeen: Date, userID: number }

// Session timeout configuration - Changed from 30 seconds to 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Function to get Philippine time
function getPhilippineTime() {
  return new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
}

// Function to initialize active sessions from DB on startup
async function initializeActiveSessions() {
  try {
    console.log('Initializing active sessions from database...');
    const pool = await getConnection();
    const result = await pool.request()
      .query(`
        SELECT sessionID, userID FROM sessions WHERE expires_at IS NULL
      `);
    
    const now = new Date(getPhilippineTime());
    for (const session of result.recordset) {
      activeSessions.set(session.sessionID, { lastSeen: now, userID: session.userID });
    }
    console.log('Initialized active sessions.');
  } catch (error) {
    console.error('Failed to initialize active sessions');
  }
}

// Background job to clean up expired sessions - Updated timeout and interval
setInterval(async () => {
  try {
    const now = new Date(getPhilippineTime());
    const pool = await getConnection();
    
    for (const [sessionID, sessionData] of activeSessions.entries()) {
      const timeSinceLastSeen = now - sessionData.lastSeen;
      
      // Changed from 30 seconds to 30 minutes
      if (timeSinceLastSeen > SESSION_TIMEOUT) {
        console.log('Session timed out due to inactivity.');
        
        await pool.request()
          .input('sessionID', sql.VarChar, sessionID)
          .input('currentTime', sql.DateTime2, now)
          .query(`
            UPDATE sessions 
            SET expires_at = @currentTime 
            WHERE sessionID = @sessionID AND expires_at IS NULL
          `);
        
        activeSessions.delete(sessionID);
      }
    }
  } catch (error) {
    console.error('Error in session cleanup job');
  }
}, 5 * 60 * 1000); // Check every 5 minutes instead of 15 seconds

// Create session function
async function createSession(userID) {
  try {
    const sessionID = uuidv4();
    const currentTime = new Date(getPhilippineTime());
    
    const pool = await getConnection();
    
    // Expire any existing active sessions for this user
    await pool.request()
      .input('userID', sql.Int, userID)
      .input('currentTime', sql.DateTime2, currentTime)
      .query(`
        UPDATE sessions SET expires_at = @currentTime WHERE userID = @userID AND expires_at IS NULL
      `);
    
    // Create a new session
    await pool.request()
      .input('sessionID', sql.VarChar, sessionID)
      .input('userID', sql.Int, userID)
      .input('created_at', sql.DateTime2, currentTime)
      .query(`
        INSERT INTO sessions (sessionID, userID, created_at, expires_at) VALUES (@sessionID, @userID, @created_at, NULL)
      `);
    
    // Add to active sessions map
    activeSessions.set(sessionID, { lastSeen: currentTime, userID: userID });
    
    return sessionID;
  } catch (error) {
    console.error('Error creating session');
    throw error;
  }
}



// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.set('X-Auth-Status', 'invalid');
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, jwtConfig.secret);
    if (!decoded.sessionID) {
      res.set('X-Auth-Status', 'invalid');
      return res.status(401).json({ success: false, message: 'Invalid token format' });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('sessionID', sql.VarChar, decoded.sessionID)
      .query(`
        SELECT u.userID, u.username, u.fullName, r.roleName as position, u.isDefaultPassword
        FROM sessions s
        JOIN userInfo u ON s.userID = u.userID
        LEFT JOIN roles r ON u.position = r.roleID
        WHERE s.sessionID = @sessionID AND s.expires_at IS NULL
      `);

    if (result.recordset.length === 0) {
      res.set('X-Auth-Status', 'invalid');
      return res.status(401).json({ success: false, message: 'Session expired or not found' });
    }

    const user = result.recordset[0];

    // Session is valid, update last seen time
    activeSessions.set(decoded.sessionID, { lastSeen: new Date(getPhilippineTime()), userID: user.userID });

    req.user = {
      userId: user.userID,
      username: user.username,
      fullName: user.fullName,
      position: user.position || '', // Ensure position is always a string to prevent null reference errors
      sessionID: decoded.sessionID
    };

    next();
  } catch (error) {
    console.error('Auth middleware error');
    res.set('X-Auth-Status', 'invalid');
    const isJwtError = error instanceof jwt.JsonWebTokenError;
    return res.status(isJwtError ? 401 : 500).json({ 
      success: false, 
      message: isJwtError ? 'Invalid token' : 'An error occurred during authentication' 
    });
  }
};

const getUserInfo = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'User not authenticated' });
  }
  return res.json({ success: true, userInfo: { userId: req.user.userId, username: req.user.username, fullName: req.user.fullName, position: req.user.position } });
};

// Initialize active sessions on startup
initializeActiveSessions();

async function logout(req, res) {
  try {
    const sessionID = req.user.sessionID;
    if (sessionID) {
      const pool = await getConnection();
      await pool.request()
        .input('sessionID', sql.VarChar, sessionID)
        .input('currentTime', sql.DateTime2, new Date(getPhilippineTime()))
        .query('UPDATE sessions SET expires_at = @currentTime WHERE sessionID = @sessionID AND expires_at IS NULL');
      
      activeSessions.delete(sessionID);
    }
    if (res && !res.headersSent) {
        res.json({ success: true, message: 'Logged out successfully' });
    }
  } catch (error) {
    console.error('Error during logout process:', error);
    if (res && !res.headersSent) {
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
  }
}

const validateToken = (req, res) => {
  if (req.user) {
    res.json({ success: true, message: 'Token is valid', user: req.user });
  } else {
    res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

module.exports = {
  createSession,
  authMiddleware,
  getUserInfo,
  logout,
  validateToken
};