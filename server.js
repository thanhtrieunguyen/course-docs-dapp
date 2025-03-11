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

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: String,
    address: { type: String, unique: true } // Ensure wallet addresses are unique
});

const User = mongoose.model('User', userSchema);

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
                email: existingUser.email  // Return email for autofill
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
            address
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
