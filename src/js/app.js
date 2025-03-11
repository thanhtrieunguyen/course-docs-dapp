const App = {
    web3: null,
    contracts: {},
    account: null,

    checkAdminAccess: async function () {
        try {
            if (!App.account) return false;

            const role = await App.contracts.Auth.methods.getUserRole(App.account).call();
            const isAdmin = role === 'admin';

            // Show admin link if user is admin
            const adminLinkContainer = document.getElementById('adminLinkContainer');
            if (adminLinkContainer) {
                if (isAdmin) {
                    adminLinkContainer.innerHTML = `
                <a href="admin/dashboard.html" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
                  Trang quản trị
                </a>
              `;
                } else {
                    adminLinkContainer.innerHTML = '';
                }
            }

            return isAdmin;
        } catch (error) {
            console.error('Error checking admin access:', error);
            return false;
        }
    },

    checkLogin: function () {
        const userAuth = localStorage.getItem('userAuth');
        if (!userAuth) {
            console.log("Không tìm thấy thông tin đăng nhập");
            window.location.href = "login.html";
            return false;
        }
        
        // Parse the userAuth JSON to check the loggedIn flag
        try {
            const user = JSON.parse(userAuth);
            if (!user.loggedIn) {
                console.log("Người dùng chưa đăng nhập");
                window.location.href = "login.html";
                return false;
            }
            
            // Kiểm tra timestamp để đảm bảo phiên không quá cũ
            const now = Date.now();
            const loginTime = user.timestamp || 0;
            const sessionLength = 24 * 60 * 60 * 1000; // 24 giờ
            
            if (now - loginTime > sessionLength) {
                console.log("Phiên đăng nhập đã hết hạn");
                localStorage.removeItem('userAuth');
                window.location.href = "login.html";
                return false;
            }

            // Cập nhật timestamp để kéo dài phiên đăng nhập
            user.timestamp = Date.now();
            localStorage.setItem('userAuth', JSON.stringify(user));
            
            console.log("Người dùng đã đăng nhập:", user.name, user.role);
            return true;
        } catch (error) {
            console.error("Error parsing user auth data:", error);
            localStorage.removeItem('userAuth'); // Clear invalid data
            window.location.href = "login.html";
            return false;
        }
    },

    init: async function () {
        try {
            console.log("Initializing App...");
            
            // Kiểm tra trạng thái đăng nhập trước khi tiếp tục
            if (!App.checkLogin()) {
                console.log("Chưa đăng nhập, chuyển hướng đến trang đăng nhập");
                return;
            }
            
            console.log("Đã đăng nhập, tiếp tục khởi tạo ứng dụng");
            // Khởi tạo Web3 và kết nối MetaMask
            if (window.ethereum) {
                App.web3 = new Web3(window.ethereum);
                await window.ethereum.enable();
            } else {
                console.error('Please install MetaMask!');
                return;
            }

            // Lấy tài khoản hiện tại
            const accounts = await App.web3.eth.getAccounts();
            App.account = accounts[0];
            document.getElementById('accountAddress').textContent =
                `Account: ${App.account.substr(0, 6)}...${App.account.substr(-4)}`;

            // Tải contracts
            await App.loadContracts();
            
            // Kiểm tra vai trò người dùng và hiển thị UI tương ứng
            await App.updateUIBasedOnUserRole();

            // Khởi tạo các event listeners
            App.bindEvents();

            // Load danh sách tài liệu
            await App.loadDocuments();

            // Load danh sách khóa học
            await App.loadCourses();
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    },
    
    // Thêm phương thức mới để cập nhật UI dựa trên vai trò người dùng
    updateUIBasedOnUserRole: async function() {
        try {
            // Lấy element chứa link admin
            const adminLinkContainer = document.getElementById('adminLinkContainer');
            if (!adminLinkContainer) return;
            
            // Sử dụng AuthApp để kiểm tra vai trò admin
            const isAdmin = await AuthApp.isAdmin();
            
            if (isAdmin) {
                // Nếu là admin, hiển thị link trang quản trị
                adminLinkContainer.style.display = 'block';
            } else {
                // Nếu không phải admin, ẩn link trang quản trị
                adminLinkContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Error updating UI based on user role:', error);
        }
    },
    
    loadContracts: async function() {
        try {
            App.contracts = App.contracts || {};

            // Load Auth contract
            const authResponse = await fetch('../contracts/Auth.json');
            const authArtifact = await authResponse.json();
            const networkId = await App.web3.eth.net.getId();
            const authDeployedNetwork = authArtifact.networks[networkId];
            
            if (!authDeployedNetwork) {
                console.error('Auth contract not deployed to detected network');
                return false;
            }
            
            App.contracts.Auth = new App.web3.eth.Contract(
                authArtifact.abi,
                authDeployedNetwork.address
            );
            
            // Load CourseDocument contract
            const docResponse = await fetch('contracts/CourseDocument.json');
            const docArtifact = await docResponse.json();
            const docDeployedNetwork = docArtifact.networks[networkId];
            
            if (!docDeployedNetwork) {
                console.error('CourseDocument contract not deployed to detected network');
                return false;
            }
            
            App.contracts.CourseDocument = new App.web3.eth.Contract(
                docArtifact.abi,
                docDeployedNetwork.address
            );
            
            return true;
        } catch (error) {
            console.error('Error loading contracts:', error);
            return false;
        }
    },

    bindEvents: function () {
        document.getElementById('uploadForm').addEventListener('submit', App.handleUpload);
    },

    checkUserRole: async function () {
        try {
            const role = await App.contracts.Auth.methods.getUserRole(App.account).call();
            if (!role || role === "None") {
                alert("Bạn chưa có quyền truy cập vào hệ thống!");
                window.location.href = "login.html";
            }
        } catch (error) {
            console.error("Error checking user role:", error);
            window.location.href = "login.html";
        }
    },

    handleUpload: async function (event) {
        event.preventDefault();

        const title = document.getElementById('title').value.trim();
        const description = document.getElementById('description').value.trim();
        const ipfsHash = document.getElementById('ipfsHash').value.trim();
        const isPublic = document.getElementById('isPublic').checked;
        const courseId = document.getElementById('courseId').value;

        // Kiểm tra dữ liệu đầu vào
        if (!title || !description || !ipfsHash) {
            alert("Vui lòng nhập đầy đủ thông tin trước khi tải lên!");
            return;
        }
        if (!courseId) {
            alert("Vui lòng chọn khóa học!");
            return;
        }

        try {
            await App.contracts.CourseDocument.methods.uploadDocument(
                title,
                description,
                ipfsHash,
                isPublic,
                courseId
            ).send({ from: App.account });

            // Reset form và reload danh sách tài liệu theo khóa học
            event.target.reset();
            await App.loadDocumentsByCourse(courseId);

        } catch (error) {
            console.error('Error uploading document:', error);
        }
    },

    loadDocuments: async function () {
        try {
            const documentList = await App.contracts.CourseDocument.methods.getAllDocuments().call();
            const documentListElement = document.getElementById('documentList');
            documentListElement.innerHTML = '';

            if (documentList.length === 0) {
                documentListElement.innerHTML = '<p class="text-gray-500">Chưa có tài liệu nào.</p>';
                return;
            }

            for (const documentId of documentList) {
                try {
                    const doc = await App.contract.methods.getDocument(documentId).call();

                    const documentElement = document.createElement('div');
                    documentElement.className = 'p-4 border rounded';
                    documentElement.innerHTML = `
                        <h3 class="font-semibold">${doc.title}</h3>
                        <p class="text-sm text-gray-600 mt-1">${doc.description}</p>
                        <div class="mt-2 text-sm">
                            <p>IPFS Hash: ${doc.ipfsHash}</p>
                            <p>Owner: ${doc.owner}</p>
                            <p>Public: ${doc.isPublic ? 'Yes' : 'No'}</p>
                            <p>Upload time: ${new Date(doc.timestamp * 1000).toLocaleString()}</p>
                        </div>
                    `;

                    documentListElement.appendChild(documentElement);
                } catch (error) {
                    continue;
                }
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    },

    loadCourses: async function () {
        try {
            const courseDropdown = document.getElementById('courseId');
            courseDropdown.innerHTML = '';
    
            // Sửa dòng này
            const courseList = await App.contracts.CourseDocument.methods.getAllCourses().call();
    
            for (const course of courseList) {
                const option = document.createElement('option');
                option.value = course.courseId;
                option.textContent = `${course.courseId} - ${course.courseName}`;
                courseDropdown.appendChild(option);
            }
        } catch (error) {
            console.error('Error loading courses:', error);
        }
    },


    //để lấy danh sách tài liệu theo khóa học
    loadDocumentsByCourse: async function (courseId) {
        try {
            const documentList = await App.contracts.CourseDocument.methods.getDocumentsByCourse(courseId).call();
            const documentListElement = document.getElementById('documentList');
            documentListElement.innerHTML = '';

            for (const documentId of documentList) {
                try {
                    const doc = await App.contract.methods.getDocument(documentId).call();

                    const documentElement = document.createElement('div');
                    documentElement.className = 'p-4 border rounded';
                    documentElement.innerHTML = `
                        <h3 class="font-semibold">${doc.title}</h3>
                        <p class="text-sm text-gray-600 mt-1">${doc.description}</p>
                        <div class="mt-2 text-sm">
                            <p>IPFS Hash: ${doc.ipfsHash}</p>
                            <p>Owner: ${doc.owner}</p>
                            <p>Public: ${doc.isPublic ? 'Yes' : 'No'}</p>
                            <p>Upload time: ${new Date(doc.timestamp * 1000).toLocaleString()}</p>
                        </div>
                    `;

                    documentListElement.appendChild(documentElement);
                } catch (error) {
                    continue;
                }
            }
        } catch (error) {
            console.error('Error loading documents by course:', error);
        }
    }

};

window.addEventListener('load', function () {
    App.init();
});
