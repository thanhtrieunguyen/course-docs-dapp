// ...existing code...

// After successful login response:
if (response.ok) {
    const data = await response.json();
    if (data.success) {
        // Use consistent auth storage
        if (window.AuthStorage) {
            window.AuthStorage.setAuth({
                token: data.token,
                name: data.user.name,
                email: data.user.email,
                role: data.user.role,
                address: data.user.address
            });
        } else {
            // Fallback if AuthStorage is not available
            localStorage.setItem('userAuth', JSON.stringify({
                token: data.token,
                name: data.user.name,
                email: data.user.email,
                role: data.user.role,
                address: data.user.address,
                loggedIn: true,
                timestamp: Date.now()
            }));
            localStorage.setItem('token', data.token);
        }
        
        // Redirect to dashboard or home page
        window.location.href = 'index.html';
    } else {
        // Handle login error
        // ...existing code...
    }
}
// ...existing code...