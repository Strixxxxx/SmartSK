const crypto = require('crypto');

// --- Configuration ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // For GCM, 12 bytes is recommended
const AUTH_TAG_LENGTH = 16;
const KEY = process.env.AES_256_KEY ? Buffer.from(process.env.AES_256_KEY, 'hex') : null;

// --- Key Validation ---
if (!KEY) {
    throw new Error('AES_256_KEY environment variable is not set.');
}
if (KEY.length !== 32) {
    throw new Error('AES_256_KEY must be a 64-character hex string (32 bytes).');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} text The plaintext to encrypt.
 * @returns {string|null} The Base64 encoded string (IV + Ciphertext + AuthTag), or null if input is invalid.
 */
function encrypt(text) {
    if (text === null || typeof text === 'undefined') {
        return text;
    }

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

        const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Combine IV, encrypted data, and auth tag, then encode as Base64
        const encryptedData = Buffer.concat([iv, encrypted, authTag]);
        return encryptedData.toString('base64');
    } catch (error) {
        console.error('Encryption failed:', error);
        // In a real application, you might want to handle this more gracefully
        // For now, we return null to indicate failure without crashing.
        return null;
    }
}

/**
 * Decrypts an AES-256-GCM encrypted, Base64 encoded string.
 * Handles errors gracefully by returning null.
 * @param {string} encryptedText The Base64 encoded string to decrypt.
 * @returns {string|null} The decrypted plaintext, or null if decryption fails.
 */
function decrypt(encryptedText) {
    if (encryptedText === null || typeof encryptedText === 'undefined') {
        return encryptedText;
    }

    try {
        const encryptedData = Buffer.from(String(encryptedText), 'base64');

        // Extract IV, auth tag, and ciphertext from the combined buffer
        const iv = encryptedData.slice(0, IV_LENGTH);
        const authTag = encryptedData.slice(-AUTH_TAG_LENGTH);
        const ciphertext = encryptedData.slice(IV_LENGTH, -AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

        return decrypted.toString('utf8');
    } catch (error) {
        // Log the error for debugging, but don't expose details to the caller.
        // This handles tampered data (auth tag mismatch) and other crypto errors.
        console.error('Decryption failed. Data may be corrupt or tampered with.', error.message);
        return null; // Return null to indicate failure
    }
}

/**
 * Generates a SHA-256 hash for an email address, used for blind indexing and lookups.
 * @param {string} email The email address to hash.
 * @returns {string|null} The SHA-256 hash as a hex string, or null if input is invalid.
 */
function generateEmailHash(email) {
    if (!email || typeof email !== 'string') {
        return null;
    }
    // Normalize email to prevent case-sensitivity issues
    const normalizedEmail = email.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalizedEmail).digest('hex');
}

/**
 * Generates a SHA-256 hash for a username, used for blind indexing and lookups.
 * @param {string} username The username to hash.
 * @returns {string|null} The SHA-256 hash as a hex string, or null if input is invalid.
 */
function generateUsernameHash(username) {
    if (!username || typeof username !== 'string') {
        return null;
    }
    // Normalize username to prevent case-sensitivity issues
    const normalizedUsername = username.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalizedUsername).digest('hex');
}

module.exports = {
    encrypt,
    decrypt,
    generateEmailHash,
    generateUsernameHash,
};
