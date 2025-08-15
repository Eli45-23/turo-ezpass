const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'turo_tolls.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
    } else {
        // Enable foreign key constraints for this connection
        db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
                console.error('❌ Error enabling foreign keys:', err);
            } else {
                console.log('🔒 Foreign key constraints enabled');
            }
        });

        // Apply SQLite performance optimizations
        db.serialize(() => {
            // Enable foreign key constraints for data integrity
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) {
                    console.warn('⚠️ Could not enable foreign keys:', err.message);
                } else {
                    console.log('🔐 Foreign key constraints enabled');
                }
            });

            // Enable WAL (Write-Ahead Logging) mode for better concurrency
            db.run('PRAGMA journal_mode = WAL', (err) => {
                if (err) {
                    console.warn('⚠️ Could not enable WAL mode:', err.message);
                } else {
                    console.log('⚡ WAL mode enabled for better concurrency');
                }
            });

            // Increase cache size to 64MB for better performance
            db.run('PRAGMA cache_size = -65536', (err) => {
                if (err) {
                    console.warn('⚠️ Could not set cache size:', err.message);
                } else {
                    console.log('🚀 Cache size increased to 64MB');
                }
            });

            // Enable memory-mapped I/O for faster file access
            db.run('PRAGMA mmap_size = 268435456', (err) => {
                if (err) {
                    console.warn('⚠️ Could not enable mmap:', err.message);
                } else {
                    console.log('💾 Memory-mapped I/O enabled (256MB)');
                }
            });

            // Set synchronous mode to NORMAL for balanced performance/safety
            db.run('PRAGMA synchronous = NORMAL', (err) => {
                if (err) {
                    console.warn('⚠️ Could not set synchronous mode:', err.message);
                } else {
                    console.log('⚖️ Synchronous mode set to NORMAL');
                }
            });

            // Set page size to 4KB for optimal performance
            db.run('PRAGMA page_size = 4096', (err) => {
                if (err) {
                    console.warn('⚠️ Could not set page size:', err.message);
                }
            });

            // Enable automatic index optimization
            db.run('PRAGMA optimize = 0x10002', (err) => {
                if (err) {
                    console.warn('⚠️ Could not enable auto-optimize:', err.message);
                } else {
                    console.log('🔧 Auto-optimization enabled');
                }
            });

            // Set temp store to memory for faster temporary operations
            db.run('PRAGMA temp_store = MEMORY', (err) => {
                if (err) {
                    console.warn('⚠️ Could not set temp store:', err.message);
                } else {
                    console.log('🧠 Temporary storage set to memory');
                }
            });
        });
    }
});

const initialize = () => {
    db.serialize(() => {
        // Hosts table
        db.run(`
            CREATE TABLE IF NOT EXISTS hosts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                turo_host_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Toll accounts table (E-ZPass, SunPass, etc.)
        db.run(`
            CREATE TABLE IF NOT EXISTS toll_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                account_number TEXT NOT NULL,
                username TEXT NOT NULL,
                password_encrypted TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                last_sync DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Turo trips table
        db.run(`
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                turo_trip_id TEXT UNIQUE NOT NULL,
                renter_name TEXT NOT NULL,
                renter_email TEXT,
                vehicle_plate TEXT NOT NULL,
                start_date DATETIME NOT NULL,
                end_date DATETIME NOT NULL,
                trip_status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Toll charges table
        db.run(`
            CREATE TABLE IF NOT EXISTS toll_charges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                toll_account_id INTEGER NOT NULL,
                trip_id INTEGER,
                toll_date DATETIME NOT NULL,
                toll_location TEXT NOT NULL,
                toll_amount DECIMAL(10,2) NOT NULL CHECK (toll_amount >= 0 AND toll_amount <= 200),
                plate_number TEXT,
                transaction_id TEXT UNIQUE,
                is_matched BOOLEAN DEFAULT 0,
                match_timestamp DATETIME,
                data_checksum TEXT,
                validation_status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (toll_account_id) REFERENCES toll_accounts(id),
                FOREIGN KEY (trip_id) REFERENCES trips(id)
            )
        `);

        // Invoices table
        db.run(`
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                invoice_number TEXT UNIQUE NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
                processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0 AND processing_fee <= 25),
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'failed', 'cancelled')),
                sent_date DATETIME,
                paid_date DATETIME,
                turo_charge_id TEXT,
                data_checksum TEXT,
                validation_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (trip_id) REFERENCES trips(id)
            )
        `);

        // Invoice line items
        db.run(`
            CREATE TABLE IF NOT EXISTS invoice_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL,
                toll_charge_id INTEGER NOT NULL,
                description TEXT,
                amount DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id),
                FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id)
            )
        `);

        // Transponder mappings table
        db.run(`
            CREATE TABLE IF NOT EXISTS transponder_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                transponder_number TEXT NOT NULL,
                vehicle_plate TEXT NOT NULL,
                vehicle_description TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, transponder_number)
            )
        `);

        // Deleted transponder plates blacklist table (prevents auto-discovery)
        db.run(`
            CREATE TABLE IF NOT EXISTS deleted_transponder_plates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                vehicle_plate TEXT NOT NULL,
                deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, vehicle_plate)
            )
        `);

        // Security audit logs table
        db.run(`
            CREATE TABLE IF NOT EXISTS security_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                details TEXT,
                severity TEXT DEFAULT 'LOW',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Failed login attempts tracking
        db.run(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT 0,
                user_agent TEXT
            )
        `);

        // Data integrity checkpoints table
        db.run(`
            CREATE TABLE IF NOT EXISTS data_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                checkpoint_type TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_count INTEGER NOT NULL,
                checksum TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Database backup logs
        db.run(`
            CREATE TABLE IF NOT EXISTS backup_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'manual')),
                file_path TEXT NOT NULL,
                file_size INTEGER,
                status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
                error_message TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )
        `);

        // Data validation errors log
        db.run(`
            CREATE TABLE IF NOT EXISTS validation_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_id INTEGER,
                field_name TEXT,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                severity TEXT DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
                resolved BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME
            )
        `);

        // Transaction audit log
        db.run(`
            CREATE TABLE IF NOT EXISTS transaction_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_id INTEGER,
                old_values TEXT,
                new_values TEXT,
                checksum TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Notification preferences table
        db.run(`
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                email_notifications BOOLEAN DEFAULT 1,
                toll_alerts BOOLEAN DEFAULT 1,
                weekly_summaries BOOLEAN DEFAULT 1,
                monthly_summaries BOOLEAN DEFAULT 1,
                system_alerts BOOLEAN DEFAULT 1,
                trip_completion BOOLEAN DEFAULT 1,
                invoice_notifications BOOLEAN DEFAULT 1,
                real_time_alerts BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Notification queue table
        db.run(`
            CREATE TABLE IF NOT EXISTS notification_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                template_name TEXT NOT NULL,
                template_data TEXT NOT NULL,
                subject TEXT,
                priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
                scheduled_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME
            )
        `);

        // Notification delivery logs table
        db.run(`
            CREATE TABLE IF NOT EXISTS notification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                template_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced')),
                message_id TEXT,
                error_message TEXT,
                priority TEXT DEFAULT 'normal',
                delivery_time INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Notification events table (for tracking what triggers notifications)
        db.run(`
            CREATE TABLE IF NOT EXISTS notification_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER NOT NULL,
                recipient_email TEXT NOT NULL,
                notification_sent BOOLEAN DEFAULT 0,
                notification_scheduled DATETIME,
                notification_sent_at DATETIME,
                event_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Analytics metrics table for storing aggregated data
        db.run(`
            CREATE TABLE IF NOT EXISTS analytics_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                metric_type TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value DECIMAL(15,4),
                metric_count INTEGER,
                date_period TEXT NOT NULL,
                period_start DATETIME NOT NULL,
                period_end DATETIME NOT NULL,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, metric_type, metric_name, date_period, period_start)
            )
        `);

        // Financial analytics table for revenue/cost tracking
        db.run(`
            CREATE TABLE IF NOT EXISTS financial_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
                period_start DATETIME NOT NULL,
                period_end DATETIME NOT NULL,
                total_revenue DECIMAL(10,2) DEFAULT 0,
                total_toll_costs DECIMAL(10,2) DEFAULT 0,
                processing_fees DECIMAL(10,2) DEFAULT 0,
                net_profit DECIMAL(10,2) DEFAULT 0,
                trip_count INTEGER DEFAULT 0,
                toll_charge_count INTEGER DEFAULT 0,
                average_toll_per_trip DECIMAL(10,2) DEFAULT 0,
                cost_per_mile DECIMAL(10,4) DEFAULT 0,
                total_miles DECIMAL(10,2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, period_type, period_start)
            )
        `);

        // Performance metrics table for system monitoring
        db.run(`
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER,
                metric_category TEXT NOT NULL CHECK (metric_category IN ('toll_matching', 'ezpass_scraping', 'system_performance', 'data_quality')),
                metric_name TEXT NOT NULL,
                metric_value DECIMAL(15,4),
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                total_count INTEGER DEFAULT 0,
                accuracy_rate DECIMAL(5,2) DEFAULT 0,
                processing_time_ms INTEGER,
                error_details TEXT,
                measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Business intelligence reports table
        db.run(`
            CREATE TABLE IF NOT EXISTS bi_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                report_type TEXT NOT NULL CHECK (report_type IN ('toll_locations', 'seasonal_trends', 'vehicle_utilization', 'renter_behavior', 'route_analysis')),
                report_name TEXT NOT NULL,
                report_data TEXT NOT NULL,
                report_summary TEXT,
                period_start DATETIME NOT NULL,
                period_end DATETIME NOT NULL,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Predictive analytics table for forecasting
        db.run(`
            CREATE TABLE IF NOT EXISTS predictive_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                prediction_type TEXT NOT NULL CHECK (prediction_type IN ('toll_forecast', 'revenue_forecast', 'seasonal_demand', 'route_optimization')),
                model_name TEXT NOT NULL,
                prediction_data TEXT NOT NULL,
                confidence_score DECIMAL(5,2),
                forecast_period_start DATETIME NOT NULL,
                forecast_period_end DATETIME NOT NULL,
                actual_values TEXT,
                accuracy_score DECIMAL(5,2),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Automated reports queue table
        db.run(`
            CREATE TABLE IF NOT EXISTS automated_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                report_type TEXT NOT NULL CHECK (report_type IN ('weekly_summary', 'monthly_financial', 'performance_report', 'trend_analysis')),
                frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
                last_generated DATETIME,
                next_scheduled DATETIME,
                report_config TEXT,
                is_active BOOLEAN DEFAULT 1,
                delivery_email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id)
            )
        `);

        // Toll location analytics for route intelligence
        db.run(`
            CREATE TABLE IF NOT EXISTS toll_location_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                toll_location TEXT NOT NULL,
                normalized_location TEXT NOT NULL,
                total_charges DECIMAL(10,2) DEFAULT 0,
                charge_count INTEGER DEFAULT 0,
                average_charge DECIMAL(10,2) DEFAULT 0,
                peak_hours TEXT,
                seasonal_patterns TEXT,
                vehicle_types TEXT,
                first_seen DATETIME,
                last_seen DATETIME,
                month_year TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, normalized_location, month_year)
            )
        `);

        // Vehicle performance analytics
        db.run(`
            CREATE TABLE IF NOT EXISTS vehicle_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                vehicle_plate TEXT NOT NULL,
                period_start DATETIME NOT NULL,
                period_end DATETIME NOT NULL,
                trip_count INTEGER DEFAULT 0,
                total_toll_costs DECIMAL(10,2) DEFAULT 0,
                total_revenue DECIMAL(10,2) DEFAULT 0,
                average_toll_per_trip DECIMAL(10,2) DEFAULT 0,
                utilization_rate DECIMAL(5,2) DEFAULT 0,
                profit_margin DECIMAL(5,2) DEFAULT 0,
                top_toll_locations TEXT,
                performance_score DECIMAL(5,2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES hosts(id),
                UNIQUE(host_id, vehicle_plate, period_start)
            )
        `);

        // Create indexes for better performance - Core Performance Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_trips_host_status ON trips(host_id, trip_status, start_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_trips_plate_dates ON trips(vehicle_plate, start_date, end_date)`);
        
        // Toll charges performance indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_date ON toll_charges(toll_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_trip ON toll_charges(trip_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_transaction ON toll_charges(transaction_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_checksum ON toll_charges(data_checksum)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_account_date ON toll_charges(toll_account_id, toll_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_matched ON toll_charges(is_matched, toll_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_plate_date ON toll_charges(plate_number, toll_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_charges_location ON toll_charges(toll_location, toll_date)`);
        
        // Host-related indexes for multi-tenancy
        db.run(`CREATE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_accounts_host_active ON toll_accounts(host_id, is_active)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_accounts_provider ON toll_accounts(provider, host_id)`);
        
        // Invoice performance indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_trip_status ON invoices(trip_id, status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_status_date ON invoices(status, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_invoice_items_toll ON invoice_items(toll_charge_id)`);
        
        // Transponder mapping indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_transponder_mappings_host ON transponder_mappings(host_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transponder_mappings_transponder ON transponder_mappings(transponder_number)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transponder_mappings_plate ON transponder_mappings(vehicle_plate, host_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transponder_mappings_active ON transponder_mappings(is_active, host_id)`);
        
        // Security and logging indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_security_logs_type ON security_logs(event_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_security_logs_date ON security_logs(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON security_logs(severity, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempt_time)`);
        
        // Data integrity indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_validation_errors_table ON validation_errors(table_name, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_validation_errors_severity ON validation_errors(severity, resolved)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_backup_logs_date ON backup_logs(started_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_backup_logs_type_status ON backup_logs(backup_type, status, started_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_id ON transaction_log(transaction_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_log_table ON transaction_log(table_name, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_data_checkpoints_table ON data_checkpoints(table_name, created_at)`);
        
        // Notification system indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, scheduled_time)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON notification_queue(priority, status, scheduled_time)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_events_type ON notification_events(event_type, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_events_entity ON notification_events(entity_type, entity_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notification_preferences_host ON notification_preferences(host_id)`);

        // Analytics table indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_metrics_host ON analytics_metrics(host_id, metric_type, date_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_metrics_period ON analytics_metrics(period_start, period_end)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_financial_analytics_host ON financial_analytics(host_id, period_type, period_start)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_performance_metrics_host ON performance_metrics(host_id, metric_category, measured_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_bi_reports_host ON bi_reports(host_id, report_type, generated_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_predictive_analytics_host ON predictive_analytics(host_id, prediction_type, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_automated_reports_host ON automated_reports(host_id, report_type, next_scheduled)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_toll_location_analytics_host ON toll_location_analytics(host_id, normalized_location, month_year)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_vehicle_analytics_host ON vehicle_analytics(host_id, vehicle_plate, period_start)`);

        // ML Performance Optimization Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_ml_toll_charges_plate_date ON toll_charges(plate_number, toll_date, is_matched)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ml_trips_vehicle_host ON trips(vehicle_plate, host_id, trip_status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ml_toll_patterns ON toll_charges(trip_id, toll_location, toll_amount, is_matched)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ml_vehicle_usage ON toll_charges(toll_date, is_matched) WHERE is_matched = 1`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ml_unmatched_charges ON toll_charges(toll_account_id, is_matched, toll_date) WHERE is_matched = 0`);

        // Add triggers for data integrity
        db.run(`
            CREATE TRIGGER IF NOT EXISTS update_toll_charges_timestamp 
            AFTER UPDATE ON toll_charges
            FOR EACH ROW 
            BEGIN
                UPDATE toll_charges SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        `);

        db.run(`
            CREATE TRIGGER IF NOT EXISTS update_invoices_timestamp 
            AFTER UPDATE ON invoices
            FOR EACH ROW 
            BEGIN
                UPDATE invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        `);

        // Add date validation trigger
        db.run(`
            CREATE TRIGGER IF NOT EXISTS validate_trip_dates 
            BEFORE INSERT ON trips
            FOR EACH ROW 
            WHEN NEW.start_date >= NEW.end_date
            BEGIN
                SELECT RAISE(ABORT, 'Trip start date must be before end date');
            END
        `);

        console.log('✅ Database initialized successfully with data integrity features');
    });
};

module.exports = {
    db,
    initialize
};