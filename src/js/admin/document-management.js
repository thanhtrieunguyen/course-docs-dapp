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
        this.setupEventListeners();
        await this.loadDocuments();
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
            await this.initContract();
            await this.loadCourses();
            await this.loadDocuments();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing DocumentManagement:', error);
            this.showStatus('error', 'Đã xảy ra lỗi khi khởi tạo: ' + error.message);
        }
    },
    
    checkAdminAccess: async function() {
        console.log("Kiểm tra quyền với account:", this.account);
        if (!window.AuthApp) {
            console.error("AuthApp is not defined");
            return false;
        }
        if (!AuthApp.web3) {
            await AuthApp.init();
        }
        if (!AuthApp.contracts || !AuthApp.contracts.auth) {
            console.error("Auth contract not initialized");
            return false;
        }
        const role = await AuthApp.contracts.auth.methods.getUserRole(this.account).call();
        console.log("Vai trò từ blockchain:", role);
        const hasAccess = role === 'admin' || role === 'dean';
        console.log("Kết quả kiểm tra:", hasAccess);
        return hasAccess;
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
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Đang tải dữ liệu...</td></tr>';

            const userAuth = JSON.parse(localStorage.getItem('userAuth'));
            if (!userAuth?.token) {
                this.handleAuthError();
                return;
            }

            const response = await fetch('/api/admin/documents', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${userAuth.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Lỗi kết nối với server');
            }

            const result = await response.json();
            if (!result.success || !Array.isArray(result.documents)) {
                throw new Error(result.error || 'Dữ liệu tài liệu không hợp lệ');
            }

            this.documents = result.documents;
            console.log('Loaded documents:', this.documents);

            const tableRows = this.documents.map(doc => `
                <tr data-document-id="${doc.documentId}">
                    <td class="py-2 px-4">${doc.title || 'Không có tiêu đề'}</td>
                    <td class="py-2 px-4">${doc.ownerName || 'Không xác định'}</td>
                    <td class="py-2 px-4">${this.getCourseNameById(doc.courseId) || 'Không có'}</td>
                    <td class="py-2 px-4">${doc.uploadDate ? new Date(doc.uploadDate).toLocaleString() : 'N/A'}</td>
                    <td class="py-2 px-4">${this.getStatusText(doc)}</td>
                    <td class="py-2 px-4 flex space-x-2">
                        <button class="view-document-btn bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600" data-id="${doc.documentId}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="edit-document-btn bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600" data-id="${doc.documentId}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-document-btn bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600" data-id="${doc.documentId}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            tbody.innerHTML = tableRows || '<tr><td colspan="6" class="text-center p-4">Không có tài liệu nào</td></tr>';
            document.getElementById('documentCount').textContent = this.documents.length;
        } catch (error) {
            console.error('Error loading documents:', error);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-500">Lỗi: ${error.message}</td></tr>`;
            this.showStatus('error', 'Lỗi khi tải danh sách tài liệu: ' + error.message);
        }
    },

    getStatusText: function(doc) {
        let status = [];
        if (doc.isPublic) status.push('Công khai');
        if (doc.isVerified) status.push('Đã xác thực');
        if (doc.isFlagged) status.push('Đã gắn cờ');
        return status.join(', ') || 'Riêng tư';
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
        document.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-document-btn');
            const editBtn = e.target.closest('.edit-document-btn');
            const deleteBtn = e.target.closest('.delete-document-btn');

            if (viewBtn) {
                const documentId = viewBtn.dataset.id || viewBtn.closest('tr')?.dataset.documentId;
                console.log('View button clicked, documentId:', documentId);
                if (!documentId) {
                    this.showStatus('error', 'Không thể xác định tài liệu để xem');
                    return;
                }
                this.viewDocument(documentId);
            } else if (editBtn) {
                const documentId = editBtn.dataset.id || editBtn.closest('tr')?.dataset.documentId;
                console.log('Edit button clicked, documentId:', documentId);
                if (!documentId) {
                    this.showStatus('error', 'Không thể xác định tài liệu để sửa');
                    return;
                }
                this.editDocument(documentId);
            } else if (deleteBtn) {
                const documentId = deleteBtn.dataset.id || deleteBtn.closest('tr')?.dataset.documentId;
                console.log('Delete button clicked, documentId:', documentId);
                if (!documentId) {
                    this.showStatus('error', 'Không thể xác định tài liệu để xóa');
                    return;
                }
                this.confirmDeleteDocument(documentId);
            } else if (e.target.id === 'viewDocumentBtn') {
                if (this.selectedDocument) {
                    this.viewDocument(this.selectedDocument.documentId);
                } else {
                    this.showStatus('error', 'Vui lòng chọn một tài liệu trước');
                }
            } else if (e.target.id === 'deleteDocumentBtn') {
                if (this.selectedDocument) {
                    this.confirmDeleteDocument(this.selectedDocument.documentId);
                } else {
                    this.showStatus('error', 'Vui lòng chọn một tài liệu trước');
                }
            } else if (e.target.id === 'cancelEditBtn') {
                this.cancelEdit();
            } else if (e.target.id === 'cancelModalBtn') {
                this.hideModal();
            } else if (e.target.id === 'confirmModalBtn') {
                if (this.modalCallback) {
                    this.modalCallback();
                    this.hideModal();
                }
            }
        });

        const editDocumentForm = document.getElementById('editDocumentForm');
        if (editDocumentForm) {
            editDocumentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateDocument();
            });
        }

        const searchDocument = document.getElementById('searchDocument');
        if (searchDocument) searchDocument.addEventListener('input', () => this.filterDocuments());

        const filterStatus = document.getElementById('filterStatus');
        if (filterStatus) filterStatus.addEventListener('change', () => this.filterDocuments());

        const filterCourse = document.getElementById('filterCourse');
        if (filterCourse) filterCourse.addEventListener('change', () => this.filterDocuments());
    },
    
    viewDocument: async function(documentId) {
        try {
            const userAuth = JSON.parse(localStorage.getItem('userAuth'));
            if (!userAuth?.token) throw new Error('Không tìm thấy thông tin xác thực');
    
            console.log('Viewing document with ID:', documentId);
            console.log('Current documents array:', JSON.stringify(this.documents, null, 2)); // Hiển thị chi tiết
            console.log('Using token:', userAuth.token);
    
            const doc = this.documents.find(d => d.documentId === documentId);
            if (!doc) {
                console.log('Document not found in local array:', documentId);
                throw new Error('Không tìm thấy tài liệu trong danh sách hiện tại');
            }
            console.log('Found document:', doc);
    
            const response = await fetch(`/api/document/${documentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${userAuth.token}`
                }
            });
    
            console.log('API response status:', response.status, response.statusText);
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Không thể tải tài liệu: ${response.status} ${response.statusText} - ${errorData}`);
            }
    
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const fileExtension = doc.fileType ? doc.fileType.split('/')[1] : 'pdf';
            if (['pdf', 'txt'].includes(fileExtension)) {
                window.open(url, '_blank');
            } else {
                const link = document.createElement('a');
                link.href = url;
                link.download = doc.fileName || `${doc.title}.${fileExtension}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            window.URL.revokeObjectURL(url);
    
            this.showStatus('success', 'Đã mở tài liệu thành công');
        } catch (error) {
            console.error('Error viewing document:', error);
            this.showStatus('error', 'Không thể xem tài liệu: ' + error.message);
        }
    },
    
    loadActivityLog: async function(documentId) {
        const logDiv = document.getElementById('documentActivityLog');
        logDiv.innerHTML = '<p class="text-gray-500 italic">Đang tải lịch sử hoạt động...</p>';

        try {
            const userAuth = JSON.parse(localStorage.getItem('userAuth'));
            const response = await fetch(`/api/documents/${documentId}/activity`, {
                headers: {
                    'Authorization': `Bearer ${userAuth.token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                const logs = result.logs || [];
                logDiv.innerHTML = logs.length > 0 
                    ? logs.map(log => `<p>${new Date(log.timestamp).toLocaleString()}: ${log.action}</p>`).join('')
                    : '<p class="text-gray-500">Không có lịch sử hoạt động</p>';
            }
        } catch (error) {
            logDiv.innerHTML = `<p class="text-red-500">Lỗi tải lịch sử: ${error.message}</p>`;
        }
    },

    editDocument: function(documentId) {
        const doc = this.documents.find(d => d.documentId === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu để sửa');
            this.loadDocuments(); // Làm mới danh sách
            return;
        }

        this.selectedDocument = doc;
        document.getElementById('documentDetailForm').classList.remove('hidden');
        document.getElementById('noDocumentSelected').classList.add('hidden');

        // Điền thông tin vào form
        document.getElementById('editDocumentId').value = doc.documentId;
        document.getElementById('editTitle').value = doc.title || '';
        document.getElementById('editOwner').value = doc.ownerName || doc.owner || 'Không xác định';
        document.getElementById('editDescription').value = doc.description || '';
        document.getElementById('editCourse').value = doc.courseId || '';
        document.getElementById('editCategory').value = doc.category || '';
        document.getElementById('editIsPublic').checked = doc.isPublic || false;
        document.getElementById('editIsVerified').checked = doc.isVerified || false;
        document.getElementById('editIsFeatured').checked = doc.isFeatured || false;
        document.getElementById('editIsArchived').checked = doc.isArchived || false;
    },


    
    cancelEdit: function() {
        this.selectedDocument = null;
        document.getElementById('documentDetailForm').classList.add('hidden');
        document.getElementById('noDocumentSelected').classList.remove('hidden');
    },

    updateDocument: async function() {
        try {
            const userAuth = JSON.parse(localStorage.getItem('userAuth'));
            if (!userAuth?.token) throw new Error('Không tìm thấy thông tin xác thực');
    
            const documentId = document.getElementById('editDocumentId').value;
            const updatedData = {
                title: document.getElementById('editTitle').value,
                description: document.getElementById('editDescription').value,
                courseId: document.getElementById('editCourse').value,
                category: document.getElementById('editCategory').value,
                isPublic: document.getElementById('editIsPublic').checked,
                isVerified: document.getElementById('editIsVerified').checked,
                isFeatured: document.getElementById('editIsFeatured').checked,
                isArchived: document.getElementById('editIsArchived').checked
            };
    
            const fileInput = document.getElementById('editFile');
            let formData = new FormData();
            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            }
            Object.entries(updatedData).forEach(([key, value]) => {
                formData.append(key, value);
            });
    
            const response = await fetch(`/api/document/${documentId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${userAuth.token}`
                },
                body: formData
            });
    
            console.log('API response status:', response.status, response.statusText);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json(); // Thử lấy JSON
                } catch {
                    errorData = await response.text(); // Nếu không phải JSON, lấy text
                }
                throw new Error(`Không thể cập nhật tài liệu: ${response.status} ${response.statusText} - ${typeof errorData === 'object' ? errorData.error : errorData}`);
            }
    
            const result = await response.json();
            const updatedDoc = result.document;
    
            const index = this.documents.findIndex(d => d.documentId === documentId);
            if (index !== -1) {
                this.documents[index] = { ...this.documents[index], ...updatedDoc };
            }
    
            this.showStatus('success', 'Đã cập nhật tài liệu thành công');
            this.cancelEdit();
            await this.loadDocuments();
        } catch (error) {
            console.error('Error updating document:', error);
            this.showStatus('error', 'Không thể cập nhật tài liệu: ' + error.message);
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
        const doc = this.documents.find(d => d.documentId === documentId);
        if (!doc) {
            this.showStatus('error', 'Không tìm thấy tài liệu để xóa');
            return;
        }

        const modal = document.getElementById('confirmModal');
        document.getElementById('modalTitle').textContent = 'Xác nhận xóa tài liệu';
        document.getElementById('modalMessage').textContent = `Bạn có chắc chắn muốn xóa tài liệu "${doc.title}" không?`;
        modal.classList.remove('hidden');

        this.modalCallback = () => this.deleteDocument(documentId);
    },
    
    deleteDocument: async function(documentId) {
        try {
            const userAuth = JSON.parse(localStorage.getItem('userAuth'));
            if (!userAuth?.token) throw new Error('Không tìm thấy thông tin xác thực');

            const response = await fetch(`/api/document/${documentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${userAuth.token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Không thể xóa tài liệu');
            }

            // Xóa khỏi mảng documents
            this.documents = this.documents.filter(d => d.documentId !== documentId);
            this.showStatus('success', 'Đã xóa tài liệu thành công');
            this.loadDocuments(); // Tải lại danh sách
            this.cancelEdit();
        } catch (error) {
            console.error('Error deleting document:', error);
            this.showStatus('error', 'Không thể xóa tài liệu: ' + error.message);
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
        const status = document.getElementById('statusMessage');
        status.classList.remove('hidden', 'bg-red-100', 'bg-green-100', 'text-red-700', 'text-green-700');
        status.classList.add(type === 'error' ? 'bg-red-100' : 'bg-green-100', 
                            type === 'error' ? 'text-red-700' : 'text-green-700');
        status.textContent = message;
        setTimeout(() => status.classList.add('hidden'), 5000);
    },
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    DocumentManagement.init();
});
