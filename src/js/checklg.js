document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Checking login status...");
        
        // Kiểm tra thông tin trong localStorage trước
        const userAuth = localStorage.getItem('userAuth');
        if (!userAuth) {
            console.log("Không tìm thấy thông tin đăng nhập");
            redirectToLogin();
            return;
        }
        
        // Parse userData
        const user = JSON.parse(userAuth);
        if (!user || !user.loggedIn) {
            console.log("Thông tin đăng nhập không hợp lệ");
            redirectToLogin();
            return;
        }
        
        // Kiểm tra token
        if (!user.token) {
            console.log("Token không tồn tại");
            redirectToLogin();
            return;
        }
        
        // Kiểm tra thời hạn phiên đăng nhập
        const now = Date.now();
        const loginTime = user.timestamp || 0;
        const sessionLength = 24 * 60 * 60 * 1000; // 24 giờ
        
        if (now - loginTime > sessionLength) {
            console.log("Phiên đăng nhập đã hết hạn");
            localStorage.removeItem('userAuth');
            redirectToLogin();
            return;
        }
        
        console.log("Thông tin đăng nhập hợp lệ, tiếp tục khởi tạo AuthApp");
        
        // Khởi tạo Auth App và kiểm tra với blockchain
        await AuthApp.init();
        
        // Kiểm tra trạng thái đăng nhập với blockchain
        const loginStatus = await AuthApp.checkLoginStatus();
        
        if (!loginStatus.loggedIn) {
            console.log("Không còn đăng nhập trên blockchain:", loginStatus.error);
            redirectToLogin();
            return;
        }
        
        console.log("Đăng nhập hợp lệ, hiển thị thông tin người dùng");
        
        // Hiển thị thông tin người dùng đã đăng nhập
        if (document.getElementById('userInfo')) {
            document.getElementById('userInfo').innerHTML = `
                <div class="user-welcome">
                    <p>Xin chào, <strong>${user.name}</strong> (${translateRole(user.role)})</p>
                    <p class="text-muted small">${user.address}</p>
                </div>
            `;
        }
        
        // Cập nhật timestamp để kéo dài phiên đăng nhập
        user.timestamp = Date.now();
        localStorage.setItem('userAuth', JSON.stringify(user));
        
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
        redirectToLogin();
    }
});

function redirectToLogin() {
    // Lưu URL hiện tại để sau khi đăng nhập có thể quay lại
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'login.html' && currentPage !== 'register.html') {
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
    }
    window.location.href = "login.html";
}

// Hàm dịch vai trò sang tiếng Việt
function translateRole(role) {
    const roles = {
        'admin': 'Quản trị viên',
        'teacher': 'Giảng viên',
        'student': 'Học viên'
    };
    
    return roles[role] || role;
}