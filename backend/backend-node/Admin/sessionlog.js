const express = require('express');
const { getConnection, sql } = require('../database/database');
const router = express.Router();
const { decrypt } = require('../utils/crypto');

// GET all session logs
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const pool = await getConnection();
    let query = `
      SELECT 
        s.sessionID,
        u.username,
        u.fullName,
        s.created_at,
        s.expires_at
      FROM sessions s
      JOIN userInfo u ON s.userID = u.userID
    `;

    const conditions = [];
    const request = pool.request();

    if (startDate && endDate) {
      conditions.push(`s.created_at BETWEEN @startDate AND @endDate`);
      request.input('startDate', sql.DateTime, new Date(startDate));
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      request.input('endDate', sql.DateTime, endOfDay);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY s.created_at DESC`;

    const result = await request.query(query);

    const decryptedLogs = result.recordset.map(log => ({
        ...log,
        userName: decrypt(log.username),
        fullName: decrypt(log.fullName),
    }));

    res.json(decryptedLogs);
  } catch (error) {
    console.error('Error fetching session logs', error);
    res.status(500).json({ message: 'Error fetching session logs' });
  }
});

module.exports = router;
