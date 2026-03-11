const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { decrypt } = require('../utils/crypto');
const { listBackups } = require('../Storage/storage');

/**
 * Admin Dashboard Data Router
 */

// 1. Get Overall Dashboard Statistics
router.get('/stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const statsResult = await pool.request().execute('sp_GetAdminDashboardStats');
        const dbStats = statsResult.recordset[0];
        
        // 1. Get health check for Python AI Service
        let aiHealth = 'Unknown';
        try {
            const axios = require('axios');
            const aiUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/health`;
            const aiRes = await axios.get(aiUrl, { timeout: 2000 });
            if (aiRes.status === 200) aiHealth = 'Excellent';
        } catch (e) {
            aiHealth = 'Offline';
        }

        // 2. Get Last Backup Date from Azure
        let lastBackupAt = 'Never';
        try {
            const backups = await listBackups();
            if (backups && backups.length > 0) {
                lastBackupAt = backups[0].createdOn; // Sorted by newest in storage.js
            }
        } catch (backupError) {
            console.error('Error fetching backup list for dashboard:', backupError);
        }

        res.json({
            success: true,
            stats: {
                ...dbStats,
                aiHealth,
                lastBackupAt
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 2. Get Project Distribution Charts
router.get('/charts', async (req, res) => {
    try {
        const pool = await getConnection();
        
        // Project Distribution (ABYIP vs CBYDP)
        const distributionResult = await pool.request().execute('sp_GetProjectDistribution');
        
        // Registration Trends (last 30 days)
        const trendsResult = await pool.request().execute('sp_GetRegistrationTrends');

        res.json({
            success: true,
            distribution: distributionResult.recordset,
            trends: trendsResult.recordset
        });
    } catch (error) {
        console.error('Error fetching dashboard charts:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// 3. Get Recent Activity (Top 10 Audit Logs)
router.get('/activity', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT TOP 5 
                t1.auditID, 
                t2.username, 
                t1.moduleName, 
                t1.actions, 
                t1.descriptions,
                FORMAT(DATEADD(hour, 8, t1.created_at), 'MM/dd/yyyy, hh:mm tt') as created_at
            FROM [audit trail] as t1
            LEFT JOIN userInfo as t2 ON t1.userID = t2.userID
            ORDER BY t1.created_at DESC
        `);

        const decryptedLogs = result.recordset.map(log => ({
            ...log,
            username: log.username ? decrypt(log.username) : '[System]',
        }));

        res.json({
            success: true,
            activity: decryptedLogs
        });
    } catch (error) {
        console.error('Error fetching dashboard activity:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
