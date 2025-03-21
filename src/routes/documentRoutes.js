const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const Document = require('../models/Document');
const upload = require('../middleware/upload');
const { calculateFileHash } = require('../utils/fileUtils');

router.post('/upload-document', authenticateToken, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Không có file được tải lên'
            });
        }

        const hash = await calculateFileHash(req.file.path);
        // ...existing code...
    } catch (err) {
        next(err);
    }
});

router.get('/document/:documentId', authenticateToken, async (req, res, next) => {
    try {
        const doc = await Document.findOne({documentId: req.params.documentId});
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài liệu'
            });
        }
        // ...existing code...
    } catch (err) {
        next(err);
    }
});

router.get('/my-documents', authenticateToken, /* ... */);

module.exports = router;
