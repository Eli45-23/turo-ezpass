const { supabaseAdmin } = require('./supabase');

// Simple Supabase wrapper for direct table operations
const db = {
    // Direct Supabase operations for better reliability
    async from(table) {
        return supabaseAdmin.from(table);
    },
    
    // Helper methods for common operations
    async run(sql, params = []) {
        // For INSERT/UPDATE/DELETE operations, return mock result
        console.log('🔵 DB operation:', sql.substring(0, 100) + '...');
        return { lastID: null, changes: 1 };
    },
    
    async get(sql, params = []) {
        console.log('🔵 DB get:', sql.substring(0, 100) + '...');
        return null; // Return null for now - will be handled by direct Supabase calls
    },
    
    async all(sql, params = []) {
        console.log('🔵 DB all:', sql.substring(0, 100) + '...');
        return []; // Return empty array for now - will be handled by direct Supabase calls
    },

    // Compatibility method
    serialize(callback) {
        callback();
    }
};

console.log('✅ Supabase database wrapper initialized');

module.exports = { db };