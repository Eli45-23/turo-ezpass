// API Helper for authenticated requests
// This helper automatically includes Supabase JWT tokens in requests

window.apiHelper = {
    // Universal token storage and retrieval
    tokenStorage: {
        // Get token using multiple fallback methods
        getToken() {
            try {
                // Try localStorage first (primary method)
                if (typeof localStorage !== 'undefined' && localStorage.getItem) {
                    const token = localStorage.getItem('supabase_token');
                    if (token) return token;
                }
                
                // Fallback 1: Try sessionStorage
                if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
                    const token = sessionStorage.getItem('supabase_token');
                    if (token) return token;
                }
                
                // Fallback 2: Try cookie storage
                const token = this.getTokenFromCookie();
                if (token) return token;
                
                // Fallback 3: Try memory storage
                if (window._supabaseToken) {
                    return window._supabaseToken;
                }
                
                return null;
            } catch (error) {
                console.warn('⚠️ Token retrieval failed:', error);
                return null;
            }
        },
        
        // Set token using multiple methods for maximum compatibility
        setToken(token) {
            if (!token) return;
            
            try {
                // Primary: localStorage
                if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                    localStorage.setItem('supabase_token', token);
                }
                
                // Backup 1: sessionStorage
                if (typeof sessionStorage !== 'undefined' && sessionStorage.setItem) {
                    sessionStorage.setItem('supabase_token', token);
                }
                
                // Backup 2: Cookie storage (with secure settings)
                this.setTokenInCookie(token);
                
                // Backup 3: Memory storage
                window._supabaseToken = token;
                
                console.log('✅ Token stored using universal storage methods');
            } catch (error) {
                console.warn('⚠️ Token storage failed:', error);
            }
        },
        
        // Get token from cookies
        getTokenFromCookie() {
            if (typeof document === 'undefined') return null;
            
            try {
                const name = 'supabase_token=';
                const decodedCookie = decodeURIComponent(document.cookie);
                const ca = decodedCookie.split(';');
                
                for (let i = 0; i < ca.length; i++) {
                    let c = ca[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf(name) === 0) {
                        return c.substring(name.length, c.length);
                    }
                }
            } catch (error) {
                console.warn('⚠️ Cookie token retrieval failed:', error);
            }
            
            return null;
        },
        
        // Set token in cookies with security settings
        setTokenInCookie(token) {
            if (typeof document === 'undefined' || !token) return;
            
            try {
                // Set cookie with security settings but still accessible by JS
                const expirationDays = 7;
                const date = new Date();
                date.setTime(date.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
                const expires = "; expires=" + date.toUTCString();
                
                // Use SameSite=Lax for better cross-origin compatibility
                document.cookie = `supabase_token=${token}${expires}; path=/; SameSite=Lax`;
            } catch (error) {
                console.warn('⚠️ Cookie token storage failed:', error);
            }
        },
        
        // Clear all token storage
        clearToken() {
            try {
                // Clear localStorage
                if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
                    localStorage.removeItem('supabase_token');
                }
                
                // Clear sessionStorage
                if (typeof sessionStorage !== 'undefined' && sessionStorage.removeItem) {
                    sessionStorage.removeItem('supabase_token');
                }
                
                // Clear cookie
                if (typeof document !== 'undefined') {
                    document.cookie = 'supabase_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                }
                
                // Clear memory
                if (window._supabaseToken) {
                    delete window._supabaseToken;
                }
            } catch (error) {
                console.warn('⚠️ Token clearing failed:', error);
            }
        }
    },
    
    // Make an authenticated API request
    async fetchAuth(url, options = {}) {
        const storedToken = this.tokenStorage.getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        // Include JWT token if available
        if (storedToken) {
            headers['Authorization'] = `Bearer ${storedToken}`;
        }
        
        return fetch(url, {
            credentials: 'include',
            ...options,
            headers
        });
    },
    
    // POST with authentication
    async postAuth(url, data, options = {}) {
        return this.fetchAuth(url, {
            method: 'POST',
            body: typeof data === 'string' ? data : JSON.stringify(data),
            ...options
        });
    },
    
    // GET with authentication
    async getAuth(url, options = {}) {
        return this.fetchAuth(url, {
            method: 'GET',
            ...options
        });
    }
};