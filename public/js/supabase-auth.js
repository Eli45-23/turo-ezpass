// Supabase Authentication Helper for Frontend
// This file handles both SQLite sessions and Supabase JWT tokens

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.session = null;
        this.isSupabase = false;
        this.token = null;
        
        // Try to detect if we're using Supabase by checking if auth returns JWT-style responses
        this.detectAuthMode();
        
        // Auto-restore session on page load
        this.restoreSession();
    }
    
    async detectAuthMode() {
        try {
            const response = await fetch('/api/auth/status', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await response.json();
            
            // If the response includes a token or session object, we're using Supabase
            this.isSupabase = data.session || data.access_token || false;
        } catch (error) {
            console.warn('Could not detect auth mode:', error);
        }
    }
    
    async restoreSession() {
        // Try to get session from storage with universal compatibility
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
        } catch (error) {
            console.warn('⚠️ Session restoration failed:', error);
        }
        
        if (storedSession) {
            try {
                this.session = JSON.parse(storedSession);
                this.token = storedToken;
                this.currentUser = this.session.user;
                return true;
            } catch (error) {
                console.warn('Could not restore Supabase session:', error);
                localStorage.removeItem('supabase_session');
                localStorage.removeItem('supabase_token');
            }
        }
        
        // Fallback: check server-side session
        return await this.checkAuthentication();
    }
    
    async checkAuthentication() {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // Add Authorization header if we have a token
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }
            
            const response = await fetch('/api/auth/status', {
                method: 'GET',
                credentials: 'include',
                headers
            });
            
            const data = await response.json();
            
            if (data.success && data.authenticated) {
                this.currentUser = data.host;
                if (data.session) {
                    this.session = data.session;
                    this.token = data.session.access_token;
                    this.saveSession();
                }
                return true;
            } else {
                this.clearSession();
                return false;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            this.clearSession();
            return false;
        }
    }
    
    async signup(email, password, fullName, turoHostId) {
        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password,
                    fullName,
                    turoHostId
                }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentUser = data.host;
                
                if (data.session) {
                    this.session = data.session;
                    this.token = data.session.access_token;
                    this.saveSession();
                }
                
                return { success: true, user: data.host, session: data.session };
            } else {
                throw new Error(data.error || 'Signup failed');
            }
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    }
    
    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password
                }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentUser = data.host;
                
                if (data.session) {
                    this.session = data.session;
                    this.token = data.session.access_token;
                    this.saveSession();
                }
                
                return { success: true, user: data.host, session: data.session };
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }
    
    async logout() {
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }
            
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                headers,
                credentials: 'include'
            });
            
            const data = await response.json();
            this.clearSession();
            
            return data.success;
        } catch (error) {
            console.error('Logout error:', error);
            this.clearSession();
            return false;
        }
    }
    
    saveSession() {
        if (this.session) {
            try {
                if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                    localStorage.setItem('supabase_session', JSON.stringify(this.session));
                }
                if (typeof sessionStorage !== 'undefined' && sessionStorage.setItem) {
                    sessionStorage.setItem('supabase_session', JSON.stringify(this.session));
                }
            } catch (error) {
                console.warn('⚠️ Session storage failed:', error);
            }
        }
        if (this.token) {
            // Use universal token storage from api-helper if available
            if (window.apiHelper && window.apiHelper.tokenStorage) {
                window.apiHelper.tokenStorage.setToken(this.token);
            } else {
                // Fallback to direct localStorage
                try {
                    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                        localStorage.setItem('supabase_token', this.token);
                    }
                } catch (error) {
                    console.warn('⚠️ Token storage fallback failed:', error);
                }
            }
        }
    }
    
    clearSession() {
        this.currentUser = null;
        this.session = null;
        this.token = null;
        
        // Use universal token storage clearing if available
        if (window.apiHelper && window.apiHelper.tokenStorage) {
            window.apiHelper.tokenStorage.clearToken();
        }
        
        // Clear ALL localStorage/sessionStorage to prevent data leakage
        try {
            if (typeof localStorage !== 'undefined' && localStorage.clear) {
                localStorage.clear();
            }
            if (typeof sessionStorage !== 'undefined' && sessionStorage.clear) {
                sessionStorage.clear();
            }
        } catch (error) {
            console.warn('⚠️ Storage clearing failed:', error);
        }
        
        // Clear any cached data
        if (window.caches) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                });
            });
        }
        
        // Clear any global state objects
        if (window.userStore) window.userStore = null;
        if (window.sessionData) window.sessionData = null;
        if (window.cachedData) window.cachedData = null;
        
        console.log('🧽 Session cleared completely - all caches and storage cleared');
    }
    
    getUser() {
        return this.currentUser;
    }
    
    getToken() {
        return this.token;
    }
    
    isAuthenticated() {
        return !!this.currentUser;
    }
    
    // Helper method for making authenticated requests
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();

// Helper functions for backward compatibility
window.checkAuthentication = () => window.authManager.checkAuthentication();
window.getCurrentUser = () => window.authManager.getUser();
window.isAuthenticated = () => window.authManager.isAuthenticated();