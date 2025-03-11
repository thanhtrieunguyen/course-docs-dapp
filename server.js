const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const cors = require('cors');

app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'], 
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(bodyParser.json());
app.use(express.static('src'));

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

// Schema phân quyền
const permissionSchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true },
    permissions: {
        upload: { type: Boolean, default: true },
        review: { type: Boolean, default: true },
        verify: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
        adminAccess: { type: Boolean, default: false }
    },
    updatedAt: { type: Date, default: Date.now }
});

// Model định nghĩa
const User = mongoose.model('User', userSchema);
const Permission = mongoose.model('Permission', permissionSchema);

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
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied: Yêu cầu quyền quản trị' 
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
    } catch (error) {
        console.error('Lỗi khi khởi tạo quyền:', error);
    }
}

// Khởi tạo quyền khi server khởi động
initializePermissions();

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
        
        const validRoles = ['admin', 'teacher', 'student'];
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

// Khởi động server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
