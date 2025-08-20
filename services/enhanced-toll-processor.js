const DataIntegrityValidator = require('../utils/data-integrity');
const TransactionManager = require('../utils/transaction-manager');
const { db } = require('../config/database');

/**
 * Enhanced Toll Data Processor
 * 
 * Integrates comprehensive data integrity validation with toll data processing,
 * providing bulletproof duplicate prevention and transaction safety.
 */

class EnhancedTollProcessor {
    constructor() {
        this.validator = new DataIntegrityValidator();
        this.transactionManager = new TransactionManager();
        this.processingStats = {
            totalProcessed: 0,
            successfulInserts: 0,
            duplicatesDetected: 0,
            validationFailures: 0,
            transactionFailures: 0
        };
    }

    /**
     * Process toll transactions with full integrity validation
     */
    async processTollTransactions(transactions, accountId, hostId) {
        console.log(`🔄 Processing ${transactions.length} toll transactions with enhanced validation...`);
        
        const processingResult = {
            success: true,
            newTransactions: 0,
            duplicates: 0,
            validationFailures: 0,
            errors: [],
            processedTransactions: []
        };

        // Start database transaction for all operations
        const transactionId = await this.transactionManager.beginTransaction();
        
        try {
            for (let i = 0; i < transactions.length; i++) {
                const transaction = transactions[i];
                console.log(`📊 Processing transaction ${i + 1}/${transactions.length}: ${transaction.location} - $${transaction.amount}`);
                
                try {
                    // Step 1: Comprehensive validation
                    const validationResult = await this.validateTransaction(transaction, accountId);
                    
                    if (!validationResult.isValid) {
                        processingResult.validationFailures++;
                        processingResult.errors.push(`Validation failed: ${validationResult.errors.join(', ')}`);
                        
                        // Log validation failure
                        this.validator.logIntegrityEvent('VALIDATION_FAILURE', {
                            transaction,
                            accountId,
                            errors: validationResult.errors
                        }, 'MEDIUM');
                        
                        continue;
                    }
                    
                    // Step 2: Enhanced duplicate detection
                    const duplicateResult = await this.checkForDuplicatesEnhanced(validationResult.sanitizedTransaction, accountId);
                    
                    if (duplicateResult.isDuplicate) {
                        processingResult.duplicates++;
                        
                        // Check if this is a submitted toll (late toll scenario)
                        if (duplicateResult.isSubmitted) {
                            console.log(`🚨 SUBMITTED TOLL RE-DETECTED: ${transaction.location} at ${transaction.date} - This may indicate a late toll situation!`);
                            
                            // Log as potential late toll rather than just duplicate
                            this.validator.logIntegrityEvent('LATE_TOLL_DETECTED', {
                                transaction: validationResult.sanitizedTransaction,
                                existingTransactions: duplicateResult.existingTransactions,
                                accountId,
                                submissionStatus: duplicateResult.submissionStatus
                            }, 'MEDIUM');
                        } else {
                            // Regular duplicate detection
                            this.validator.logIntegrityEvent('DUPLICATE_DETECTED', {
                                transaction: validationResult.sanitizedTransaction,
                                existingTransactions: duplicateResult.existingTransactions,
                                accountId
                            }, 'LOW');
                        }
                        
                        console.log(`⚠️ Duplicate detected: ${transaction.location} at ${transaction.date} - Status: ${duplicateResult.submissionStatus || 'unsubmitted'}`);
                        continue;
                    }
                    
                    // Step 3: Insert transaction within ACID transaction
                    const insertResult = await this.insertTransactionSafely(
                        validationResult.sanitizedTransaction, 
                        accountId,
                        transactionId
                    );
                    
                    if (insertResult.success) {
                        processingResult.newTransactions++;
                        processingResult.processedTransactions.push({
                            id: insertResult.id,
                            transactionId: validationResult.sanitizedTransaction.transactionId,
                            location: validationResult.sanitizedTransaction.location,
                            amount: validationResult.sanitizedTransaction.amount,
                            checksum: validationResult.sanitizedTransaction.data_checksum
                        });
                        
                        console.log(`✅ Successfully processed: ${transaction.location} - $${transaction.amount}`);
                    } else {
                        processingResult.errors.push(`Insert failed: ${insertResult.error}`);
                    }
                    
                } catch (error) {
                    processingResult.errors.push(`Transaction processing error: ${error.message}`);
                    console.error(`❌ Error processing transaction ${i + 1}:`, error);
                }
            }
            
            // Step 4: Verify all operations and commit
            await this.transactionManager.commitTransaction(transactionId, (transaction) => {
                // Verify expected number of operations
                const expectedOperations = processingResult.newTransactions;
                const actualOperations = transaction.operations.filter(op => op.description.includes('Insert toll charge')).length;
                
                if (actualOperations !== expectedOperations) {
                    return { 
                        isValid: false, 
                        errors: [`Operation count mismatch: expected ${expectedOperations}, got ${actualOperations}`] 
                    };
                }
                
                return { isValid: true };
            });
            
            // Step 5: Update account sync timestamp
            await this.updateAccountSyncStatus(accountId);
            
            // Update processing stats
            this.processingStats.totalProcessed += transactions.length;
            this.processingStats.successfulInserts += processingResult.newTransactions;
            this.processingStats.duplicatesDetected += processingResult.duplicates;
            this.processingStats.validationFailures += processingResult.validationFailures;
            
            console.log(`✅ Toll processing completed: ${processingResult.newTransactions} new, ${processingResult.duplicates} duplicates, ${processingResult.validationFailures} validation failures`);
            
        } catch (error) {
            console.error('❌ Toll processing transaction failed:', error);
            await this.transactionManager.rollbackTransaction(transactionId, `PROCESSING_ERROR: ${error.message}`);
            
            processingResult.success = false;
            processingResult.errors.push(`Transaction rollback: ${error.message}`);
            this.processingStats.transactionFailures++;
        }
        
        return processingResult;
    }

    /**
     * Comprehensive transaction validation
     */
    async validateTransaction(transaction, accountId) {
        // Prepare transaction data with account ID
        const transactionData = {
            toll_account_id: accountId,
            toll_date: transaction.date,
            toll_location: transaction.location,
            toll_amount: transaction.amount,
            plate_number: transaction.plate,
            transaction_id: transaction.transactionId
        };
        
        // Run comprehensive validation
        const validationResult = await this.validator.validateNewTransaction(transactionData);
        
        // Additional business logic validation
        if (validationResult.isValid) {
            // Check location validity
            if (!this.isValidTollLocation(transaction.location)) {
                validationResult.isValid = false;
                validationResult.errors.push(`Invalid or suspicious toll location: ${transaction.location}`);
            }
            
            // Check date reasonableness
            const transactionDate = new Date(transaction.date);
            const now = new Date();
            const oneYearAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
            const oneWeekFuture = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
            
            if (transactionDate < oneYearAgo || transactionDate > oneWeekFuture) {
                validationResult.warnings = validationResult.warnings || [];
                validationResult.warnings.push(`Transaction date outside normal range: ${transaction.date}`);
            }
            
            // Check for suspicious patterns
            const suspiciousPatterns = this.detectSuspiciousPatterns(transaction);
            if (suspiciousPatterns.length > 0) {
                validationResult.warnings = validationResult.warnings || [];
                validationResult.warnings.push(...suspiciousPatterns);
            }
        }
        
        return validationResult;
    }

    /**
     * Enhanced duplicate detection with multiple strategies
     */
    async checkForDuplicatesEnhanced(transaction, accountId) {
        // Strategy 1: Exact transaction ID match
        const exactDuplicate = await this.checkExactTransactionId(transaction.transaction_id);
        if (exactDuplicate.isDuplicate) {
            return exactDuplicate;
        }
        
        // Strategy 2: Comprehensive field matching with tolerance
        const comprehensiveDuplicate = await this.validator.detectPotentialDuplicates(transaction);
        if (comprehensiveDuplicate.isDuplicate) {
            return comprehensiveDuplicate;
        }
        
        // Strategy 3: Pattern-based duplicate detection
        const patternDuplicate = await this.checkPatternBasedDuplicates(transaction, accountId);
        if (patternDuplicate.isDuplicate) {
            return patternDuplicate;
        }
        
        return { isDuplicate: false, duplicateCount: 0, existingTransactions: [] };
    }

    /**
     * Check for exact transaction ID duplicates with submission status
     */
    async checkExactTransactionId(transactionId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT *, 
                    CASE WHEN submitted_to_turo = 1 THEN 'submitted' ELSE 'unsubmitted' END as submission_status
                 FROM toll_charges 
                 WHERE transaction_id = ?`,
                [transactionId],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (row) {
                        const isSubmitted = row.submitted_to_turo === 1;
                        console.log(`🔍 Found existing toll: ${transactionId} - Status: ${isSubmitted ? 'SUBMITTED' : 'UNSUBMITTED'}`);
                        
                        resolve({
                            isDuplicate: true,
                            duplicateCount: 1,
                            existingTransactions: [row],
                            isSubmitted: isSubmitted,
                            submissionStatus: row.submission_status
                        });
                    } else {
                        resolve({
                            isDuplicate: false,
                            duplicateCount: 0,
                            existingTransactions: [],
                            isSubmitted: false
                        });
                    }
                }
            );
        });
    }

    /**
     * Pattern-based duplicate detection for similar transactions
     */
    async checkPatternBasedDuplicates(transaction, accountId) {
        return new Promise((resolve, reject) => {
            // Look for transactions with same location, similar amount, and close time
            const query = `
                SELECT * FROM toll_charges tc
                WHERE tc.toll_account_id = ?
                AND tc.toll_location = ?
                AND ABS(tc.toll_amount - ?) <= 0.50
                AND ABS(CAST(strftime('%s', tc.toll_date) AS INTEGER) - CAST(strftime('%s', ?) AS INTEGER)) <= 3600
                ORDER BY ABS(CAST(strftime('%s', tc.toll_date) AS INTEGER) - CAST(strftime('%s', ?) AS INTEGER))
                LIMIT 5
            `;
            
            db.all(query, [
                accountId,
                transaction.toll_location,
                transaction.toll_amount,
                transaction.toll_date,
                transaction.toll_date
            ], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Apply sophisticated pattern matching
                const suspiciousDuplicates = rows.filter(row => {
                    // Check if amounts are exactly the same or very close
                    const amountMatch = Math.abs(row.toll_amount - transaction.toll_amount) <= 0.01;
                    
                    // Check time proximity (within 1 hour)
                    const timeDiff = Math.abs(new Date(row.toll_date) - new Date(transaction.toll_date));
                    const timeMatch = timeDiff <= (60 * 60 * 1000); // 1 hour
                    
                    // Check plate similarity if available
                    let plateMatch = true;
                    if (row.plate_number && transaction.plate_number) {
                        const rowPlate = row.plate_number.replace(/\s+/g, '').toUpperCase();
                        const transPlate = transaction.plate_number.replace(/\s+/g, '').toUpperCase();
                        plateMatch = rowPlate === transPlate;
                    }
                    
                    return amountMatch && timeMatch && plateMatch;
                });
                
                resolve({
                    isDuplicate: suspiciousDuplicates.length > 0,
                    duplicateCount: suspiciousDuplicates.length,
                    existingTransactions: suspiciousDuplicates
                });
            });
        });
    }

    /**
     * Safely insert transaction within ACID transaction
     */
    async insertTransactionSafely(transaction, accountId, transactionId) {
        try {
            const result = await this.transactionManager.executeInTransaction(transactionId, {
                query: `INSERT INTO toll_charges 
                       (toll_account_id, toll_date, toll_location, toll_amount, plate_number, 
                        transaction_id, is_matched, data_checksum, validation_status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'validated', CURRENT_TIMESTAMP)`,
                params: [
                    accountId,
                    transaction.toll_date,
                    transaction.toll_location,
                    transaction.toll_amount,
                    transaction.plate_number,
                    transaction.transaction_id,
                    transaction.data_checksum
                ],
                description: `Insert toll charge: ${transaction.toll_location} - $${transaction.toll_amount}`,
                validationFn: (params) => {
                    const errors = [];
                    if (!params[0]) errors.push('Missing account ID');
                    if (!params[1]) errors.push('Missing toll date');
                    if (!params[2]) errors.push('Missing toll location');
                    if (typeof params[3] !== 'number' || params[3] <= 0) errors.push('Invalid toll amount');
                    if (!params[5]) errors.push('Missing transaction ID');
                    if (!params[6]) errors.push('Missing data checksum');
                    
                    return { isValid: errors.length === 0, errors };
                }
            });
            
            return {
                success: true,
                id: result.lastID,
                changes: result.changes
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update account sync status
     */
    async updateAccountSyncStatus(accountId) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE toll_accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?',
                [accountId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                }
            );
        });
    }

    /**
     * Validate toll location against known locations
     */
    isValidTollLocation(location) {
        if (!location || typeof location !== 'string') {
            return false;
        }
        
        const normalizedLocation = location.toLowerCase().trim();
        
        // List of suspicious keywords that might indicate invalid data
        const suspiciousKeywords = [
            'payment', 'refund', 'credit', 'adjustment', 'balance', 'fee',
            'transfer', 'deposit', 'withdrawal', 'test', 'sample'
        ];
        
        for (const keyword of suspiciousKeywords) {
            if (normalizedLocation.includes(keyword)) {
                return false;
            }
        }
        
        // Check for minimum length and reasonable characters
        if (normalizedLocation.length < 3) {
            return false;
        }
        
        // Should contain letters (indicating a place name)
        if (!/[a-zA-Z]/.test(normalizedLocation)) {
            return false;
        }
        
        return true;
    }

    /**
     * Detect suspicious patterns in transaction data
     */
    detectSuspiciousPatterns(transaction) {
        const warnings = [];
        
        // Check for unusual amounts
        if (transaction.amount > 100) {
            warnings.push(`Unusually high toll amount: $${transaction.amount}`);
        }
        
        // Check for suspicious time patterns (e.g., exactly on the hour repeatedly)
        const date = new Date(transaction.date);
        if (date.getMinutes() === 0 && date.getSeconds() === 0) {
            warnings.push('Transaction time exactly on the hour - may indicate test data');
        }
        
        // Check for suspicious plate patterns
        if (transaction.plate) {
            const plate = transaction.plate.replace(/\s+/g, '').toUpperCase();
            
            // Check for test plate patterns
            const testPatterns = ['TEST', 'SAMPLE', '123456', 'ABC123', 'XYZ789'];
            if (testPatterns.some(pattern => plate.includes(pattern))) {
                warnings.push(`Potentially test license plate: ${transaction.plate}`);
            }
            
            // Check for extremely long transponder numbers
            if (/^\d{12,}$/.test(plate)) {
                warnings.push(`Suspiciously long transponder number: ${transaction.plate}`);
            }
        }
        
        // Check for suspicious location patterns
        if (transaction.location) {
            const location = transaction.location.toLowerCase();
            if (location.includes('test') || location.includes('sample') || location.includes('demo')) {
                warnings.push(`Potentially test location: ${transaction.location}`);
            }
        }
        
        return warnings;
    }

    /**
     * Get processing statistics
     */
    getProcessingStats() {
        return {
            ...this.processingStats,
            successRate: this.processingStats.totalProcessed > 0 ? 
                ((this.processingStats.successfulInserts / this.processingStats.totalProcessed) * 100).toFixed(2) + '%' : '0%',
            duplicateRate: this.processingStats.totalProcessed > 0 ? 
                ((this.processingStats.duplicatesDetected / this.processingStats.totalProcessed) * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Reset processing statistics
     */
    resetStats() {
        this.processingStats = {
            totalProcessed: 0,
            successfulInserts: 0,
            duplicatesDetected: 0,
            validationFailures: 0,
            transactionFailures: 0
        };
    }
}

module.exports = EnhancedTollProcessor;