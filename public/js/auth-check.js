// Authentication check for protected pages
// This script should be included in all pages that require authentication

(function() {
    'use strict';
    
    // Check if user is authenticated when page loads
    async function checkAuth() {
        try {
            // First try to get stored auth data
            const storedSession = localStorage.getItem('supabase_session');
            const storedToken = localStorage.getItem('supabase_token');
            
            let headers = {
                'Content-Type': 'application/json'
            };
            
            // Add Authorization header if we have a token
            if (storedToken) {
                headers['Authorization'] = `Bearer ${storedToken}`;
            }
            
            const response = await fetch('/api/auth/status', {
                method: 'GET',
                credentials: 'include',
                headers
            });
            
            const data = await response.json();
            
            if (!data.success || !data.authenticated) {
                console.log('❌ User not authenticated, redirecting to login');
                
                // Clear any stale auth data
                localStorage.removeItem('supabase_session');
                localStorage.removeItem('supabase_token');
                
                // Redirect to login page
                window.location.href = '/';
                return false;
            }
            
            console.log('✅ User authenticated:', data.host);
            
            // Store user info globally for dashboard and other components
            window.currentUser = data.host;
            
            return true;
            
        } catch (error) {
            console.error('❌ Auth check failed:', error);
            
            // Clear any stale auth data
            localStorage.removeItem('supabase_session');
            localStorage.removeItem('supabase_token');
            
            // Redirect to login page
            window.location.href = '/';
            return false;
        }
    }
    
    // Run auth check when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAuth);
    } else {
        checkAuth();
    }
    
    // Export for other scripts to use
    window.authCheck = checkAuth;
})();