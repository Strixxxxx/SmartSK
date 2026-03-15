const jwt = require('jsonwebtoken');
const uuidv4 = require('uuid4');
const { getConnection, sql } = require('../database/database');
const path = require('path');
const dotenv = require('dotenv');
const { decrypt } = require('../utils/crypto');

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
    console.error('Failed to initialize active sessions', error);
  }
}

// Background job to clean up expired sessions - Optimized to reduce DB wake-ups
setInterval(async () => {
  try {
    // Memory-only guard: If no sessions are active, don't wake up the database
    if (activeSessions.size === 0) {
      return;
    }

    const now = new Date(getPhilippineTime());
    const pool = await getConnection();

    for (const [sessionID, sessionData] of activeSessions.entries()) {
      const timeSinceLastSeen = now - sessionData.lastSeen;

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
    console.error('Error in session cleanup job', error);
  }
}, 60 * 60 * 1000); // Check every hour

// Create session function
async function createSession(userID) {
  try {
    const sessionID = uuidv4();
    const currentTime = new Date(getPhilippineTime());

    const pool = await getConnection();

    await pool.request()
      .input('userID', sql.Int, userID)
      .input('currentTime', sql.DateTime2, currentTime)
      .query(`
        UPDATE sessions SET expires_at = @currentTime WHERE userID = @userID AND expires_at IS NULL
      `);

    await pool.request()
      .input('sessionID', sql.VarChar, sessionID)
      .input('userID', sql.Int, userID)
      .input('created_at', sql.DateTime2, currentTime)
      .query(`
        INSERT INTO sessions (sessionID, userID, created_at, expires_at) VALUES (@sessionID, @userID, @created_at, NULL)
      `);

    activeSessions.set(sessionID, { lastSeen: currentTime, userID: userID });

    return sessionID;
  } catch (error) {
    console.error('Error creating session', error);
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
        SELECT u.userID, u.username, u.fullName, r.roleName as position, u.isDefaultPassword, u.barangay, b.barangayName, u.emailAddress, u.phoneNumber, u.termID
        FROM sessions s
        JOIN userInfo u ON s.userID = u.userID
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN barangays b ON u.barangay = b.barangayID
        WHERE s.sessionID = @sessionID AND s.expires_at IS NULL
      `);

    if (result.recordset.length === 0) {
      res.set('X-Auth-Status', 'invalid');
      return res.status(401).json({ success: false, message: 'Session expired or not found' });
    }

    const user = result.recordset[0];

    try {
      const decryptedUsername = decrypt(user.username);
      const decryptedFullName = decrypt(user.fullName);

      activeSessions.set(decoded.sessionID, { lastSeen: new Date(getPhilippineTime()), userID: user.userID });

      req.sessionID = decoded.sessionID;

      req.user = {
        userID: user.userID,
        username: decryptedUsername,
        fullName: decryptedFullName,
        position: user.position || '',
        barangay: user.barangay,
        barangayName: user.barangayName,
        emailAddress: decrypt(user.emailAddress),
        phoneNumber: decrypt(user.phoneNumber),
        termID: user.termID
      };

      next();
    } catch (decryptError) {
      console.error('❌ DECRYPTION ERROR:', decryptError);
      res.set('X-Auth-Status', 'invalid');
      return res.status(500).json({
        success: false,
        message: 'Error processing user data'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
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
  // req.user is already decrypted by the middleware and does NOT contain sessionID
  return res.json({ success: true, userInfo: req.user });
};

// Initialize active sessions on startup
initializeActiveSessions();

async function logout(req, res) {
  try {
    // Use req.sessionID instead of req.user.sessionID (which no longer exists)
    const sessionID = req.sessionID;
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