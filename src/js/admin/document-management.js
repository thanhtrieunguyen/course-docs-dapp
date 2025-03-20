const DocumentManagement = {
    web3: null,
    contracts: {
        auth: null,
        courseDocument: null
    },
    account: null,
    documents: [],
    selectedDocument: null,
    courses: [],
    modalCallback: null,

    init: async function () {
        try {
            // Initialize web3
            if (window.ethereum) {
                this.web3 = new Web3(window.ethereum);
                try {
                    // Request account access
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const accounts = await this.web3.eth.getAccounts();
                    this.account = accounts[0];
                    document.getElementById('accountAddress').textContent = 
                        `Tài khoản: ${this.account.substr(0, 6)}...${this.account.substr(-4)}`;
                } catch (error) {
                    this.showStatus('error', 'Vui lòng kết nối với MetaMask để sử dụng ứng dụng này');
                    return;
                }
            } else {
                this.showStatus('error', 'MetaMask không được tìm thấy. Vui lòng cài đặt MetaMask để tiếp tục.');
                return;
            }
            
            // Verify admin access
            const isAdmin = await this.checkAdminAccess();
            // if (!isAdmin) {
            //     alert('Bạn không có quyền truy cập trang quản lý tài liệu');
            //     window.location.href = "../login.html";
            //     return;
            // }
            
            // Initialize contracts
            await this.initContract();
            
            // Load courses for filter and edit form
            await this.loadCourses();
            
            // Load documents
            await this.loadDocuments();
            
            // Setup event handlers
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing DocumentManagement:', error);
            this.showStatus('error', 'Đã xảy ra lỗi khi khởi tạo: ' + error.message);
        }
    },
    
    checkAdminAccess: async function() {
        try {
            // Check if AuthApp is available
            if (!window.AuthApp) {
                console.error("AuthApp is not defined. Make sure auth.js is loaded before document-management.js");
                return false;
            }
            
            // Initialize AuthApp if needed
            if (!AuthApp.web3) {
                await AuthApp.init();
            }
            
            // Verify that the auth contract is initialized
            if (!AuthApp.contracts || !AuthApp.contracts.auth) {
                console.error("AuthApp.contracts.auth is not initialized. Make sure auth contract is properly loaded");
                return false;
            }
            
            // Check if user is logged in and has admin role
            const role = await AuthApp.contracts.auth.methods.getUserRole(this.account).call();
            return role === 'admin';
        } catch (error) {
            console.error("Error checking admin access:", error);
            return false;
        }
    },
    
    initContract: async function() {
        try {
            // Load Auth contract
            const authResponse = await fetch('../contracts/Auth.json');
            const authData = await authResponse.json();
            
            // Get contract instance
            const networkId = await this.web3.eth.net.getId();
            
            // Initialize Auth contract
            const deployedAuth = authData.networks[networkId];
            if (!deployedAuth) {
                throw new Error('Auth contract not deployed to detected network.');
            }
            
            this.contracts.auth = new this.web3.eth.Contract(
                authData.abi,
                deployedAuth.address
            );
            
            // Load CourseDocument contract
            const courseDocResponse = await fetch('../contracts/CourseDocument.json');
            const courseDocData = await courseDocResponse.json();
            
            // Initialize CourseDocument contract
            const deployedCourseDoc = courseDocData.networks[networkId];
            if (!deployedCourseDoc) {
                throw new Error('CourseDocument contract not deployed to detected network.');
            }
            
            this.contracts.courseDocument = new this.web3.eth.Contract(
                courseDocData.abi,
                deployedCourseDoc.address
            );
            
        } catch (error) {
            console.error("Error loading contract:", error);
            throw error;
        }
    },
    
    loadCourses: async function() {
        try {
            // Implementation will depend on how courses are stored
            // For now, use a placeholder implementation
            const courseSelect = document.getElementById('filterCourse');
            const editCourseSelect = document.getElementById('editCourse');
            
            // Fetch courses from API
            const response = await fetch('/api/courses', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.courses = result.courses || [];
                    
                    // Add courses to filter dropdown
                    let courseOptions = '<option value="">Tất cả khóa học</option>';
                    let editCourseOptions = '<option value="">Không thuộc khóa học nào</option>';
                    
                    this.courses.forEach(course => {
                        courseOptions += `<option value="${course.id}">${course.name}</option>`;
                        editCourseOptions += `<option value="${course.id}">${course.name}</option>`;
                    });
                    
                    courseSelect.innerHTML = courseOptions;
                    editCourseSelect.innerHTML = editCourseOptions;
                }
            }
        } catch (error) {
            console.error("Error loading courses:", error);
            this.showStatus('warning', 'Không thể tải danh sách khóa học: ' + error.message);
        }
    },
    
    loadDocuments: async function() {
        console.log("Starting document loading process...");
        try {
            const tbody = document.getElementById('documentTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="py-4 px-4 text-center">Đang tải dữ liệu tài liệu...</td></tr>';

            // Get token from localStorage
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                throw new Error('No authentication token found');
            }
            const auth = JSON.parse(userAuth);
            
            // Get document count from blockchain
            console.log("Fetching document count from blockchain...");
            const documentCount = await this.contracts.courseDocument.methods.getDocumentCount().call();
            console.log(`Document count: ${documentCount}`);

            if (parseInt(documentCount) === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-4 px-4 text-center">Không có tài liệu nào</td></tr>';
                return;
            }

            // Get all document IDs
            console.log(`Fetching ${documentCount} document IDs...`);
            const documentIds = await this.contracts.courseDocument.methods.getDocuments(0, parseInt(documentCount)).call();
            console.log(`Received ${documentIds.length} document IDs:`, documentIds);

            // Clear documents array
            this.documents = [];
            let tableRows = '';

            // Fetch document details for each ID
            for (let i = 0; i < documentIds.length; i++) {
                const docId = documentIds[i];
                try {
                    console.log(`Fetching details for document ID ${docId} (${i+1}/${documentIds.length})...`);
                    const doc = await this.contracts.courseDocument.methods.documents(docId).call();

                    // Skip deleted documents
                    if (!doc.documentHash) {
                        console.log(`Document ${docId} has empty hash, skipping...`);
                        continue;
                    }

                    // Fetch additional info from MongoDB
                    let mongoDoc = null;
                    try {
                        const response = await fetch(`/api/document/${docId}`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${auth.token}`
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data.success) {
                                mongoDoc = data.document;
                            }
                        }
                    } catch (err) {
                        console.warn('Could not fetch additional document info:', err);
                    }

                    // Convert BigInt values to regular numbers
                    const timestamp = Number(doc.timestamp);
                    const accessCount = Number(doc.accessCount || 0);

                    // Create document object
                    const document = {
                        id: docId,
                        title: doc.title,
                        description: doc.description,
                        owner: doc.owner,
                        documentHash: doc.documentHash,
                        ipfsHash: doc.ipfsHash || mongoDoc?.ipfsHash,
                        courseId: doc.courseId,
                        timestamp: timestamp,
                        accessCount: accessCount,
                        isPublic: doc.isPublic,
                        isVerified: doc.isVerified,
                        isFlagged: doc.isFlagged
                    };

                    this.documents.push(document);

                    // Format date for display
                    const uploadDate = new Date(timestamp * 1000).toLocaleDateString('vi-VN');

                    // Add table row
                    tableRows += `
                    <tr data-document-id="${docId}">
                        <td class="py-3 px-4 border-b">${doc.title}</td>
                        <td class="py-3 px-4 border-b">${doc.owner}</td>
                        <td class="py-3 px-4 border-b">${uploadDate}</td>
                        <td class="py-3 px-4 border-b">
                            <div class="flex flex-wrap gap-1">
                                ${doc.isVerified ? 
                                    '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Đã xác thực</span>' : 
                                    '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Chưa xác thực</span>'
                                }
                                ${doc.isPublic ? 
                                    '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Công khai</span>' : 
                                    '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">Riêng tư</span>'
                                }
                                ${doc.isFlagged ? 
                                    '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">Đã gắn cờ</span>' : 
                                    ''
                                }
                            </div>
                        </td>
                        <td class="py-3 px-4 border-b">${doc.courseId || 'Không có'}</td>
                        <td class="py-3 px-4 border-b">
                            <button class="view-document-btn bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 mr-2">
                                <i class="fas fa-eye"></i> Xem
                            </button>
                            <button class="edit-document-btn bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600 mr-2">
                                <i class="fas fa-edit"></i> Chi tiết
                            </button>
                            <button class="delete-document-btn bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                                <i class="fas fa-trash"></i> Xóa
                            </button>
                        </td>
                    </tr>
                    `;
                } catch (error) {
                    console.error(`Error processing document ${docId}:`, error);
                    continue;
                }
            }

            console.log(`Successfully processed ${this.documents.length} documents out of ${documentIds.length} IDs`);

            if (this.documents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-4 px-4 text-center">Không tìm thấy tài liệu hợp lệ nào</td></tr>';
            } else {
                tbody.innerHTML = tableRows;
            }

        } catch (error) {
            console.error("Error loading documents:", error);
            document.getElementById('documentTableBody').innerHTML = 
                `<tr><td colspan="6" class="py-4 px-4 text-center text-red-500">
                Lỗi khi tải dữ liệu: ${error.message}</td></tr>`;
        }
    },
    
    getCourseNameById: function(courseId) {
        if (!courseId) return '';
        const course = this.courses.find(c => c.id === courseId);
        return course ? course.name : courseId;
    },
    
    setupEventListeners: function() {
        // Document table row actions
        document.addEventListener('click', function(e) {
            if (e.target.closest('.view-document-btn')) {
                const row = e.target.closest('tr');
                const documentId = row.dataset.documentId;
                DocumentManagement.viewDocument(documentId);
            } else if (e.target.closest('.edit-document-btn')) {
                const row = e.target.closest('tr');
                const documentId = row.dataset.documentId;
                DocumentManagement.editDocument(documentId);
            } else if (e.target.closest('.delete-document-btn')) {
                const row = e.target.closest('tr');
                const documentId = row.dataset.documentId;
                DocumentManagement.confirmDeleteDocument(documentId);
            }
        });
        
        // Cancel edit button
        document.getElementById('cancelEditBtn').addEventListener('click', function() {
            DocumentManagement.cancelEdit();
        });
        
        // Document action buttons
        document.getElementById('viewDocumentBtn').addEventListener('click', function() {
            if (DocumentManagement.selectedDocument) {
                DocumentManagement.viewDocument(DocumentManagement.selectedDocument.id);
            }
        });
        
        document.getElementById('flagDocumentBtn').addEventListener('click', function() {
            if (DocumentManagement.selectedDocument) {
                DocumentManagement.showFlagModal(DocumentManagement.selectedDocument.id);
            }
        });
        
        document.getElementById('removeDocumentBtn').addEventListener('click', function() {
            if (DocumentManagement.selectedDocument) {
                DocumentManagement.confirmDeleteDocument(DocumentManagement.selectedDocument.id);
            }
        });
        
        // Edit document form submit
        document.getElementById('editDocumentForm').addEventListener('submit', function(e) {
            e.preventDefault();
            DocumentManagement.updateDocument();
        });
        
        // Confirm modal actions
        document.getElementById('cancelModalBtn').addEventListener('click', function() {
            DocumentManagement.hideModal();
        });
        
        document.getElementById('confirmModalBtn').addEventListener('click', function() {
            if (DocumentManagement.modalCallback) {
                DocumentManagement.modalCallback();
            }
            DocumentManagement.hideModal();
        });
        
        // Flag modal actions
        document.getElementById('cancelFlagBtn').addEventListener('click', function() {
            document.getElementById('flagModal').classList.add('hidden');
        });
        
        document.getElementById('confirmFlagBtn').addEventListener('click', function() {
            const reason = document.getElementById('flagReason').value;
            const docId = DocumentManagement.selectedDocument.id;
            DocumentManagement.flagDocument(docId, reason);
            document.getElementById('flagModal').classList.add('hidden');
        });
        
        // Search and filter
        document.getElementById('searchDocument').addEventListener('input', function() {
            DocumentManagement.filterDocuments();
        });
        
        document.getElementById('filterStatus').addEventListener('change', function() {
            DocumentManagement.filterDocuments();
        });
        
        document.getElementById('filterCourse').addEventListener('change', function() {
            DocumentManagement.filterDocuments();
        });
    },
    
    viewDocument: function(documentId) {
        const doc = this.documents.find(d => d.id === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu');
            return;
        }
        
        // If IPFS hash exists, open it in a new window
        if (doc.ipfsHash) {
            window.open(`https://ipfs.io/ipfs/${doc.ipfsHash}`, '_blank');
        } else {
            // Otherwise try to fetch from MongoDB API
            this.viewDocumentFromMongoDB(documentId);
        }
    },
    
    viewDocumentFromMongoDB: async function(documentId) {
        try {
            const response = await fetch(`/api/document/${documentId}/content`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.url) {
                    window.open(result.url, '_blank');
                } else {
                    throw new Error(result.error || 'Không thể tải tài liệu');
                }
            } else {
                throw new Error('Lỗi khi tải tài liệu');
            }
        } catch (error) {
            console.error('Error viewing document:', error);
            this.showStatus('error', 'Không thể xem tài liệu: ' + error.message);
        }
    },
    
    editDocument: function(documentId) {
        const doc = this.documents.find(d => d.id === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu');
            return;
        }
        
        // Store selected document
        this.selectedDocument = doc;
        
        // Fill form with document data
        document.getElementById('editDocumentId').value = doc.id;
        document.getElementById('editTitle').value = doc.title;
        document.getElementById('editDescription').value = doc.description;
        document.getElementById('editOwner').value = doc.ownerName + ' (' + doc.owner.substr(0, 10) + '...)';
        document.getElementById('editIsPublic').checked = doc.isPublic;
        document.getElementById('editIsVerified').checked = doc.isVerified;
        
        // Set course if it exists
        if (doc.courseId) {
            const courseSelect = document.getElementById('editCourse');
            for (let i = 0; i < courseSelect.options.length; i++) {
                if (courseSelect.options[i].value === doc.courseId) {
                    courseSelect.selectedIndex = i;
                    break;
                }
            }
        } else {
            document.getElementById('editCourse').selectedIndex = 0;
        }
        
        // Show edit form, hide placeholder
        document.getElementById('documentDetailForm').classList.remove('hidden');
        document.getElementById('noDocumentSelected').classList.add('hidden');
    },
    
    cancelEdit: function() {
        // Clear form fields
        document.getElementById('editDocumentForm').reset();
        
        // Hide edit form, show placeholder
        document.getElementById('documentDetailForm').classList.add('hidden');
        document.getElementById('noDocumentSelected').classList.remove('hidden');
        
        // Clear selected document
        this.selectedDocument = null;
    },
    
    updateDocument: async function() {
        try {
            if (!this.selectedDocument) {
                this.showStatus('error', 'Không có tài liệu nào được chọn');
                return;
            }
            
            const docId = this.selectedDocument.id;
            const title = document.getElementById('editTitle').value;
            const description = document.getElementById('editDescription').value;
            const courseId = document.getElementById('editCourse').value;
            const isPublic = document.getElementById('editIsPublic').checked;
            const isVerified = document.getElementById('editIsVerified').checked;
            
            // Validate inputs
            if (!title || !description) {
                this.showStatus('error', 'Tiêu đề và mô tả không được để trống');
                return;
            }
            
            // Check if document verification status changed
            if (isVerified !== this.selectedDocument.isVerified) {
                if (isVerified) {
                    // Verify document on blockchain
                    await this.contracts.courseDocument.methods.verifyDocument(docId)
                        .send({ from: this.account });
                } else {
                    // Currently no way to un-verify, so warn and exit
                    this.showStatus('warning', 'Không thể bỏ xác thực tài liệu đã được xác thực');
                    document.getElementById('editIsVerified').checked = true;
                    return;
                }
            }
            
            // Update document metadata on MongoDB
            const response = await fetch(`/api/admin/update-document`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documentId: docId,
                    title: title,
                    description: description,
                    courseId: courseId,
                    isPublic: isPublic
                })
            });
            
            if (!response.ok) {
                throw new Error('Lỗi khi cập nhật tài liệu');
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Không thể cập nhật tài liệu');
            }
            
            this.showStatus('success', 'Cập nhật tài liệu thành công');
            
            // Reload documents
            await this.loadDocuments();
            
            // Hide edit form
            this.cancelEdit();
            
        } catch (error) {
            console.error('Error updating document:', error);
            this.showStatus('error', 'Lỗi khi cập nhật tài liệu: ' + error.message);
        }
    },
    
    showFlagModal: function(documentId) {
        const doc = this.documents.find(d => d.id === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu');
            return;
        }
        
        // Store selected document
        this.selectedDocument = doc;
        
        // Clear reason field
        document.getElementById('flagReason').value = '';
        
        // Show flag modal
        document.getElementById('flagModal').classList.remove('hidden');
    },
    
    flagDocument: async function(documentId, reason) {
        try {
            if (!reason) {
                this.showStatus('error', 'Vui lòng nhập lý do gắn cờ');
                return;
            }
            
            await this.contracts.courseDocument.methods.flagDocument(documentId, reason)
                .send({ from: this.account });
                
            this.showStatus('success', 'Tài liệu đã được gắn cờ thành công');
            
            // Reload documents
            await this.loadDocuments();
            
        } catch (error) {
            console.error('Error flagging document:', error);
            this.showStatus('error', 'Lỗi khi gắn cờ tài liệu: ' + error.message);
        }
    },
    
    confirmDeleteDocument: function(documentId) {
        const doc = this.documents.find(d => d.id === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu');
            return;
        }
        
        // Store selected document
        this.selectedDocument = doc;
        
        // Set modal content
        document.getElementById('modalTitle').textContent = 'Xác nhận xóa tài liệu';
        document.getElementById('modalMessage').textContent = 
            `Bạn có chắc chắn muốn xóa tài liệu "${doc.title}"?`;
        
        // Set callback
        this.modalCallback = function() {
            DocumentManagement.deleteDocument(documentId);
        };
        
        // Show modal
        this.showModal();
    },
    
    deleteDocument: async function(documentId) {
        try {
            // Call removeDocument on blockchain
            await this.contracts.courseDocument.methods.removeDocument(documentId)
                .send({ from: this.account });
                
            // Optional: Mark as deleted on MongoDB
            const response = await fetch(`/api/admin/delete-document`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documentId: documentId
                })
            });
            
            this.showStatus('success', 'Xóa tài liệu thành công');
            
            // If we were editing this document, clear the form
            if (this.selectedDocument && this.selectedDocument.id === documentId) {
                this.cancelEdit();
            }
            
            // Reload documents
            await this.loadDocuments();
            
        } catch (error) {
            console.error('Error deleting document:', error);
            this.showStatus('error', 'Lỗi khi xóa tài liệu: ' + error.message);
        }
    },
    
    filterDocuments: function() {
        const searchTerm = document.getElementById('searchDocument').value.toLowerCase();
        const statusFilter = document.getElementById('filterStatus').value;
        const courseFilter = document.getElementById('filterCourse').value;
        
        const rows = document.querySelectorAll('#documentTableBody tr');
        
        rows.forEach(row => {
            // Skip header row or rows without document ID
            if (!row.dataset.documentId) return;
            
            const doc = this.documents.find(d => d.id === row.dataset.documentId);
            if (!doc) return;
            
            // Check if matches search term
            const title = doc.title.toLowerCase();
            const description = doc.description.toLowerCase();
            const owner = doc.ownerName.toLowerCase();
            const matchesSearch = title.includes(searchTerm) || 
                description.includes(searchTerm) || 
                owner.includes(searchTerm);
            
            // Check if matches status filter
            let matchesStatus = true;
            if (statusFilter) {
                switch (statusFilter) {
                    case 'verified':
                        matchesStatus = doc.isVerified;
                        break;
                    case 'unverified':
                        matchesStatus = !doc.isVerified;
                        break;
                    case 'public':
                        matchesStatus = doc.isPublic;
                        break;
                    case 'private':
                        matchesStatus = !doc.isPublic;
                        break;
                    case 'flagged':
                        matchesStatus = doc.isFlagged;
                        break;
                }
            }
            
            // Check if matches course filter
            const matchesCourse = !courseFilter || doc.courseId === courseFilter;
            
            // Show or hide row
            if (matchesSearch && matchesStatus && matchesCourse) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },
    
    showModal: function() {
        document.getElementById('confirmModal').classList.remove('hidden');
    },
    
    hideModal: function() {
        document.getElementById('confirmModal').classList.add('hidden');
        this.modalCallback = null;
    },
    
    showStatus: function(type, message) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'bg-yellow-100');
        
        if (type === 'success') {
            statusDiv.classList.add('bg-green-100', 'text-green-800', 'border-green-300');
        } else if (type === 'error') {
            statusDiv.classList.add('bg-red-100', 'text-red-800', 'border-red-300');
        } else if (type === 'warning') {
            statusDiv.classList.add('bg-yellow-100', 'text-yellow-800', 'border-yellow-300');
        }
        
        statusDiv.textContent = message;
        statusDiv.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    DocumentManagement.init();
});
