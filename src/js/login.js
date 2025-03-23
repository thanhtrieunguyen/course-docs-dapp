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
                role: data.user.role, // Vai trò 'dean' sẽ được lưu nếu API trả về
                address: data.user.address
            });
        } else {
            // Fallback if AuthStorage is not available
            localStorage.setItem('userAuth', JSON.stringify({
                token: data.token,
                name: data.user.name,
                email: data.user.email,
                role: data.user.role, // Vai trò 'dean' sẽ được lưu nếu API trả về
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
        console.error("Đăng nhập thất bại:", data.error || 'Lỗi không xác định');
        // Hiển thị thông báo lỗi cho người dùng (tùy thuộc vào giao diện của bạn)
        alert(data.error || 'Đăng nhập thất bại. Vui lòng thử lại.');
    }
}