const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { decrypt } = require('../utils/crypto');

const moduleMapping = {
    'A': 'Authentication',
    'B': 'Backup',
    'C': 'Account Creation',
    'D': 'Archive',
    'E': 'Email',
    'F': 'Forgot Password',
    'G': 'Posting',
    'I': 'Registration',
    'L': 'Login',
    'P': 'Projects',
    'Q': 'Portfolio',
    'R': 'Roles',
    'S': 'Session log',
    'X': 'Predictive Analysis',
    'Y': 'Forecast',
    'Z': 'Raw Data'
};

function generateAuditID(actor, module) {
    const now = new Date();
    const phTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

    const mm = String(phTime.getMonth() + 1).padStart(2, '0');
    const dd = String(phTime.getDate()).padStart(2, '0');
    const yy = String(phTime.getFullYear()).slice(-2);
    const HH = String(phTime.getHours()).padStart(2, '0');
    const MM = String(phTime.getMinutes()).padStart(2, '0');
    const ss = String(phTime.getSeconds()).padStart(2, '0');

    return `${mm}${dd}${yy}${HH}${MM}${ss}${actor}${module}`;
}

async function addAuditTrail({
    actor,
    module,
    userID,
    actions,
    oldValue,
    newValue,
    descriptions,
}) {
    const pool = await getConnection();
    const request = pool.request();

    const auditID = generateAuditID(actor, module);
    const fullModuleName = moduleMapping[module] || module;

    let sqlQuery = `
        INSERT INTO [audit trail] (
            auditID,
            userID,
            moduleName,
            actions,
            old_value,
            new_value,
            descriptions
        )
        VALUES (
            @auditID,
            @userID,
            @moduleName,
            @actions,
            @oldValue,
            @newValue,
            @descriptions
        )
    `;

    request.input('auditID', sql.NVarChar, auditID);
    request.input('userID', sql.Int, userID);
    request.input('moduleName', sql.NVarChar, fullModuleName);
    request.input('actions', sql.NVarChar, actions);
    request.input('oldValue', sql.NVarChar, oldValue);
    request.input('newValue', sql.NVarChar, newValue);
    request.input('descriptions', sql.NVarChar, descriptions);

    try {
        await request.query(sqlQuery);
    } catch (error) {
        console.error('Error adding audit trail:', error);
    }
}

router.get('/', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT t1.auditID, t2.username, t1.moduleName, t1.actions, t1.descriptions, t1.old_value, t1.new_value, 
                   FORMAT(DATEADD(hour, 8, t1.created_at), 'MM/dd/yyyy, hh:mm tt') as created_at
            FROM [audit trail] as t1
            LEFT JOIN userInfo as t2 ON t1.userID = t2.userID
            ORDER BY t1.created_at DESC
        `);

        const decryptedLogs = result.recordset.map(log => ({
            ...log,
            username: log.username ? decrypt(log.username) : '[System]',
        }));

        res.json(decryptedLogs);
    } catch (error) {
        console.error('Error fetching audit trail:', error);
        res.status(500).json({ message: 'Error fetching audit trail' });
    }
});

module.exports = { addAuditTrail, router };
