const mongoose = require('mongoose');

// ...existing code...
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

module.exports = mongoose.model('Permission', permissionSchema);
