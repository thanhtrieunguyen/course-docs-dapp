const RoleManagement = {
    web3: null,
    contracts: {},
    account: null,
    permissions: {
        teacher: {},
        student: {},
        dean: {}
    },
    
    init: async function() {
        try {
            // Check admin access
            if (!await this.checkAdminAccess()) {
                window.location.href = "../login.html";
                return;
            }
            
            // Initialize Web3
            if (window.ethereum) {
                this.web3 = new Web3(window.ethereum);
                try {
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const accounts = await this.web3.eth.getAccounts();
                    this.account = accounts[0];
                    document.getElementById('accountAddress').textContent = 
                        `Tài khoản: ${this.account.substr(0, 6)}...${this.account.substr(-4)}`;
                } catch (error) {
                    console.error('User denied account access:', error);
                    this.showStatus('error', 'Vui lòng kết nối với MetaMask để sử dụng ứng dụng này');
                    return;
                }
            } else {
                this.showStatus('error', 'MetaMask không được tìm thấy. Vui lòng cài đặt MetaMask để tiếp tục.');
                return;
            }
            
            // Load permissions
            await this.loadPermissions();
            
            // Setup event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing role management:', error);
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
    
    loadPermissions: async function() {
        try {
            // Get token from local storage
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                throw new Error('User authentication data not found');
            }
            
            const auth = JSON.parse(userAuth);
            const token = auth.token;
            
            // Fetch all permissions from API
            const response = await fetch('/api/admin/permissions', {
                headers: {
                    'Authorization': 'Bearer ' + token,
                }
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to load permissions');
            }
            
            result.permissions.forEach(rolePermission => {
                if (rolePermission.role === 'teacher') {
                    this.permissions.teacher = rolePermission.permissions;
                    document.getElementById('teacherUpload').checked = rolePermission.permissions.upload;
                    document.getElementById('teacherView').checked = true;
                    document.getElementById('teacherDelete').checked = rolePermission.permissions.delete;
                    document.getElementById('teacherManageCourse').checked = rolePermission.permissions.manageCourse || true;

                    this.updateTableCell('tableTeacherUpload', rolePermission.permissions.upload);
                    this.updateTableCell('tableTeacherView', true);
                    this.updateTableCell('tableTeacherDelete', rolePermission.permissions.delete);
                    this.updateTableCell('tableTeacherManageCourse', rolePermission.permissions.manageCourse || true);
                } else if (rolePermission.role === 'dean') {
                    this.permissions.dean = rolePermission.permissions;
                    document.getElementById('deanUpload').checked = rolePermission.permissions.upload;
                    document.getElementById('deanView').checked = true; // Always true for deans
                    document.getElementById('deanDelete').checked = rolePermission.permissions.delete;
                    document.getElementById('deanManageCourse').checked = rolePermission.permissions.manageCourse || true;
                    document.getElementById('deanApproveCourse').checked = rolePermission.permissions.approveCourse || true;
                    document.getElementById('deanManageDepartment').checked = rolePermission.permissions.manageDepartment || true;

                    this.updateTableCell('tableDeanUpload', rolePermission.permissions.upload);
                    this.updateTableCell('tableDeanView', true);
                    this.updateTableCell('tableDeanDelete', rolePermission.permissions.delete);
                    this.updateTableCell('tableDeanManageCourse', rolePermission.permissions.manageCourse || true);
                    this.updateTableCell('tableDeanApproveCourse', rolePermission.permissions.approveCourse || true);
                    this.updateTableCell('tableDeanManageDepartment', rolePermission.permissions.manageDepartment || true);
                } else if (rolePermission.role === 'student') {
                    this.permissions.student = rolePermission.permissions;
                    document.getElementById('studentView').checked = true; 
                    document.getElementById('studentReview').checked = rolePermission.permissions.review;
                    document.getElementById('studentReport').checked = rolePermission.permissions.report || true;
                    document.getElementById('studentUpload').checked = rolePermission.permissions.upload;

                    this.updateTableCell('tableStudentUpload', rolePermission.permissions.upload);
                    this.updateTableCell('tableStudentView', true);
                    this.updateTableCell('tableStudentReview', rolePermission.permissions.review);
                    this.updateTableCell('tableStudentReport', rolePermission.permissions.report || true);
                }
            });
            
        } catch (error) {
            console.error("Error loading permissions:", error);
            this.showStatus('error', 'Không thể tải dữ liệu phân quyền: ' + error.message);
        }
    },
    
    updateTableCell: function(cellId, isAllowed) {
        const cell = document.getElementById(cellId);
        if (cell) {
            cell.innerHTML = isAllowed ? 
                '<span class="text-green-500"><i class="fas fa-check"></i></span>' : 
                '<span class="text-red-500"><i class="fas fa-times"></i></span>';
        }
    },
    
    setupEventListeners: function() {
        // Save teacher permissions
        document.getElementById('saveTeacherPermissions').addEventListener('click', async () => {
            try {
                const uploadPermission = document.getElementById('teacherUpload').checked;
                const viewPermission = document.getElementById('teacherView').checked;
                const deletePermission = document.getElementById('teacherDelete').checked;
                const manageCoursePermission = document.getElementById('teacherManageCourse').checked;
                
                // Update permissions in database
                await this.updatePermissions('teacher', {
                    upload: uploadPermission,
                    view: viewPermission,
                    delete: deletePermission,
                    manageCourse: manageCoursePermission
                });
                
                // Update table
                this.updateTableCell('tableTeacherUpload', uploadPermission);
                this.updateTableCell('tableTeacherView', viewPermission);
                this.updateTableCell('tableTeacherDelete', deletePermission);
                this.updateTableCell('tableTeacherManageCourse', manageCoursePermission);
                
                this.showStatus('success', 'Đã cập nhật quyền cho giảng viên thành công');
            } catch (error) {
                console.error("Error saving teacher permissions:", error);
                this.showStatus('error', 'Lỗi khi cập nhật quyền: ' + error.message);
            }
        });
        
        // Save dean permissions
        document.getElementById('saveDeanPermissions').addEventListener('click', async () => {
            try {
                const uploadPermission = document.getElementById('deanUpload').checked;
                const viewPermission = document.getElementById('deanView').checked;
                const deletePermission = document.getElementById('deanDelete').checked;
                const manageCoursePermission = document.getElementById('deanManageCourse').checked;
                const approveCoursePermission = document.getElementById('deanApproveCourse').checked;
                const manageDepartmentPermission = document.getElementById('deanManageDepartment').checked;
                
                // Update permissions in database
                await this.updatePermissions('dean', {
                    upload: uploadPermission,
                    view: viewPermission,
                    delete: deletePermission,
                    manageCourse: manageCoursePermission,
                    approveCourse: approveCoursePermission,
                    manageDepartment: manageDepartmentPermission
                });
                
                // Update table
                this.updateTableCell('tableDeanUpload', uploadPermission);
                this.updateTableCell('tableDeanView', viewPermission);
                this.updateTableCell('tableDeanDelete', deletePermission);
                this.updateTableCell('tableDeanManageCourse', manageCoursePermission);
                this.updateTableCell('tableDeanApproveCourse', approveCoursePermission);
                this.updateTableCell('tableDeanManageDepartment', manageDepartmentPermission);
                
                this.showStatus('success', 'Đã cập nhật quyền cho trưởng khoa thành công');
            } catch (error) {
                console.error("Error saving dean permissions:", error);
                this.showStatus('error', 'Lỗi khi cập nhật quyền: ' + error.message);
            }
        });
        
        // Save student permissions
        document.getElementById('saveStudentPermissions').addEventListener('click', async () => {
            try {
                const uploadPermission = document.getElementById('studentUpload').checked;
                const viewPermission = document.getElementById('studentView').checked;
                const reviewPermission = document.getElementById('studentReview').checked;
                const reportPermission = document.getElementById('studentReport').checked;
                
                // Update permissions in database
                await this.updatePermissions('student', {
                    upload: uploadPermission,
                    view: viewPermission,
                    review: reviewPermission,
                    report: reportPermission
                });
                
                // Update table
                this.updateTableCell('tableStudentUpload', uploadPermission);
                this.updateTableCell('tableStudentView', viewPermission);
                this.updateTableCell('tableStudentReview', reviewPermission);
                this.updateTableCell('tableStudentReport', reportPermission);
                
                this.showStatus('success', 'Đã cập nhật quyền cho học viên thành công');
            } catch (error) {
                console.error("Error saving student permissions:", error);
                this.showStatus('error', 'Lỗi khi cập nhật quyền: ' + error.message);
            }
        });
    },
    
    updatePermissions: async function(role, permissions) {
        // For each permission, make an API call to update it
        for (const [permission, allowed] of Object.entries(permissions)) {
            await this.updatePermission(role, permission, allowed);
        }
    },
    
    updatePermission: async function(role, permission, allowed) {
        try {
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                throw new Error('User authentication data not found');
            }
            
            const auth = JSON.parse(userAuth);
            const token = auth.token;
            
            const response = await fetch('/api/admin/update-permission', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({
                    role,
                    permission,
                    allowed
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to update permission');
            }
            
            return true;
        } catch (error) {
            console.error(`Error updating ${permission} permission for ${role}:`, error);
            throw error;
        }
    },
    
    showStatus: function(type, message) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'bg-yellow-100');
        
        if (type === 'success') {
            statusDiv.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-300', 'rounded');
        } else if (type === 'error') {
            statusDiv.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-300', 'rounded');
        } else {
            statusDiv.classList.add('bg-yellow-100', 'text-yellow-800', 'border', 'border-yellow-300', 'rounded');
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
    RoleManagement.init();
});
