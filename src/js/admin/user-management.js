const UserManagement = {
    web3: null,
    contracts: {
        auth: null
    },
    account: null,
    users: [],
    selectedUser: null,
    
    init: async function () {
        try {
            // Check authentication and authorization
            if (!await this.checkAdminAccess()) {
                window.location.href = "../login.html";
                return;
            }
            
            // Initialize Web3
            if (window.ethereum) {
                UserManagement.web3 = new Web3(window.ethereum);
                try {
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const accounts = await UserManagement.web3.eth.getAccounts();
                    UserManagement.account = accounts[0];
                    document.getElementById('accountAddress').textContent = 
                        `Tài khoản: ${UserManagement.account.substr(0, 6)}...${UserManagement.account.substr(-4)}`;
                } catch (error) {
                    console.error('User denied account access:', error);
                    this.showStatus('error', 'Vui lòng kết nối với MetaMask để sử dụng ứng dụng này');
                    return;
                }
            } else {
                this.showStatus('error', 'MetaMask không được tìm thấy. Vui lòng cài đặt MetaMask để tiếp tục.');
                return;
            }
            
            // Initialize contracts
            await this.initContract();
            
            // Load users
            await this.loadUsers();
            
            // Setup event handlers
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing UserManagement:', error);
            this.showStatus('error', 'Đã xảy ra lỗi khi khởi tạo: ' + error.message);
        }
    },
    
    checkAdminAccess: async function() {
        try {
            // Initialize AuthApp if needed
            if (!AuthApp.web3) {
                await AuthApp.init();
            }
            
            // Check if user is logged in and has admin role
            const loginStatus = await AuthApp.checkLoginStatus();
            if (!loginStatus.loggedIn) {
                return false;
            }
            
            const isAdmin = await AuthApp.isAdmin();
            return isAdmin;
        } catch (error) {
            console.error("Error checking admin access:", error);
            return false;
        }
    },
    
    initContract: async function() {
        try {
            // Load Auth contract
            const response = await fetch('../../contracts/Auth.json');
            const authArtifact = await response.json();
            
            // Get network ID
            const networkId = await UserManagement.web3.eth.net.getId();
            const deployedNetwork = authArtifact.networks[networkId];
            
            if (!deployedNetwork) {
                throw new Error(`Không tìm thấy contract đã deploy trên mạng ID: ${networkId}`);
            }
            
            UserManagement.contracts.auth = new UserManagement.web3.eth.Contract(
                authArtifact.abi,
                deployedNetwork.address
            );
            
            console.log("Auth contract loaded at:", deployedNetwork.address);
        } catch (error) {
            console.error("Error loading contract:", error);
            throw error;
        }
    },
    
    loadUsers: async function() {
        try {
            const tbody = document.getElementById('userTableBody');
            tbody.innerHTML = '<tr><td colspan="5" class="py-4 px-4 text-center">Đang tải dữ liệu người dùng...</td></tr>';

            // Get users from API instead of blockchain
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                throw new Error('Phiên đăng nhập không hợp lệ');
            }

            const { token } = JSON.parse(userAuth);
            const response = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Không thể tải danh sách người dùng');
            }

            UserManagement.users = result.users;
            
            if (UserManagement.users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="py-4 px-4 text-center">Không tìm thấy người dùng</td></tr>';
                return;
            }

            let tableRows = '';
            for (const user of UserManagement.users) {
                tableRows += `
                <tr data-address="${user.address}" class="hover:bg-gray-50 cursor-pointer user-row">
                    <td class="py-3 px-4 border-b">${user.name}</td>
                    <td class="py-3 px-4 border-b">${user.email}</td>
                    <td class="py-3 px-4 border-b">${user.address.substr(0, 8)}...${user.address.substr(-6)}</td>
                    <td class="py-3 px-4 border-b">
                        <span class="px-2 py-1 rounded text-xs ${
                            user.role === 'admin' ? 'bg-red-100 text-red-800' :
                            user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                        }">
                            ${user.role === 'admin' ? 'Quản trị viên' :
                              user.role === 'teacher' ? 'Giảng viên' :
                              'Học viên'
                            }
                        </span>
                    </td>
                    <td class="py-3 px-4 border-b text-right">
                        <button class="edit-user-btn text-blue-600 hover:text-blue-800 mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-user-btn text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            }
            
            tbody.innerHTML = tableRows;

        } catch (error) {
            console.error("Error loading users:", error);
            document.getElementById('userTableBody').innerHTML = 
                '<tr><td colspan="5" class="py-4 px-4 text-center text-red-500">Lỗi khi tải dữ liệu: ' + error.message + '</td></tr>';
        }
    },
    
    setupEventListeners: function() {
        // User table row click
        document.addEventListener('click', function(e) {
            if (e.target.closest('.edit-user-btn')) {
                const row = e.target.closest('tr');
                const address = row.dataset.address;
                UserManagement.editUser(address);
            } else if (e.target.closest('.delete-user-btn')) {
                const row = e.target.closest('tr');
                const address = row.dataset.address;
                UserManagement.confirmDeleteUser(address);
            }
        });
        
        // Search functionality
        document.getElementById('searchUser').addEventListener('input', function(e) {
            UserManagement.filterUsers();
        });
        
        // Role filter
        document.getElementById('filterRole').addEventListener('change', function(e) {
            UserManagement.filterUsers();
        });
        
        // Edit form submission
        document.getElementById('editUserForm').addEventListener('submit', function(e) {
            e.preventDefault();
            UserManagement.updateUser();
        });
        
        // Cancel edit button
        document.getElementById('cancelEditBtn').addEventListener('click', function() {
            UserManagement.cancelEdit();
        });
        
        // Modal buttons
        document.getElementById('cancelModalBtn').addEventListener('click', function() {
            UserManagement.hideModal();
        });
        
        document.getElementById('confirmModalBtn').addEventListener('click', function() {
            // The action will be set when the modal is shown
            if (UserManagement.modalCallback) {
                UserManagement.modalCallback();
            }
            UserManagement.hideModal();
        });
    },
    
    filterUsers: function() {
        const searchTerm = document.getElementById('searchUser').value.toLowerCase();
        const roleFilter = document.getElementById('filterRole').value;
        
        const rows = document.querySelectorAll('#userTableBody tr.user-row');
        
        rows.forEach(row => {
            const name = row.cells[0].textContent.toLowerCase();
            const email = row.cells[1].textContent.toLowerCase();
            const address = row.cells[2].textContent.toLowerCase();
            const roleElement = row.cells[3].querySelector('span');
            const role = row.cells[3].textContent.toLowerCase();
            
            // Check if matches search term
            const matchesSearch = name.includes(searchTerm) || 
                                email.includes(searchTerm) || 
                                address.includes(searchTerm);
            
            // Check if matches role filter
            const matchesRole = roleFilter === '' || 
                              (roleFilter === 'admin' && role.includes('quản trị')) ||
                              (roleFilter === 'teacher' && role.includes('giảng viên')) ||
                              (roleFilter === 'student' && role.includes('học viên'));
            
            // Show or hide row
            if (matchesSearch && matchesRole) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },
    
    editUser: function(address) {
        // Find user in array
        const user = UserManagement.users.find(u => u.address === address);
        if (!user) {
            this.showStatus('error', 'Không tìm thấy thông tin người dùng');
            return;
        }
        
        // Store selected user
        UserManagement.selectedUser = user;
        
        // Fill form
        document.getElementById('editUserId').value = user.address;
        document.getElementById('editName').value = user.name;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editWalletAddress').value = user.address;
        document.getElementById('editRole').value = user.role;
        
        // Show edit form, hide placeholder
        document.getElementById('userEditForm').classList.remove('hidden');
        document.getElementById('noUserSelected').classList.add('hidden');
    },
    
    cancelEdit: function() {
        // Clear form
        document.getElementById('editUserForm').reset();
        
        // Hide edit form, show placeholder
        document.getElementById('userEditForm').classList.add('hidden');
        document.getElementById('noUserSelected').classList.remove('hidden');
        
        // Clear selected user
        UserManagement.selectedUser = null;
    },
    
    updateUser: async function() {
        try {
            if (!UserManagement.selectedUser) {
                this.showStatus('error', 'Không có người dùng nào được chọn');
                return;
            }

            // Get token from localStorage
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                this.showStatus('error', 'Phiên đăng nhập không hợp lệ');
                return;
            }

            const { token } = JSON.parse(userAuth);
            if (!token) {
                this.showStatus('error', 'Token không hợp lệ');
                return;
            }

            const address = document.getElementById('editUserId').value;
            const name = document.getElementById('editName').value;
            const email = document.getElementById('editEmail').value; 
            const newRole = document.getElementById('editRole').value;

            // Validate
            if (!name || !email) {
                this.showStatus('error', 'Vui lòng điền đầy đủ thông tin');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                this.showStatus('error', 'Email không hợp lệ');
                return;
            }

            // Only update blockchain if role changed
            const roleChanged = newRole !== UserManagement.selectedUser.role;
            if (roleChanged) {
                try {
                    await UserManagement.contracts.auth.methods.setUserRole(address, newRole)
                        .send({ from: UserManagement.account });
                } catch (error) {
                    throw new Error('Lỗi khi cập nhật vai trò: ' + error.message);
                }
            }

            // Update MongoDB
            const response = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    address,
                    name,
                    email,
                    role: newRole // Include role in update
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Không thể cập nhật thông tin người dùng');
            }

            this.showStatus('success', 'Cập nhật thông tin người dùng thành công');
            
            // Reload users from blockchain to update display
            await this.loadUsers();
            
            this.cancelEdit();

        } catch (error) {
            console.error("Error updating user:", error);
            this.showStatus('error', 'Lỗi khi cập nhật người dùng: ' + error.message);
        }
    },
    
    confirmDeleteUser: function(address) {
        // Find user in array
        const user = UserManagement.users.find(u => u.address === address);
        if (!user) {
            this.showStatus('error', 'Không tìm thấy thông tin người dùng');
            return;
        }
        
        // Set modal content
        document.getElementById('modalTitle').textContent = 'Xác nhận xóa người dùng';
        document.getElementById('modalMessage').textContent = 
            `Bạn có chắc chắn muốn xóa người dùng "${user.name}" (${user.email})?`;
        
        // Set action for confirm button
        UserManagement.modalCallback = function() {
            UserManagement.deleteUser(address);
        };
        
        // Show modal
        this.showModal();
    },
    
    deleteUser: async function(address) {
        try {
            // Call API to delete user from MongoDB
            const response = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: address
                })
            });
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Không thể xóa người dùng');
            }
            
            this.showStatus('success', 'Xóa người dùng thành công');
            
            // Reload users
            await this.loadUsers();
            
        } catch (error) {
            console.error("Error deleting user:", error);
            this.showStatus('error', 'Lỗi khi xóa người dùng: ' + error.message);
        }
    },
    
    showModal: function() {
        document.getElementById('confirmModal').classList.remove('hidden');
    },
    
    hideModal: function() {
        document.getElementById('confirmModal').classList.add('hidden');
        UserManagement.modalCallback = null;
    },
    
    showStatus: function(type, message) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'bg-yellow-100');
        
        if (type === 'success') {
            statusDiv.classList.add('bg-green-100', 'text-green-800', 'border-green-300');
        } else if (type === 'error') {
            statusDiv.classList.add('bg-red-100', 'text-red-800', 'border-red-300');
        } else {
            statusDiv.classList.add('bg-yellow-100', 'text-yellow-800', 'border-yellow-300');
        }
        
        statusDiv.innerHTML = `
            <div class="flex items-center p-4">
                <div class="mr-3">
                    ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>'}
                </div>
                <div>${message}</div>
                <button class="ml-auto" onclick="document.getElementById('statusMessage').classList.add('hidden')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (statusDiv) statusDiv.classList.add('hidden');
        }, 5000);
    }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    UserManagement.init();
});
