const { db } = require('../config/database');
const DataIntegrityValidator = require('./data-integrity');

/**
 * Database Transaction Manager
 * 
 * Provides ACID transaction support for critical multi-step operations
 * in the Turo toll tracking system, ensuring data consistency and integrity.
 */

class TransactionManager {
    constructor() {
        this.validator = new DataIntegrityValidator();
        this.activeTransactions = new Map();
        this.transactionTimeout = 30000; // 30 seconds
    }

    /**
     * Begin a new database transaction with automatic rollback on timeout
     */
    async beginTransaction(transactionId = null) {
        if (!transactionId) {
            transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        return new Promise((resolve, reject) => {
            // Start SQLite transaction
            db.serialize(() => {
                db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
                    if (err) {
                        console.error('❌ Failed to begin transaction:', err);
                        reject(new Error(`Transaction begin failed: ${err.message}`));
                        return;
                    }

                    const transaction = {
                        id: transactionId,
                        startTime: new Date(),
                        operations: [],
                        status: 'active',
                        autoRollbackTimer: setTimeout(() => {
                            this.rollbackTransaction(transactionId, 'TIMEOUT')
                                .then(() => console.log(`⏰ Transaction ${transactionId} auto-rolled back due to timeout`))
                                .catch(err => console.error('❌ Auto-rollback failed:', err));
                        }, this.transactionTimeout)
                    };

                    this.activeTransactions.set(transactionId, transaction);
                    
                    console.log(`🔄 Transaction ${transactionId} started`);
                    resolve(transactionId);
                });
            });
        });
    }

    /**
     * Execute a validated database operation within a transaction
     */
    async executeInTransaction(transactionId, operation) {
        const transaction = this.activeTransactions.get(transactionId);
        
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found or already completed`);
        }

        if (transaction.status !== 'active') {
            throw new Error(`Transaction ${transactionId} is not active (status: ${transaction.status})`);
        }

        return new Promise((resolve, reject) => {
            const { query, params, description, validationFn } = operation;
            
            // Pre-execution validation if provided
            if (validationFn) {
                try {
                    const validationResult = validationFn(params);
                    if (!validationResult.isValid) {
                        reject(new Error(`Validation failed: ${validationResult.errors.join(', ')}`));
                        return;
                    }
                } catch (error) {
                    reject(new Error(`Validation error: ${error.message}`));
                    return;
                }
            }

            // Execute the database operation
            const self = this;
            db.run(query, params, function(err) {
                if (err) {
                    console.error(`❌ Transaction operation failed: ${description}`, err);
                    reject(new Error(`Database operation failed: ${err.message}`));
                    return;
                }

                // Record the operation for audit trail
                const operationRecord = {
                    description,
                    query,
                    params,
                    result: {
                        lastID: this.lastID,
                        changes: this.changes
                    },
                    timestamp: new Date(),
                    checksum: transaction ? self.validator.generateDataChecksum({
                        query,
                        params: JSON.stringify(params),
                        timestamp: Date.now()
                    }) : null
                };

                transaction.operations.push(operationRecord);
                
                console.log(`✅ Transaction operation completed: ${description} (ID: ${this.lastID}, Changes: ${this.changes})`);
                
                resolve({
                    lastID: this.lastID,
                    changes: this.changes,
                    operation: operationRecord
                });
            });
        });
    }

    /**
     * Commit a transaction with integrity verification
     */
    async commitTransaction(transactionId, verificationFn = null) {
        const transaction = this.activeTransactions.get(transactionId);
        
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        if (transaction.status !== 'active') {
            throw new Error(`Cannot commit transaction ${transactionId}: status is ${transaction.status}`);
        }

        return new Promise((resolve, reject) => {
            try {
                // Clear auto-rollback timer
                if (transaction.autoRollbackTimer) {
                    clearTimeout(transaction.autoRollbackTimer);
                }

                // Pre-commit verification if provided
                if (verificationFn) {
                    const verificationResult = verificationFn(transaction);
                    if (!verificationResult.isValid) {
                        // Rollback on verification failure
                        this.rollbackTransaction(transactionId, 'VERIFICATION_FAILED')
                            .then(() => reject(new Error(`Commit verification failed: ${verificationResult.errors.join(', ')}`)))
                            .catch(rollbackErr => reject(new Error(`Verification failed and rollback failed: ${rollbackErr.message}`)));
                        return;
                    }
                }

                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('❌ Transaction commit failed:', err);
                        // Attempt rollback on commit failure
                        this.rollbackTransaction(transactionId, 'COMMIT_FAILED')
                            .then(() => reject(new Error(`Commit failed: ${err.message}`)))
                            .catch(rollbackErr => reject(new Error(`Commit failed and rollback failed: ${rollbackErr.message}`)));
                        return;
                    }

                    transaction.status = 'committed';
                    transaction.endTime = new Date();
                    transaction.duration = transaction.endTime - transaction.startTime;

                    // Log successful transaction
                    this.validator.logIntegrityEvent('TRANSACTION_COMMITTED', {
                        transactionId,
                        duration: transaction.duration,
                        operationCount: transaction.operations.length,
                        operations: transaction.operations.map(op => op.description)
                    }, 'LOW');

                    console.log(`✅ Transaction ${transactionId} committed successfully (${transaction.operations.length} operations, ${transaction.duration}ms)`);
                    
                    // Clean up completed transaction
                    this.activeTransactions.delete(transactionId);
                    
                    resolve({
                        transactionId,
                        duration: transaction.duration,
                        operationCount: transaction.operations.length,
                        operations: transaction.operations
                    });
                });
            } catch (error) {
                reject(new Error(`Transaction commit process failed: ${error.message}`));
            }
        });
    }

    /**
     * Rollback a transaction with reason logging
     */
    async rollbackTransaction(transactionId, reason = 'MANUAL') {
        const transaction = this.activeTransactions.get(transactionId);
        
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        return new Promise((resolve, reject) => {
            // Clear auto-rollback timer
            if (transaction.autoRollbackTimer) {
                clearTimeout(transaction.autoRollbackTimer);
            }

            db.run('ROLLBACK', (err) => {
                if (err) {
                    console.error('❌ Transaction rollback failed:', err);
                    reject(new Error(`Rollback failed: ${err.message}`));
                    return;
                }

                transaction.status = 'rolled_back';
                transaction.endTime = new Date();
                transaction.duration = transaction.endTime - transaction.startTime;
                transaction.rollbackReason = reason;

                // Log rollback event
                this.validator.logIntegrityEvent('TRANSACTION_ROLLED_BACK', {
                    transactionId,
                    reason,
                    duration: transaction.duration,
                    operationCount: transaction.operations.length,
                    operations: transaction.operations.map(op => op.description)
                }, 'MEDIUM');

                console.log(`🔄 Transaction ${transactionId} rolled back: ${reason} (${transaction.operations.length} operations, ${transaction.duration}ms)`);
                
                // Clean up rolled back transaction
                this.activeTransactions.delete(transactionId);
                
                resolve({
                    transactionId,
                    reason,
                    duration: transaction.duration,
                    operationCount: transaction.operations.length
                });
            });
        });
    }

    /**
     * Execute toll-to-trip matching with full transaction safety
     */
    async executeTollMatching(hostId, tollCharges, trips) {
        const transactionId = await this.beginTransaction();
        
        try {
            const matchResults = [];
            
            for (const charge of tollCharges) {
                // Validate charge data
                const validation = await this.validator.validateNewTransaction(charge);
                if (!validation.isValid) {
                    throw new Error(`Invalid toll charge: ${validation.errors.join(', ')}`);
                }

                // Find matching trip
                const matchingTrip = trips.find(trip => this.isValidMatch(charge, trip));
                
                if (matchingTrip) {
                    // Update toll charge with trip mapping
                    await this.executeInTransaction(transactionId, {
                        query: 'UPDATE toll_charges SET trip_id = ?, is_matched = 1, match_timestamp = CURRENT_TIMESTAMP WHERE id = ?',
                        params: [matchingTrip.id, charge.id],
                        description: `Match toll charge ${charge.id} to trip ${matchingTrip.id}`,
                        validationFn: (params) => {
                            if (!params[0] || !params[1]) {
                                return { isValid: false, errors: ['Invalid trip or charge ID'] };
                            }
                            return { isValid: true };
                        }
                    });
                    
                    matchResults.push({
                        tollChargeId: charge.id,
                        tripId: matchingTrip.id,
                        amount: charge.toll_amount,
                        location: charge.toll_location
                    });
                }
            }

            // Commit with verification
            await this.commitTransaction(transactionId, (transaction) => {
                // Verify all operations were successful
                const expectedMatches = matchResults.length;
                const actualOperations = transaction.operations.length;
                
                if (actualOperations !== expectedMatches) {
                    return { 
                        isValid: false, 
                        errors: [`Operation count mismatch: expected ${expectedMatches}, got ${actualOperations}`] 
                    };
                }
                
                return { isValid: true };
            });

            console.log(`✅ Toll matching transaction completed: ${matchResults.length} matches`);
            return {
                success: true,
                matchCount: matchResults.length,
                matches: matchResults
            };

        } catch (error) {
            await this.rollbackTransaction(transactionId, `MATCHING_ERROR: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute invoice generation with transaction safety
     */
    async executeInvoiceGeneration(tripId, charges, processingFee, hostId) {
        const transactionId = await this.beginTransaction();
        
        try {
            // Validate invoice data
            const tollTotal = charges.reduce((sum, c) => sum + c.toll_amount, 0);
            const totalAmount = tollTotal + processingFee;
            
            const invoiceValidation = this.validator.validateInvoiceData({
                trip_id: tripId,
                total_amount: totalAmount,
                processing_fee: processingFee,
                toll_total: tollTotal
            });
            
            if (invoiceValidation.length > 0) {
                throw new Error(`Invoice validation failed: ${invoiceValidation.join(', ')}`);
            }

            // Generate invoice
            const invoiceNumber = `INV-${Date.now()}-${tripId}`;
            
            const invoiceResult = await this.executeInTransaction(transactionId, {
                query: 'INSERT INTO invoices (trip_id, invoice_number, total_amount, processing_fee, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                params: [tripId, invoiceNumber, totalAmount, processingFee],
                description: `Create invoice ${invoiceNumber}`,
                validationFn: (params) => {
                    const errors = [];
                    if (!params[0]) errors.push('Missing trip ID');
                    if (!params[1]) errors.push('Missing invoice number');
                    if (typeof params[2] !== 'number' || params[2] <= 0) errors.push('Invalid total amount');
                    if (typeof params[3] !== 'number' || params[3] < 0) errors.push('Invalid processing fee');
                    return { isValid: errors.length === 0, errors };
                }
            });

            const invoiceId = invoiceResult.lastID;

            // Create invoice line items
            for (const charge of charges) {
                await this.executeInTransaction(transactionId, {
                    query: 'INSERT INTO invoice_items (invoice_id, toll_charge_id, description, amount) VALUES (?, ?, ?, ?)',
                    params: [
                        invoiceId, 
                        charge.id, 
                        `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
                        charge.toll_amount
                    ],
                    description: `Add line item for charge ${charge.id}`,
                    validationFn: (params) => {
                        if (!params[0] || !params[1] || !params[3]) {
                            return { isValid: false, errors: ['Invalid line item data'] };
                        }
                        return { isValid: true };
                    }
                });
            }

            // Commit with verification
            await this.commitTransaction(transactionId, (transaction) => {
                const expectedOperations = 1 + charges.length; // 1 invoice + N line items
                if (transaction.operations.length !== expectedOperations) {
                    return { 
                        isValid: false, 
                        errors: [`Expected ${expectedOperations} operations, got ${transaction.operations.length}`] 
                    };
                }
                return { isValid: true };
            });

            return {
                success: true,
                invoiceId,
                invoiceNumber,
                totalAmount,
                lineItemCount: charges.length
            };

        } catch (error) {
            await this.rollbackTransaction(transactionId, `INVOICE_ERROR: ${error.message}`);
            throw error;
        }
    }

    /**
     * Helper method to determine if a toll matches a trip
     */
    isValidMatch(tollCharge, trip) {
        try {
            const tollDate = new Date(tollCharge.toll_date);
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            
            // 24-hour buffer for matching
            const bufferMs = 24 * 60 * 60 * 1000;
            const adjustedStart = new Date(tripStart.getTime() - bufferMs);
            const adjustedEnd = new Date(tripEnd.getTime() + bufferMs);
            
            const dateMatch = tollDate >= adjustedStart && tollDate <= adjustedEnd;
            
            // Basic plate matching (can be enhanced based on business rules)
            let plateMatch = true;
            if (tollCharge.plate_number && trip.vehicle_plate) {
                const chargePlate = tollCharge.plate_number.replace(/\s+/g, '').toUpperCase();
                const tripPlate = trip.vehicle_plate.replace(/\s+/g, '').toUpperCase();
                plateMatch = chargePlate === tripPlate || chargePlate.includes(tripPlate) || tripPlate.includes(chargePlate);
            }
            
            return dateMatch && plateMatch;
        } catch (error) {
            console.error('❌ Match validation error:', error);
            return false;
        }
    }

    /**
     * Get status of all active transactions
     */
    getActiveTransactions() {
        return Array.from(this.activeTransactions.entries()).map(([id, transaction]) => ({
            id,
            status: transaction.status,
            startTime: transaction.startTime,
            operationCount: transaction.operations.length,
            duration: Date.now() - transaction.startTime.getTime()
        }));
    }

    /**
     * Force cleanup of stale transactions (emergency use only)
     */
    async cleanupStaleTransactions(maxAgeMinutes = 30) {
        const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
        const staleTransactions = Array.from(this.activeTransactions.entries())
            .filter(([id, transaction]) => transaction.startTime.getTime() < cutoffTime);
        
        for (const [transactionId, transaction] of staleTransactions) {
            try {
                await this.rollbackTransaction(transactionId, 'STALE_CLEANUP');
                console.log(`🧹 Cleaned up stale transaction: ${transactionId}`);
            } catch (error) {
                console.error(`❌ Failed to cleanup stale transaction ${transactionId}:`, error);
            }
        }
        
        return {
            cleanedCount: staleTransactions.length,
            remainingActive: this.activeTransactions.size
        };
    }
}

module.exports = TransactionManager;