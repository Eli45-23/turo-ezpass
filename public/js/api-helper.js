// API Helper for authenticated requests
// This helper automatically includes Supabase JWT tokens in requests

window.apiHelper = {
    // Make an authenticated API request
    async fetchAuth(url, options = {}) {
        const storedToken = localStorage.getItem('supabase_token');
        
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