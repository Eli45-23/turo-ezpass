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