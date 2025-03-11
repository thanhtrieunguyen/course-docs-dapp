const AdminDashboard = {
    web3: null,
    contracts: {
        auth: null,
        courseDocument: null
    },
    account: null,
    
    init: async function() {
        try {
            // Check if user is admin
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
                    alert('Vui lòng kết nối với MetaMask để sử dụng ứng dụng này');
                    return;
                }
            } else {
                alert('Vui lòng cài đặt MetaMask để sử dụng ứng dụng này');
                return;
            }
            
            // Initialize contracts
            await this.initContracts();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Setup event handlers
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing admin dashboard:', error);
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
    
    initContracts: async function() {
        try {
            // Load Auth contract
            const authResponse = await fetch('../../contracts/Auth.json');
            const authArtifact = await authResponse.json();
            
            // Load CourseDocument contract
            const courseDocResponse = await fetch('../contracts/CourseDocument.json');
            const courseDocArtifact = await courseDocResponse.json();
            
            // Get network ID
            const networkId = await this.web3.eth.net.getId();
            
            // Initialize Auth contract
            const authDeployedNetwork = authArtifact.networks[networkId];
            if (!authDeployedNetwork) {
                throw new Error(`Auth contract not deployed on network ID: ${networkId}`);
            }
            
            this.contracts.auth = new this.web3.eth.Contract(
                authArtifact.abi,
                authDeployedNetwork.address
            );
            
            // Initialize CourseDocument contract
            const courseDocDeployedNetwork = courseDocArtifact.networks[networkId];
            if (!courseDocDeployedNetwork) {
                throw new Error(`CourseDocument contract not deployed on network ID: ${networkId}`);
            }
            
            this.contracts.courseDocument = new this.web3.eth.Contract(
                courseDocArtifact.abi,
                courseDocDeployedNetwork.address
            );
            
            console.log("Contracts initialized successfully");
            
        } catch (error) {
            console.error("Error initializing contracts:", error);
            throw error;
        }
    },
    
    loadDashboardData: async function() {
        try {
            await Promise.all([
                this.loadSummaryData(),
                this.loadRecentUsers(),
                this.loadRecentDocuments(),
                this.loadRecentReports()
            ]);
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        }
    },
    
    loadSummaryData: async function() {
        try {
            // Get total users count
            const userCount = await this.contracts.auth.methods.getUserCount().call();
            document.getElementById('totalUsers').textContent = userCount;
            
            // Get total documents count
            const documentList = await this.contracts.courseDocument.methods.getAllDocuments().call();
            document.getElementById('totalDocuments').textContent = documentList.length;
            
            // Get total courses count
            const courseList = await this.contracts.courseDocument.methods.getAllCourses().call();
            document.getElementById('totalCourses').textContent = courseList.length;
            
            // Get pending reports count
            const reportList = await this.contracts.courseDocument.methods.getAllReports().call();
            let pendingReports = 0;
            for (const reportId of reportList) {
                const report = await this.contracts.courseDocument.methods.reports(reportId).call();
                if (!report.isResolved) {
                    pendingReports++;
                }
            }
            document.getElementById('pendingReports').textContent = pendingReports;
            
        } catch (error) {
            console.error("Error loading summary data:", error);
            document.getElementById('totalUsers').textContent = 'Lỗi';
            document.getElementById('totalDocuments').textContent = 'Lỗi';
            document.getElementById('totalCourses').textContent = 'Lỗi';
            document.getElementById('pendingReports').textContent = 'Lỗi';
        }
    },
    
    loadRecentUsers: async function() {
        try {
            const usersList = document.getElementById('usersList');
            usersList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu người dùng...</div>';
            
            // Get user count
            const userCount = await this.contracts.auth.methods.getUserCount().call();
            
            if (userCount == 0) {
                usersList.innerHTML = '<div class="p-4 text-center">Không có người dùng nào.</div>';
                return;
            }
            
            // Display only the most recent 5 users
            const limit = Math.min(5, userCount);
            let usersHtml = '';
            
            // Get the most recent users (starting from the end)
            for (let i = userCount - 1; i >= Math.max(0, userCount - limit); i--) {
                const address = await this.contracts.auth.methods.getUserAtIndex(i).call();
                const userData = await this.contracts.auth.methods.users(address).call();
                const role = await this.contracts.auth.methods.getUserRole(address).call();
                
                usersHtml += `
                <div class="py-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-medium">${userData.name}</p>
                            <p class="text-sm text-gray-500">${address.substr(0, 8)}...${address.substr(-6)}</p>
                            <p class="text-sm text-gray-700">${userData.email}</p>
                        </div>
                        <span class="px-2 py-1 rounded text-xs ${
                            role === 'admin' ? 'bg-red-100 text-red-800' : 
                            role === 'teacher' ? 'bg-blue-100 text-blue-800' : 
                            'bg-green-100 text-green-800'
                        }">
                            ${
                                role === 'admin' ? 'Quản trị viên' : 
                                role === 'teacher' ? 'Giảng viên' : 
                                'Học viên'
                            }
                        </span>
                    </div>
                </div>
                `;
            }
            
            usersList.innerHTML = usersHtml;
            
        } catch (error) {
            console.error("Error loading recent users:", error);
            document.getElementById('usersList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách người dùng.</div>';
        }
    },
    
    loadRecentDocuments: async function() {
        try {
            const documentsList = document.getElementById('documentsList');
            documentsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu tài liệu...</div>';
            
            // Get all documents
            const documentIds = await this.contracts.courseDocument.methods.getAllDocuments().call();
            
            if (documentIds.length === 0) {
                documentsList.innerHTML = '<div class="p-4 text-center">Không có tài liệu nào.</div>';
                return;
            }
            
            // Display only the most recent 5 documents
            const limit = Math.min(5, documentIds.length);
            let documentsHtml = '';
            
            // Get the most recent documents (starting from the end)
            for (let i = documentIds.length - 1; i >= Math.max(0, documentIds.length - limit); i--) {
                const docId = documentIds[i];
                const doc = await this.contracts.courseDocument.methods.documents(docId).call();
                
                if (doc.ipfsHash === '') continue; // Skip removed documents
                
                const date = new Date(doc.timestamp * 1000).toLocaleDateString();
                
                documentsHtml += `
                <div class="py-3">
                    <div class="flex justify-between">
                        <div>
                            <p class="font-medium">${doc.title}</p>
                            <p class="text-sm text-gray-500">${doc.description.substring(0, 50)}${doc.description.length > 50 ? '...' : ''}</p>
                            <p class="text-sm text-gray-700">Ngày tải lên: ${date}</p>
                        </div>
                        <div class="flex flex-col items-end">
                            <div class="flex space-x-1 mb-2">
                                ${doc.isVerified ? 
                                    '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Xác thực</span>' : 
                                    '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Chưa xác thực</span>'
                                }
                                ${doc.isPublic ? 
                                    '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Công khai</span>' : 
                                    '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">Riêng tư</span>'
                                }
                            </div>
                            <a href="https://ipfs.io/ipfs/${doc.ipfsHash}" target="_blank" class="text-blue-500 hover:underline text-sm">
                                <i class="fas fa-external-link-alt mr-1"></i>Xem
                            </a>
                        </div>
                    </div>
                </div>
                `;
            }
            
            documentsList.innerHTML = documentsHtml;
            
        } catch (error) {
            console.error("Error loading recent documents:", error);
            document.getElementById('documentsList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách tài liệu.</div>';
        }
    },
    
    loadRecentReports: async function() {
        try {
            const reportsList = document.getElementById('reportsList');
            reportsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu báo cáo...</div>';
            
            // Get all reports
            const reportIds = await this.contracts.courseDocument.methods.getAllReports().call();
            
            if (reportIds.length === 0) {
                reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm nào.</div>';
                return;
            }
            
            // Filter unresolved reports
            const unresolvedReports = [];
            for (const reportId of reportIds) {
                const report = await this.contracts.courseDocument.methods.reports(reportId).call();
                if (!report.isResolved) {
                    unresolvedReports.push({ id: reportId, ...report });
                }
            }
            
            if (unresolvedReports.length === 0) {
                reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm chưa giải quyết.</div>';
                return;
            }
            
            // Display only the most recent 5 unresolved reports
            const limit = Math.min(5, unresolvedReports.length);
            let reportsHtml = '';
            
            // Sort by timestamp (most recent first)
            unresolvedReports.sort((a, b) => b.timestamp - a.timestamp);
            
            for (let i = 0; i < limit; i++) {
                const report = unresolvedReports[i];
                const document = await this.contracts.courseDocument.methods.documents(report.documentId).call();
                const date = new Date(report.timestamp * 1000).toLocaleDateString();
                
                reportsHtml += `
                <div class="py-3">
                    <p class="font-medium">Báo cáo về "${document.title}"</p>
                    <p class="text-sm text-gray-500">Lý do: ${report.reason}</p>
                    <p class="text-sm text-gray-700">Ngày báo cáo: ${date}</p>
                    <div class="mt-2">
                        <button data-report-id="${report.id}" class="resolve-report bg-green-500 hover:bg-green-600 text-white text-xs py-1 px-2 rounded mr-2">
                            <i class="fas fa-check mr-1"></i>Giải quyết
                        </button>
                        <button data-doc-id="${report.documentId}" class="view-document bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded">
                            <i class="fas fa-eye mr-1"></i>Xem tài liệu
                        </button>
                    </div>
                </div>
                `;
            }
            
            reportsList.innerHTML = reportsHtml;
            
        } catch (error) {
            console.error("Error loading recent reports:", error);
            document.getElementById('reportsList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách báo cáo vi phạm.</div>';
        }
    },
    
    setupEventListeners: function() {
        // System pause/resume
        document.getElementById('pauseSystemBtn').addEventListener('click', async () => {
            try {
                await this.contracts.courseDocument.methods.pauseSystem()
                    .send({ from: this.account });
                alert('Hệ thống đã được tạm dừng thành công!');
            } catch (error) {
                console.error('Error pausing system:', error);
                alert('Lỗi khi tạm dừng hệ thống: ' + error.message);
            }
        });
        
        document.getElementById('resumeSystemBtn').addEventListener('click', async () => {
            try {
                await this.contracts.courseDocument.methods.unpauseSystem()
                    .send({ from: this.account });
                alert('Hệ thống đã được kích hoạt lại thành công!');
            } catch (error) {
                console.error('Error resuming system:', error);
                alert('Lỗi khi kích hoạt lại hệ thống: ' + error.message);
            }
        });
        
        // Permission toggles
        document.getElementById('teacherUploadPermission').addEventListener('change', async (e) => {
            try {
                const allowed = e.target.checked;
                await this.updateRolePermission('teacher', 'upload', allowed);
                alert(`Quyền tải lên tài liệu của giảng viên đã được ${allowed ? 'bật' : 'tắt'}.`);
            } catch (error) {
                console.error('Error updating teacher permission:', error);
                alert('Lỗi khi cập nhật quyền: ' + error.message);
                e.target.checked = !e.target.checked; // Revert toggle
            }
        });
        
        document.getElementById('studentReviewPermission').addEventListener('change', async (e) => {
            try {
                const allowed = e.target.checked;
                await this.updateRolePermission('student', 'review', allowed);
                alert(`Quyền đánh giá tài liệu của học viên đã được ${allowed ? 'bật' : 'tắt'}.`);
            } catch (error) {
                console.error('Error updating student permission:', error);
                alert('Lỗi khi cập nhật quyền: ' + error.message);
                e.target.checked = !e.target.checked; // Revert toggle
            }
        });
        
        // Report actions
        document.addEventListener('click', async (e) => {
            if (e.target.closest('.resolve-report')) {
                const reportId = e.target.closest('.resolve-report').dataset.reportId;
                await this.resolveReport(reportId);
            } else if (e.target.closest('.view-document')) {
                const docId = e.target.closest('.view-document').dataset.docId;
                const doc = await this.contracts.courseDocument.methods.documents(docId).call();
                window.open(`https://ipfs.io/ipfs/${doc.ipfsHash}`, '_blank');
            }
        });
        
        // Search functionality
        document.getElementById('userSearchInput').addEventListener('input', (e) => {
            this.searchUsers(e.target.value);
        });

        document.getElementById('contentSearchInput').addEventListener('input', (e) => {
            this.searchDocuments(e.target.value);
        });
    },
    
    searchUsers: function(searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        const userItems = document.querySelectorAll('#usersList > div');
        
        userItems.forEach(item => {
            if (item.textContent.toLowerCase().includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    },
    
    searchDocuments: function(searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        const documentItems = document.querySelectorAll('#documentsList > div');
        
        documentItems.forEach(item => {
            if (item.textContent.toLowerCase().includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    },
    
    updateRolePermission: async function(role, permission, allowed) {
        try {
            // Call API to update permission in database
            const response = await fetch('/api/admin/update-permission', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role,
                    permission,
                    allowed
                })
            });
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Không thể cập nhật quyền');
            }
            
            return true;
        } catch (error) {
            console.error("Error updating permission:", error);
            throw error;
        }
    },
    
    resolveReport: async function(reportId) {
        try {
            await this.contracts.courseDocument.methods.resolveReport(reportId)
                .send({ from: this.account });
                
            alert('Báo cáo đã được đánh dấu là đã giải quyết!');
            await this.loadRecentReports();
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Lỗi khi giải quyết báo cáo: ' + error.message);
        }
    }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    AdminDashboard.init();
});
