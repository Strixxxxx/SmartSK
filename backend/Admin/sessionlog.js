const express = require('express');
const { getConnection, sql } = require('../database/database');
const router = express.Router();

// GET all session logs
router.get('/', async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const pool = await getConnection();
    let query = `
      SELECT 
        s.sessionID,
        u.userName,
        u.fullName,
        s.created_at,
        s.expires_at
      FROM sessions s
      JOIN userInfo u ON s.userID = u.userID
    `;

    const conditions = [];
    const request = pool.request();

    if (search) {
      conditions.push(`(u.userName LIKE @search OR u.fullName LIKE @search)`);
      request.input('search', sql.NVarChar, `%${search}%`);
    }

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

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching session logs');
    res.status(500).json({ message: 'Error fetching session logs' });
  }
});

module.exports = router;
