const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  // Metadata
  title: { type: String, required: true },
  description: { type: String, required: true },
  fileHash: { type: String, required: true }, // Hash của tài liệu (lưu trên blockchain)
  contentHash: { type: String }, // Add this field for compatibility
  fileContent: { type: Buffer, required: true }, // Nội dung file thực tế
  fileType: { type: String, required: true }, // Loại file (MIME type)
  fileName: { type: String, required: true }, // Tên file gốc
  fileSize: { type: Number, required: true }, // Kích thước file
  
  // Blockchain information
  blockchainId: { type: String }, // ID của tài liệu trên blockchain (bytes32)
  transactionHash: { type: String }, // Transaction hash khi lưu lên blockchain
  owner: { type: String, required: true }, // Địa chỉ ví của người sở hữu
  
  // Access control
  isPublic: { type: Boolean, default: false },
  courseId: { type: String, default: '' },
  
  // Verification status
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: String },
  verifiedAt: { type: Date },
  
  // Flag status
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String },
  flaggedBy: { type: String },
  flaggedAt: { type: Date },
  
  // Tracking
  accessHistory: [{
    user: String,
    timestamp: { type: Date, default: Date.now },
    action: String // 'view', 'edit', 'download', 'flag', 'verify', 'delete'
  }],
  
  // Deletion tracking
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: String },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Thêm index để tìm kiếm nhanh hơn
documentSchema.index({ fileHash: 1 });
documentSchema.index({ blockchainId: 1 });
documentSchema.index({ owner: 1 });
documentSchema.index({ courseId: 1 });
documentSchema.index({ title: 'text', description: 'text' }); // Text search index

// Create compound index for faster queries including isDeleted
documentSchema.index({ owner: 1, courseId: 1, status: 1, isDeleted: 1 });

// Add a static method to help with queries
documentSchema.statics.notDeleted = function() {
    return this.where({ isDeleted: { $ne: true } });
};

module.exports = mongoose.model('Document', documentSchema);
