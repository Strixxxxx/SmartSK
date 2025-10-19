// backend/existEncrypt.js

// This script is for one-time use to encrypt existing data in the database.
// CRITICAL: BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT.

require('dotenv').config();
const { getConnection, sql } = require('./database/database');
const { encrypt, decrypt, generateEmailHash, generateUsernameHash } = require('./utils/crypto');

// Helper function to check if a value is already encrypted.
// It's a basic check: if decryption fails on a non-null value, we assume it's plaintext.
const isPlaintext = (value) => {
    if (value === null || typeof value === 'undefined') {
        return false; // Null values don't need encryption
    }
    // If decrypt returns null for a non-null value, it's not valid encrypted data.
    // We assume it's plaintext.
    return decrypt(value) === null;
};

async function encryptUserInfo() {
    const pool = await getConnection();
    console.log('Starting encryption for userInfo table...');

    const result = await pool.request().query('SELECT userID, username, fullName, emailAddress, phoneNumber FROM userInfo');
    const users = result.recordset;
    let updatedCount = 0;

    for (const user of users) {
        try {
            const needsUpdate = isPlaintext(user.username) || isPlaintext(user.fullName) || isPlaintext(user.emailAddress) || isPlaintext(user.phoneNumber);

            if (needsUpdate) {
                console.log(`Encrypting data for userID: ${user.userID}`);

                // We must use the original plaintext for hashes
                const plainUsername = isPlaintext(user.username) ? user.username : decrypt(user.username);
                const plainEmail = isPlaintext(user.emailAddress) ? user.emailAddress : decrypt(user.emailAddress);

                const request = pool.request();
                request.input('userID', sql.Int, user.userID);

                const setClauses = [];
                if (isPlaintext(user.username)) {
                    request.input('username', sql.NVarChar, encrypt(user.username));
                    request.input('usernameHash', sql.VarChar, generateUsernameHash(user.username));
                    setClauses.push('username = @username', 'usernameHash = @usernameHash');
                }
                if (isPlaintext(user.fullName)) {
                    request.input('fullName', sql.NVarChar, encrypt(user.fullName));
                    setClauses.push('fullName = @fullName');
                }
                if (isPlaintext(user.emailAddress)) {
                    request.input('emailAddress', sql.NVarChar, encrypt(user.emailAddress));
                    request.input('emailHash', sql.VarChar, generateEmailHash(user.emailAddress));
                    setClauses.push('emailAddress = @emailAddress', 'emailHash = @emailHash');
                }
                if (isPlaintext(user.phoneNumber)) {
                    request.input('phoneNumber', sql.NVarChar, encrypt(user.phoneNumber));
                    setClauses.push('phoneNumber = @phoneNumber');
                }

                if (setClauses.length > 0) {
                    const query = `UPDATE userInfo SET ${setClauses.join(', ')} WHERE userID = @userID`;
                    await request.query(query);
                    updatedCount++;
                }
            }
        } catch (error) {
            console.error(`Failed to process userID ${user.userID}:`, error.message);
        }
    }
    console.log(`Encryption for userInfo table complete. ${updatedCount} records updated.`);
}


async function encryptProjects(tableName) {
    const pool = await getConnection();
    console.log(`Starting encryption for ${tableName} table...`);

    const result = await pool.request().query(`SELECT projectID, title, description, remarks, reviewedBy FROM ${tableName}`);
    const projects = result.recordset;
    let updatedCount = 0;

    for (const project of projects) {
        try {
            const needsUpdate = isPlaintext(project.title) || isPlaintext(project.description) || isPlaintext(project.remarks) || isPlaintext(project.reviewedBy);

            if (needsUpdate) {
                console.log(`Encrypting data for projectID: ${project.projectID} in ${tableName}`);

                const request = pool.request();
                request.input('projectID', sql.Int, project.projectID);

                const setClauses = [];
                if (isPlaintext(project.title)) {
                    request.input('title', sql.NVarChar, encrypt(project.title));
                    setClauses.push('title = @title');
                }
                if (isPlaintext(project.description)) {
                    request.input('description', sql.NVarChar, encrypt(project.description));
                    setClauses.push('description = @description');
                }
                if (isPlaintext(project.remarks)) {
                    request.input('remarks', sql.NVarChar, encrypt(project.remarks));
                    setClauses.push('remarks = @remarks');
                }
                if (isPlaintext(project.reviewedBy)) {
                    request.input('reviewedBy', sql.NVarChar, encrypt(project.reviewedBy));
                    setClauses.push('reviewedBy = @reviewedBy');
                }

                if (setClauses.length > 0) {
                    const query = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE projectID = @projectID`;
                    await request.query(query);
                    updatedCount++;
                }
            }
        } catch (error) {
            console.error(`Failed to process projectID ${project.projectID} in ${tableName}:`, error.message);
        }
    }
    console.log(`Encryption for ${tableName} table complete. ${updatedCount} records updated.`);
}


async function main() {
    console.log('--- Starting Encryption Migration Script ---');
    try {
        await encryptUserInfo();
        await encryptProjects('projects');
        await encryptProjects('projectsARC');
        console.log('--- Encryption Migration Script Finished Successfully ---');
    } catch (error) {
        console.error('--- A critical error occurred during the migration ---');
        console.error(error);
    } finally {
        // Close the connection pool
        const pool = await getConnection();
        await pool.close();
        console.log('Database connection closed.');
    }
}

main();
