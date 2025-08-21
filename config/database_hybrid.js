// Hybrid database configuration - can switch between SQLite and Supabase
const { db: supabaseDb } = require('./supabase');
const sqliteConfig = require('./database');

// Environment variable to control which database to use
const USE_SUPABASE = process.env.USE_SUPABASE === 'true' || process.env.NODE_ENV === 'production';

console.log(`🔗 Database mode: ${USE_SUPABASE ? 'Supabase' : 'SQLite'}`);

// Database abstraction layer
const db = {
    // Configuration
    isSupabase: USE_SUPABASE,
    isSQLite: !USE_SUPABASE,
    
    // Raw clients (for advanced operations)
    supabase: USE_SUPABASE ? supabaseDb : null,
    sqlite: !USE_SUPABASE ? sqliteConfig.db : null,
    
    // Unified query interface
    async query(sql, params = []) {
        if (USE_SUPABASE) {
            throw new Error('Raw SQL queries not supported with Supabase. Use specific methods.');
        } else {
            return new Promise((resolve, reject) => {
                sqliteConfig.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    },
    
    // Table operations
    hosts: {
        async findById(id) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('hosts').select('*').eq('id', id).single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    sqliteConfig.db.get('SELECT * FROM hosts WHERE id = ?', [id], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
            }
        },
        
        async findByEmail(email) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('hosts').select('*').eq('email', email).single();
                if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    sqliteConfig.db.get('SELECT * FROM hosts WHERE email = ?', [email], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
            }
        },
        
        async create(hostData) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('hosts').insert(hostData).select().single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    const { email, full_name, turo_host_id } = hostData;
                    sqliteConfig.db.run(
                        'INSERT INTO hosts (email, full_name, turo_host_id) VALUES (?, ?, ?)',
                        [email, full_name, turo_host_id],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, ...hostData });
                        }
                    );
                });
            }
        }
    },
    
    tollAccounts: {
        async findByHostId(hostId) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('toll_accounts').select('*').eq('host_id', hostId);
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    sqliteConfig.db.all('SELECT * FROM toll_accounts WHERE host_id = ?', [hostId], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            }
        },
        
        async create(accountData) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('toll_accounts').insert(accountData).select().single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    const { host_id, provider, account_number, username, password_encrypted } = accountData;
                    sqliteConfig.db.run(
                        'INSERT INTO toll_accounts (host_id, provider, account_number, username, password_encrypted) VALUES (?, ?, ?, ?, ?)',
                        [host_id, provider, account_number, username, password_encrypted],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, ...accountData });
                        }
                    );
                });
            }
        }
    },
    
    trips: {
        async findByHostId(hostId, options = {}) {
            if (USE_SUPABASE) {
                let query = supabaseDb.from('trips').select('*').eq('host_id', hostId);
                
                if (options.status) {
                    query = query.eq('trip_status', options.status);
                }
                
                if (options.limit) {
                    query = query.limit(options.limit);
                }
                
                if (options.orderBy) {
                    query = query.order(options.orderBy, { ascending: options.ascending !== false });
                }
                
                const { data, error } = await query;
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    let sql = 'SELECT * FROM trips WHERE host_id = ?';
                    const params = [hostId];
                    
                    if (options.status) {
                        sql += ' AND trip_status = ?';
                        params.push(options.status);
                    }
                    
                    if (options.orderBy) {
                        sql += ` ORDER BY ${options.orderBy} ${options.ascending === false ? 'DESC' : 'ASC'}`;
                    }
                    
                    if (options.limit) {
                        sql += ' LIMIT ?';
                        params.push(options.limit);
                    }
                    
                    sqliteConfig.db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            }
        },
        
        async create(tripData) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('trips').insert(tripData).select().single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    const { host_id, turo_trip_id, renter_name, renter_email, vehicle_plate, start_date, end_date } = tripData;
                    sqliteConfig.db.run(
                        'INSERT INTO trips (host_id, turo_trip_id, renter_name, renter_email, vehicle_plate, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [host_id, turo_trip_id, renter_name, renter_email, vehicle_plate, start_date, end_date],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, ...tripData });
                        }
                    );
                });
            }
        }
    },
    
    tollCharges: {
        async findByAccountId(accountId, options = {}) {
            if (USE_SUPABASE) {
                let query = supabaseDb.from('toll_charges').select('*').eq('toll_account_id', accountId);
                
                if (options.matched !== undefined) {
                    query = query.eq('is_matched', options.matched);
                }
                
                if (options.limit) {
                    query = query.limit(options.limit);
                }
                
                const { data, error } = await query;
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    let sql = 'SELECT * FROM toll_charges WHERE toll_account_id = ?';
                    const params = [accountId];
                    
                    if (options.matched !== undefined) {
                        sql += ' AND is_matched = ?';
                        params.push(options.matched ? 1 : 0);
                    }
                    
                    if (options.limit) {
                        sql += ' LIMIT ?';
                        params.push(options.limit);
                    }
                    
                    sqliteConfig.db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            }
        },
        
        async create(chargeData) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('toll_charges').insert(chargeData).select().single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    const { toll_account_id, toll_date, toll_location, toll_amount, plate_number, transaction_id } = chargeData;
                    sqliteConfig.db.run(
                        'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, plate_number, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
                        [toll_account_id, toll_date, toll_location, toll_amount, plate_number, transaction_id],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, ...chargeData });
                        }
                    );
                });
            }
        },
        
        async updateMatching(chargeId, tripId) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('toll_charges')
                    .update({ 
                        trip_id: tripId, 
                        is_matched: true, 
                        match_timestamp: new Date().toISOString() 
                    })
                    .eq('id', chargeId)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    sqliteConfig.db.run(
                        'UPDATE toll_charges SET trip_id = ?, is_matched = 1, match_timestamp = CURRENT_TIMESTAMP WHERE id = ?',
                        [tripId, chargeId],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ changes: this.changes });
                        }
                    );
                });
            }
        }
    },
    
    transponderMappings: {
        async findByHostId(hostId) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('transponder_mappings')
                    .select('*')
                    .eq('host_id', hostId)
                    .eq('is_active', true);
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    sqliteConfig.db.all('SELECT * FROM transponder_mappings WHERE host_id = ? AND is_active = 1', [hostId], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            }
        },
        
        async create(mappingData) {
            if (USE_SUPABASE) {
                const { data, error } = await supabaseDb.from('transponder_mappings').insert(mappingData).select().single();
                if (error) throw error;
                return data;
            } else {
                return new Promise((resolve, reject) => {
                    const { host_id, transponder_number, vehicle_plate, vehicle_description } = mappingData;
                    sqliteConfig.db.run(
                        'INSERT INTO transponder_mappings (host_id, transponder_number, vehicle_plate, vehicle_description) VALUES (?, ?, ?, ?)',
                        [host_id, transponder_number, vehicle_plate, vehicle_description],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, ...mappingData });
                        }
                    );
                });
            }
        }
    },
    
    // Analytics and reporting
    async getHostStats(hostId) {
        if (USE_SUPABASE) {
            // Use Supabase's advanced querying
            const [tripsResult, tollChargesResult, accountsResult] = await Promise.all([
                supabaseDb.from('trips').select('id').eq('host_id', hostId),
                supabaseDb.from('toll_charges')
                    .select('id, toll_amount, is_matched')
                    .in('toll_account_id', 
                        supabaseDb.from('toll_accounts').select('id').eq('host_id', hostId)
                    ),
                supabaseDb.from('toll_accounts').select('id').eq('host_id', hostId)
            ]);
            
            return {
                trips: tripsResult.data?.length || 0,
                tollCharges: tollChargesResult.data?.length || 0,
                matchedCharges: tollChargesResult.data?.filter(c => c.is_matched).length || 0,
                tollAccounts: accountsResult.data?.length || 0,
                totalTollAmount: tollChargesResult.data?.reduce((sum, c) => sum + parseFloat(c.toll_amount), 0) || 0
            };
        } else {
            return new Promise((resolve, reject) => {
                const sql = `
                    SELECT 
                        (SELECT COUNT(*) FROM trips WHERE host_id = ?) as trips,
                        (SELECT COUNT(*) FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE ta.host_id = ?) as toll_charges,
                        (SELECT COUNT(*) FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE ta.host_id = ? AND tc.is_matched = 1) as matched_charges,
                        (SELECT COUNT(*) FROM toll_accounts WHERE host_id = ?) as toll_accounts,
                        (SELECT COALESCE(SUM(tc.toll_amount), 0) FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE ta.host_id = ?) as total_toll_amount
                `;
                sqliteConfig.db.get(sql, [hostId, hostId, hostId, hostId, hostId], (err, row) => {
                    if (err) reject(err);
                    else resolve({
                        trips: row.trips,
                        tollCharges: row.toll_charges,
                        matchedCharges: row.matched_charges,
                        tollAccounts: row.toll_accounts,
                        totalTollAmount: row.total_toll_amount
                    });
                });
            });
        }
    },
    
    // Initialize database (if needed)
    async initialize() {
        if (!USE_SUPABASE) {
            sqliteConfig.initialize();
        }
        // Supabase initialization is handled by the schema setup
    }
};

// Initialize on require
if (!USE_SUPABASE) {
    db.initialize();
}

module.exports = { db, USE_SUPABASE };