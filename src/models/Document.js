const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Tiêu đề không được để trống'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    documentHash: {
        type: String,
        required: true,
        unique: true
    },
    documentId: String,
    contentHash: String,
    filePath: String,
    fileType: String,
    fileName: String,
    fileSize: Number,
    owner: String,
    isPublic: Boolean,
    courseId: String,
    uploadDate: { type: Date, default: Date.now },
    status: { type: String, default: 'active' },
    accessHistory: [{
        user: String,
        action: String,
        timestamp: Date
    }]
}, {
    timestamps: true
});

// Add index for better query performance
documentSchema.index({ documentId: 1 });
documentSchema.index({ owner: 1 });
documentSchema.index({ courseId: 1 });

module.exports = mongoose.model('Document', documentSchema);
