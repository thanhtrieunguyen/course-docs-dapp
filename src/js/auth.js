const AuthApp = {
    web3Provider: null,
    contracts: {},
    account: null,
    loading: false,

    debugContract: async function () {
        if (!this.contracts.Auth) {
            console.error("Auth contract not initialized");
            return;
        }

        console.log("Contract address:", this.contracts.Auth._address);
        console.log("Available methods:", Object.keys(this.contracts.Auth.methods));

        // Try to call a simple view function
        try {
            const userCount = await this.contracts.Auth.methods.getUserCount().call();
            console.log("User count:", userCount);
        } catch (error) {
            console.error("Error calling getUserCount:", error);
        }
    },

    init: async function () {
        // Thêm listener cho sự thay đổi tài khoản MetaMask
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', function (accounts) {
                console.log('Tài khoản đã thay đổi thành:', accounts[0]);
                // Tải lại trang để cập nhật trạng thái ứng dụng với tài khoản mới
                window.location.reload();
            });

            window.ethereum.on('chainChanged', function (chainId) {
                console.log('Mạng blockchain đã thay đổi. Đang tải lại trang...');
                window.location.reload();
            });
        }

        return await this.initWeb3();
    },

    initWeb3: async function () {
        if (window.ethereum) {
            this.web3Provider = window.ethereum;
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
            } catch (error) {
                console.error("User denied account access");
                return false;
            }
        } else if (window.web3) {
            this.web3Provider = window.web3.currentProvider;
        } else {
            // Fallback provider (e.g. Ganache)
            this.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
        }
        // IMPORTANT: instantiate Web3 using the provider
        this.web3 = new Web3(this.web3Provider);
        return await this.initContract();
    },

    initContract: async function () {
        try {
            // Tạo các đối tượng contract empty
            this.contracts = {};

            // Tải ABI của contract Auth
            const response = await fetch('contracts/Auth.json');
            const authArtifact = await response.json();

            // Get the network ID
            const networkId = await this.web3.eth.net.getId();

            // Get the deployed network info from the artifact
            const deployedNetwork = authArtifact.networks[networkId];

            if (!deployedNetwork) {
                console.error(`No deployed network found for network ID: ${networkId}`);
                return false;
            }

            // Create the contract instance using the ABI and address
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
            // Load Auth Contract ABI
            const response = await fetch('contracts/Auth.json');
            const authArtifact = await response.json();

            // Get the network ID
            const networkId = await AuthApp.web3.eth.net.getId();
            console.log('Network ID:', networkId);

            // Get the deployed contract address for this network
            const deployedNetwork = authArtifact.networks[networkId];
            if (!deployedNetwork) {
                throw new Error(`Contract not deployed on network ID: ${networkId}. Please check your MetaMask network.`);
            }

            // Create the contract instance
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

    // Connect MetaMask function
    connectMetaMask: async function () {
        if (typeof window.ethereum !== 'undefined') {
            try {
                // This will open the MetaMask popup
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                AuthApp.account = accounts[0];
                console.log("Connected to MetaMask with account:", AuthApp.account);

                // Check if user is registered after connecting
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
            document.getElementById('walletAddress').textContent = this.account;
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
            // Check if the wallet is already registered
            const isAlreadyRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
            if (isAlreadyRegistered) {
                return { success: false, error: 'Địa chỉ ví này đã được đăng ký' };
            }

            // Check if role exists
            const roleExists = await this.contracts.Auth.methods.roleExists(role).call();
            if (!roleExists) {
                return { success: false, error: `Quyền "${role}" không tồn tại trong hệ thống` };
            }

            // Call the blockchain register function
            const blockchainResult = await this.contracts.Auth.methods
                .register(name, email, password, role)
                .send({ from: this.account, gas: 3000000 });

            console.log("Blockchain registration successful:", blockchainResult);

            // Prepare user info
            const userInfo = {
                address: this.account,
                name: name,
                email: email,
                role: role,
                loggedIn: true
            };

            // Store user info locally if needed
            localStorage.setItem('userAuth', JSON.stringify(userInfo));
            return { success: true, user: userInfo };
        } catch (error) {
            console.error("Blockchain registration error:", error);
            let errorMessage = error.message;
            if (errorMessage.includes("User already registered")) {
                errorMessage = "Địa chỉ ví này đã được đăng ký";
            }
            return { success: false, error: `Lỗi đăng ký blockchain: ${errorMessage}` };
        }
    },

    debugContract: async function () {
        try {
            // Get all available methods from the contract
            console.log("Available methods:",
                Object.keys(AuthApp.contracts.Auth.methods)
                    .filter(key => typeof AuthApp.contracts.Auth.methods[key] === 'function')
            );

            // Print the owner of the contract if there's an owner method
            if (AuthApp.contracts.Auth.methods.owner) {
                const owner = await AuthApp.contracts.Auth.methods.owner().call();
                console.log("Contract owner:", owner);
                console.log("Is caller the owner:", owner.toLowerCase() === AuthApp.account.toLowerCase());
            }

            // Try to get any public variables
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

            // 1. Kết nối đến MetaMask
            if (!await this.loadAccount()) {
                return { success: false, error: 'Không thể kết nối MetaMask', type: 'connection' };
            }

            console.log("Đang thực hiện đăng nhập với tài khoản:", this.account);

            try {
                // 2. Kiểm tra xem địa chỉ ví đã đăng ký chưa
                const isRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
                console.log("Trạng thái đăng ký của ví:", isRegistered);

                if (!isRegistered) {
                    return { success: false, error: 'Địa chỉ ví này chưa đăng ký', type: 'not_registered' };
                }

                // 3. Đăng nhập với blockchain
                const blockchainResult = await this.contracts.Auth.methods.login(password).call({
                    from: this.account
                });

                console.log("Blockchain login result:", blockchainResult);

                if (!blockchainResult) {
                    return { success: false, error: 'Mật khẩu không chính xác', type: 'wrong_password' };
                }

                // 4. Lấy thông tin người dùng từ blockchain
                const userData = await this.contracts.Auth.methods.getUser(this.account).call({
                    from: this.account
                });

                console.log("User data retrieved:", userData);

                // 5. Lưu thông tin đăng nhập vào local storage
                const userInfo = {
                    address: this.account,
                    name: userData.name,
                    email: userData.email,
                    role: userData.role,
                    loggedIn: true
                };

                localStorage.setItem('userAuth', JSON.stringify(userInfo));
                return { success: true, user: userInfo };
            } catch (error) {
                console.error("Blockchain registration error:", error);
                let errorMessage = error.message;
                if (errorMessage.includes("User already registered")) {
                    errorMessage = "Địa chỉ ví này đã được đăng ký";
                }
                // Always return an object with a success property:
                return { success: false, error: `Lỗi đăng ký blockchain: ${errorMessage}` };
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

    checkLoginStatus: async function () {
        try {
            // Kiểm tra thông tin đăng nhập từ localStorage
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                return { loggedIn: false };
            }

            const user = JSON.parse(userAuth);

            // Kết nối đến MetaMask để lấy địa chỉ hiện tại
            if (!await this.loadAccount()) {
                // Người dùng không kết nối với MetaMask
                localStorage.removeItem('userAuth');
                return { loggedIn: false, error: 'Không thể kết nối với MetaMask' };
            }

            // Kiểm tra xem địa chỉ ví hiện tại có phải là địa chỉ đã đăng nhập không
            if (user.address.toLowerCase() !== this.account.toLowerCase()) {
                console.log("Địa chỉ ví đã thay đổi. Đăng xuất...");
                localStorage.removeItem('userAuth');
                return {
                    loggedIn: false,
                    error: 'Địa chỉ ví đã thay đổi. Vui lòng đăng nhập lại.'
                };
            }

            // Xác minh lại với blockchain (tùy chọn)
            const isRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
            if (!isRegistered) {
                console.log("Tài khoản không còn đăng ký trên blockchain");
                localStorage.removeItem('userAuth');
                return {
                    loggedIn: false,
                    error: 'Tài khoản không còn tồn tại trên blockchain'
                };
            }

            return {
                loggedIn: true,
                user: user
            };
        } catch (error) {
            console.error("Lỗi khi kiểm tra trạng thái đăng nhập:", error);
            return { loggedIn: false, error: error.message };
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

            // Check if wallet address is registered in MongoDB
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

            // Use the correct method name as it appears in your contract
            const isRegistered = await this.contracts.Auth.methods.isRegistered(this.account).call();
            console.log("Registration result:", isRegistered);

            if (isRegistered) {
                // Lấy thêm thông tin người dùng nếu đã đăng ký
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

            // Try to call a simple view function to verify connectivity
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

// Initialize the app when page loads
window.addEventListener('load', function () {
    AuthApp.init();
});