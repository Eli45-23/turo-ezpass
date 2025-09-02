const { db } = require('../config/database');
const crypto = require('crypto');

/**
 * Data Integrity and Financial Validation Module
 * 
 * This module provides comprehensive data integrity measures for the Turo toll tracking system,
 * ensuring 100% accuracy and reliability for financial transactions.
 */

class DataIntegrityValidator {
    constructor() {
        this.validationErrors = [];
        this.config = {
            // Financial validation limits
            minTollAmount: 0.01,        // Minimum valid toll amount
            maxTollAmount: 200.00,      // Maximum reasonable toll amount
            decimalPrecision: 2,        // Required decimal precision for financial amounts
            
            // Date validation ranges
            earliestValidDate: new Date('2020-01-01'),  // Earliest reasonable toll date
            latestValidDate: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 year future max
            maxTripDuration: 30,        // Maximum trip duration in days
            
            // Business logic validation
            maxDailyTolls: 50,          // Maximum tolls per day per trip (prevents spam)
            maxProcessingFee: 25.00,    // Maximum processing fee
            
            // Data integrity thresholds
            duplicateToleranceMs: 5000, // 5 second tolerance for duplicate detection
            anomalyThresholds: {
                unusualTollAmount: 100.00,      // Flag amounts over $100
                highVolumeTrips: 20,            // Flag trips with >20 tolls
                rapidSuccessionTolls: 60000     // Flag tolls within 1 minute
            }
        };
    }

    /**
     * Validate financial amount (toll amount, processing fee, etc.)
     */
    validateFinancialAmount(amount, fieldName = 'amount') {
        const errors = [];
        
        // Type validation
        if (typeof amount !== 'number' && typeof amount !== 'string') {
            errors.push(`${fieldName} must be a number or numeric string`);
            return errors;
        }
        
        const numAmount = parseFloat(amount);
        
        // NaN validation
        if (isNaN(numAmount)) {
            errors.push(`${fieldName} is not a valid number: ${amount}`);
            return errors;
        }
        
        // Negative amount validation
        if (numAmount < 0) {
            errors.push(`${fieldName} cannot be negative: ${numAmount}`);
        }
        
        // Range validation
        if (numAmount < this.config.minTollAmount && numAmount !== 0) {
            errors.push(`${fieldName} is below minimum allowed value: ${numAmount} < ${this.config.minTollAmount}`);
        }
        
        if (numAmount > this.config.maxTollAmount) {
            errors.push(`${fieldName} exceeds maximum allowed value: ${numAmount} > ${this.config.maxTollAmount}`);
        }
        
        // Decimal precision validation - handle floating-point precision issues
        // Round to avoid floating-point precision errors, then check
        const roundedAmount = Math.round(numAmount * Math.pow(10, this.config.decimalPrecision)) / Math.pow(10, this.config.decimalPrecision);
        
        // Only validate if the rounded value differs significantly from the original
        if (Math.abs(numAmount - roundedAmount) > 1e-10) {
            // Count actual decimal places in string representation
            const amountStr = numAmount.toString();
            let decimalPlaces = 0;
            
            if (amountStr.includes('.') && !amountStr.includes('e')) {
                const decimalPart = amountStr.split('.')[1];
                // Remove trailing zeros to get actual significant decimal places
                decimalPlaces = decimalPart.replace(/0+$/, '').length;
                
                if (decimalPlaces > this.config.decimalPrecision) {
                    errors.push(`${fieldName} has too many decimal places: ${decimalPlaces} > ${this.config.decimalPrecision}`);
                }
            }
        }
        
        // Infinity/extreme value check
        if (!isFinite(numAmount)) {
            errors.push(`${fieldName} must be a finite number: ${numAmount}`);
        }
        
        return errors;
    }

    /**
     * Validate trip date integrity
     */
    validateTripDates(startDate, endDate) {
        const errors = [];
        
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Valid date check
            if (isNaN(start.getTime())) {
                errors.push(`Invalid start date: ${startDate}`);
            }
            if (isNaN(end.getTime())) {
                errors.push(`Invalid end date: ${endDate}`);
            }
            
            if (errors.length > 0) return errors;
            
            // Date range validation
            if (start < this.config.earliestValidDate) {
                errors.push(`Start date is too early: ${startDate} < ${this.config.earliestValidDate.toISOString()}`);
            }
            if (end > this.config.latestValidDate) {
                errors.push(`End date is too far in future: ${endDate} > ${this.config.latestValidDate.toISOString()}`);
            }
            
            // Logical order validation
            if (start >= end) {
                errors.push(`Start date must be before end date: ${startDate} >= ${endDate}`);
            }
            
            // Duration validation
            const durationDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
            if (durationDays > this.config.maxTripDuration) {
                errors.push(`Trip duration exceeds maximum: ${durationDays} days > ${this.config.maxTripDuration} days`);
            }
            
        } catch (error) {
            errors.push(`Date validation error: ${error.message}`);
        }
        
        return errors;
    }

    /**
     * Validate toll date is within reasonable range of trip dates
     */
    validateTollDateAgainstTrip(tollDate, tripStartDate, tripEndDate, bufferHours = 24) {
        const errors = [];
        
        try {
            const toll = new Date(tollDate);
            const tripStart = new Date(tripStartDate);
            const tripEnd = new Date(tripEndDate);
            
            const bufferMs = bufferHours * 60 * 60 * 1000;
            const adjustedStart = new Date(tripStart.getTime() - bufferMs);
            const adjustedEnd = new Date(tripEnd.getTime() + bufferMs);
            
            if (toll < adjustedStart || toll > adjustedEnd) {
                errors.push(`Toll date ${tollDate} is outside trip window (${tripStartDate} to ${tripEndDate}) with ${bufferHours}h buffer`);
            }
            
        } catch (error) {
            errors.push(`Toll date validation error: ${error.message}`);
        }
        
        return errors;
    }

    /**
     * Enhanced duplicate detection for toll transactions
     */
    async detectPotentialDuplicates(transaction, tolerance = null) {
        const toleranceMs = tolerance || this.config.duplicateToleranceMs;
        
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM toll_charges 
                WHERE toll_account_id = ? 
                AND toll_location = ?
                AND ABS(CAST(strftime('%s', toll_date) AS INTEGER) - CAST(strftime('%s', ?) AS INTEGER)) <= ?
                AND ABS(toll_amount - ?) <= 0.01
                AND (plate_number = ? OR plate_number IS NULL OR ? IS NULL)
            `;
            
            const toleranceSeconds = Math.ceil(toleranceMs / 1000);
            
            db.all(query, [
                transaction.toll_account_id,
                transaction.toll_location,
                transaction.toll_date,
                toleranceSeconds,
                transaction.toll_amount,
                transaction.plate_number,
                transaction.plate_number
            ], (err, duplicates) => {
                if (err) {
                    reject(new Error(`Duplicate detection failed: ${err.message}`));
                    return;
                }
                
                resolve({
                    isDuplicate: duplicates.length > 0,
                    duplicateCount: duplicates.length,
                    existingTransactions: duplicates
                });
            });
        });
    }

    /**
     * Validate transaction data integrity
     */
    validateTransactionData(transaction) {
        const errors = [];
        
        // Required field validation
        const requiredFields = ['toll_account_id', 'toll_date', 'toll_location', 'toll_amount'];
        requiredFields.forEach(field => {
            if (!transaction[field] && transaction[field] !== 0) {
                errors.push(`Missing required field: ${field}`);
            }
        });
        
        if (errors.length > 0) return errors;
        
        // Financial validation
        const amountErrors = this.validateFinancialAmount(transaction.toll_amount, 'toll_amount');
        errors.push(...amountErrors);
        
        // Date validation
        try {
            const tollDate = new Date(transaction.toll_date);
            if (isNaN(tollDate.getTime())) {
                errors.push(`Invalid toll date: ${transaction.toll_date}`);
            } else {
                if (tollDate < this.config.earliestValidDate || tollDate > this.config.latestValidDate) {
                    errors.push(`Toll date outside valid range: ${transaction.toll_date}`);
                }
            }
        } catch (error) {
            errors.push(`Toll date validation error: ${error.message}`);
        }
        
        // Location validation
        if (typeof transaction.toll_location !== 'string' || transaction.toll_location.trim().length === 0) {
            errors.push('Toll location must be a non-empty string');
        }
        
        // Suspicious transaction detection
        if (transaction.toll_amount > this.config.anomalyThresholds.unusualTollAmount) {
            errors.push(`ANOMALY: Unusually high toll amount: $${transaction.toll_amount}`);
        }
        
        return errors;
    }

    /**
     * Validate invoice data integrity
     */
    validateInvoiceData(invoice) {
        const errors = [];
        
        // Required field validation
        const requiredFields = ['trip_id', 'total_amount'];
        requiredFields.forEach(field => {
            if (!invoice[field] && invoice[field] !== 0) {
                errors.push(`Missing required field: ${field}`);
            }
        });
        
        if (errors.length > 0) return errors;
        
        // Financial validation
        const totalErrors = this.validateFinancialAmount(invoice.total_amount, 'total_amount');
        errors.push(...totalErrors);
        
        if (invoice.processing_fee !== undefined) {
            const feeErrors = this.validateFinancialAmount(invoice.processing_fee, 'processing_fee');
            errors.push(...feeErrors);
            
            if (invoice.processing_fee > this.config.maxProcessingFee) {
                errors.push(`Processing fee exceeds maximum: $${invoice.processing_fee} > $${this.config.maxProcessingFee}`);
            }
        }
        
        // Logical validation
        if (invoice.processing_fee && invoice.toll_total) {
            const expectedTotal = invoice.toll_total + invoice.processing_fee;
            if (Math.abs(expectedTotal - invoice.total_amount) > 0.01) {
                errors.push(`Total amount mismatch: expected ${expectedTotal}, got ${invoice.total_amount}`);
            }
        }
        
        return errors;
    }

    /**
     * Generate data integrity checksum for critical financial data
     */
    generateDataChecksum(data) {
        const criticalFields = ['toll_amount', 'toll_date', 'toll_location', 'transaction_id'];
        const checksumData = criticalFields
            .filter(field => data[field] !== undefined)
            .map(field => `${field}:${data[field]}`)
            .join('|');
        
        return crypto
            .createHash('sha256')
            .update(checksumData)
            .digest('hex')
            .substring(0, 16); // First 16 characters for storage efficiency
    }

    /**
     * Verify data integrity checksum
     */
    verifyDataChecksum(data, expectedChecksum) {
        const actualChecksum = this.generateDataChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    /**
     * Comprehensive data anomaly detection
     */
    async detectDataAnomalies(hostId, timeRangeHours = 24) {
        const anomalies = [];
        const cutoffTime = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));
        
        return new Promise((resolve, reject) => {
            // Check for rapid succession tolls (potential bot/scraping errors)
            db.all(`
                SELECT tc1.*, tc2.toll_date as next_toll_date 
                FROM toll_charges tc1
                JOIN toll_charges tc2 ON tc1.toll_account_id = tc2.toll_account_id
                JOIN toll_accounts ta ON tc1.toll_account_id = ta.id
                WHERE ta.host_id = ?
                AND tc1.created_at > ?
                AND ABS(CAST(strftime('%s', tc2.toll_date) AS INTEGER) - CAST(strftime('%s', tc1.toll_date) AS INTEGER)) <= ?
                AND tc1.id != tc2.id
            `, [hostId, cutoffTime.toISOString(), this.config.anomalyThresholds.rapidSuccessionTolls / 1000], 
            (err, rapidTolls) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (rapidTolls.length > 0) {
                    anomalies.push({
                        type: 'RAPID_SUCCESSION_TOLLS',
                        severity: 'MEDIUM',
                        count: rapidTolls.length,
                        description: 'Multiple tolls detected within short time period'
                    });
                }
                
                // Check for high volume trips
                db.all(`
                    SELECT trip_id, COUNT(*) as toll_count 
                    FROM toll_charges tc
                    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                    WHERE ta.host_id = ? AND tc.created_at > ?
                    GROUP BY trip_id 
                    HAVING toll_count > ?
                `, [hostId, cutoffTime.toISOString(), this.config.anomalyThresholds.highVolumeTrips], 
                (err, highVolumeTrips) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (highVolumeTrips.length > 0) {
                        anomalies.push({
                            type: 'HIGH_VOLUME_TRIPS',
                            severity: 'HIGH',
                            count: highVolumeTrips.length,
                            trips: highVolumeTrips,
                            description: 'Trips with unusually high toll counts detected'
                        });
                    }
                    
                    resolve({
                        anomalies,
                        detectionTime: new Date().toISOString(),
                        timeRangeHours
                    });
                });
            });
        });
    }

    /**
     * Log data integrity event
     */
    logIntegrityEvent(eventType, details, severity = 'LOW') {
        const logEntry = {
            event_type: `DATA_INTEGRITY_${eventType}`,
            details: typeof details === 'object' ? JSON.stringify(details) : details,
            severity: severity
        };
        
        db.run(
            `INSERT INTO security_logs (event_type, details, severity) VALUES (?, ?, ?)`,
            [logEntry.event_type, logEntry.details, logEntry.severity],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log integrity event:', err);
                } else {
                    console.log(`🔒 Data integrity event logged: ${eventType} (${severity})`);
                }
            }
        );
    }

    /**
     * Sanitize and normalize financial amounts
     */
    sanitizeFinancialAmount(amount) {
        if (typeof amount === 'string') {
            // Remove currency symbols and whitespace
            amount = amount.replace(/[$,\s]/g, '');
        }
        
        const num = parseFloat(amount);
        
        if (isNaN(num)) {
            throw new Error(`Invalid financial amount: ${amount}`);
        }
        
        // Round to 2 decimal places to prevent floating point errors
        return Math.round(num * 100) / 100;
    }

    /**
     * Complete validation suite for new transaction
     */
    async validateNewTransaction(transaction) {
        const validationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            sanitizedTransaction: { ...transaction }
        };
        
        try {
            // Basic data validation
            const dataErrors = this.validateTransactionData(transaction);
            validationResult.errors.push(...dataErrors);
            
            // Sanitize financial amount
            try {
                validationResult.sanitizedTransaction.toll_amount = this.sanitizeFinancialAmount(transaction.toll_amount);
            } catch (error) {
                validationResult.errors.push(`Amount sanitization failed: ${error.message}`);
            }
            
            // Duplicate detection
            try {
                const duplicateResult = await this.detectPotentialDuplicates(transaction);
                if (duplicateResult.isDuplicate) {
                    validationResult.errors.push(`Potential duplicate transaction detected (${duplicateResult.duplicateCount} existing)`);
                    validationResult.duplicates = duplicateResult.existingTransactions;
                }
            } catch (error) {
                validationResult.warnings.push(`Duplicate detection failed: ${error.message}`);
            }
            
            // Generate data checksum
            validationResult.sanitizedTransaction.data_checksum = this.generateDataChecksum(validationResult.sanitizedTransaction);
            
            validationResult.isValid = validationResult.errors.length === 0;
            
        } catch (error) {
            validationResult.errors.push(`Validation process failed: ${error.message}`);
            validationResult.isValid = false;
        }
        
        return validationResult;
    }
}

module.exports = DataIntegrityValidator;