const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logSecurityEvent } = require('./security');

/**
 * Enhanced CSV Upload Validation Middleware
 * 
 * Provides comprehensive validation for CSV file uploads including:
 * - File size limits
 * - Content type validation
 * - Header structure validation
 * - Content sanitization
 * - Malicious content detection
 */

// Configure multer with enhanced security
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        
        // Ensure upload directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate safe filename with timestamp
        const timestamp = Date.now();
        const hostId = req.session?.hostId || 'unknown';
        const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${hostId}_${timestamp}_${sanitizedOriginalName}`;
        cb(null, filename);
    }
});

// File filter with comprehensive validation
const fileFilter = (req, file, cb) => {
    try {
        // Check file extension
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv') {
            logSecurityEvent('CSV_UPLOAD_INVALID_EXTENSION', {
                filename: file.originalname,
                mimetype: file.mimetype,
                hostId: req.session?.hostId,
                ip: req.ip
            });
            return cb(new Error('Only .csv files are allowed'), false);
        }

        // Check MIME type
        const allowedMimeTypes = [
            'text/csv',
            'application/csv', 
            'text/plain',
            'application/vnd.ms-excel'
        ];
        
        if (!allowedMimeTypes.includes(file.mimetype)) {
            logSecurityEvent('CSV_UPLOAD_INVALID_MIMETYPE', {
                filename: file.originalname,
                mimetype: file.mimetype,
                hostId: req.session?.hostId,
                ip: req.ip
            });
            return cb(new Error('Invalid file type. Please upload a valid CSV file.'), false);
        }

        // Check filename for suspicious patterns
        const suspiciousPatterns = [
            /\.\./,           // Directory traversal
            /[<>:"'|?*]/,     // Dangerous characters
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
            /^\./,            // Hidden files
            /__proto__|constructor|prototype/i, // Prototype pollution
            /<script|javascript:|data:|vbscript:/i // Potential XSS
        ];

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(file.originalname)) {
                logSecurityEvent('CSV_UPLOAD_SUSPICIOUS_FILENAME', {
                    filename: file.originalname,
                    pattern: pattern.toString(),
                    hostId: req.session?.hostId,
                    ip: req.ip
                });
                return cb(new Error('Filename contains invalid characters'), false);
            }
        }

        cb(null, true);
    } catch (error) {
        logSecurityEvent('CSV_UPLOAD_FILTER_ERROR', {
            error: error.message,
            filename: file.originalname,
            hostId: req.session?.hostId,
            ip: req.ip
        });
        cb(new Error('File validation error'), false);
    }
};

// Enhanced multer configuration
const enhancedUpload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,    // 10MB max file size
        files: 1,                       // Only 1 file at a time
        fields: 10,                     // Limit form fields
        fieldNameSize: 50,              // Limit field name length
        fieldSize: 1024                 // Limit field value size
    }
});

/**
 * Validate CSV content structure and detect malicious content
 */
function validateCSVContent(filePath, expectedHeaders = null) {
    return new Promise((resolve, reject) => {
        try {
            // Read file with size limit check
            const stats = fs.statSync(filePath);
            if (stats.size > 10 * 1024 * 1024) { // 10MB
                return reject(new Error('File too large'));
            }

            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check for null bytes (potential binary file)
            if (content.includes('\0')) {
                return reject(new Error('Invalid file format - contains null bytes'));
            }

            // Check for suspicious content patterns
            const suspiciousPatterns = [
                /<script[^>]*>.*?<\/script>/i,      // Script tags
                /javascript\s*:/i,                   // JavaScript protocol
                /data\s*:\s*text\/html/i,           // Data URLs
                /vbscript\s*:/i,                    // VBScript
                /on\w+\s*=/i,                       // Event handlers
                /\\x[0-9a-f]{2}/i,                  // Hex encoded characters
                /%[0-9a-f]{2}/i,                    // URL encoded characters
                /\$\(.*\)/,                         // jQuery selectors
                /eval\s*\(/i,                       // eval function
                /document\.|window\.|alert\(/i,     // DOM manipulation
                /import\s+/i,                       // ES6 imports
                /<.*?>/,                            // HTML tags
                /\bDROP\s+TABLE\b/i,               // SQL injection
                /\bDELETE\s+FROM\b/i,              // SQL injection
                /\bINSERT\s+INTO\b/i,              // SQL injection
                /\bUPDATE\s+.*\bSET\b/i,           // SQL injection
                /\bSELECT\s+.*\bFROM\b/i,          // SQL injection
                /\bCREATE\s+TABLE\b/i,             // SQL injection
                /\bALTER\s+TABLE\b/i,              // SQL injection
                /;\s*--.*/,                         // SQL comments
                /\/\*.*?\*\//,                      // Multi-line comments
                /\bexec\s*\(/i,                     // Code execution
                /\bsystem\s*\(/i,                   // System calls
                /\b__import__\b/i,                  // Python imports
                /\brequire\s*\(/i,                  // Node.js requires
                /\bprocess\./i,                     // Node.js process
                /\bBuffer\./i,                      // Node.js Buffer
                /\bglobal\./i,                      // Global object access
            ];

            for (const pattern of suspiciousPatterns) {
                if (pattern.test(content)) {
                    return reject(new Error(`Suspicious content detected: ${pattern.toString()}`));
                }
            }

            // Parse CSV structure
            const lines = content.trim().split(/\r?\n/);
            
            if (lines.length < 2) {
                return reject(new Error('CSV must contain header row and at least one data row'));
            }

            // Check for excessive line length (potential DoS)
            for (let i = 0; i < Math.min(lines.length, 100); i++) {
                if (lines[i].length > 10000) {
                    return reject(new Error(`Line ${i + 1} is too long (max 10,000 characters)`));
                }
            }

            // Validate header row if expected headers provided
            const headerRow = lines[0].toLowerCase();
            const actualHeaders = headerRow.split(',').map(h => h.trim().replace(/"/g, ''));

            if (expectedHeaders && expectedHeaders.length > 0) {
                const missingHeaders = expectedHeaders.filter(expected => 
                    !actualHeaders.some(actual => actual.includes(expected.toLowerCase()))
                );

                if (missingHeaders.length > 0) {
                    return reject(new Error(`Missing required headers: ${missingHeaders.join(', ')}`));
                }
            }

            // Check row consistency (same number of columns)
            const firstRowCols = lines[1]?.split(',').length || 0;
            let inconsistentRows = 0;
            
            for (let i = 1; i < Math.min(lines.length, 1000); i++) {
                const cols = lines[i].split(',').length;
                if (Math.abs(cols - firstRowCols) > 1) { // Allow 1 column variance
                    inconsistentRows++;
                }
            }

            if (inconsistentRows > lines.length * 0.1) { // More than 10% inconsistent
                return reject(new Error('CSV has inconsistent column structure'));
            }

            // Validate content doesn't exceed reasonable limits
            if (lines.length > 50000) {
                return reject(new Error('CSV contains too many rows (max 50,000)'));
            }

            if (actualHeaders.length > 100) {
                return reject(new Error('CSV has too many columns (max 100)'));
            }

            resolve({
                success: true,
                rowCount: lines.length - 1, // Exclude header
                headers: actualHeaders,
                sampleData: lines.slice(1, 4) // First 3 data rows for preview
            });

        } catch (error) {
            reject(new Error(`File validation error: ${error.message}`));
        }
    });
}

/**
 * Middleware factory for different CSV types
 */
function createCSVUploadMiddleware(options = {}) {
    const {
        fieldName = 'csvFile',
        expectedHeaders = null,
        maxRows = 50000,
        maxFileSize = 10 * 1024 * 1024
    } = options;

    return [
        // File upload middleware
        enhancedUpload.single(fieldName),
        
        // Content validation middleware
        async (req, res, next) => {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            try {
                // Validate file content
                const validation = await validateCSVContent(req.file.path, expectedHeaders);
                
                // Check row count limit
                if (validation.rowCount > maxRows) {
                    // Clean up file
                    fs.unlinkSync(req.file.path);
                    return res.status(400).json({
                        success: false,
                        error: `File contains too many rows (${validation.rowCount}). Maximum allowed: ${maxRows}`
                    });
                }

                // Add validation results to request
                req.csvValidation = validation;
                
                // Log successful upload
                logSecurityEvent('CSV_UPLOAD_SUCCESS', {
                    filename: req.file.originalname,
                    fileSize: req.file.size,
                    rowCount: validation.rowCount,
                    headers: validation.headers.join(','),
                    hostId: req.session?.hostId,
                    ip: req.ip
                });

                next();

            } catch (error) {
                // Clean up file on validation failure
                try {
                    fs.unlinkSync(req.file.path);
                } catch (cleanupError) {
                    console.error('Failed to clean up invalid file:', cleanupError);
                }

                logSecurityEvent('CSV_UPLOAD_VALIDATION_FAILED', {
                    filename: req.file.originalname,
                    error: error.message,
                    hostId: req.session?.hostId,
                    ip: req.ip
                });

                res.status(400).json({
                    success: false,
                    error: `File validation failed: ${error.message}`
                });
            }
        }
    ];
}

/**
 * Clean up uploaded file (utility function)
 */
function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Failed to cleanup file:', filePath, error.message);
    }
}

module.exports = {
    enhancedUpload,
    validateCSVContent,
    createCSVUploadMiddleware,
    cleanupFile
};