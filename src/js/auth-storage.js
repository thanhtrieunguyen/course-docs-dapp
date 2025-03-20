/**
 * Authentication storage utility
 * This utility ensures consistent token storage and retrieval across the app
 */

const AuthStorage = {
    // Store user authentication data
    setAuth(userData) {
        if (!userData || !userData.token) {
            console.error("Invalid user data for auth storage");
            return false;
        }
        
        // Store the complete user object
        localStorage.setItem('userAuth', JSON.stringify({
            ...userData,
            loggedIn: true,
            timestamp: Date.now()
        }));
        
        // Also store the token separately for backward compatibility
        localStorage.setItem('token', userData.token);
        
        return true;
    },
    
    // Get authentication data
    getAuth() {
        try {
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) return null;
            
            return JSON.parse(userAuth);
        } catch (error) {
            console.error("Error parsing auth data:", error);
            this.clearAuth();
            return null;
        }
    },
    
    // Get token
    getToken() {
        // First try to get from userAuth
        const auth = this.getAuth();
        if (auth && auth.token) return auth.token;
        
        // Fall back to separate token
        return localStorage.getItem('token');
    },
    
    // Check if user is authenticated
    isAuthenticated() {
        const token = this.getToken();
        const auth = this.getAuth();
        
        return !!(token && auth && auth.loggedIn);
    },
    
    // Clear authentication data
    clearAuth() {
        localStorage.removeItem('userAuth');
        localStorage.removeItem('token');
    },

    // Validate token with server
    async validateToken() {
        try {
            const token = this.getToken();
            if (!token) return false;
            
            const response = await fetch('http://localhost:3000/api/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) return false;
            
            const data = await response.json();
            return data && data.success && data.user;
        } catch (error) {
            console.error("Token validation error:", error);
            return false;
        }
    }
};

// Make available globally
window.AuthStorage = AuthStorage;
