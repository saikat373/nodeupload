const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { loadConfig } = require('./config');
const createUploadRoutes = require('./routes/upload');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { logStartup, logShutdown, createRequestLoggingMiddleware } = require('./utils/logger');

// Load configuration
let config;
try {
    config = loadConfig(path.join(__dirname, '../config/default.json'));
    logStartup(config);
} catch (error) {
    console.error('Failed to load configuration:', error.message);
    process.exit(1);
}

// Create Express application
const app = express();

// Basic middleware setup
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '1mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Parse URL-encoded bodies

// Request logging middleware
app.use(createRequestLoggingMiddleware());

// Rate limiting middleware
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Speed limiting middleware for uploads
const uploadSpeedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 10, // Allow 10 requests per 15 minutes at full speed
    delayMs: () => 500, // Add 500ms delay per request after delayAfter
    maxDelayMs: 20000, // Maximum delay of 20 seconds
    validate: { delayMs: false } // Disable the warning
});

// Apply rate limiting to upload routes
app.use('/upload', uploadLimiter);
app.use('/upload', uploadSpeedLimiter);

// Configure Multer with memory storage for validation before disk write
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxFileSize,
        files: config.maxFiles
    }
});

// Health check endpoint with detailed monitoring
app.get('/health', (req, res) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
            external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
        },
        cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
        },
        activeConnections: connections.size,
        config: {
            maxFileSize: config.maxFileSize,
            maxFiles: config.maxFiles,
            allowedExtensions: config.allowedExtensions.length,
            port: config.port
        }
    });
});

// Readiness probe endpoint (for Kubernetes)
app.get('/ready', (req, res) => {
    // Check if server is ready to accept requests
    if (server.listening) {
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString()
        });
    }
});

// Liveness probe endpoint (for Kubernetes)
app.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

// Upload routes
app.use('/upload', createUploadRoutes(config, upload));

// 404 handler (must come before error handler)
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

// Start server
const PORT = config.port;
const server = app.listen(PORT, () => {
    console.log(`File upload server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Track active connections for graceful shutdown
let connections = new Set();
server.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
        connections.delete(connection);
    });
});

// Enhanced graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    logShutdown();
    
    // Stop accepting new connections
    server.close((err) => {
        if (err) {
            console.error('Error during server close:', err);
            process.exit(1);
        }
        console.log('Server stopped accepting new connections');
        
        // Force close remaining connections after timeout
        setTimeout(() => {
            console.log('Forcing close of remaining connections');
            connections.forEach(connection => connection.destroy());
            process.exit(0);
        }, 10000); // 10 second timeout
        
        // If no active connections, exit immediately
        if (connections.size === 0) {
            console.log('No active connections. Exiting...');
            process.exit(0);
        } else {
            console.log(`Waiting for ${connections.size} active connections to close...`);
        }
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = { app, upload, config };