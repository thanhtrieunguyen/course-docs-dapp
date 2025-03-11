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
    origin: 'http://localhost:3001', 
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

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, address } = req.body;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.json({ success: false, error: 'Invalid email or password' });
        }
        
        // Verify wallet address matches the registered address
        if (user.address !== address) {
            return res.json({ 
                success: false, 
                error: 'Wallet address does not match the one registered with this account' 
            });
        }
        
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
