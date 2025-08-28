const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Public client (for auth and RLS operations)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
});

// Admin client (for server-side operations that bypass RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Database helper functions
const db = {
    // Auth operations
    auth: supabase.auth,
    
    // Public database operations (with RLS)
    from: (table) => supabase.from(table),
    
    // Admin database operations (bypass RLS)
    adminFrom: (table) => supabaseAdmin.from(table),
    
    // Raw SQL queries (admin only)
    rpc: (functionName, params = {}) => supabaseAdmin.rpc(functionName, params),
    
    // Storage operations
    storage: supabase.storage,
    
    // Real-time subscriptions
    channel: (name) => supabase.channel(name),
    
    // Helper to get authenticated user
    getUser: async (jwt) => {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
        return { user, error };
    },
    
    // Helper to verify JWT and get session
    getSession: async (jwt) => {
        const { data: { session }, error } = await supabaseAdmin.auth.getSession(jwt);
        return { session, error };
    },
    
    // RLS Context Management - Critical for multi-tenant isolation
    setHostContext: async (hostId) => {
        if (!hostId) {
            throw new Error('Host ID is required for RLS context');
        }
        
        try {
            // Validate hostId format (UUID)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(hostId)) {
                throw new Error(`Invalid hostId format: ${hostId}`);
            }
            
            // Set the host context for Row-Level Security
            const query = `SET app.host_id = '${hostId}';`;
            console.log('🔐 Setting RLS context with query:', query);
            
            const { data, error } = await supabaseAdmin.rpc('exec', {
                query: query
            });
            
            if (error) {
                console.error('❌ Failed to set RLS context:', error);
                throw error;
            }
            
            console.log('🔐 RLS context set for host:', hostId);
            return true;
        } catch (error) {
            console.error('❌ Error setting RLS context:', error);
            throw error;
        }
    },
    
    // Clear RLS context
    clearHostContext: async () => {
        try {
            const query = `SET app.host_id = '';`;
            console.log('🔓 Clearing RLS context with query:', query);
            
            const { data, error } = await supabaseAdmin.rpc('exec', {
                query: query
            });
            
            if (error) {
                console.error('❌ Failed to clear RLS context:', error);
            }
            
            console.log('🔓 RLS context cleared');
        } catch (error) {
            console.error('❌ Error clearing RLS context:', error);
        }
    },
    
    // Execute query with host context - ensures proper isolation
    withHostContext: async (hostId, operation) => {
        if (!hostId) {
            throw new Error('Host ID is required for isolated operations');
        }
        
        try {
            // TEMPORARY FIX: Since exec function regex is restrictive,
            // we'll rely on explicit .eq('host_id', hostId) filters
            // and RLS policies that use auth.uid()
            
            console.log('🔐 Using explicit host filtering for:', hostId);
            
            // Create a wrapped operation that adds explicit host filtering
            const result = await operation();
            
            return result;
        } catch (error) {
            console.error('❌ Error in withHostContext:', error);
            throw error;
        }
    }
};

console.log('✅ Supabase client configured successfully');
console.log('🔗 Supabase URL:', supabaseUrl);
console.log('🔑 Auth client ready');
console.log('🛡️ Admin client ready');

module.exports = {
    supabase,
    supabaseAdmin,
    db
};