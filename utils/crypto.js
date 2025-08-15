const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

/**
 * Derives a key from password and salt using PBKDF2
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Gets the master encryption key from environment variable
 */
function getMasterKey() {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
        throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }
    if (masterKey.length < 32) {
        throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long');
    }
    return masterKey;
}

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @param {string} hostId - Host ID used as additional authenticated data
 * @returns {string} - Base64 encoded encrypted data with salt, IV, and tag
 */
function encryptSensitiveData(plaintext, hostId) {
    try {
        const masterKey = getMasterKey();
        
        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);
        
        // Derive encryption key
        const key = deriveKey(masterKey, salt);
        
        // Create cipher
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        // Set additional authenticated data (prevents tampering)
        cipher.setAAD(Buffer.from(hostId.toString()));
        
        // Encrypt data
        let encrypted = cipher.update(plaintext, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Get authentication tag
        const tag = cipher.getAuthTag();
        
        // Combine salt + iv + tag + encrypted data
        const combined = Buffer.concat([salt, iv, tag, encrypted]);
        
        return combined.toString('base64');
    } catch (error) {
        console.error('❌ Encryption failed:', error.message);
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypts sensitive data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @param {string} hostId - Host ID used as additional authenticated data
 * @returns {string} - Decrypted plaintext
 */
function decryptSensitiveData(encryptedData, hostId) {
    try {
        const masterKey = getMasterKey();
        
        // Decode from base64
        const combined = Buffer.from(encryptedData, 'base64');
        
        // Extract components
        const salt = combined.slice(0, SALT_LENGTH);
        const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        
        // Derive decryption key
        const key = deriveKey(masterKey, salt);
        
        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        decipher.setAAD(Buffer.from(hostId.toString()));
        
        // Decrypt data
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('❌ Decryption failed:', error.message);
        throw new Error('Decryption failed - data may be corrupted or tampered with');
    }
}

/**
 * Securely compares two strings to prevent timing attacks
 */
function secureCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generates a cryptographically secure random token
 */
function generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Migrates old base64 encoded passwords to new encryption format
 * @param {string} base64Password - Old base64 encoded password
 * @param {string} hostId - Host ID for additional authentication
 * @returns {string} - Newly encrypted password
 */
function migrateOldPassword(base64Password, hostId) {
    try {
        // Decode the old base64 password
        const plaintext = Buffer.from(base64Password, 'base64').toString('utf8');
        
        // Encrypt using new method
        return encryptSensitiveData(plaintext, hostId);
    } catch (error) {
        console.error('❌ Password migration failed:', error.message);
        throw new Error('Password migration failed');
    }
}

/**
 * Checks if a password is in the old base64 format
 * @param {string} password - Encrypted password to check
 * @returns {boolean} - True if it's old format
 */
function isOldPasswordFormat(password) {
    try {
        // New format will be longer due to salt, IV, and tag
        if (password.length > 100) {
            return false;
        }
        
        // Try to decode as base64 - if it fails, it's not old format
        const decoded = Buffer.from(password, 'base64').toString('utf8');
        
        // Old format should contain readable characters
        return /^[\x20-\x7E]+$/.test(decoded);
    } catch (error) {
        return false;
    }
}

module.exports = {
    encryptSensitiveData,
    decryptSensitiveData,
    secureCompare,
    generateSecureToken,
    migrateOldPassword,
    isOldPasswordFormat
};