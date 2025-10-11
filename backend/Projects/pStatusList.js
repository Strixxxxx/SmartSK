const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../database/database');

router.get('/statuses', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT StatusName, description FROM StatusLookup ORDER BY StatusName');
        res.json({
            success: true,
            statuses: result.recordset
        });
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch statuses' });
    }
});

module.exports = router;