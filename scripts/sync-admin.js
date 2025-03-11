require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

// Kết nối đến MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("MongoDB connection error:", err));

// Định nghĩa schema User
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: String,
    address: { type: String, unique: true }
});

const User = mongoose.model('User', userSchema);

// Kết nối đến blockchain
async function syncAdmin() {
    try {
        // Đọc ABI và địa chỉ contract
        const contractPath = path.resolve(__dirname, '../src/contracts/Auth.json');
        const authArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        
        // Kết nối Web3 với provider của bạn (Ganache hoặc MetaMask)
        const web3 = new Web3('http://localhost:7545'); // Điều chỉnh URL nếu cần
        
        // Lấy tài khoản đã deploy contract (admin)
        const accounts = await web3.eth.getAccounts();
        const adminAddress = accounts[0];
        
        // Khởi tạo contract
        const networkId = await web3.eth.net.getId();
        const deployedNetwork = authArtifact.networks[networkId];
        const authContract = new web3.eth.Contract(
            authArtifact.abi,
            deployedNetwork.address
        );
        
        // Lấy thông tin admin từ blockchain
        const adminData = await authContract.methods.users(adminAddress).call();
        
        // Kiểm tra xem admin đã tồn tại trong MongoDB chưa
        const existingAdmin = await User.findOne({ address: adminAddress });
        
        if (existingAdmin) {
            console.log("Admin already exists in MongoDB:", existingAdmin);
            mongoose.disconnect();
            return;
        }
        
        // Hash mật khẩu (123456) từ blockchain
        const hashedPassword = await bcrypt.hash("123456", 10);
        
        // Tạo admin trong MongoDB
        const newAdmin = new User({
            name: adminData.name || "System Admin",
            email: adminData.email || "admin@example.com",
            password: hashedPassword,
            role: "admin",
            address: adminAddress
        });
        
        await newAdmin.save();
        console.log("Admin synchronized successfully:", newAdmin);
        
        mongoose.disconnect();
    } catch (error) {
        console.error("Error synchronizing admin:", error);
        mongoose.disconnect();
    }
}

syncAdmin();