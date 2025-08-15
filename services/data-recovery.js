const { db } = require('../config/database');
const DataIntegrityValidator = require('../utils/data-integrity');
const BackupManager = require('./backup-manager');
const fs = require('fs').promises;
const path = require('path');

/**
 * Data Recovery and Corruption Handling System
 * 
 * Provides comprehensive data recovery mechanisms for the Turo toll tracking system,
 * including automatic corruption detection, data healing, and rollback procedures.
 */

class DataRecoveryManager {
    constructor() {
        this.validator = new DataIntegrityValidator();
        this.backupManager = new BackupManager();
        this.recoveryLogPath = path.join(__dirname, '..', 'recovery_log.json');
        this.corruptionThresholds = {
            maxValidationErrors: 10,    // Max validation errors before triggering recovery
            maxChecksumMismatches: 5,   // Max checksum mismatches before data healing
            maxDuplicates: 20,          // Max duplicates before cleanup
            integrityCheckInterval: 60000 // 1 minute integrity checks
        };
        
        this.recoveryOperations = [];
        this.isRecoveryInProgress = false;
    }

    /**
     * Comprehensive database integrity check
     */
    async performIntegrityCheck(hostId = null) {
        console.log('🔍 Starting comprehensive database integrity check...');
        
        const integrityReport = {
            timestamp: new Date().toISOString(),
            hostId,
            checks: {
                schemaIntegrity: { passed: false, errors: [] },
                dataValidation: { passed: false, errors: [] },
                referentialIntegrity: { passed: false, errors: [] },
                checksumValidation: { passed: false, errors: [] },
                duplicateDetection: { passed: false, errors: [] }
            },
            overallStatus: 'UNKNOWN',
            recoveryRecommendations: []
        };

        try {
            // 1. Schema Integrity Check
            integrityReport.checks.schemaIntegrity = await this.checkSchemaIntegrity();
            
            // 2. Data Validation Check
            integrityReport.checks.dataValidation = await this.checkDataValidation(hostId);
            
            // 3. Referential Integrity Check
            integrityReport.checks.referentialIntegrity = await this.checkReferentialIntegrity(hostId);
            
            // 4. Checksum Validation
            integrityReport.checks.checksumValidation = await this.validateDataChecksums(hostId);
            
            // 5. Duplicate Detection
            integrityReport.checks.duplicateDetection = await this.checkForDuplicates(hostId);
            
            // Determine overall status
            const allPassed = Object.values(integrityReport.checks).every(check => check.passed);
            integrityReport.overallStatus = allPassed ? 'HEALTHY' : 'ISSUES_DETECTED';
            
            // Generate recovery recommendations
            if (!allPassed) {
                integrityReport.recoveryRecommendations = this.generateRecoveryRecommendations(integrityReport.checks);
            }
            
            // Log integrity check results
            this.logIntegrityCheck(integrityReport);
            
            console.log(`🔍 Integrity check completed: ${integrityReport.overallStatus}`);
            return integrityReport;
            
        } catch (error) {
            console.error('❌ Integrity check failed:', error);
            integrityReport.overallStatus = 'CHECK_FAILED';
            integrityReport.error = error.message;
            return integrityReport;
        }
    }

    /**
     * Check database schema integrity
     */
    async checkSchemaIntegrity() {
        return new Promise((resolve) => {
            const requiredTables = [
                'hosts', 'trips', 'toll_charges', 'invoices', 'invoice_items',
                'toll_accounts', 'transponder_mappings', 'security_logs'
            ];
            
            const result = { passed: true, errors: [], checkedTables: 0 };
            
            db.all(
                "SELECT name FROM sqlite_master WHERE type='table'",
                (err, tables) => {
                    if (err) {
                        result.passed = false;
                        result.errors.push(`Schema query failed: ${err.message}`);
                        resolve(result);
                        return;
                    }
                    
                    const existingTables = tables.map(t => t.name);
                    
                    for (const requiredTable of requiredTables) {
                        if (!existingTables.includes(requiredTable)) {
                            result.passed = false;
                            result.errors.push(`Missing required table: ${requiredTable}`);
                        } else {
                            result.checkedTables++;
                        }
                    }
                    
                    console.log(`📋 Schema integrity: ${result.checkedTables}/${requiredTables.length} tables verified`);
                    resolve(result);
                }
            );
        });
    }

    /**
     * Validate data in all critical tables
     */
    async checkDataValidation(hostId) {
        const result = { passed: true, errors: [], validatedRecords: 0, invalidRecords: 0 };
        
        try {
            // Validate toll charges
            const tollValidation = await this.validateTollChargesData(hostId);
            result.validatedRecords += tollValidation.validCount;
            result.invalidRecords += tollValidation.invalidCount;
            result.errors.push(...tollValidation.errors);
            
            // Validate invoices
            const invoiceValidation = await this.validateInvoicesData(hostId);
            result.validatedRecords += invoiceValidation.validCount;
            result.invalidRecords += invoiceValidation.invalidCount;
            result.errors.push(...invoiceValidation.errors);
            
            // Validate trips
            const tripValidation = await this.validateTripsData(hostId);
            result.validatedRecords += tripValidation.validCount;
            result.invalidRecords += tripValidation.invalidCount;
            result.errors.push(...tripValidation.errors);
            
            result.passed = result.invalidRecords === 0;
            console.log(`🔍 Data validation: ${result.validatedRecords} valid, ${result.invalidRecords} invalid records`);
            
        } catch (error) {
            result.passed = false;
            result.errors.push(`Data validation failed: ${error.message}`);
        }
        
        return result;
    }

    /**
     * Validate toll charges data
     */
    async validateTollChargesData(hostId) {
        return new Promise((resolve) => {
            const query = hostId ? 
                `SELECT tc.* FROM toll_charges tc JOIN toll_accounts ta ON tc.toll_account_id = ta.id WHERE ta.host_id = ?` :
                `SELECT * FROM toll_charges`;
            const params = hostId ? [hostId] : [];
            
            db.all(query, params, async (err, charges) => {
                if (err) {
                    resolve({ validCount: 0, invalidCount: 0, errors: [`Toll charges query failed: ${err.message}`] });
                    return;
                }
                
                let validCount = 0;
                let invalidCount = 0;
                const errors = [];
                
                for (const charge of charges) {
                    const validation = this.validator.validateTransactionData(charge);
                    if (validation.length > 0) {
                        invalidCount++;
                        errors.push(`Toll charge ${charge.id}: ${validation.join(', ')}`);
                        
                        // Log validation error to database
                        this.logValidationError('toll_charges', charge.id, 'DATA_VALIDATION', validation.join(', '));
                    } else {
                        validCount++;
                    }
                }
                
                resolve({ validCount, invalidCount, errors });
            });
        });
    }

    /**
     * Validate invoices data
     */
    async validateInvoicesData(hostId) {
        return new Promise((resolve) => {
            const query = hostId ? 
                `SELECT i.* FROM invoices i JOIN trips t ON i.trip_id = t.id WHERE t.host_id = ?` :
                `SELECT * FROM invoices`;
            const params = hostId ? [hostId] : [];
            
            db.all(query, params, (err, invoices) => {
                if (err) {
                    resolve({ validCount: 0, invalidCount: 0, errors: [`Invoices query failed: ${err.message}`] });
                    return;
                }
                
                let validCount = 0;
                let invalidCount = 0;
                const errors = [];
                
                for (const invoice of invoices) {
                    const validation = this.validator.validateInvoiceData(invoice);
                    if (validation.length > 0) {
                        invalidCount++;
                        errors.push(`Invoice ${invoice.id}: ${validation.join(', ')}`);
                        
                        this.logValidationError('invoices', invoice.id, 'DATA_VALIDATION', validation.join(', '));
                    } else {
                        validCount++;
                    }
                }
                
                resolve({ validCount, invalidCount, errors });
            });
        });
    }

    /**
     * Validate trips data
     */
    async validateTripsData(hostId) {
        return new Promise((resolve) => {
            const query = hostId ? `SELECT * FROM trips WHERE host_id = ?` : `SELECT * FROM trips`;
            const params = hostId ? [hostId] : [];
            
            db.all(query, params, (err, trips) => {
                if (err) {
                    resolve({ validCount: 0, invalidCount: 0, errors: [`Trips query failed: ${err.message}`] });
                    return;
                }
                
                let validCount = 0;
                let invalidCount = 0;
                const errors = [];
                
                for (const trip of trips) {
                    const dateValidation = this.validator.validateTripDates(trip.start_date, trip.end_date);
                    if (dateValidation.length > 0) {
                        invalidCount++;
                        errors.push(`Trip ${trip.id}: ${dateValidation.join(', ')}`);
                        
                        this.logValidationError('trips', trip.id, 'DATE_VALIDATION', dateValidation.join(', '));
                    } else {
                        validCount++;
                    }
                }
                
                resolve({ validCount, invalidCount, errors });
            });
        });
    }

    /**
     * Check referential integrity
     */
    async checkReferentialIntegrity(hostId) {
        return new Promise((resolve) => {
            const result = { passed: true, errors: [], orphanedRecords: 0 };
            
            // Check for orphaned toll charges
            const orphanQuery = `
                SELECT tc.id, tc.toll_account_id, tc.trip_id 
                FROM toll_charges tc 
                LEFT JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                LEFT JOIN trips t ON tc.trip_id = t.id 
                WHERE ta.id IS NULL 
                   OR (tc.trip_id IS NOT NULL AND t.id IS NULL)
                ${hostId ? 'AND ta.host_id = ?' : ''}
            `;
            
            db.all(orphanQuery, hostId ? [hostId] : [], (err, orphans) => {
                if (err) {
                    result.passed = false;
                    result.errors.push(`Referential integrity check failed: ${err.message}`);
                    resolve(result);
                    return;
                }
                
                result.orphanedRecords = orphans.length;
                if (orphans.length > 0) {
                    result.passed = false;
                    result.errors.push(`Found ${orphans.length} orphaned toll charge records`);
                    
                    // Log each orphaned record
                    orphans.forEach(orphan => {
                        this.logValidationError('toll_charges', orphan.id, 'REFERENTIAL_INTEGRITY', 
                            `Orphaned record - toll_account_id: ${orphan.toll_account_id}, trip_id: ${orphan.trip_id}`);
                    });
                }
                
                console.log(`🔗 Referential integrity: ${result.orphanedRecords} orphaned records found`);
                resolve(result);
            });
        });
    }

    /**
     * Validate data checksums
     */
    async validateDataChecksums(hostId) {
        return new Promise((resolve) => {
            const result = { passed: true, errors: [], validatedRecords: 0, invalidChecksums: 0 };
            
            const query = hostId ? 
                `SELECT tc.* FROM toll_charges tc JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                 WHERE ta.host_id = ? AND tc.data_checksum IS NOT NULL` :
                `SELECT * FROM toll_charges WHERE data_checksum IS NOT NULL`;
            
            db.all(query, hostId ? [hostId] : [], (err, charges) => {
                if (err) {
                    result.passed = false;
                    result.errors.push(`Checksum validation query failed: ${err.message}`);
                    resolve(result);
                    return;
                }
                
                for (const charge of charges) {
                    result.validatedRecords++;
                    
                    const currentChecksum = this.validator.generateDataChecksum(charge);
                    if (currentChecksum !== charge.data_checksum) {
                        result.invalidChecksums++;
                        result.errors.push(`Checksum mismatch for toll charge ${charge.id}`);
                        
                        this.logValidationError('toll_charges', charge.id, 'CHECKSUM_MISMATCH', 
                            `Expected: ${charge.data_checksum}, Actual: ${currentChecksum}`);
                    }
                }
                
                result.passed = result.invalidChecksums === 0;
                console.log(`🔐 Checksum validation: ${result.validatedRecords} checked, ${result.invalidChecksums} invalid`);
                resolve(result);
            });
        });
    }

    /**
     * Check for duplicate records
     */
    async checkForDuplicates(hostId) {
        return new Promise((resolve) => {
            const result = { passed: true, errors: [], duplicateGroups: 0, totalDuplicates: 0 };
            
            // Check for duplicate toll charges
            const duplicateQuery = `
                SELECT toll_location, toll_date, toll_amount, plate_number, COUNT(*) as duplicate_count
                FROM toll_charges tc
                ${hostId ? 'JOIN toll_accounts ta ON tc.toll_account_id = ta.id WHERE ta.host_id = ?' : ''}
                GROUP BY toll_location, toll_date, toll_amount, plate_number
                HAVING COUNT(*) > 1
            `;
            
            db.all(duplicateQuery, hostId ? [hostId] : [], (err, duplicates) => {
                if (err) {
                    result.passed = false;
                    result.errors.push(`Duplicate detection query failed: ${err.message}`);
                    resolve(result);
                    return;
                }
                
                result.duplicateGroups = duplicates.length;
                result.totalDuplicates = duplicates.reduce((sum, dup) => sum + (dup.duplicate_count - 1), 0);
                
                if (result.totalDuplicates > this.corruptionThresholds.maxDuplicates) {
                    result.passed = false;
                    result.errors.push(`Excessive duplicates detected: ${result.totalDuplicates} duplicate records in ${result.duplicateGroups} groups`);
                }
                
                console.log(`🔍 Duplicate detection: ${result.duplicateGroups} groups with ${result.totalDuplicates} duplicates`);
                resolve(result);
            });
        });
    }

    /**
     * Generate recovery recommendations based on integrity check results
     */
    generateRecoveryRecommendations(checks) {
        const recommendations = [];
        
        if (!checks.schemaIntegrity.passed) {
            recommendations.push({
                priority: 'CRITICAL',
                action: 'SCHEMA_REPAIR',
                description: 'Database schema is corrupted - restore from backup immediately',
                autoFixAvailable: false
            });
        }
        
        if (!checks.dataValidation.passed) {
            recommendations.push({
                priority: 'HIGH',
                action: 'DATA_HEALING',
                description: 'Invalid data detected - run data healing process',
                autoFixAvailable: true
            });
        }
        
        if (!checks.referentialIntegrity.passed) {
            recommendations.push({
                priority: 'HIGH',
                action: 'ORPHAN_CLEANUP',
                description: 'Orphaned records detected - clean up referential integrity violations',
                autoFixAvailable: true
            });
        }
        
        if (!checks.checksumValidation.passed) {
            recommendations.push({
                priority: 'MEDIUM',
                action: 'CHECKSUM_REPAIR',
                description: 'Data checksums invalid - regenerate checksums for affected records',
                autoFixAvailable: true
            });
        }
        
        if (!checks.duplicateDetection.passed) {
            recommendations.push({
                priority: 'MEDIUM',
                action: 'DUPLICATE_REMOVAL',
                description: 'Excessive duplicates detected - run duplicate removal process',
                autoFixAvailable: true
            });
        }
        
        return recommendations;
    }

    /**
     * Perform automatic data healing based on recommendations
     */
    async performDataHealing(integrityReport, hostId) {
        if (this.isRecoveryInProgress) {
            throw new Error('Recovery operation already in progress');
        }
        
        this.isRecoveryInProgress = true;
        console.log('🔧 Starting automated data healing process...');
        
        const healingResults = {
            timestamp: new Date().toISOString(),
            operations: [],
            overallSuccess: true
        };
        
        try {
            // Create emergency backup before healing
            console.log('💾 Creating emergency backup before healing...');
            const backupResult = await this.backupManager.createFullBackup('manual', 'Pre-healing emergency backup');
            
            if (!backupResult.success) {
                throw new Error('Failed to create emergency backup - aborting healing process');
            }
            
            healingResults.emergencyBackup = backupResult.backupPath;
            
            // Process each recommendation
            for (const recommendation of integrityReport.recoveryRecommendations) {
                if (!recommendation.autoFixAvailable) {
                    console.log(`⚠️ Skipping ${recommendation.action}: manual intervention required`);
                    continue;
                }
                
                const operationResult = await this.executeHealingOperation(recommendation, hostId);
                healingResults.operations.push(operationResult);
                
                if (!operationResult.success) {
                    healingResults.overallSuccess = false;
                    console.error(`❌ Healing operation failed: ${recommendation.action}`);
                }
            }
            
            // Verify healing effectiveness
            console.log('🔍 Verifying healing effectiveness...');
            const postHealingCheck = await this.performIntegrityCheck(hostId);
            healingResults.postHealingIntegrity = postHealingCheck;
            
            const improvements = this.calculateHealingImprovements(integrityReport, postHealingCheck);
            healingResults.improvements = improvements;
            
            console.log(`✅ Data healing completed: ${healingResults.overallSuccess ? 'SUCCESS' : 'PARTIAL'}`);
            
            // Log healing results
            this.logDataHealing(healingResults);
            
        } catch (error) {
            console.error('❌ Data healing failed:', error);
            healingResults.overallSuccess = false;
            healingResults.error = error.message;
        } finally {
            this.isRecoveryInProgress = false;
        }
        
        return healingResults;
    }

    /**
     * Execute specific healing operation
     */
    async executeHealingOperation(recommendation, hostId) {
        const operation = {
            action: recommendation.action,
            startTime: new Date(),
            success: false,
            details: {}
        };
        
        try {
            switch (recommendation.action) {
                case 'DATA_HEALING':
                    operation.details = await this.healInvalidData(hostId);
                    break;
                    
                case 'ORPHAN_CLEANUP':
                    operation.details = await this.cleanupOrphanedRecords(hostId);
                    break;
                    
                case 'CHECKSUM_REPAIR':
                    operation.details = await this.repairDataChecksums(hostId);
                    break;
                    
                case 'DUPLICATE_REMOVAL':
                    operation.details = await this.removeDuplicates(hostId);
                    break;
                    
                default:
                    throw new Error(`Unknown healing operation: ${recommendation.action}`);
            }
            
            operation.success = true;
            
        } catch (error) {
            operation.error = error.message;
            operation.success = false;
        }
        
        operation.endTime = new Date();
        operation.duration = operation.endTime - operation.startTime;
        
        return operation;
    }

    /**
     * Heal invalid data by correcting or quarantining
     */
    async healInvalidData(hostId) {
        return new Promise((resolve, reject) => {
            const healingDetails = { correctedRecords: 0, quarantinedRecords: 0, errors: [] };
            
            // Get validation errors for the host
            const query = `
                SELECT * FROM validation_errors 
                WHERE resolved = 0 
                ${hostId ? 'AND record_id IN (SELECT tc.id FROM toll_charges tc JOIN toll_accounts ta ON tc.toll_account_id = ta.id WHERE ta.host_id = ?)' : ''}
                ORDER BY severity DESC, created_at ASC
            `;
            
            db.all(query, hostId ? [hostId] : [], (err, validationErrors) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                let processedErrors = 0;
                const totalErrors = validationErrors.length;
                
                if (totalErrors === 0) {
                    resolve(healingDetails);
                    return;
                }
                
                validationErrors.forEach(validationError => {
                    this.healValidationError(validationError)
                        .then(result => {
                            if (result.corrected) {
                                healingDetails.correctedRecords++;
                            } else if (result.quarantined) {
                                healingDetails.quarantinedRecords++;
                            } else {
                                healingDetails.errors.push(result.error);
                            }
                            
                            processedErrors++;
                            if (processedErrors === totalErrors) {
                                resolve(healingDetails);
                            }
                        })
                        .catch(error => {
                            healingDetails.errors.push(error.message);
                            processedErrors++;
                            if (processedErrors === totalErrors) {
                                resolve(healingDetails);
                            }
                        });
                });
            });
        });
    }

    /**
     * Heal individual validation error
     */
    async healValidationError(validationError) {
        return new Promise((resolve) => {
            const tableName = validationError.table_name;
            const recordId = validationError.record_id;
            
            // Get the actual record
            db.get(`SELECT * FROM ` + tableName + ` WHERE id = ?`, [recordId], (err, record) => {
                if (err || !record) {
                    resolve({ corrected: false, quarantined: false, error: 'Record not found' });
                    return;
                }
                
                let correctionApplied = false;
                
                // Apply specific corrections based on error type
                if (validationError.error_type === 'DATA_VALIDATION') {
                    if (tableName === 'toll_charges') {
                        // Try to correct toll amount issues
                        if (record.toll_amount < 0) {
                            record.toll_amount = Math.abs(record.toll_amount);
                            correctionApplied = true;
                        } else if (record.toll_amount > 200) {
                            record.toll_amount = 200; // Cap at maximum
                            correctionApplied = true;
                        }
                    }
                }
                
                if (correctionApplied) {
                    // Update the record
                    const updateFields = Object.keys(record).filter(key => key !== 'id').join(' = ?, ') + ' = ?';
                    const updateValues = Object.keys(record).filter(key => key !== 'id').map(key => record[key]);
                    updateValues.push(recordId);
                    
                    db.run(
                        `UPDATE ${tableName} SET ${updateFields} WHERE id = ?`,
                        updateValues,
                        (updateErr) => {
                            if (updateErr) {
                                resolve({ corrected: false, quarantined: false, error: updateErr.message });
                            } else {
                                // Mark validation error as resolved
                                db.run(
                                    `UPDATE validation_errors SET resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
                                    [validationError.id],
                                    () => {
                                        resolve({ corrected: true, quarantined: false });
                                    }
                                );
                            }
                        }
                    );
                } else {
                    // Quarantine the record if it can't be corrected
                    resolve({ corrected: false, quarantined: true });
                }
            });
        });
    }

    /**
     * Clean up orphaned records
     */
    async cleanupOrphanedRecords(hostId) {
        return new Promise((resolve, reject) => {
            const cleanupDetails = { removedRecords: 0, errors: [] };
            
            // Remove orphaned toll charges
            const orphanQuery = `
                DELETE FROM toll_charges 
                WHERE id IN (
                    SELECT tc.id 
                    FROM toll_charges tc 
                    LEFT JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                    WHERE ta.id IS NULL 
                    ${hostId ? 'OR ta.host_id != ?' : ''}
                )
            `;
            
            db.run(orphanQuery, hostId ? [hostId] : [], function(err) {
                if (err) {
                    reject(err);
                } else {
                    cleanupDetails.removedRecords = this.changes;
                    console.log(`🧹 Cleaned up ${cleanupDetails.removedRecords} orphaned records`);
                    resolve(cleanupDetails);
                }
            });
        });
    }

    /**
     * Repair data checksums
     */
    async repairDataChecksums(hostId) {
        return new Promise((resolve, reject) => {
            const repairDetails = { repairedChecksums: 0, errors: [] };
            
            const query = hostId ? 
                `SELECT tc.* FROM toll_charges tc JOIN toll_accounts ta ON tc.toll_account_id = ta.id WHERE ta.host_id = ?` :
                `SELECT * FROM toll_charges`;
            
            db.all(query, hostId ? [hostId] : [], (err, charges) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                let processedRecords = 0;
                const totalRecords = charges.length;
                
                if (totalRecords === 0) {
                    resolve(repairDetails);
                    return;
                }
                
                charges.forEach(charge => {
                    const correctChecksum = this.validator.generateDataChecksum(charge);
                    
                    db.run(
                        `UPDATE toll_charges SET data_checksum = ? WHERE id = ?`,
                        [correctChecksum, charge.id],
                        function(updateErr) {
                            if (updateErr) {
                                repairDetails.errors.push(`Failed to update checksum for record ${charge.id}: ${updateErr.message}`);
                            } else if (this.changes > 0) {
                                repairDetails.repairedChecksums++;
                            }
                            
                            processedRecords++;
                            if (processedRecords === totalRecords) {
                                resolve(repairDetails);
                            }
                        }
                    );
                });
            });
        });
    }

    /**
     * Remove duplicate records intelligently
     */
    async removeDuplicates(hostId) {
        return new Promise((resolve, reject) => {
            const removalDetails = { removedDuplicates: 0, preservedRecords: 0, errors: [] };
            
            // Find duplicate groups
            const duplicateQuery = `
                SELECT toll_location, toll_date, toll_amount, plate_number, 
                       GROUP_CONCAT(id) as ids, COUNT(*) as count
                FROM toll_charges tc
                ${hostId ? 'JOIN toll_accounts ta ON tc.toll_account_id = ta.id WHERE ta.host_id = ?' : ''}
                GROUP BY toll_location, toll_date, toll_amount, plate_number
                HAVING COUNT(*) > 1
            `;
            
            db.all(duplicateQuery, hostId ? [hostId] : [], (err, duplicateGroups) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (duplicateGroups.length === 0) {
                    resolve(removalDetails);
                    return;
                }
                
                let processedGroups = 0;
                const totalGroups = duplicateGroups.length;
                
                duplicateGroups.forEach(group => {
                    const ids = group.ids.split(',');
                    // Keep the first record (presumably the original), remove the rest
                    const idsToKeep = [ids[0]];
                    const idsToRemove = ids.slice(1);
                    
                    if (idsToRemove.length > 0) {
                        const placeholders = idsToRemove.map(() => '?').join(',');
                        
                        db.run(
                            `DELETE FROM toll_charges WHERE id IN (${placeholders})`,
                            idsToRemove,
                            function(deleteErr) {
                                if (deleteErr) {
                                    removalDetails.errors.push(`Failed to remove duplicates for group: ${deleteErr.message}`);
                                } else {
                                    removalDetails.removedDuplicates += this.changes;
                                    removalDetails.preservedRecords += idsToKeep.length;
                                }
                                
                                processedGroups++;
                                if (processedGroups === totalGroups) {
                                    resolve(removalDetails);
                                }
                            }
                        );
                    } else {
                        processedGroups++;
                        if (processedGroups === totalGroups) {
                            resolve(removalDetails);
                        }
                    }
                });
            });
        });
    }

    /**
     * Calculate improvements from healing process
     */
    calculateHealingImprovements(beforeReport, afterReport) {
        return {
            validationErrorsReduced: (beforeReport.checks.dataValidation.errors.length || 0) - (afterReport.checks.dataValidation.errors.length || 0),
            checksumMismatchesFixed: (beforeReport.checks.checksumValidation.errors.length || 0) - (afterReport.checks.checksumValidation.errors.length || 0),
            orphanedRecordsRemoved: (beforeReport.checks.referentialIntegrity.orphanedRecords || 0) - (afterReport.checks.referentialIntegrity.orphanedRecords || 0),
            duplicatesRemoved: (beforeReport.checks.duplicateDetection.totalDuplicates || 0) - (afterReport.checks.duplicateDetection.totalDuplicates || 0),
            overallHealthImproved: beforeReport.overallStatus !== 'HEALTHY' && afterReport.overallStatus === 'HEALTHY'
        };
    }

    /**
     * Log validation error to database
     */
    logValidationError(tableName, recordId, errorType, errorMessage, severity = 'MEDIUM') {
        db.run(
            `INSERT INTO validation_errors (table_name, record_id, error_type, error_message, severity) 
             VALUES (?, ?, ?, ?, ?)`,
            [tableName, recordId, errorType, errorMessage, severity],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log validation error:', err);
                }
            }
        );
    }

    /**
     * Log integrity check results
     */
    logIntegrityCheck(integrityReport) {
        const eventDetails = {
            overallStatus: integrityReport.overallStatus,
            checksPerformed: Object.keys(integrityReport.checks).length,
            issuesFound: Object.values(integrityReport.checks).filter(check => !check.passed).length,
            recommendationsCount: integrityReport.recoveryRecommendations.length
        };
        
        db.run(
            `INSERT INTO security_logs (event_type, details, severity) VALUES (?, ?, ?)`,
            ['DATA_INTEGRITY_CHECK', JSON.stringify(eventDetails), integrityReport.overallStatus === 'HEALTHY' ? 'LOW' : 'HIGH'],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log integrity check:', err);
                }
            }
        );
    }

    /**
     * Log data healing results
     */
    logDataHealing(healingResults) {
        const eventDetails = {
            overallSuccess: healingResults.overallSuccess,
            operationsPerformed: healingResults.operations.length,
            successfulOperations: healingResults.operations.filter(op => op.success).length,
            improvements: healingResults.improvements
        };
        
        db.run(
            `INSERT INTO security_logs (event_type, details, severity) VALUES (?, ?, ?)`,
            ['DATA_HEALING_COMPLETED', JSON.stringify(eventDetails), healingResults.overallSuccess ? 'MEDIUM' : 'HIGH'],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log data healing:', err);
                }
            }
        );
    }

    /**
     * Start automated monitoring and recovery
     */
    startAutomatedMonitoring() {
        console.log('🔄 Starting automated data integrity monitoring...');
        
        setInterval(async () => {
            try {
                const integrityReport = await this.performIntegrityCheck();
                
                if (integrityReport.overallStatus !== 'HEALTHY') {
                    console.log('⚠️ Data integrity issues detected, considering auto-healing...');
                    
                    // Only auto-heal if issues are not critical and auto-fix is available
                    const autoHealable = integrityReport.recoveryRecommendations.filter(rec => 
                        rec.autoFixAvailable && rec.priority !== 'CRITICAL'
                    );
                    
                    if (autoHealable.length > 0) {
                        console.log(`🔧 Starting automatic healing for ${autoHealable.length} issues...`);
                        await this.performDataHealing(integrityReport);
                    }
                }
            } catch (error) {
                console.error('❌ Automated monitoring cycle failed:', error);
            }
        }, this.corruptionThresholds.integrityCheckInterval);
    }
}

module.exports = DataRecoveryManager;