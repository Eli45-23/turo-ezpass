// Authentication check for protected pages
// This script should be included in all pages that require authentication

(function() {
    'use strict';
    
    // Check if user is authenticated when page loads
    async function checkAuth() {
        try {
            // Get stored auth data using universal compatibility
            let storedSession = null;
            let storedToken = null;
            
            try {
                // Try localStorage first
                if (typeof localStorage !== 'undefined' && localStorage.getItem) {
                    storedSession = localStorage.getItem('supabase_session');
                }
                
                // If no session found, try sessionStorage
                if (!storedSession && typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
                    storedSession = sessionStorage.getItem('supabase_session');
                }
                
                // Get token using universal storage
                if (window.apiHelper && window.apiHelper.tokenStorage) {
                    storedToken = window.apiHelper.tokenStorage.getToken();
                } else {
                    // Fallback to direct localStorage
                    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
                        storedToken = localStorage.getItem('supabase_token');
                    }
                }
            } catch (storageError) {
                console.warn('⚠️ Storage access failed:', storageError);
            }
            
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
                
                // Clear any stale auth data using universal method
                try {
                    if (window.apiHelper && window.apiHelper.tokenStorage) {
                        window.apiHelper.tokenStorage.clearToken();
                    }
                    if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
                        localStorage.removeItem('supabase_session');
                        localStorage.removeItem('supabase_token');
                    }
                    if (typeof sessionStorage !== 'undefined' && sessionStorage.removeItem) {
                        sessionStorage.removeItem('supabase_session');
                    }
                } catch (clearError) {
                    console.warn('⚠️ Storage clearing failed:', clearError);
                }
                
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
            
            // Clear any stale auth data using universal method
            try {
                if (window.apiHelper && window.apiHelper.tokenStorage) {
                    window.apiHelper.tokenStorage.clearToken();
                }
                if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
                    localStorage.removeItem('supabase_session');
                    localStorage.removeItem('supabase_token');
                }
                if (typeof sessionStorage !== 'undefined' && sessionStorage.removeItem) {
                    sessionStorage.removeItem('supabase_session');
                }
            } catch (clearError) {
                console.warn('⚠️ Storage clearing failed:', clearError);
            }
            
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