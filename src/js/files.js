document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('documentFile');
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const removeFile = document.getElementById('removeFile');

    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                showFilePreview(file);
            }
        });
    }

    if (removeFile) {
        removeFile.addEventListener('click', function() {
            if(fileInput) fileInput.value = '';
            if(filePreview) filePreview.classList.add('hidden');
        });
    }
    
    // Xử lý kéo thả file (nếu dropZone tồn tại)
    const dropZone = document.querySelector('label[for="documentFile"]');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
    
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
    
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
    
        dropZone.addEventListener('drop', handleDrop, false);
    }
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    function highlight(e) {
        dropZone.classList.add('bg-gray-50');
    }
    function unhighlight(e) {
        dropZone.classList.remove('bg-gray-50');
    }
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if(fileInput) {
            fileInput.files = dt.files;
            showFilePreview(file);
        }
    }
    function showFilePreview(file) {
        if(fileName) fileName.textContent = file.name;
        if(fileSize) fileSize.textContent = formatFileSize(file.size);
        if(filePreview) filePreview.classList.remove('hidden');
    }
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Add function to preview document from MongoDB
    window.previewDocument = async function(documentId) {
        try {
            // Open document in a new window
            window.open(`/api/document/${documentId}`, '_blank');
            
            // Optionally record this access in the blockchain
            if (window.web3 && window.CourseDocumentContract) {
                const accounts = await web3.eth.getAccounts();
                const account = accounts[0];
                
                // Get document blockchain ID using MongoDB ID
                // This might require a mapping function or API call
                
                // Then record this access
                await CourseDocumentContract.methods.recordDocumentAccess(documentId)
                    .send({ from: account });
            }
        } catch (error) {
            console.error("Error previewing document:", error);
            alert("Không thể xem tài liệu: " + error.message);
        }
    };
    
    // Add function to load and display user's documents
    window.loadUserDocuments = async function() {
        const documentList = document.getElementById('documentList');
        if (!documentList) return;
        
        documentList.innerHTML = '<div class="p-4 text-center">Đang tải danh sách tài liệu...</div>';
        
        try {
            // Try to get token first from userAuth, then from separate token storage
            let token = null;
            const userAuth = localStorage.getItem('userAuth');
            
            if (userAuth) {
                const user = JSON.parse(userAuth);
                token = user.token;
                // Save token separately for consistency
                if (token) localStorage.setItem('token', token);
            } else {
                token = localStorage.getItem('token');
            }

            console.log("Loading documents - auth check:", {
                hasUserAuth: !!userAuth,
                hasToken: !!token
            });

            if (!token) {
                documentList.innerHTML = '<div class="p-4 text-center text-red-500">Vui lòng đăng nhập để xem tài liệu của bạn</div>';
                return;
            }

            // Use the token to fetch documents
            const response = await fetch('/api/my-documents', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log("API response status:", response.status);
            
            if (!response.ok) {
                const data = await response.json();
                console.error('Error response from server:', data);
                
                if (response.status === 403) {
                    // Token is invalid or expired
                    localStorage.removeItem('token');
                    localStorage.removeItem('userAuth');
                    documentList.innerHTML = '<div class="p-4 text-center text-red-500">Phiên làm việc hết hạn, vui lòng đăng nhập lại</div>';
                    setTimeout(() => window.location.href = '/login.html', 2000);
                    return;
                }
                
                documentList.innerHTML = `<div class="p-4 text-center text-red-500">Lỗi: ${data.error || 'Không thể tải danh sách tài liệu'}</div>`;
                return;
            }

            const data = await response.json();
            console.log("Documents data:", data);
            
            if (!data.success) {
                documentList.innerHTML = `<div class="p-4 text-center text-red-500">Lỗi: ${data.error || 'Không thể tải danh sách tài liệu'}</div>`;
                return;
            }

            if (!data.documents || data.documents.length === 0) {
                documentList.innerHTML = '<div class="p-4 text-center">Bạn chưa có tài liệu nào</div>';
                return;
            }

            // Process and display documents
            let documentsHTML = '';
            data.documents.forEach(doc => {
                // Format your HTML for each document here
                // ...existing code...
            });
            
            documentList.innerHTML = documentsHTML;
            
        } catch (error) {
            console.error('Error loading documents:', error);
            documentList.innerHTML = `<div class="p-4 text-center text-red-500">Lỗi khi tải danh sách tài liệu: ${error.message}</div>`;
        }
    };
    
    function getUserToken() {
        const userAuth = localStorage.getItem('userAuth');
        if (!userAuth) return null;
        
        const user = JSON.parse(userAuth);
        return user.token || null;
    }
    
    // Initialize document list if on the dashboard page
    if (document.getElementById('documentList')) {
        window.loadUserDocuments();
    }
});
