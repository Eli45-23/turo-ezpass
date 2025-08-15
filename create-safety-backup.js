#!/usr/bin/env node

/**
 * Safety Backup Script
 * Creates a comprehensive backup before critical database fixes
 */

const BackupManager = require('./services/backup-manager');

async function createSafetyBackup() {
    console.log('🔒 Creating safety backup before critical database fixes...');
    
    try {
        const backupManager = new BackupManager();
        
        // Create a full manual backup with description
        const result = await backupManager.createFullBackup(
            'manual', 
            'SAFETY_BACKUP_BEFORE_CRITICAL_FIXES - Orphaned records cleanup and foreign key enforcement'
        );
        
        console.log('✅ Safety backup created successfully!');
        console.log('📍 Backup location: /backups/manual/');
        console.log('🔍 Backup verified and ready for recovery if needed');
        
        return result;
        
    } catch (error) {
        console.error('❌ Failed to create safety backup:', error);
        console.error('🛑 DO NOT PROCEED with database changes until backup is successful');
        throw error;
    }
}

// Run backup if script is executed directly
if (require.main === module) {
    createSafetyBackup()
        .then(() => {
            console.log('🎉 Ready to proceed with critical database fixes');
            process.exit(0);
        })
        .catch(() => {
            process.exit(1);
        });
}

module.exports = { createSafetyBackup };