const UploadDocument = {
    web3: null,
    contracts: {},
    account: null,
    init: async function() {
        try {
            console.log("Initializing UploadDocument module...");
            
            // Check if user is logged in and has valid token
            const userAuth = localStorage.getItem('userAuth');
            
            // IMPORTANT FIX: Get token from userAuth object, not separate token item
            if (!userAuth) {
                console.log("No auth data found, redirecting to login");
                window.location.href = "login.html";
                return false;
            }
            // Change from const to let to allow reassignment
            let user = JSON.parse(userAuth);
            const token = user.token;
            
            // Double check if token exists in the user object
            if (!token) {
                console.log("No token found in auth data, redirecting to login");
                localStorage.removeItem('userAuth');
                window.location.href = "login.html";
                return false;
            }
            
            console.log("User role:", user.role);
            
            // Validate token with backend
            try {
                console.log("Validating token with backend...");
                const response = await fetch('http://localhost:3000/api/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                console.log("Token validation response:", response.status);
                
                if (!response.ok) {
                    throw new Error(`Token validation failed: ${response.status}`);
                }

                const userData = await response.json();
                console.log("User data from API:", userData);
                
                // Store the token separately for other components that expect it
                localStorage.setItem('token', token);
                
                // Fix: Access the user object within the response
                if (!userData || !userData.success || !userData.user) {
                    throw new Error('Invalid response from server');
                }
                
                // Fix: Store the user data from the server response in the userAuth object
                // Works because user is declared with let
                const updatedUser = {
                    ...user,
                    ...userData.user,
                    token: token,
                    loggedIn: true,
                    timestamp: Date.now()
                };
                localStorage.setItem('userAuth', JSON.stringify(updatedUser));
                
                // Updating the user reference for later role checks
                user = updatedUser;
            } catch (error) {
                console.error("Token validation failed:", error);
                localStorage.removeItem('token');
                localStorage.removeItem('userAuth');
                window.location.replace("login.html");
                return false;
            }
            
            // Check if user is a teacher
            if (user.role !== 'teacher' && user.role !== 'admin') {
                alert("Bạn không có quyền tải lên tài liệu. Chỉ giảng viên mới có thể thực hiện chức năng này.");
                window.location.href = "index.html";
                return false;
            }

            // Initialize Web3
            if (window.ethereum) {
                this.web3 = new Web3(window.ethereum);
                try {
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    const accounts = await this.web3.eth.getAccounts();
                    this.account = accounts[0];
                    console.log("Connected account:", this.account);
                } catch (error) {
                    console.error("User denied account access");
                    return false;
                }
            } else {
                console.error("No ethereum browser extension detected");
                alert("Vui lòng cài đặt MetaMask để sử dụng ứng dụng này.");
                return false;
            }
            
            await this.initContract();
            await this.setupEventListeners();
            await this.loadCourses();
            await this.loadDocuments();
            return true;
        } catch (error) {
            console.error("Error initializing UploadDocument:", error);
            return false;
        }
    },

    initContract: async function() {
        try {
            // Initialize CourseDocument contract with multiple fallback paths
            let courseDocumentArtifact = null;
            const possiblePaths = [
                './contracts/CourseDocument.json',
                '../contracts/CourseDocument.json',
                '/contracts/CourseDocument.json',
                'contracts/CourseDocument.json',
                '/src/contracts/CourseDocument.json',
                '../src/contracts/CourseDocument.json',
                'http://localhost:3000/contracts/CourseDocument.json', // Try direct URL
                'http://localhost:3001/contracts/CourseDocument.json'  // Try direct URL on frontend port
            ];

            let fetchError = null;
            for (const path of possiblePaths) {
                try {
                    console.log(`Trying to fetch contract from: ${path}`);
                    const response = await fetch(path);
                    if (response.ok) {
                        courseDocumentArtifact = await response.json();
                        console.log(`Successfully loaded contract from: ${path}`);
                        break;
                    }
                } catch (e) {
                    fetchError = e;
                    console.log(`Failed to fetch from ${path}:`, e.message);
                    continue;
                }
            }

            if (!courseDocumentArtifact) {
                throw new Error(`Could not load contract from any path. Last error: ${fetchError?.message}`);
            }

            const networkId = await this.web3.eth.net.getId();
            const deployedNetwork = courseDocumentArtifact.networks[networkId];
            
            if (!deployedNetwork || !deployedNetwork.address) {
                throw new Error(`Contract not deployed on network ID: ${networkId}`);
            }
            
            this.contracts.CourseDocument = new this.web3.eth.Contract(
                courseDocumentArtifact.abi,
                deployedNetwork.address
            );
            
            console.log("Contract initialized at:", deployedNetwork.address);
            return true;
        } catch (error) {
            console.error("Could not initialize contract:", error);
            if (error.message.includes('Failed to fetch')) {
                console.error("Network error - check if contract files are accessible");
            }
            throw new Error(`Không thể khởi tạo contract: ${error.message}`);
        }
    },

    setupEventListeners: function() {
        const uploadForm = document.getElementById('uploadForm');
        const fileInput = document.getElementById('documentFile');
    
        if (uploadForm) {
            uploadForm.addEventListener('submit', this.handleUpload.bind(this));
        } else {
            console.error("Không tìm thấy biểu mẫu tải lên trong DOM");
        }
    
        if (fileInput) {
            fileInput.addEventListener('change', this.calculateFileHash.bind(this));
            console.log("Đã thêm listener cho input file thành công");
        } else {
            console.error("Không tìm thấy phần tử input file trong DOM");
        }
    },

    calculateFileHash: async function(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;
    
            const buffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            this.fileHash = hashHex; // Lưu trữ hash trong thuộc tính
            console.log("File hash calculated:", hashHex);
            return hashHex;
        } catch (error) {
            console.error("Lỗi tính toán hash file:", error);
            return null;
        }
    },
    handleUpload: async function(event) {
        event.preventDefault();
        console.log("Đang xử lý việc gửi biểu mẫu tải lên");
    
        if (!this.contracts.CourseDocument) {
            alert("Hệ thống blockchain chưa sẵn sàng. Vui lòng thử lại sau.");
            return;
        }
    
        // Get all required form elements
        const elements = {
            uploadButton: document.getElementById('uploadButton'),
            titleInput: document.getElementById('title'),
            descriptionInput: document.getElementById('description'),
            fileInput: document.getElementById('documentFile'),
            isPublicInput: document.getElementById('isPublic'),
            facultyInput: document.getElementById('facultyId'),
            subjectInput: document.getElementById('subjectId')
        };

        // Check if any element is missing
        const missingElements = Object.entries(elements)
            .filter(([key, element]) => !element)
            .map(([key]) => key);

        if (missingElements.length > 0) {
            const error = `Không tìm thấy các phần tử form: ${missingElements.join(', ')}`;
            console.error(error);
            alert(error);
            return;
        }

        const originalButtonText = elements.uploadButton.innerHTML;
        elements.uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Đang tải lên...';
        elements.uploadButton.disabled = true;
    
        try {
            const formData = {
                title: elements.titleInput.value.trim(),
                description: elements.descriptionInput.value.trim(),
                file: elements.fileInput.files[0],
                isPublic: elements.isPublicInput.checked,
                facultyId: elements.facultyInput.value.trim(),
                subjectId: elements.subjectInput.value.trim()
            };
    
            if (!formData.title || !formData.description || !formData.file || !this.fileHash) {
                throw new Error("Vui lòng điền đầy đủ thông tin và chọn file để tải lên");
            }
    
            const uploadResult = await this.uploadToMongoDB(
                formData.file, 
                formData.title, 
                formData.description, 
                formData.isPublic, 
                formData.facultyId,
                formData.subjectId,
                this.fileHash
            );
    
            if (uploadResult.success) {
                await this.registerDocumentOnBlockchain(
                    formData.title, 
                    formData.description, 
                    uploadResult.documentHash,
                    formData.isPublic, 
                    formData.facultyId,
                    uploadResult.documentId
                );
                alert("Tài liệu đã được tải lên thành công!");
                await this.loadDocuments();
            } else {
                throw new Error(uploadResult.error || "Lỗi khi tải lên tài liệu");
            }
        } catch (error) {
            console.error("Lỗi tải lên:", error);
            alert("Có lỗi xảy ra khi tải lên tài liệu: " + error.message);
        } finally {
            elements.uploadButton.innerHTML = originalButtonText;
            elements.uploadButton.disabled = false;
        }
    },

    uploadToMongoDB: async function(file, title, description, isPublic, courseId, contentHash) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                // Try to refresh token or redirect to login
                localStorage.removeItem('userAuth');
                window.location.href = "login.html";
                throw new Error('Session expired. Please login again.');
            }

            console.log("Preparing form data for direct MongoDB upload...");
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', title);
            formData.append('description', description);
            formData.append('owner', this.account);
            formData.append('isPublic', isPublic);
            formData.append('courseId', courseId || "");
            formData.append('contentHash', contentHash || "");

            console.log("Sending request to /api/upload-document...");
            const response = await fetch('http://localhost:3000/api/upload-document', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                // If token expired, redirect to login
                if (response.status === 403 && errorData.error.includes('Token')) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('userAuth');
                    window.location.href = '/login.html';
                    throw new Error('Session expired. Please login again.');
                }
                throw new Error(errorData.error || 'Upload failed');
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Error uploading to MongoDB:", error);
            return { success: false, error: error.message };
        }
    },

    registerDocumentOnBlockchain: async function(title, description, documentHash, isPublic, courseId, documentId) {
        try {
            console.log("Registering document metadata on blockchain...");
            console.log({title, description, documentHash, isPublic, courseId, documentId});
            
            // Call the smart contract method to upload document metadata
            await this.contracts.CourseDocument.methods
                .uploadDocument(
                    title,
                    description,
                    documentHash,
                    documentId, // Store the MongoDB document ID
                    isPublic,
                    courseId || ""
                )
                .send({ from: this.account, gas: 3000000 });
            
            console.log("Document metadata registered on blockchain successfully");
            return true;
        } catch (error) {
            console.error("Error registering document on blockchain:", error);
            throw new Error("Blockchain registration failed: " + error.message);
        }
    },

    loadCourses: async function() {
        try {
            // Get course dropdown element
            const courseSelect = document.getElementById('courseId');
            if (!courseSelect) return;

            // Clear existing options
            courseSelect.innerHTML = '<option value="">Không thuộc khóa học nào</option>';

            // Get all courses from the blockchain
            const courses = await this.contracts.CourseDocument.methods.getAllCourses().call();
            
            // Add each course as an option
            for (let i = 0; i < courses.length; i++) {
                const courseId = courses[i];
                const course = await this.contracts.CourseDocument.methods.courses(courseId).call();
                
                if (course.isActive) {
                    const option = document.createElement('option');
                    option.value = courseId;
                    option.textContent = `${courseId} - ${course.courseName}`;
                    courseSelect.appendChild(option);
                }
            }
        } catch (error) {
            console.error("Error loading courses:", error);
        }
    },

    loadDocuments: async function() {
        try {
            const documentList = document.getElementById('documentList');
            if (!documentList) return;

            // Show loading state
            documentList.innerHTML = '<p class="text-center text-gray-500">Đang tải danh sách tài liệu...</p>';

            const token = localStorage.getItem('token');
            if (!token) throw new Error('No auth token found');

            const response = await fetch('http://localhost:3000/api/my-documents', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch documents');
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error);

            if (data.documents.length === 0) {
                documentList.innerHTML = '<p class="text-center text-gray-500">Chưa có tài liệu nào</p>';
                return;
            }

            // Render documents
            documentList.innerHTML = data.documents.map(doc => `
                <div class="border rounded p-4 mb-4 hover:bg-gray-50">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-medium">${doc.title}</h3>
                            <p class="text-sm text-gray-600">${doc.description}</p>
                            <div class="mt-2 text-xs text-gray-500">
                                <span>${new Date(doc.uploadDate).toLocaleDateString()}</span>
                                <span class="mx-2">•</span>
                                <span>${doc.fileType}</span>
                                <span class="mx-2">•</span>
                                <span>${doc.isPublic ? 'Công khai' : 'Riêng tư'}</span>
                            </div>
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="window.open('/api/document/${doc.documentId}', '_blank')" 
                                    class="text-blue-600 hover:text-blue-800">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading documents:', error);
            documentList.innerHTML = `
                <div class="text-red-500 text-center">
                    Lỗi tải danh sách tài liệu: ${error.message}
                </div>
            `;
        }
    }
};

// Add a standalone initialization function to be called from HTML
window.initializeUploadSystem = function() {
    UploadDocument.init()
        .then(success => {
            if (!success) {
                console.error("Failed to initialize upload document module");
                const statusMsg = document.getElementById('statusMessage');
                const uploadBtn = document.getElementById('uploadButton');
                
                if (uploadBtn) uploadBtn.disabled = true;
                if (statusMsg) {
                    statusMsg.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded">' + 
                        'Không thể kết nối với blockchain. Vui lòng kiểm tra:<br>' +
                        '1. MetaMask đã được cài đặt và đăng nhập<br>' +
                        '2. Đang kết nối đúng mạng (network)<br>' +
                        '3. Smart contract đã được triển khai<br>' +
                        'Sau đó làm mới trang và thử lại.</div>';
                    statusMsg.classList.remove('hidden');
                }
            }
        })
        .catch(error => {
            console.error("Error during initialization:", error);
            const statusMsg = document.getElementById('statusMessage');
            const uploadBtn = document.getElementById('uploadButton');
            
            if (uploadBtn) uploadBtn.disabled = true;
            if (statusMsg) {
                statusMsg.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded">' +
                    `Lỗi khởi tạo: ${error.message}<br>Vui lòng làm mới trang và thử lại.</div>`;
                statusMsg.classList.remove('hidden');
            }
        });
};

document.addEventListener('DOMContentLoaded', function() {
    window.initializeUploadSystem();
});
