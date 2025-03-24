const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const multer = require('multer');
const { create } = require('ipfs-http-client');
const upload = multer({ dest: 'uploads/' });
const fetch = require('node-fetch');
const cors = require('cors'); // Keep only this cors declaration

global.self = global;

const app = express();
const port = process.env.PORT || 3000;

// Update CORS configuration to specifically include all required headers
app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'], 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'Accept', 
        'Cache-Control', 
        'X-Requested-With'
    ]
}));

app.use(bodyParser.json());
app.use(express.static('src'));

// Remove duplicate cors sections and keep only these middleware configurations
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Kiểm tra connect tới mongodb
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connect to mongodb successfully"))
  .catch(err => console.log(err));

// Schema định nghĩa người dùng
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: String,
    address: { type: String, unique: true }, // Ensure wallet addresses are unique
    status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

// Instead, import the Permission model:
const Permission = require('./models/Permission');

// Enhanced Document schema to store binary content
const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    documentHash: { type: String, required: true, index: true }, // Hash for blockchain reference
    documentId: { type: String, index: true }, // Generated ID for reference
    contentHash: { type: String, index: true }, // Content hash for deduplication
    fileContent: { type: Buffer, required: true }, // Actual binary file content
    fileType: { type: String, required: true }, // MIME type
    fileName: { type: String, required: true }, // Original filename
    fileSize: { type: Number, required: true }, // File size in bytes
    owner: { type: String, required: true },
    isPublic: { type: Boolean, default: false },
    courseId: { type: String, default: '' },
    uploadDate: { type: Date, default: Date.now },
    status: { type: String, default: 'active' },
    accessHistory: [{ 
        user: String, 
        action: String, 
        timestamp: Date 
    }]
});

// Create compound index for faster queries
documentSchema.index({ owner: 1, courseId: 1, status: 1 });

// Model định nghĩa
const User = mongoose.model('User', userSchema);
const Document = mongoose.model('Document', documentSchema);

// Middleware xác thực JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Token không hợp lệ' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Forbidden: Token hết hạn hoặc không hợp lệ' });
        }
        
        req.user = user;
        next();
    });
}

// Middleware kiểm tra quyền admin
function requireAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'dean')) {
        console.log("Quyền truy cập bị từ chối:", req.user?.role);
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied: Yêu cầu quyền admin hoặc dean' 
        });
    }
    next();
}

// Middleware kiểm tra quyền giảng viên
function requireTeacher(req, res, next) {
    if (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin')) {
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied: Yêu cầu quyền giảng viên hoặc quản trị' 
        });
    }
    
    next();
}

// Khởi tạo quyền mặc định cho các vai trò
async function initializePermissions() {
    try {
        // Kiểm tra xem quyền đã được khởi tạo chưa
        const adminPermission = await Permission.findOne({ role: 'admin' });
        
        if (!adminPermission) {
            // Khởi tạo quyền cho admin
            await Permission.create({
                role: 'admin',
                permissions: {
                    upload: true,
                    review: true,
                    verify: true,
                    delete: true,
                    adminAccess: true
                }
            });
            
            // Khởi tạo quyền cho giảng viên
            await Permission.create({
                role: 'teacher',
                permissions: {
                    upload: true,
                    review: true,
                    verify: false,
                    delete: false,
                    adminAccess: false
                }
            });
            
            // Khởi tạo quyền cho học viên
            await Permission.create({
                role: 'student',
                permissions: {
                    upload: false,
                    review: true,
                    verify: false,
                    delete: false,
                    adminAccess: false
                }
            });
            
            console.log('Đã khởi tạo các quyền mặc định');
        }

        const deanPermission = await Permission.findOne({ role: 'dean' });
        if (!deanPermission) {
            await Permission.create({
                role: 'dean',
                permissions: {
                    upload: true,
                    review: true,
                    verify: true,
                    delete: true,
                    adminAccess: false
                }
            });
            console.log('Đã khởi tạo quyền cho vai trò dean');
        }
    } catch (error) {
        console.error('Lỗi khi khởi tạo quyền:', error);
    }
}

// Khởi tạo quyền khi server khởi động
initializePermissions();

// Hàm đồng bộ admin
async function syncAdmin() {
    try {
        // Đọc ABI và địa chỉ contract 
        const contractPath = path.resolve(__dirname, './src/contracts/Auth.json');
        const authArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        
        // Thử kết nối Web3 với nhiều provider khác nhau
        let web3;
        try {
            web3 = new Web3('http://localhost:7545');
            await web3.eth.net.isListening(); // Check connection
        } catch (err) {
            try {
                web3 = new Web3('http://127.0.0.1:7545');
                await web3.eth.net.isListening();
            } catch (err2) {
                console.log("Cannot connect to local blockchain, skipping admin sync");
                return; // Skip admin sync but don't crash the server
            }
        }
        
        // Lấy admin address
        const accounts = await web3.eth.getAccounts();
        const adminAddress = accounts[0];
        
        // Kiểm tra admin đã tồn tại
        const existingAdmin = await User.findOne({ address: adminAddress });
        if (existingAdmin) {
            console.log("Admin already exists in MongoDB");
            return;
        }

        // Khởi tạo contract
        const networkId = await web3.eth.net.getId();
        const deployedNetwork = authArtifact.networks[networkId];
        const authContract = new web3.eth.Contract(
            authArtifact.abi,
            deployedNetwork.address
        );
        
        // Lấy thông tin admin từ blockchain
        const adminData = await authContract.methods.users(adminAddress).call();
        
        // Tạo admin trong MongoDB
        const hashedPassword = await bcrypt.hash("123456", 10);
        const newAdmin = new User({
            name: adminData.name || "System Admin",
            email: adminData.email || "admin@example.com", 
            password: hashedPassword,
            role: "admin",
            address: adminAddress
        });
        
        await newAdmin.save();
        console.log("Admin synchronized successfully");
    } catch (error) {
        console.error("Error synchronizing admin:", error);
        // Don't crash the server on sync error
    }
}

// Replace the duplicate mongoose connection with a single one
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log("Connected to MongoDB");
        
        // Start server first
        const server = app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is busy, trying ${port + 1}...`);
                server.listen(port + 1);
            } else {
                console.error('Server error:', err);
            }
        });

        // Then try to sync admin
        await syncAdmin();
    })
    .catch(err => {
        console.log("MongoDB connection error:", err);
        process.exit(1);
    });

// Add graceful shutdown
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    shutdown();
});

process.on('SIGINT', () => {
    console.info('SIGINT signal received.');
    shutdown();
});

function shutdown() {
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
}

// API Routes

// Kiểm tra địa chỉ ví
app.post('/api/verify-wallet', async (req, res) => {
    try {
        const { address } = req.body;
        
        // Check if the wallet address exists in the database
        const existingUser = await User.findOne({ address });
        
        if (existingUser) {
            // User with this wallet exists
            return res.json({ 
                success: true, 
                exists: true, 
                email: existingUser.email,  // Return email for autofill
                status: existingUser.status // Return user status
            });
        } else {
            // User with this wallet doesn't exist
            return res.json({ 
                success: true, 
                exists: false 
            });
        }
    } catch (error) {
        console.error('Error verifying wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Đăng ký người dùng
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role, address } = req.body;
        
        // Validate required fields
        if (!name || !email || !password || !role || !address) {
            return res.json({
                success: false,
                error: 'All fields are required'
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { email: email },
                { address: address }
            ]
        });
        
        if (existingUser) {
            return res.json({
                success: false,
                error: existingUser.email === email ? 
                    'Email already registered' : 
                    'Wallet address already registered'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            address,
            status: 'active',
            createdAt: new Date()
        });
        
        // Save to database
        await newUser.save();
        
        res.json({
            success: true,
            message: 'User registered successfully'
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { address, password } = req.body;
        
        // Find user by address
        const user = await User.findOne({ address });
        
        if (!user) {
            return res.json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        // Check if user is active
        if (user.status !== 'active') {
            return res.json({
                success: false,
                error: `Account is ${user.status}. Please contact administrator.`
            });
        }
        
        // Verify password
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
            return res.json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        // Generate JWT token
        const token = jwt.sign({ 
            id: user._id, 
            address: user.address,
            role: user.role 
        }, process.env.JWT_SECRET, { expiresIn: '1h' });
        
        res.json({ 
            success: true, 
            token, 
            user: {
                name: user.name,
                email: user.email,
                address: user.address,
                role: user.role
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API lấy thông tin người dùng
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API kiểm tra quyền
app.get('/api/check-permission', authenticateToken, async (req, res) => {
    try {
        const { role } = req.user;
        const { permission } = req.query;
        
        if (!permission) {
            return res.json({
                success: false,
                error: 'Permission parameter required'
            });
        }
        
        const rolePermission = await Permission.findOne({ role });
        
        if (!rolePermission) {
            return res.json({
                success: false,
                error: 'Role permissions not found'
            });
        }
        
        const hasPermission = rolePermission.permissions[permission] || false;
        
        res.json({
            success: true,
            hasPermission
        });
    } catch (error) {
        console.error('Error checking permission:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API lấy danh sách người dùng (ADMIN)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        
        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API cập nhật vai trò người dùng (ADMIN)
app.post('/api/admin/update-user-role', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { address, role } = req.body;
        
        if (!address || !role) {
            return res.json({
                success: false,
                error: 'Address and role are required'
            });
        }
        
        const validRoles = ['admin', 'teacher', 'student', 'dean'];
        if (!validRoles.includes(role)) {
            return res.json({
                success: false,
                error: 'Invalid role'
            });
        }
        
        // Cập nhật vai trò người dùng
        const updatedUser = await User.findOneAndUpdate(
            { address },
            { role },
            { new: true }
        ).select('-password');
        
        if (!updatedUser) {
            return res.json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API cập nhật quyền của vai trò (ADMIN)
app.post('/api/admin/update-permission', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { role, permission, allowed } = req.body;
        
        if (!role || !permission) {
            return res.json({
                success: false,
                error: 'Role and permission are required'
            });
        }
        
        // Cập nhật quyền
        const update = {};
        update[`permissions.${permission}`] = allowed;
        
        const updatedPermission = await Permission.findOneAndUpdate(
            { role },
            { $set: update, updatedAt: new Date() },
            { new: true }
        );
        
        if (!updatedPermission) {
            return res.json({
                success: false,
                error: 'Role permissions not found'
            });
        }
        
        res.json({
            success: true,
            permission: updatedPermission
        });
    } catch (error) {
        console.error('Error updating permission:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API lấy danh sách quyền (ADMIN)
app.get('/api/admin/permissions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const permissions = await Permission.find().sort('role');
        
        res.json({
            success: true,
            permissions
        });
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API xóa người dùng (ADMIN)
app.post('/api/admin/delete-user', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { address } = req.body;
        
        if (!address) {
            return res.json({
                success: false,
                error: 'Address is required'
            });
        }
        
        // Kiểm tra không cho xóa người dùng admin cuối cùng
        if (address === req.user.address) {
            const adminCount = await User.countDocuments({ role: 'admin' });
            
            if (adminCount <= 1) {
                return res.json({
                    success: false,
                    error: 'Cannot delete the last admin account'
                });
            }
        }
        
        // Xóa người dùng
        const deletedUser = await User.findOneAndDelete({ address });
        
        if (!deletedUser) {
            return res.json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API thay đổi trạng thái người dùng (ADMIN)
app.post('/api/admin/change-user-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { address, status } = req.body;
        
        if (!address || !status) {
            return res.json({
                success: false,
                error: 'Address and status are required'
            });
        }
        
        const validStatuses = ['active', 'inactive', 'banned'];
        if (!validStatuses.includes(status)) {
            return res.json({
                success: false,
                error: 'Invalid status'
            });
        }
        
        // Không cho phép tắt tài khoản admin cuối cùng
        if (status !== 'active') {
            const user = await User.findOne({ address });
            if (user && user.role === 'admin') {
                const adminCount = await User.countDocuments({ role: 'admin', status: 'active' });
                
                if (adminCount <= 1) {
                    return res.json({
                        success: false,
                        error: 'Cannot deactivate the last admin account'
                    });
                }
            }
        }
        
        // Cập nhật trạng thái người dùng
        const updatedUser = await User.findOneAndUpdate(
            { address },
            { status },
            { new: true }
        ).select('-password');
        
        if (!updatedUser) {
            return res.json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error changing user status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API cập nhật thông tin người dùng (ADMIN)
app.post('/api/admin/update-user', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { address, name, email } = req.body;
        
        if (!address || !name || !email) {
            return res.json({
                success: false,
                error: 'All fields are required'
            });
        }

        // Kiểm tra email đã tồn tại chưa (ngoại trừ email hiện tại của user)
        const existingUser = await User.findOne({ 
            email: email,
            address: { $ne: address }
        });

        if (existingUser) {
            return res.json({
                success: false,
                error: 'Email already exists'
            });
        }

        // Cập nhật thông tin người dùng
        const updatedUser = await User.findOneAndUpdate(
            { address },
            { 
                name,
                email
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm hàm fetch tùy chỉnh để thêm duplex option
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Custom fetch function to include duplex option
const customFetch = (url, options = {}) => {
    if (options.body) {
        options.duplex = 'half'; // Set duplex to 'half' when body is present
    }
    return fetch(url, options);
};

// Cập nhật cấu hình IPFS client sử dụng customFetch
const ipfs = create({
    host: '127.0.0.1',
    port: 5001,
    protocol: 'http', // Use 'http' instead of the /ip4/... format for simplicity
    fetch: customFetch, // Explicitly pass the custom fetch
  });

// API upload file lên IPFS
app.post('/api/upload-ipfs', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // Read file from disk
        const fileContent = fs.readFileSync(req.file.path);

        // Upload to IPFS
        const result = await ipfs.add(fileContent, {
            progress: (prog) => console.log(`Upload progress: ${prog} bytes`)
        });

        // Clean up temporary file
        fs.unlinkSync(req.file.path);

        return res.json({
            success: true,
            ipfsHash: result.path
        });
    } catch (error) {
        console.error('IPFS upload error:', error);

        // Clean up temporary file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
            success: false,
            error: 'IPFS upload failed: ' + error.message
        });
    }
});

// Updated document upload endpoint
app.post('/api/upload-document', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        // Check if user has upload permission based on role
        const role = req.user.role;
        const permissionDoc = await Permission.findOne({ role });
        
        if (!permissionDoc || !permissionDoc.permissions.upload) {
            return res.status(403).json({
                success: false,
                error: 'Bạn không có quyền tải lên tài liệu'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Không có file được tải lên'
            });
        }
        
        const { title, description, owner, isPublic, courseId, contentHash } = req.body;

        // Validate required fields
        if (!title || !owner) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu thông tin cần thiết'
            });
        }

        // Read file content
        const fileContent = fs.readFileSync(req.file.path);
        
        // Calculate hash of file content for blockchain and deduplication
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(fileContent);
        const documentHash = hash.digest('hex');
        
        // Check if this exact file has been uploaded before
        const existingDoc = await Document.findOne({ contentHash: documentHash });
        if (existingDoc) {
            // Clean up the uploaded file
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            return res.status(409).json({
                success: false,
                error: 'File này đã được tải lên trước đó',
                existingDocument: {
                    id: existingDoc._id,
                    title: existingDoc.title,
                    owner: existingDoc.owner
                }
            });
        }
        
        // Generate a unique document ID
        const documentId = crypto.randomUUID();
        
        // Create and save document with binary content
        const document = new Document({
            title,
            description,
            documentHash,
            documentId,
            contentHash: documentHash,
            fileContent: fileContent,
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            owner,
            isPublic: isPublic === 'true',
            courseId: courseId || '',
            accessHistory: [{
                user: owner,
                action: 'upload',
                timestamp: new Date()
            }]
        });

        await document.save();
        
        // Clean up the temporary file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({
            success: true,
            documentId: documentId,
            documentHash: documentHash,
            document: {
                id: document._id,
                title: document.title
            }
        });
    } catch (error) {
        console.error('Error uploading document:', error);
        
        // Clean up temporary file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to save document: ' + error.message
        });
    }
});
app.get('/api/document/:documentId', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        
        // Find the document in MongoDB
        const document = await Document.findOne({ documentId });
        
        if (!document) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }
        
        // Check access permissions
        const hasAccess = document.isPublic || 
                         document.owner === req.user.address || 
                         req.user.role === 'admin';
        
        // Additional check for course membership if needed
        if (!hasAccess && document.courseId) {
            // Here you would check if user is enrolled in the course
            // This would depend on your course enrollment system
        }
        
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this document'
            });
        }
        
        // Log this access
        document.accessHistory.push({
            user: req.user.address,
            action: 'view',
            timestamp: new Date()
        });
        
        await document.save();
        
        // Set response headers
        res.setHeader('Content-Type', document.fileType);
        res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
        
        // Send the file content
        res.send(document.fileContent);
        
    } catch (error) {
        console.error('Error retrieving document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve document: ' + error.message
        });
    }
});

// Add endpoint to get document metadata
app.get('/api/document-info/:documentId', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        
        // Find document but exclude the binary content
        const document = await Document.findOne({ documentId })
                                      .select('-fileContent');
        
        if (!document) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }
        
        // Check basic access permission for metadata
        const hasAccess = document.isPublic || 
                         document.owner === req.user.address || 
                         req.user.role === 'admin';
        
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this document'
            });
        }
        
        res.json({
            success: true,
            document: {
                id: document._id,
                documentId: document.documentId,
                title: document.title,
                description: document.description,
                fileName: document.fileName,
                fileSize: document.fileSize,
                fileType: document.fileType,
                owner: document.owner,
                isPublic: document.isPublic,
                courseId: document.courseId,
                uploadDate: document.uploadDate,
                accessCount: document.accessHistory.length
            }
        });
        
    } catch (error) {
        console.error('Error retrieving document info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve document info: ' + error.message
        });
    }
});

// Modify the my-documents endpoint to include better error handling
app.get('/api/my-documents', authenticateToken, async (req, res) => {
    try {
        const userAddress = req.user.address;
        console.log(`Fetching documents for user: ${userAddress}`);
        
        // Find all documents owned by the user
        const documents = await Document.find({ owner: userAddress })
                                      .select('-fileContent')
                                      .sort({ uploadDate: -1 });
        
        console.log(`Found ${documents.length} documents for user ${userAddress}`);
        
        res.json({
            success: true,
            documents: documents.map(doc => ({
                id: doc._id,
                documentId: doc.documentId,
                title: doc.title,
                description: doc.description,
                fileName: doc.fileName,
                fileSize: doc.fileSize,
                fileType: doc.fileType,
                isPublic: doc.isPublic,
                courseId: doc.courseId,
                uploadDate: doc.uploadDate,
                accessCount: doc.accessHistory.length
            }))
        });
    } catch (error) {
        console.error('Error retrieving user documents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve documents: ' + error.message
        });
    }
});

// Add a test endpoint for debugging uploads
app.post('/api/test-debug-upload', upload.single('file'), (req, res) => {
    try {
        // Get hash of file if it exists
        let fileHash = null;
        if (req.file) {
            const crypto = require('crypto');
            const fileBuffer = fs.readFileSync(req.file.path);
            const hash = crypto.createHash('sha256');
            hash.update(fileBuffer);
            fileHash = hash.digest('hex');
            
            // Clean up file
            fs.unlinkSync(req.file.path);
        }
        
        res.json({
            success: true,
            message: 'Upload test received',
            body: req.body,
            file: req.file ? {
                filename: req.file.filename,
                size: req.file.size,
                contentType: req.file.mimetype,
                hash: fileHash
            } : null
        });
    } catch (error) {
        console.error('Test upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API lấy danh sách khóa học
app.get('/api/courses', authenticateToken, async (req, res) => {
    try {
        // Thực hiện truy vấn lấy danh sách các khóa học
        // Mô hình khóa học có thể chưa được định nghĩa, tạm thời trả về danh sách ví dụ
        const courses = [
            { id: 'course-001', name: 'Blockchain cơ bản' },
            { id: 'course-002', name: 'Lập trình Smart Contract' },
            { id: 'course-003', name: 'Phát triển DApp' },
            { id: 'course-004', name: 'An toàn Blockchain' }
        ];
        
        res.json({
            success: true,
            courses
        });
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API lấy thông tin tài liệu theo ID
app.get('/api/document/:documentId', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        
        const document = await Document.findOne({ blockchainId: documentId })
            .select('-fileContent');
        
        if (!document) {
            return res.status(404).json({ 
                success: false, 
                error: 'Không tìm thấy tài liệu' 
            });
        }
        
        res.json({
            success: true,
            document
        });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API lấy nội dung tài liệu theo ID
app.get('/api/document/:documentId/content', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        
        const document = await Document.findOne({ blockchainId: documentId });
        
        if (!document) {
            return res.status(404).json({ 
                success: false, 
                error: 'Không tìm thấy tài liệu' 
            });
        }
        
        // Check permission based on document privacy and user role
        if (!document.isPublic && document.owner !== req.user.address) {
            // If document is private, only owner or admin can access
            const userRole = req.user.role;
            if (userRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Bạn không có quyền xem tài liệu này'
                });
            }
        }
        
        // For admin, create a temporary URL to view the file
        const fileName = document.fileName;
        const contentType = document.fileType;
        const fileContent = document.fileContent;
        
        // Create temp file path
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
        
        const tempFilePath = path.join(tempDir, fileName);
        fs.writeFileSync(tempFilePath, fileContent);
        
        // Record access
        document.accessHistory.push({
            user: req.user.address,
            action: 'view',
            timestamp: new Date()
        });
        await document.save();
        
        // Send file to client
        res.sendFile(tempFilePath, {
            headers: {
                'Content-Type': contentType
            },
            // Delete file after sending
            callback: function (err) {
                if (err) {
                    console.error('Error sending file:', err);
                }
                // Remove temp file after sending
                fs.unlink(tempFilePath, (err) => {
                    if (err) console.error('Error deleting temp file:', err);
                });
            }
        });
    } catch (error) {
        console.error('Error fetching document content:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API cập nhật thông tin tài liệu (ADMIN)
app.post('/api/admin/update-document', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { documentId, title, description, courseId, isPublic } = req.body;
        
        if (!documentId || !title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu thông tin cần thiết'
            });
        }
        
        // Cập nhật tài liệu trong MongoDB
        const updatedDocument = await Document.findOneAndUpdate(
            { blockchainId: documentId },
            { 
                title, 
                description, 
                courseId: courseId || '',
                isPublic: Boolean(isPublic),
                updatedAt: new Date(),
                'accessHistory': {
                    $push: {
                        user: req.user.address,
                        action: 'update',
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        ).select('-fileContent');
        
        if (!updatedDocument) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài liệu'
            });
        }
        
        res.json({
            success: true,
            document: updatedDocument
        });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API xóa tài liệu (ADMIN)
app.post('/api/admin/delete-document', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { documentId } = req.body;
        
        if (!documentId) {
            return res.status(400).json({
                success: false,
                error: 'DocumentId là bắt buộc'
            });
        }
        
        // Đánh dấu là đã xóa thay vì xóa hoàn toàn
        const updatedDocument = await Document.findOneAndUpdate(
            { blockchainId: documentId },
            { 
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user.address,
                'accessHistory': {
                    $push: {
                        user: req.user.address,
                        action: 'delete',
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        ).select('-fileContent');
        
        if (!updatedDocument) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài liệu'
            });
        }
        
        res.json({
            success: true,
            message: 'Tài liệu đã được xóa thành công'
        });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API lấy danh sách tài liệu có phân trang
app.get('/api/admin/documents', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const searchQuery = req.query.search 
            ? { title: { $regex: req.query.search, $options: 'i' } } 
            : {};
        if (req.query.courseId) searchQuery.courseId = req.query.courseId;
        if (req.query.verified === 'true') searchQuery.isVerified = true;
        else if (req.query.verified === 'false') searchQuery.isVerified = false;
        if (req.query.public === 'true') searchQuery.isPublic = true;
        else if (req.query.public === 'false') searchQuery.isPublic = false;
        if (req.query.flagged === 'true') searchQuery.isFlagged = true;
        searchQuery.isDeleted = { $ne: true };
        
        const documents = await Document.find(searchQuery)
            .select('-fileContent')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await Document.countDocuments(searchQuery);
        
        res.json({
            success: true,
            documents,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API gắn cờ tài liệu
app.post('/api/admin/flag-document', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { documentId, reason } = req.body;
        
        if (!documentId || !reason) {
            return res.status(400).json({
                success: false,
                error: 'DocumentId và lý do gắn cờ là bắt buộc'
            });
        }
        
        const updatedDocument = await Document.findOneAndUpdate(
            { blockchainId: documentId },
            { 
                isFlagged: true,
                flagReason: reason,
                flaggedBy: req.user.address,
                flaggedAt: new Date(),
                'accessHistory': {
                    $push: {
                        user: req.user.address,
                        action: 'flag',
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        ).select('-fileContent');
        
        if (!updatedDocument) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài liệu'
            });
        }
        
        res.json({
            success: true,
            message: 'Tài liệu đã được gắn cờ thành công',
            document: updatedDocument
        });
    } catch (error) {
        console.error('Error flagging document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API để xác thực tài liệu
app.post('/api/admin/verify-document', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { documentId } = req.body;
        
        if (!documentId) {
            return res.status(400).json({
                success: false,
                error: 'DocumentId là bắt buộc'
            });
        }
        
        const updatedDocument = await Document.findOneAndUpdate(
            { blockchainId: documentId },
            { 
                isVerified: true,
                verifiedBy: req.user.address,
                verifiedAt: new Date(),
                'accessHistory': {
                    $push: {
                        user: req.user.address,
                        action: 'verify',
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        ).select('-fileContent');
        
        if (!updatedDocument) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài liệu'
            });
        }
        
        res.json({
            success: true,
            message: 'Tài liệu đã được xác thực thành công',
            document: updatedDocument
        });
    } catch (error) {
        console.error('Error verifying document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all courses
app.get('/api/courses', authenticateToken, async (req, res) => {
    try {
        const courses = await Course.find({});
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get document by ID
app.get('/api/document/:id', authenticateToken, async (req, res) => {
    try {
        const document = await Document.findOne({ blockchainId: req.params.id });
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        res.json({ success: true, document });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Make sure server is listening on the correct port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.delete('/api/document/:documentId', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        const document = await Document.findOne({ documentId });
        if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

        const hasAccess = document.owner === req.user.address || req.user.role === 'admin' || req.user.role === 'dean';
        if (!hasAccess) return res.status(403).json({ success: false, error: 'No permission' });

        await Document.deleteOne({ documentId });
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ success: false, error: 'Failed to delete document: ' + error.message });
    }
});

app.put('/api/document/:documentId', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { documentId } = req.params;
        const document = await Document.findOne({ documentId });
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const hasAccess = document.owner === req.user.address || req.user.role === 'admin' || req.user.role === 'dean';
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'You do not have permission to update this document' });
        }

        const updates = {
            title: req.body.title || document.title,
            description: req.body.description || document.description,
            courseId: req.body.courseId || document.courseId,
            category: req.body.category || document.category,
            isPublic: req.body.isPublic === 'true' ? true : req.body.isPublic === 'false' ? false : document.isPublic,
            isVerified: req.body.isVerified === 'true' ? true : req.body.isVerified === 'false' ? false : document.isVerified,
            isFeatured: req.body.isFeatured === 'true' ? true : req.body.isFeatured === 'false' ? false : document.isFeatured,
            isArchived: req.body.isArchived === 'true' ? true : req.body.isArchived === 'false' ? false : document.isArchived
        };

        if (req.file) {
            updates.fileContent = req.file.buffer;
            updates.fileName = req.file.originalname;
            updates.fileType = req.file.mimetype;
            updates.fileSize = req.file.size;
        }

        const updatedDoc = await Document.findOneAndUpdate({ documentId }, updates, { new: true });
        res.json({ success: true, document: updatedDoc });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ success: false, error: 'Failed to update document: ' + error.message });
    }
});