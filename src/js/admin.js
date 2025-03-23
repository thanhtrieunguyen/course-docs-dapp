const AdminApp = {
    web3: null,
    contracts: {
        auth: null,
        courseDocument: null
    },
    account: null,
    
    init: async function () {
        try {
            // Check if window.ethereum is available
            if (window.ethereum) {
                AdminApp.web3 = new Web3(window.ethereum);
                try {
                    // Request account access
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    
                    // Get connected account
                    const accounts = await AdminApp.web3.eth.getAccounts();
                    AdminApp.account = accounts[0];
                    
                    // Display account address
                    document.getElementById('accountAddress').textContent = 
                        `Account: ${AdminApp.account.substr(0, 6)}...${AdminApp.account.substr(-4)}`;
                    
                    // Initialize contracts
                    await AdminApp.initContracts();
                    
                    // Check if user is admin
                    const isAdmin = await AdminApp.checkAdminRole();
                    if (!isAdmin) {
                        alert('Bạn không có quyền truy cập trang quản trị!');
                        window.location.href = 'index.html';
                        return;
                    }
                    
                    // Load admin data
                    await AdminApp.loadUsers();
                    await AdminApp.loadDocuments();
                    await AdminApp.loadReports();
                    await AdminApp.setupListeners();
                    
                } catch (error) {
                    console.error('User denied account access:', error);
                    alert('Vui lòng cho phép truy cập vào tài khoản MetaMask để tiếp tục!');
                }
            } else {
                alert('Vui lòng cài đặt MetaMask để sử dụng ứng dụng này!');
            }
        } catch (error) {
            console.error('Error initializing AdminApp:', error);
        }
    },
    
    initContracts: async function () {
        try {
            // Initialize Auth contract
            const authResponse = await fetch('../contracts/Auth.json');
            const authArtifact = await authResponse.json();
            const authNetworkId = await AdminApp.web3.eth.net.getId();
            const authDeployedNetwork = authArtifact.networks[authNetworkId];
            AdminApp.contracts.auth = new AdminApp.web3.eth.Contract(
                authArtifact.abi,
                authDeployedNetwork && authDeployedNetwork.address
            );
            
            // Initialize CourseDocument contract
            const docResponse = await fetch('contracts/CourseDocument.json');
            const docArtifact = await docResponse.json();
            const docNetworkId = await AdminApp.web3.eth.net.getId();
            const docDeployedNetwork = docArtifact.networks[docNetworkId];
            AdminApp.contracts.courseDocument = new AdminApp.web3.eth.Contract(
                docArtifact.abi,
                docDeployedNetwork && docDeployedNetwork.address
            );
            
        } catch (error) {
            console.error('Error initializing contracts:', error);
        }
    },
    
    checkAdminRole: async function () {
        try {
            const role = await AdminApp.contracts.auth.methods.getUserRole(AdminApp.account).call();
            return role === 'admin';
        } catch (error) {
            console.error('Error checking admin role:', error);
            return false;
        }
    },
    
    loadUsers: async function () {
        try {
            const usersList = document.getElementById('usersList');
            usersList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu...</div>';
            
            const userCount = await AdminApp.contracts.auth.methods.getUserCount().call();
            let usersHtml = '';
            
            if (userCount == 0) {
                usersList.innerHTML = '<div class="p-4 text-center">Không có người dùng nào.</div>';
                return;
            }
            
            for (let i = 0; i < userCount; i++) {
                const address = await AdminApp.contracts.auth.methods.getUserAtIndex(i).call();
                const userData = await AdminApp.contracts.auth.methods.users(address).call();
                const role = await AdminApp.contracts.auth.methods.getUserRole(address).call();
                
                usersHtml += `
                <div class="py-3" data-address="${address}">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-medium">${userData.name}</p>
                            <p class="text-sm text-gray-500">${address}</p>
                            <p class="text-sm text-gray-700">Email: ${userData.email}</p>
                            <p class="text-sm">
                               <span class="px-2 py-1 rounded text-xs ${role === 'admin' ? 'bg-red-100 text-red-800' : role === 'teacher' ? 'bg-blue-100 text-blue-800' : role === 'dean' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}">
                                    ${role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giảng viên' : role === 'dean' ? 'Trưởng khoa' : 'Sinh viên'}
                                </span>
                            </p>
                        </div>
                        <div class="flex flex-col space-y-2">
                            <select class="role-select border rounded p-1 text-sm" data-address="${address}">
                                <option value="student" ${role === 'student' ? 'selected' : ''}>Sinh viên</option>
                                <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Giảng viên</option>
                                <option value="admin" ${role === 'admin' ? 'selected' : ''}>Quản trị viên</option>
                                <option value="admin" ${role === 'dean' ? 'selected' : ''}>Trưởng khoa</option>
                            </select>
                            <button class="update-role bg-blue-500 text-white text-xs py-1 px-2 rounded hover:bg-blue-600" data-address="${address}">
                                Cập nhật quyền
                            </button>
                        </div>
                    </div>
                </div>
                `;
            }
            
            usersList.innerHTML = usersHtml;
            
            // Add event listeners to update role buttons
            const updateButtons = document.querySelectorAll('.update-role');
            updateButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const address = e.target.dataset.address;
                    const roleSelect = document.querySelector(`.role-select[data-address="${address}"]`);
                    const newRole = roleSelect.value;
                    
                    await AdminApp.updateUserRole(address, newRole);
                });
            });
            
            // Add search functionality
            const searchInput = document.getElementById('userSearchInput');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const userItems = document.querySelectorAll('#usersList > div');
                
                userItems.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    if (text.includes(searchTerm)) {
                        item.style.display = 'block';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
            
        } catch (error) {
            console.error('Error loading users:', error);
            document.getElementById('usersList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách người dùng.</div>';
        }
    },
    
    updateUserRole: async function (address, newRole) {
        try {
            await AdminApp.contracts.auth.methods.setUserRole(address, newRole)
                .send({ from: AdminApp.account });
                
            alert(`Đã cập nhật quyền của người dùng ${address} thành ${newRole}`);
            await AdminApp.loadUsers(); // Reload user list
            
        } catch (error) {
            console.error('Error updating user role:', error);
            alert('Lỗi khi cập nhật quyền người dùng.');
        }
    },
    
    loadDocuments: async function () {
        try {
            const documentsList = document.getElementById('documentsList');
            documentsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu...</div>';
            
            const documentIds = await AdminApp.contracts.courseDocument.methods.getAllDocuments().call();
            let documentsHtml = '';
            
            if (documentIds.length === 0) {
                documentsList.innerHTML = '<div class="p-4 text-center">Không có tài liệu nào.</div>';
                return;
            }
            
            for (let i = 0; i < documentIds.length; i++) {
                const docId = documentIds[i];
                const doc = await AdminApp.contracts.courseDocument.methods.documents(docId).call();
                
                if (doc.ipfsHash === '') continue; // Skip removed documents
                
                const ownerName = await AdminApp.getUserName(doc.owner);
                const date = new Date(doc.timestamp * 1000).toLocaleDateString();
                
                documentsHtml += `
                <div class="py-3" data-doc-id="${docId}">
                    <div class="flex justify-between">
                        <div>
                            <p class="font-medium">${doc.title}</p>
                            <p class="text-sm text-gray-500">${doc.description}</p>
                            <p class="text-sm text-gray-700">Uploaded by: ${ownerName} (${doc.owner.substr(0, 6)}...${doc.owner.substr(-4)})</p>
                            <p class="text-sm text-gray-700">Date: ${date}</p>
                            <div class="flex space-x-2 mt-1">
                                ${doc.isVerified ? 
                                    '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Verified</span>' : 
                                    '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Unverified</span>'
                                }
                                ${doc.isFlagged ? 
                                    `<span class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded" title="${doc.flagReason}">Flagged</span>` : ''
                                }
                                ${doc.isPublic ? 
                                    '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Public</span>' : 
                                    '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">Private</span>'
                                }
                            </div>
                        </div>
                        <div class="flex flex-col space-y-2">
                            ${doc.isVerified ? 
                                `<button class="flag-document bg-yellow-500 text-white text-xs py-1 px-2 rounded hover:bg-yellow-600" data-doc-id="${docId}">
                                    Flag Document
                                </button>` : 
                                `<button class="verify-document bg-green-500 text-white text-xs py-1 px-2 rounded hover:bg-green-600" data-doc-id="${docId}">
                                    Verify Document
                                </button>`
                            }
                            <button class="remove-document bg-red-500 text-white text-xs py-1 px-2 rounded hover:bg-red-600" data-doc-id="${docId}">
                                Remove Document
                            </button>
                            <a href="https://ipfs.io/ipfs/${doc.ipfsHash}" target="_blank" class="bg-blue-500 text-white text-xs py-1 px-2 rounded hover:bg-blue-600 text-center">
                                View Document
                            </a>
                        </div>
                    </div>
                </div>
                `;
            }
            
            documentsList.innerHTML = documentsHtml;
            
            // Add event listeners for document actions
            const verifyButtons = document.querySelectorAll('.verify-document');
            verifyButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const docId = e.target.dataset.docId;
                    await AdminApp.verifyDocument(docId);
                });
            });
            
            const flagButtons = document.querySelectorAll('.flag-document');
            flagButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const docId = e.target.dataset.docId;
                    const reason = prompt("Enter reason for flagging this document:");
                    if (reason) {
                        await AdminApp.flagDocument(docId, reason);
                    }
                });
            });
            
            const removeButtons = document.querySelectorAll('.remove-document');
            removeButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const docId = e.target.dataset.docId;
                    if (confirm("Are you sure you want to remove this document?")) {
                        await AdminApp.removeDocument(docId);
                    }
                });
            });
            
            // Add search functionality
            const searchInput = document.getElementById('contentSearchInput');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const docItems = document.querySelectorAll('#documentsList > div');
                
                docItems.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    if (text.includes(searchTerm)) {
                        item.style.display = 'block';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
            
        } catch (error) {
            console.error('Error loading documents:', error);
            document.getElementById('documentsList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách tài liệu.</div>';
        }
    },
    
    getUserName: async function (address) {
        try {
            const userData = await AdminApp.contracts.auth.methods.users(address).call();
            return userData.name || 'Unknown';
        } catch (error) {
            console.error('Error getting user name:', error);
            return 'Unknown';
        }
    },
    
    verifyDocument: async function (docId) {
        try {
            await AdminApp.contracts.courseDocument.methods.verifyDocument(docId)
                .send({ from: AdminApp.account });
                
            alert('Tài liệu đã được xác thực thành công!');
            await AdminApp.loadDocuments();
            
        } catch (error) {
            console.error('Error verifying document:', error);
            alert('Lỗi khi xác thực tài liệu.');
        }
    },
    
    flagDocument: async function (docId, reason) {
        try {
            await AdminApp.contracts.courseDocument.methods.flagDocument(docId, reason)
                .send({ from: AdminApp.account });
                
            alert('Tài liệu đã được đánh dấu để xem xét!');
            await AdminApp.loadDocuments();
            
        } catch (error) {
            console.error('Error flagging document:', error);
            alert('Lỗi khi đánh dấu tài liệu.');
        }
    },
    
    removeDocument: async function (docId) {
        try {
            await AdminApp.contracts.courseDocument.methods.removeDocument(docId)
                .send({ from: AdminApp.account });
                
            alert('Tài liệu đã được xóa thành công!');
            await AdminApp.loadDocuments();
            
        } catch (error) {
            console.error('Error removing document:', error);
            alert('Lỗi khi xóa tài liệu.');
        }
    },
    
    loadReports: async function () {
        try {
            const reportsList = document.getElementById('reportsList');
            reportsList.innerHTML = '<div class="p-4 text-center">Đang tải dữ liệu...</div>';
            
            const reportIds = await AdminApp.contracts.courseDocument.methods.getAllReports().call();
            let reportsHtml = '';
            
            if (reportIds.length === 0) {
                reportsList.innerHTML = '<div class="p-4 text-center">Không có báo cáo vi phạm nào.</div>';
                return;
            }
            
            for (let i = 0; i < reportIds.length; i++) {
                const reportId = reportIds[i];
                const report = await AdminApp.contracts.courseDocument.methods.reports(reportId).call();
                
                if (report.isResolved) continue; // Skip resolved reports
                
                const reporterName = await AdminApp.getUserName(report.reporter);
                const document = await AdminApp.contracts.courseDocument.methods.documents(report.documentId).call();
                const date = new Date(report.timestamp * 1000).toLocaleDateString();
                
                reportsHtml += `
                <div class="py-3" data-report-id="${reportId}">
                    <div class="flex justify-between">
                        <div>
                            <p class="font-medium">Báo cáo về "${document.title}"</p>
                            <p class="text-sm text-gray-500">Lý do: ${report.reason}</p>
                            <p class="text-sm text-gray-700">Người báo cáo: ${reporterName} (${report.reporter.substr(0, 6)}...)</p>
                            <p class="text-sm text-gray-700">Ngày báo cáo: ${date}</p>
                        </div>
                        <div class="flex flex-col space-y-2">
                            <button class="resolve-report bg-green-500 text-white text-xs py-1 px-2 rounded hover:bg-green-600" data-report-id="${reportId}" data-doc-id="${report.documentId}">
                                Giải quyết
                            </button>
                            <button class="view-document bg-blue-500 text-white text-xs py-1 px-2 rounded hover:bg-blue-600" data-doc-id="${report.documentId}">
                                Xem tài liệu
                            </button>
                        </div>
                    </div>
                </div>
                `;
            }
            
            reportsList.innerHTML = reportsHtml || '<div class="p-4 text-center">Không có báo cáo vi phạm nào.</div>';
            
            // Add event listeners for report actions
            const resolveButtons = document.querySelectorAll('.resolve-report');
            resolveButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const reportId = e.target.dataset.reportId;
                    if (confirm("Bạn có chắc muốn đánh dấu báo cáo này là đã giải quyết?")) {
                        await AdminApp.resolveReport(reportId);
                    }
                });
            });
            
            const viewButtons = document.querySelectorAll('.view-document');
            viewButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const docId = e.target.dataset.docId;
                    const doc = await AdminApp.contracts.courseDocument.methods.documents(docId).call();
                    window.open(`https://ipfs.io/ipfs/${doc.ipfsHash}`, '_blank');
                });
            });
            
        } catch (error) {
            console.error('Error loading reports:', error);
            document.getElementById('reportsList').innerHTML = 
                '<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách báo cáo.</div>';
        }
    },
    
    resolveReport: async function (reportId) {
        try {
            await AdminApp.contracts.courseDocument.methods.resolveReport(reportId)
                .send({ from: AdminApp.account });
                
            alert('Báo cáo đã được đánh dấu là đã giải quyết!');
            await AdminApp.loadReports();
            
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Lỗi khi giải quyết báo cáo.');
        }
    },
    
    setupListeners: function() {
        // System pause/resume buttons
        document.getElementById('pauseSystemBtn').addEventListener('click', async () => {
            try {
                await AdminApp.contracts.courseDocument.methods.pauseSystem()
                    .send({ from: AdminApp.account });
                alert('Hệ thống đã được tạm dừng thành công!');
            } catch (error) {
                console.error('Error pausing system:', error);
                alert('Lỗi khi tạm dừng hệ thống.');
            }
        });
        
        document.getElementById('resumeSystemBtn').addEventListener('click', async () => {
            try {
                await AdminApp.contracts.courseDocument.methods.unpauseSystem()
                    .send({ from: AdminApp.account });
                alert('Hệ thống đã được kích hoạt lại thành công!');
            } catch (error) {
                console.error('Error resuming system:', error);
                alert('Lỗi khi kích hoạt lại hệ thống.');
            }
        });
    }
};

window.addEventListener('load', function() {
    // Initialize the admin application
    AdminApp.init();
});