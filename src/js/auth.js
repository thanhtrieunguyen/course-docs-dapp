const AuthApp = {
    web3Provider: null,
    contracts: {},
    account: null,
    loading: false,
    lastAccountChange: 0, // Thêm biến để debounce sự kiện accountsChanged
    lastChainChange: 0,   // Thêm biến để debounce sự kiện chainChanged

    debugContract: async function () {
        if (!this.contracts.Auth) {
            console.error("Auth contract not initialized");
            return;
        }

        console.log("Contract address:", this.contracts.Auth._address);
        console.log("Available methods:", Object.keys(this.contracts.Auth.methods));

        try {
            const userCount = await this.contracts.Auth.methods.getUserCount().call();
            console.log("User count:", userCount);
        } catch (error) {
            console.error("Error calling getUserCount:", error);
        }
    },

    init: async function () {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                const now = Date.now();
                // Debounce: Chỉ xử lý nếu đã qua 1 giây kể từ lần xử lý trước
                if (now - this.lastAccountChange < 1000) {
                    console.log("Bỏ qua sự kiện accountsChanged do xử lý quá nhanh");
                    return;
                }
                this.lastAccountChange = now;

                console.log('Tài khoản đã thay đổi thành:', accounts[0]);
                if (this.account !== accounts[0]) {
                    this.account = accounts[0];
                    const sensitivePages = ['admin', 'upload'];
                    const currentPath = window.location.pathname;
                    const needsReload = sensitivePages.some(page => currentPath.includes(page));

                    if (needsReload) {
                        window.location.reload();
                    }
                }
            });

            window.ethereum.on('chainChanged', (chainId) => {
                const now = Date.now();
                // Debounce: Chỉ xử lý nếu đã qua 1 giây kể từ lần xử lý trước
                if (now - this.lastChainChange < 1000) {
                    console.log("Bỏ qua sự kiện chainChanged do xử lý quá nhanh");
                    return;
                }
                this.lastChainChange = now;

                console.log('Mạng blockchain đã thay đổi. Đang tải lại trang...');
                window.location.reload();
            });
        }

        return await this.initWeb3();
    },

    initWeb3: async function () {
        try {
            if (window.ethereum) {
                this.web3Provider = window.ethereum;
                try {
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                } catch (error) {
                    console.error("Người dùng từ chối truy cập tài khoản:", error);
                    return false;
                }
            } else if (window.web3) {
                this.web3Provider = window.web3.currentProvider;
            } else {
                this.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
            }
            this.web3 = new Web3(this.web3Provider);
            return await this.initContract();
        } catch (error) {
            console.error("Lỗi khởi tạo Web3:", error);
            return false;
        }
    },

    initContract: async function () {
        try {
            this.contracts = {};
            const response = await fetch('../contracts/Auth.json');
            const authArtifact = await response.json();
            const networkId = await this.web3.eth.net.getId();
            const deployedNetwork = authArtifact.networks[networkId];

            if (!deployedNetwork) {
                console.error(`No deployed network found for network ID: ${networkId}`);
                return false;
            }

            this.contracts.Auth = new this.web3.eth.Contract(
                authArtifact.abi,
                deployedNetwork.address
            );

            console.log("Contract Auth được khởi tạo tại địa chỉ:", deployedNetwork.address);
            return true;
        } catch (error) {
            console.error("Không thể khởi tạo contract:", error);
            return false;
        }
    },

    loadContract: async function () {
        try {
            const response = await fetch('../contracts/Auth.json');
            const authArtifact = await response.json();
            const networkId = await AuthApp.web3.eth.net.getId();
            console.log('Network ID:', networkId);

            const deployedNetwork = authArtifact.networks[networkId];
            if (!deployedNetwork) {
                throw new Error(`Contract not deployed on network ID: ${networkId}. Please check your MetaMask network.`);
            }

            AuthApp.contracts.Auth = new AuthApp.web3.eth.Contract(
                authArtifact.abi,
                deployedNetwork.address
            );

            console.log('Auth contract loaded:', AuthApp.contracts.Auth._address);
            return true;
        } catch (error) {
            console.error('Error loading contract:', error);
            return false;
        }
    },

    connectMetaMask: async function () {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                AuthApp.account = accounts[0];
                console.log("Connected to MetaMask with account:", AuthApp.account);
                return await AuthApp.checkUser();
            } catch (error) {
                console.error('User denied account access:', error);
                alert('You need to connect MetaMask to continue.');
                return false;
            }
        } else {
            alert('MetaMask is required! Please install MetaMask.');
            console.error('MetaMask is required!');
            return false;
        }
    },

    loadAccount: async function () {
        try {
            if (!this.web3) {
                if (window.ethereum) {
                    this.web3 = new Web3(window.ethereum);
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                } else {
                    alert('MetaMask is not installed!');
                    console.error('MetaMask is not installed!');
                    return false;
                }
            }
            const accounts = await this.web3.eth.getAccounts();
            if (accounts.length === 0) {
                console.error("No accounts found");
                return false;
            }
            this.account = accounts[0];
            console.log("Connected account:", this.account);

            const walletAddressElement = document.getElementById('walletAddress');
            if (walletAddressElement) {
                walletAddressElement.textContent = this.account;
            }
            return true;
        } catch (error) {
            console.error("Lỗi khi tải tài khoản:", error);
            return false;
        }
    },

    register: async function (name, email, password, role) {
        try {
            if (!await this.loadAccount()) {
                return { success: false, error: 'Không thể kết nối MetaMask' };
            }
            const isAlreadyRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
            if (isAlreadyRegistered) {
                return { success: false, error: 'Địa chỉ ví này đã được đăng ký' };
            }
    
            // Thêm vai trò 'dean' vào danh sách allowedRoles
            const allowedRoles = ['admin', 'dean', 'teacher', 'student'];
            if (!allowedRoles.includes(role)) {
                return { success: false, error: `Quyền "${role}" không tồn tại trong hệ thống` };
            }
    
            try {
                const apiResponse = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        password,
                        role,
                        address: this.account
                    })
                });
    
                const apiResult = await apiResponse.json();
    
                if (!apiResult.success) {
                    return { success: false, error: apiResult.error || 'Lỗi đăng ký với hệ thống' };
                }
    
                console.log("MongoDB registration successful:", apiResult);
            } catch (dbError) {
                console.error("MongoDB registration error:", dbError);
                return { success: false, error: `Lỗi kết nối với cơ sở dữ liệu: ${dbError.message}` };
            }
    
            const blockchainResult = await this.contracts.Auth.methods
                .register(name, email, password, role)
                .send({ from: this.account, gas: 3000000 });
    
            console.log("Blockchain registration successful:", blockchainResult);
            const userInfo = {
                address: this.account,
                name: name,
                email: email,
                role: role,
                loggedIn: true
            };
    
            localStorage.setItem('userAuth', JSON.stringify(userInfo));
            return { success: true, user: userInfo };
        } catch (error) {
            console.error("Registration error:", error);
            let errorMessage = error.message;
            if (errorMessage.includes("User already registered")) {
                errorMessage = "Địa chỉ ví này đã được đăng ký";
            }
            return { success: false, error: `Lỗi đăng ký: ${errorMessage}` };
        }
    },
    
    debugContract: async function () {
        try {
            console.log("Available methods:",
                Object.keys(AuthApp.contracts.Auth.methods)
                    .filter(key => typeof AuthApp.contracts.Auth.methods[key] === 'function')
            );

            if (AuthApp.contracts.Auth.methods.owner) {
                const owner = await AuthApp.contracts.Auth.methods.owner().call();
                console.log("Contract owner:", owner);
                console.log("Is caller the owner:", owner.toLowerCase() === AuthApp.account.toLowerCase());
            }

            if (AuthApp.contracts.Auth.methods.userCount) {
                const userCount = await AuthApp.contracts.Auth.methods.userCount().call();
                console.log("User count:", userCount);
            }

            return "Debug complete";
        } catch (error) {
            console.error("Debug error:", error);
            return error.message;
        }
    },

    login: async function (password) {
        try {
            this.loading = true;

            if (!await this.loadAccount()) {
                return { success: false, error: 'Không thể kết nối MetaMask', type: 'connection' };
            }

            console.log("Đang thực hiện đăng nhập với tài khoản:", this.account);

            try {
                const isRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
                console.log("Trạng thái đăng ký của ví:", isRegistered);

                if (!isRegistered) {
                    return { success: false, error: 'Địa chỉ ví này chưa đăng ký', type: 'not_registered' };
                }

                try {
                    const apiResponse = await fetch('http://localhost:3000/api/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            address: this.account,
                            password: password
                        })
                    });

                    const apiResult = await apiResponse.json();

                    if (!apiResult.success) {
                        return {
                            success: false,
                            error: apiResult.error || 'Đăng nhập thất bại',
                            type: 'wrong_password'
                        };
                    }

                    console.log("MongoDB login successful:", apiResult);

                    const blockchainResult = await this.contracts.Auth.methods.login(password).call({
                        from: this.account
                    });

                    console.log("Blockchain login result:", blockchainResult);

                    if (!blockchainResult) {
                        return {
                            success: false,
                            error: 'Mật khẩu không chính xác hoặc dữ liệu blockchain không đồng bộ',
                            type: 'wrong_password'
                        };
                    }

                    const userData = apiResult.user;

                    console.log("User data retrieved:", userData);

                    const userInfo = {
                        address: this.account,
                        name: userData.name,
                        email: userData.email,
                        role: userData.role,
                        token: apiResult.token,
                        loggedIn: true,
                        timestamp: Date.now()
                    };

                    localStorage.setItem('userAuth', JSON.stringify(userInfo));
                    return { success: true, user: userInfo };
                } catch (dbError) {
                    console.error("MongoDB login error:", dbError);
                    return {
                        success: false,
                        error: `Lỗi kết nối với cơ sở dữ liệu: ${dbError.message}`,
                        type: 'system_error'
                    };
                }
            } catch (error) {
                console.error("Blockchain login error:", error);
                let errorMessage = error.message;
                return { success: false, error: `Lỗi đăng nhập blockchain: ${errorMessage}` };
            }
        } catch (error) {
            console.error("Login error:", error);
            return {
                success: false,
                error: `Lỗi hệ thống: ${error.message}`,
                type: 'system_error'
            };
        } finally {
            this.loading = false;
        }
    },
hasRole: async function (role) {
        try {
            // Kiểm tra tài khoản trước
            if (!this.account) {
                await this.loadAccount();
                if (!this.account) {
                    console.error("Không thể tải tài khoản để kiểm tra vai trò");
                    return false;
                }
            }

            // Kiểm tra contract
            if (!this.contracts.Auth) {
                await this.initContract();
                if (!this.contracts.Auth) {
                    console.error("Không thể khởi tạo contract để kiểm tra vai trò");
                    return false;
                }
            }

            // Lấy thông tin từ localStorage
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                console.error("Không tìm thấy userAuth trong localStorage");
                return false;
            }

            const user = JSON.parse(userAuth);
            if (!user.role) {
                console.error("Không tìm thấy vai trò trong userAuth");
                return false;
            }

            // Kiểm tra vai trò từ localStorage trước
            if (user.role === role) {
                // Xác nhận với blockchain để đảm bảo tính chính xác
                try {
                    const blockchainRole = await this.contracts.Auth.methods.getUserRole(this.account).call();
                    console.log(`Vai trò từ blockchain: ${blockchainRole}, vai trò cần kiểm tra: ${role}`);
                    return blockchainRole === role;
                } catch (error) {
                    console.error(`Lỗi khi xác thực vai trò ${role} với blockchain:`, error);
                    // Nếu blockchain thất bại, tin tưởng localStorage
                    return user.role === role;
                }
            }

            return false;
        } catch (error) {
            console.error(`Lỗi khi kiểm tra vai trò ${role}:`, error);
            return false;
        }
    },
    checkLoginStatus: async function () {
        try {
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                return { loggedIn: false };
            }

            const user = JSON.parse(userAuth);
            
            if (!user.token) {
                localStorage.removeItem('userAuth');
                return { loggedIn: false, error: 'Token không hợp lệ' };
            }
            
            const now = Date.now();
            const loginTime = user.timestamp || 0;
            const sessionLength = 24 * 60 * 60 * 1000; // 24 giờ
            
            if (now - loginTime > sessionLength) {
                localStorage.removeItem('userAuth');
                return { loggedIn: false, error: 'Phiên đăng nhập đã hết hạn' };
            }

            if (!await this.loadAccount()) {
                return { loggedIn: false, error: 'Không thể kết nối với MetaMask' };
            }

            if (!this.account) {
                console.log("Đang chờ kết nối MetaMask...");
                return { loggedIn: true, user: user };
            }

            if (user.address.toLowerCase() !== this.account.toLowerCase()) {
                console.log("Địa chỉ ví đã thay đổi. Đăng xuất...");
                localStorage.removeItem('userAuth');
                return {
                    loggedIn: false,
                    error: 'Địa chỉ ví đã thay đổi. Vui lòng đăng nhập lại.'
                };
            }

            user.timestamp = Date.now();
            localStorage.setItem('userAuth', JSON.stringify(user));

            return {
                loggedIn: true,
                user: user
            };
        } catch (error) {
            console.error("Lỗi khi kiểm tra trạng thái đăng nhập:", error);
            return { loggedIn: false, error: error.message };
        }
    },

    isAdmin: async function () {
        try {
            if (!this.account) {
                await this.loadAccount();
                if (!this.account) return false;
            }

            if (!this.contracts.Auth) {
                await this.initContract();
            }

            const userAuth = localStorage.getItem('userAuth');
            if (userAuth) {
                const user = JSON.parse(userAuth);
                if (user.role === 'admin') {
                    try {
                        const role = await this.contracts.Auth.methods.getUserRole(this.account).call();
                        return role === 'admin';
                    } catch (error) {
                        console.error("Lỗi khi xác thực vai trò với blockchain:", error);
                        return false;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error("Lỗi khi kiểm tra vai trò admin:", error);
            return false;
        }
    },

    checkWalletExists: async function () {
        try {
            if (!AuthApp.account) {
                await this.loadAccount();
                if (!AuthApp.account) {
                    return { success: false, error: 'Could not connect to wallet' };
                }
            }

            const response = await fetch('http://localhost:3000/api/verify-wallet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address: AuthApp.account })
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Error checking wallet:", error);
            return { success: false, error: error.message };
        }
    },

    logout: function () {
        localStorage.removeItem('userAuth');
        console.log("userAuth từ localStorage:", localStorage.getItem('userAuth'));
        window.location.href = "../login.html";
        return true;
    },

    checkRegistrationStatus: async function () {
        try {
            if (!AuthApp.account) {
                return { registered: false, error: 'Wallet not connected' };
            }

            if (!this.contracts.Auth) {
                console.error("Auth contract not initialized");
                return { registered: false, error: 'Contract not initialized' };
            }

            console.log("Available methods:", Object.keys(this.contracts.Auth.methods));

            const isRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
            console.log("Registration result:", isRegistered);

            if (isRegistered) {
                try {
                    const user = await this.contracts.Auth.methods.users(this.account).call();
                    const role = await this.contracts.Auth.methods.getUserRole(this.account).call();

                    return {
                        registered: true,
                        userData: {
                            name: user.name,
                            email: user.email,
                            role: role
                        }
                    };
                } catch (error) {
                    console.error("Lỗi khi lấy thông tin người dùng:", error);
                    return { registered: true };
                }
            }

            return { registered: isRegistered };
        } catch (error) {
            console.error("Lỗi khi kiểm tra trạng thái đăng ký:", error);
            return { registered: false, error: error.message };
        }
    },

    verifyContractConnection: async function () {
        try {
            if (!this.contracts.Auth) {
                return { success: false, error: 'Auth contract not initialized' };
            }

            await this.contracts.Auth.methods.getUserCount().call();
            return { success: true };
        } catch (error) {
            console.error("Contract connectivity error:", error);
            return { success: false, error: error.message };
        }
    },

    checkUser: async function () {
        if (!AuthApp.contracts.Auth || !AuthApp.account) {
            return false;
        }

        try {
            const user = await AuthApp.contracts.Auth.methods
                .users(AuthApp.account)
                .call();
            return user.isRegistered;
        } catch (error) {
            console.error("Error checking user:", error);
            return false;
        }
    }
};

window.addEventListener('load', function () {
    AuthApp.init();
});