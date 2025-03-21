const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    
    // MongoDB Duplicate Key Error
    if (err.code === 11000) {
        return res.status(400).json({
            success: false,
            error: 'Dữ liệu đã tồn tại'
        });
    }

    // JWT Error
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Token không hợp lệ'
        });
    }

    // Multer Error
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: 'Lỗi khi tải file'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Lỗi server'
    });
};

module.exports = errorHandler;
