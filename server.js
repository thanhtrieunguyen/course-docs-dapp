require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./src/config/db');
const documentRoutes = require('./src/routes/documentRoutes'); 
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src/public'));

// Routes
app.use('/api', documentRoutes);

// Error Handler
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route không tồn tại'
    });
});

// Connect to database
connectDB();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received');
    shutdown();
});

process.on('SIGINT', () => {
    console.info('SIGINT signal received');
    shutdown();
});

const shutdown = () => {
    console.log('Starting graceful shutdown');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
};

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});