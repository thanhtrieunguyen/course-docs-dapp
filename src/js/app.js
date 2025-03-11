const App = {
    web3: null,
    contract: null,
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
                <a href="admin.html" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
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
        if (!localStorage.getItem('loggedIn')) {
            window.location.href = "login.html";
            return false;
        }
        return true;
    },


    init: async function () {
        await App.loadAccount();
        await App.loadContracts();
        await App.checkAdminAccess();
        await App.renderApp();

        // Check if user is logged in
        if (!App.checkLogin()) {
            return;
        }
        try {
            // Kiểm tra trạng thái đăng nhập trước khi tiếp tục
            App.checkLogin();

            // Kiểm tra MetaMask
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

            // Khởi tạo contract
            const response = await fetch('build/contracts/CourseDocument.json');
            const contractJson = await response.json();
            App.contract = new App.web3.eth.Contract(
                contractJson.abi,
                contractJson.networks[await App.web3.eth.net.getId()].address
            );

            // Kiểm tra vai trò người dùng
            await App.checkUserRole();

            // Khởi tạo các event listeners
            App.bindEvents();

            // Load danh sách tài liệu
            await App.loadDocuments();

            // Thêm dòng này để tải danh sách khóa học
            await App.loadCourses();
            // kiểm tra tài khoản người dùng
            await App.checkUserRole();

        } catch (error) {
            console.error('Error initializing app:', error);
        }
    },

    bindEvents: function () {
        document.getElementById('uploadForm').addEventListener('submit', App.handleUpload);
    },

    checkUserRole: async function () {
        try {
            const role = await App.contract.methods.getUserRole(App.account).call();
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
            await App.contract.methods.uploadDocument(
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
            const documentList = await App.contract.methods.getAllDocuments().call();
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

            const courseList = await App.contract.methods.getAllCourses().call();

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
            const documentList = await App.contract.methods.getDocumentsByCourse(courseId).call();
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
