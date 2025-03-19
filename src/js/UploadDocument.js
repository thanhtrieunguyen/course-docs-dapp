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
        if (uploadForm) {
            uploadForm.addEventListener('submit', this.handleUpload.bind(this));
        }

        // Add event listener for file selection to calculate hash
        const fileInput = document.getElementById('documentFile');
        if (fileInput) {
            fileInput.addEventListener('change', this.calculateFileHash.bind(this));
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
            
            // Store the hash in a hidden input field
            const hashField = document.getElementById('contentHash');
            if (!hashField) {
                // Create the field if it doesn't exist
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = 'contentHash';
                hiddenInput.name = 'contentHash';
                hiddenInput.value = hashHex;
                document.getElementById('uploadForm').appendChild(hiddenInput);
            } else {
                hashField.value = hashHex;
            }
            
            console.log("File hash calculated:", hashHex);
            return hashHex;
        } catch (error) {
            console.error("Error calculating file hash:", error);
            return null;
        }
    },

    handleUpload: async function(event) {
        event.preventDefault();
        console.log("Handling upload submission");

        // Check if contract is initialized
        if (!this.contracts.CourseDocument) {
            alert("Hệ thống blockchain chưa sẵn sàng. Vui lòng thử lại sau.");
            return;
        }

        // Show loading indicator
        const uploadButton = document.getElementById('uploadButton');
        const originalButtonText = uploadButton.innerHTML;
        uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Đang tải lên...';
        uploadButton.disabled = true;

        try {
            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            const file = document.getElementById('documentFile').files[0];
            const isPublic = document.getElementById('isPublic').checked;
            const courseId = document.getElementById('courseId').value.trim();
            const contentHash = document.getElementById('contentHash')?.value;

            // Validate inputs
            if (!title || !description || !file) {
                alert("Vui lòng điền đầy đủ thông tin và chọn file.");
                uploadButton.innerHTML = originalButtonText;
                uploadButton.disabled = false;
                return;
            }

            // Upload directly to MongoDB with document content
            const uploadResult = await this.uploadToMongoDB(file, title, description, isPublic, courseId, contentHash);

            // Then register metadata on blockchain
            if (uploadResult.success) {
                await this.registerDocumentOnBlockchain(
                    title, 
                    description, 
                    uploadResult.documentHash, // Use the hash returned from MongoDB
                    isPublic, 
                    courseId,
                    uploadResult.documentId // Pass the MongoDB document ID
                );
                
                alert("Tài liệu đã được tải lên thành công!");
                window.location.reload();
            } else {
                alert(`Lỗi khi lưu tài liệu: ${uploadResult.error}`);
            }
        } catch (error) {
            console.error("Upload error:", error);
            alert("Có lỗi xảy ra khi tải lên tài liệu: " + error.message);
        } finally {
            // Reset button state
            uploadButton.innerHTML = originalButtonText;
            uploadButton.disabled = false;
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
