document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Khởi tạo Auth App
        await AuthApp.init();
        
        // Kiểm tra trạng thái đăng nhập
        const loginStatus = await AuthApp.checkLoginStatus();
        
        if (!loginStatus.loggedIn) {
            // Người dùng chưa đăng nhập, chuyển hướng đến trang đăng nhập
            alert("Bạn cần đăng nhập để truy cập trang này!");
            window.location.href = "login.html";
            return;
        }
        
        // Hiển thị thông tin người dùng đã đăng nhập
        const user = loginStatus.user;
        if (document.getElementById('userInfo')) {
            document.getElementById('userInfo').innerHTML = `
                <div class="user-welcome">
                    <p>Xin chào, <strong>${user.name}</strong> (${translateRole(user.role)})</p>
                    <p class="text-muted small">${user.address}</p>
                </div>
            `;
        }
        
        // Xử lý nút đăng xuất
        document.querySelectorAll('.logout-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                AuthApp.logout();
                window.location.href = "login.html";
            });
        });
        
        // Kiểm tra quyền truy cập
        const requiredRole = document.body.dataset.requiredRole;
        if (requiredRole && user.role !== requiredRole) {
            alert(`Bạn không có quyền truy cập trang này. Yêu cầu quyền: ${translateRole(requiredRole)}`);
            window.location.href = "dashboard.html";
            return;
        }
        
    } catch (error) {
        console.error("Lỗi khi kiểm tra đăng nhập:", error);
        alert("Đã xảy ra lỗi khi kiểm tra đăng nhập: " + error.message);
        window.location.href = "login.html";
    }
});

// Hàm dịch vai trò sang tiếng Việt
function translateRole(role) {
    const roles = {
        'admin': 'Quản trị viên',
        'teacher': 'Giảng viên',
        'student': 'Học viên'
    };
    
    return roles[role] || role;
}