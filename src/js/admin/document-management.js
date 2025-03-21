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
        try {
            const tbody = document.getElementById('documentTableBody');
            if (!tbody) {
                console.error('Table body element not found');
                return;
            }

            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Đang tải dữ liệu...</td></tr>';

            // Lấy và kiểm tra token
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) {
                this.handleAuthError();
                return;
            }

            const auth = JSON.parse(userAuth);
            if (!auth.token || !auth.timestamp) {
                this.handleAuthError();
                return;
            }

            // Kiểm tra thời hạn token (24h)
            const now = Date.now();
            const tokenAge = now - auth.timestamp;
            if (tokenAge > 24 * 60 * 60 * 1000) { // 24 hours
                this.handleAuthError('Token đã hết hạn');
                return;
            }

            // Gọi API với token
            const response = await fetch('/api/admin/documents', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${auth.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 403) {
                this.handleAuthError('Token không hợp lệ hoặc đã hết hạn');
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Lỗi kết nối với server');
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Lỗi khi tải dữ liệu');
            }

            this.documents = result.documents;

            // Render documents table
            const tableRows = this.documents.map(doc => {
                return `
                    <tr data-document-id="${doc.id}">
                        <td class="p-2">${doc.title}</td>
                        <td class="p-2">${doc.ownerName}</td>
                        <td class="p-2">${doc.isPublic ? 'Công khai' : 'Riêng tư'}</td>
                        <td class="p-2">${new Date(doc.uploadDate).toLocaleDateString()}</td>
                        <td class="p-2 flex space-x-2">
                            <button class="view-document-btn text-blue-600 hover:text-blue-800">
                                Xem
                            </button>
                            <button class="edit-document-btn text-yellow-600 hover:text-yellow-800 mx-2">
                                Sửa
                            </button>
                            <button class="delete-document-btn text-red-600 hover:text-red-800">
                                Xóa
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = tableRows || '<tr><td colspan="5" class="text-center p-4">Không có tài liệu nào</td></tr>';

        } catch (error) {
            console.error("Error loading documents:", error);
            const tbody = document.getElementById('documentTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">
                    Lỗi khi tải danh sách tài liệu: ${error.message}</td></tr>`;
            }
            this.showStatus('error', 'Lỗi khi tải danh sách tài liệu: ' + error.message);
        }
    },

    handleAuthError: function(message = 'Phiên đăng nhập đã hết hạn') {
        // Xóa thông tin đăng nhập
        localStorage.removeItem('userAuth');
        localStorage.removeItem('token');
        
        // Hiển thị thông báo
        this.showStatus('error', message);
        
        // Lưu URL hiện tại để redirect sau khi đăng nhập lại
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
        
        // Chuyển hướng về trang đăng nhập sau 2 giây
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 2000);
    },
    
    getCourseNameById: function(courseId) {
        if (!courseId) return '';
        const course = this.courses.find(c => c.id === courseId);
        return course ? course.name : courseId;
    },
    
    setupEventListeners: function() {
        // Document table row actions
        document.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row || !row.dataset.documentId) return;
            
            const documentId = row.dataset.documentId;
            
            if (e.target.closest('.view-document-btn')) {
                this.viewDocument(documentId);
            } else if (e.target.closest('.edit-document-btn')) {
                this.editDocument(documentId);
            } else if (e.target.closest('.delete-document-btn')) {
                this.confirmDeleteDocument(documentId);
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
    
    viewDocument: async function(documentId) {
        try {
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) throw new Error('Không tìm thấy thông tin xác thực');
            const auth = JSON.parse(userAuth);

            // Check if document exists first
            const doc = this.documents.find(d => d.id === documentId);
            if (!doc) throw new Error('Không tìm thấy tài liệu');

            const response = await fetch(`/api/documents/${documentId}/view`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${auth.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Không thể tải tài liệu');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
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
                throw new Error('Không có tài liệu nào được chọn');
            }

            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) throw new Error('Không tìm thấy thông tin xác thực');
            const auth = JSON.parse(userAuth);

            const docId = this.selectedDocument.id;
            const formData = new FormData();
            formData.append('title', document.getElementById('editTitle').value);
            formData.append('description', document.getElementById('editDescription').value);
            formData.append('courseId', document.getElementById('editCourse').value);
            formData.append('isPublic', document.getElementById('editIsPublic').checked);

            const response = await fetch(`/api/documents/${docId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${auth.token}`
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Không thể cập nhật tài liệu');
            }

            await this.loadDocuments();
            this.cancelEdit();
            this.showStatus('success', 'Cập nhật tài liệu thành công');

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
            const userAuth = localStorage.getItem('userAuth');
            if (!userAuth) throw new Error('Không tìm thấy thông tin xác thực');
            const auth = JSON.parse(userAuth);

            const response = await fetch(`/api/documents/${documentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${auth.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Không thể xóa tài liệu');
            }

            // Remove from local array
            this.documents = this.documents.filter(doc => doc.id !== documentId);
            
            // Remove row from table
            const row = document.querySelector(`tr[data-document-id="${documentId}"]`);
            if (row) row.remove();

            this.showStatus('success', 'Xóa tài liệu thành công');

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
