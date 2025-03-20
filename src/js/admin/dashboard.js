const AdminDashboard = {
    web3: null,
    contracts: {
        auth: null,
        courseDocument: null
    },
    account: null,

    init: async function () {
        try {
            // Initialize Web3 first
            await this.initWeb3();

            // Initialize contracts before any other operations
            await this.initContracts();

            // Now verify admin access
            const isAdmin = await this.verifyAdminAccess();
            if (!isAdmin) {
                alert('Bạn không có quyền truy cập trang quản trị');
                window.location.href = "../login.html";
                return;
            }

            // Update UI with account info
            document.getElementById('accountAddress').textContent =
                `Tài khoản: ${this.account.substr(0, 6)}...${this.account.substr(-4)}`;

            // Load dashboard data
            await this.loadDashboardData();

            // Setup event handlers
            this.setupEventListeners();

        } catch (error) {
            console.error('Error initializing admin dashboard:', error);
            alert('Lỗi khởi tạo dashboard: ' + error.message);
        }
    },

    async verifyAdminAccess() {
        try {
            if (!this.account || !this.contracts.auth) return false;
            const role = await this.contracts.auth.methods.getUserRole(this.account).call();
            console.log("Current account role:", role);
            return role === 'admin';
        } catch (error) {
            console.error("Error verifying admin access:", error);
            return false;
        }
    },

    initContracts: async function () {
        try {
            if (!this.web3) {
                throw new Error('Web3 not initialized');
            }

            // Load contracts with retries
            const [authArtifact, courseDocArtifact] = await Promise.all([
                this.loadContractJson('../../contracts/Auth.json'),
                this.loadContractJson('../contracts/CourseDocument.json')
            ]);

            // Verify network deployment
            const authNetwork = authArtifact.networks[this.networkId];
            const courseDocNetwork = courseDocArtifact.networks[this.networkId];

            if (!authNetwork || !courseDocNetwork) {
                throw new Error(`Contracts not deployed on network ${this.networkId}`);
            }

            // Initialize contract instances
            this.contracts.auth = new this.web3.eth.Contract(
                authArtifact.abi,
                authNetwork.address
            );

            this.contracts.courseDocument = new this.web3.eth.Contract(
                courseDocArtifact.abi,
                courseDocNetwork.address
            );

            return true;
        } catch (error) {
            console.error('Contract initialization failed:', error);
            throw error;
        }
    },

    loadDashboardData: async function () {
        try {
            // Check connection first
            if (!await this.checkConnection()) {
                throw new Error('Unable to connect to blockchain network');
            }

            // Load each section independently to prevent complete failure
            const results = await Promise.allSettled([
                this.loadSummaryData(),
                this.loadRecentUsers(),
                this.loadRecentDocuments(),
                this.loadRecentReports()
            ]);

            // Log any failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Failed to load section ${index}:`, result.reason);
                }
            });
        } catch (error) {
            console.error("Error loading dashboard data:", error);
            alert('Lỗi kết nối đến blockchain. Vui lòng kiểm tra kết nối MetaMask của bạn.');
        }
    },

    safeToNumber: function (bigIntValue) {
        try {
            return Number(bigIntValue);
        } catch (error) {
            console.warn('Error converting BigInt:', error);
            return 0;
        }
    },

    retry: async function (fn, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                // Kiểm tra kết nối trước mỗi lần thử
                if (!await this.checkConnection()) {
                    throw new Error('No connection available');
                }
                return await fn();
            } catch (error) {
                // Xử lý lỗi phương thức không tồn tại
                if (error.message && error.message.includes('is not a function')) {
                    console.warn("Method not available:", error.message);
                    return []; // Trả về mảng rỗng cho các hàm get
                }
                
                // Xử lý lỗi "Start index out of bounds"
                if (error.message && error.message.includes('Start index out of bounds')) {
                    console.log("No items found in collection, returning default value");
                    return error.message.includes('documents') ? [] : 0;
                }
                
                if (i === retries - 1) throw error;
                console.warn(`Attempt ${i + 1} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    },

    loadSummaryData: async function () {
        try {
            if (!await this.checkConnection()) {
                throw new Error('No connection available');
            }

            const promises = [
                this.retry(async () => {
                    try {
                        const userCount = await this.contracts.auth.methods.getUserCount().call();
                        document.getElementById('totalUsers').textContent = this.safeToNumber(userCount);
                    } catch (error) {
                        document.getElementById('totalUsers').textContent = 'Lỗi';
                        throw error;
                    }
                }),
                this.retry(async () => {
                    try {
                        // Changed: use getDocumentCount instead of getAllDocuments
                        const documentCount = await this.contracts.courseDocument.methods.getDocumentCount().call();
                        document.getElementById('totalDocuments').textContent = documentCount;
                    } catch (error) {
                        document.getElementById('totalDocuments').textContent = 'Lỗi';
                        throw error;
                    }
                }),
                this.retry(async () => {
                    try {
                        const courses = await this.contracts.courseDocument.methods.getAllCourses().call();
                        document.getElementById('totalCourses').textContent = courses.length;
                    } catch (error) {
                        document.getElementById('totalCourses').textContent = 'Lỗi';
                        throw error;
                    }
                }),
                this.retry(async () => {
                    try {
                        // Changed: use getReportCount & getReports instead of getAllReports
                        const reportCount = await this.contracts.courseDocument.methods.getReportCount().call();
                        if (parseInt(reportCount) === 0) {
                            document.getElementById('pendingReports').textContent = 0;
                            return;
                        }
                        const limit = Math.min(5, parseInt(reportCount));
                        let unresolvedCount = 0;
                        if (typeof this.contracts.courseDocument.methods.getReports === 'function') {
                            const reports = await this.contracts.courseDocument.methods.getReports(0, limit).call();
                            for (const reportId of reports) {
                                const report = await this.contracts.courseDocument.methods.reports(reportId).call();
                                if (!report.isResolved) unresolvedCount++;
                            }
                        }
                        document.getElementById('pendingReports').textContent = unresolvedCount;
                    } catch (error) {
                        document.getElementById('pendingReports').textContent = 'Lỗi';
                        throw error;
                    }
                })
            ];

            await Promise.allSettled(promises);
        } catch (error) {
            console.error("Error loading summary data:", error);
            ['totalUsers', 'totalDocuments', 'totalCourses', 'pendingReports'].forEach(id => {
                document.getElementById(id).textContent = 'Lỗi';
            });
            throw error;
        }
    },

    loadRecentUsers: async function () {
        try {
            const usersList = document.getElementById('usersList');
            usersList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu người dùng...</div>';

            // Get user count
            const userCount = await this.retry(() =>
                this.contracts.auth.methods.getUserCount().call()
            );

            if (!userCount || this.safeToNumber(userCount) === 0) {
                usersList.innerHTML = '<div class="p-4 text-center">Không có người dùng nào.</div>';
                return;
            }

            const count = this.safeToNumber(userCount);
            const limit = Math.min(5, count);
            let usersHtml = '';

            // Get the most recent users
            for (let i = count - 1; i >= Math.max(0, count - limit); i--) {
                try {
                    const address = await this.retry(() =>
                        this.contracts.auth.methods.getUserAtIndex(i).call()
                    );
                    const userData = await this.retry(() =>
                        this.contracts.auth.methods.users(address).call()
                    );
                    const role = await this.retry(() =>
                        this.contracts.auth.methods.getUserRole(address).call()
                    );

                    usersHtml += `
                    <div class="py-3">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-medium">${userData.name || 'N/A'}</p>
                                <p class="text-sm text-gray-500">${address.substr(0, 8)}...${address.substr(-6)}</p>
                                <p class="text-sm text-gray-700">${userData.email || 'N/A'}</p>
                            </div>
                            <span class="px-2 py-1 rounded text-xs ${role === 'admin' ? 'bg-red-100 text-red-800' :
                            role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                        }">
                                ${role === 'admin' ? 'Quản trị viên' :
                            role === 'teacher' ? 'Giảng viên' :
                                'Học viên'
                        }
                            </span>
                        </div>
                    </div>`;
                } catch (error) {
                    console.warn(`Error loading user at index ${i}:`, error);
                    continue;
                }
            }

            usersList.innerHTML = usersHtml || '<div class="p-4 text-center">Không thể tải dữ liệu người dùng.</div>';

        } catch (error) {
            console.error("Error loading recent users:", error);
            usersList.innerHTML = '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách người dùng.</div>';
        }
    },

    loadRecentDocuments: async function () {
        try {
            const documentsList = document.getElementById('documentsList');
            documentsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu tài liệu...</div>';

            // Get document count from blockchain
            const documentCount = await this.retry(() =>
                this.contracts.courseDocument.methods.getDocumentCount().call()
            );

            if (parseInt(documentCount) === 0) {
                documentsList.innerHTML = '<div class="p-4 text-center">Không có tài liệu nào.</div>';
                return;
            }

            // Get recent document IDs
            let documentIds = [];
            try {
                const limit = Math.min(5, parseInt(documentCount));
                documentIds = await this.contracts.courseDocument.methods.getDocuments(0, limit).call();
            } catch (error) {
                console.warn("Error getting documents:", error);
                documentsList.innerHTML = '<div class="p-4 text-center">Lỗi khi truy vấn danh sách tài liệu.</div>';
                return;
            }

            let documentsHtml = '';
            for (let i = documentIds.length - 1; i >= Math.max(0, documentIds.length - 5); i--) {
                try {
                    const docId = documentIds[i];
                    const doc = await this.contracts.courseDocument.methods.documents(docId).call();
                    if (doc.documentHash === '') continue; // Skip removed documents
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
                                <a href="document-management.html?document=${docId}" class="text-blue-500 hover:underline text-sm">
                                    <i class="fas fa-edit mr-1"></i>Quản lý
                                </a>
                            </div>
                        </div>
                    </div>
                    `;
                } catch (error) {
                    console.error("Error loading document details:", error);
                    continue;
                }
            }

            documentsList.innerHTML = documentsHtml || '<div class="p-4 text-center">Không có tài liệu nào.</div>';

        } catch (error) {
            console.error("Error loading recent documents:", error);
            document.getElementById('documentsList').innerHTML =
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách tài liệu.</div>';
        }
    },

    loadRecentReports: async function () {
        try {
            const reportsList = document.getElementById('reportsList');
            reportsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu báo cáo...</div>';

            const isAdmin = await this.verifyAdminAccess();
            if (!isAdmin) {
                reportsList.innerHTML = '<div class="p-4 text-center">Bạn không có quyền xem báo cáo.</div>';
                return;
            }

            let reportIds = [];
            try {
                if (typeof this.contracts.courseDocument.methods.getReportCount === 'function') {
                    const reportCount = await this.contracts.courseDocument.methods.getReportCount().call();
                    if (parseInt(reportCount) === 0) {
                        reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm nào.</div>';
                        return;
                    }
                    const limit = Math.min(5, parseInt(reportCount));
                    if (typeof this.contracts.courseDocument.methods.getReports === 'function') {
                        reportIds = await this.contracts.courseDocument.methods.getReports(0, limit).call();
                    }
                }
                // Removed fallback branch for getAllReports
                if (!reportIds || reportIds.length === 0) {
                    reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm nào.</div>';
                    return;
                }
            } catch (error) {
                console.warn("Error getting reports:", error);
                reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo hoặc lỗi khi truy vấn.</div>';
                return;
            }

            const unresolvedReports = [];
            for (const reportId of reportIds) {
                try {
                    const report = await this.contracts.courseDocument.methods.reports(reportId).call();
                    if (!report.isResolved) {
                        unresolvedReports.push({ id: reportId, ...report });
                    }
                } catch (error) {
                    console.warn(`Error fetching report ${reportId}:`, error);
                    continue;
                }
            }

            if (unresolvedReports.length === 0) {
                reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm chưa giải quyết.</div>';
                return;
            }

            let reportsHtml = '';
            unresolvedReports.sort((a, b) => b.timestamp - a.timestamp);
            const limit = Math.min(5, unresolvedReports.length);
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

    setupEventListeners: function () {
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

    searchUsers: function (searchTerm) {
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

    searchDocuments: function (searchTerm) {
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

    updateRolePermission: async function (role, permission, allowed) {
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

    resolveReport: async function (reportId) {
        try {
            await this.contracts.courseDocument.methods.resolveReport(reportId)
                .send({ from: this.account });

            alert('Báo cáo đã được đánh dấu là đã giải quyết!');
            await this.loadRecentReports();
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Lỗi khi giải quyết báo cáo: ' + error.message);
        }
    },

    checkConnection: async function () {
        try {
            // Check Web3 and account
            if (!this.web3 || !this.account) {
                await this.initWeb3();
            }

            // Verify account
            const accounts = await this.web3.eth.getAccounts();
            if (!accounts.includes(this.account)) {
                throw new Error('Account disconnected');
            }

            // Check if contracts are initialized
            if (!this.contracts.auth || !this.contracts.courseDocument) {
                await this.initContracts();
            }

            // Verify admin role
            const isAdmin = await this.verifyAdminAccess();
            if (!isAdmin) {
                throw new Error('Not authorized as admin');
            }

            return true;
        } catch (error) {
            console.error('Connection check failed:', error);
            return false;
        }
    },

    initWeb3: async function () {
        if (!window.ethereum) {
            throw new Error('Please install MetaMask');
        }

        try {
            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });

            // Configure Web3
            this.web3 = new Web3(window.ethereum);
            this.web3.eth.handleRevert = true;

            // Increase timeouts
            this.web3.eth.transactionBlockTimeout = 100;
            this.web3.eth.transactionPollingTimeout = 1000;
            this.web3.eth.defaultBlock = 'latest';

            // Get network info
            this.networkId = await this.web3.eth.net.getId();
            const accounts = await this.web3.eth.getAccounts();

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            this.account = accounts[0];

            // Setup listeners
            window.ethereum.on('accountsChanged', () => window.location.reload());
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('disconnect', () => window.location.reload());

            console.log('Web3 initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing Web3:', error);
            throw error;
        }
    },

    loadContractJson: async function (path, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function () {
    AdminDashboard.init();
});
