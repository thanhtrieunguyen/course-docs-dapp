document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Checking login status...");
        
        // Thêm cờ để phát hiện vòng lặp tải lại trang
        const reloadCount = sessionStorage.getItem('reloadCount') || 0;
        sessionStorage.setItem('reloadCount', parseInt(reloadCount) + 1);
        console.log(`Trang đã tải ${parseInt(reloadCount) + 1} lần`);
        
        // Nếu đã tải quá nhiều lần, tạm dừng kiểm tra đăng nhập
        if (parseInt(reloadCount) > 5) {
            console.log("Phát hiện tải lại quá nhiều lần, tạm dừng kiểm tra đăng nhập");
            sessionStorage.removeItem('reloadCount');
            return; // Dừng lại để tránh vòng lặp vô hạn
        }
        
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
        
        // Validate token with server if needed
        try {
            const response = await fetch('http://localhost:3000/api/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${user.token}`
                }
            });

            if (!response.ok) {
                console.log("Token validation failed on server:", response.status);
                localStorage.removeItem('userAuth');
                localStorage.removeItem('token');
                redirectToLogin();
                return;
            }

            // Success - update token expiration
            const userData = await response.json();
            if (userData && userData.success && userData.user) {
                // Update the stored user data with fresh data from server
                const updatedUser = {
                    ...user,
                    ...userData.user,
                    timestamp: Date.now() // Refresh the timestamp
                };
                localStorage.setItem('userAuth', JSON.stringify(updatedUser));
                localStorage.setItem('token', user.token); // Ensure token is also stored separately
            }
            
            console.log("Thông tin đăng nhập hợp lệ, tiếp tục khởi tạo AuthApp");
        } catch (error) {
            console.error("Error during token validation:", error);
            // Không redirect khi lỗi kết nối API để tránh vòng lặp
            console.log("Bỏ qua lỗi API và tiếp tục với thông tin hiện có");
        }
        
        // Khởi tạo Auth App nhưng bỏ qua các event listener có thể gây vòng lặp
        if (!window.authAppInitialized) {
            await initAuthAppSafely();
        }
        
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
                localStorage.removeItem('userAuth');
                localStorage.removeItem('token');
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

        // Đặt lại bộ đếm reload sau khi mọi thứ đã ổn
        sessionStorage.removeItem('reloadCount');
        
    } catch (error) {
        console.error("Lỗi khi kiểm tra đăng nhập:", error);
        alert("Đã xảy ra lỗi khi kiểm tra đăng nhập: " + error.message);
        redirectToLogin();
    }
});

// Hàm khởi tạo AuthApp an toàn hơn
async function initAuthAppSafely() {
    try {
        window.authAppInitialized = true;
        
        // Khởi tạo Web3 mà không gắn các event listener
        if (!AuthApp.web3) {
            try {
                if (window.ethereum) {
                    AuthApp.web3Provider = window.ethereum;
                    try {
                        await window.ethereum.request({ method: 'eth_requestAccounts' });
                    } catch (error) {
                        console.error("User denied account access");
                        return false;
                    }
                } else if (window.web3) {
                    AuthApp.web3Provider = window.web3.currentProvider;
                } else {
                    AuthApp.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
                }
                
                AuthApp.web3 = new Web3(AuthApp.web3Provider);
                
                // Khởi tạo contract
                const response = await fetch('../contracts/Auth.json');
                const authArtifact = await response.json();
                
                const networkId = await AuthApp.web3.eth.net.getId();
                const deployedNetwork = authArtifact.networks[networkId];
                
                if (!deployedNetwork) {
                    console.error(`Không tìm thấy contract trên network ID: ${networkId}`);
                    return false;
                }
                
                AuthApp.contracts.Auth = new AuthApp.web3.eth.Contract(
                    authArtifact.abi,
                    deployedNetwork.address
                );
                
                // Lấy tài khoản hiện tại
                const accounts = await AuthApp.web3.eth.getAccounts();
                if (accounts.length > 0) {
                    AuthApp.account = accounts[0];
                }
                
                console.log("Khởi tạo AuthApp an toàn thành công");
                return true;
            } catch (error) {
                console.error("Lỗi khởi tạo AuthApp:", error);
                return false;
            }
        }
    } catch (error) {
        console.error("Lỗi trong initAuthAppSafely:", error);
        return false;
    }
}

let redirecting = false;

function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    
    // Store current page for redirect after login
    if (window.location.pathname !== '/login.html') {
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
    }
    
    window.location.href = "login.html";
}

// Hàm dịch vai trò sang tiếng Việt
function translateRole(role) {
    const roles = {
        'admin': 'Quản trị viên',
        'teacher': 'Giảng viên',
        'student': 'Học viên',
        'dean': 'Trưởng khoa',
    };
    
    return roles[role] || role;
}