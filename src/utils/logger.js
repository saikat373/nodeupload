/**
 * Logging utility for error logging and monitoring capabilities
 * Provides structured logging with different levels and contexts
 */

const fs = require('fs');
const path = require('path');

/**
 * Log levels with numeric priorities
 */
const LogLevels = {
    ERROR: { name: 'ERROR', priority: 0, color: '\x1b[31m' }, // Red
    WARN: { name: 'WARN', priority: 1, color: '\x1b[33m' },   // Yellow
    INFO: { name: 'INFO', priority: 2, color: '\x1b[36m' },   // Cyan
    DEBUG: { name: 'DEBUG', priority: 3, color: '\x1b[37m' }  // White
};

/**
 * Security event types
 */
const SecurityEventTypes = {
    ERROR: 'error',
    WARNING: 'warning',
    SUSPICIOUS: 'suspicious',
    BLOCKED: 'blocked'
};

/**
 * Logger configuration
 */
const LoggerConfig = {
    logLevel: process.env.LOG_LEVEL || 'INFO',
    logToFile: process.env.LOG_TO_FILE === 'true',
    logDirectory: process.env.LOG_DIRECTORY || path.join(process.cwd(), 'logs'),
    maxLogFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 5,
    enableConsoleColors: process.env.ENABLE_CONSOLE_COLORS !== 'false',
    enableStructuredLogging: process.env.ENABLE_STRUCTURED_LOGGING === 'true'
};

/**
 * Ensures log directory exists
 */
function ensureLogDirectory() {
    if (LoggerConfig.logToFile && !fs.existsSync(LoggerConfig.logDirectory)) {
        try {
            fs.mkdirSync(LoggerConfig.logDirectory, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }
}

/**
 * Rotates log file if it exceeds maximum size
 * @param {string} logFilePath - Path to the log file
 */
function rotateLogFile(logFilePath) {
    try {
        const stats = fs.statSync(logFilePath);
        if (stats.size > LoggerConfig.maxLogFileSize) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedPath = logFilePath.replace('.log', `-${timestamp}.log`);
            fs.renameSync(logFilePath, rotatedPath);
            
            // Clean up old log files
            cleanupOldLogFiles(path.dirname(logFilePath));
        }
    } catch (error) {
        // Ignore rotation errors to prevent logging loops
    }
}

/**
 * Cleans up old log files keeping only the most recent ones
 * @param {string} logDirectory - Directory containing log files
 */
function cleanupOldLogFiles(logDirectory) {
    try {
        const files = fs.readdirSync(logDirectory)
            .filter(file => file.endsWith('.log'))
            .map(file => ({
                name: file,
                path: path.join(logDirectory, file),
                mtime: fs.statSync(path.join(logDirectory, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);
        
        // Remove files beyond the maximum count
        if (files.length > LoggerConfig.maxLogFiles) {
            files.slice(LoggerConfig.maxLogFiles).forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (error) {
                    // Ignore cleanup errors
                }
            });
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}

/**
 * Formats log message for console output
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {string} - Formatted log message
 */
function formatConsoleMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const levelInfo = LogLevels[level] || LogLevels.INFO;
    const color = LoggerConfig.enableConsoleColors ? levelInfo.color : '';
    const reset = LoggerConfig.enableConsoleColors ? '\x1b[0m' : '';
    
    let formattedMessage = `${color}[${timestamp}] ${level}: ${message}${reset}`;
    
    // Add context if provided and not in structured logging mode
    if (context && Object.keys(context).length > 0 && !LoggerConfig.enableStructuredLogging) {
        formattedMessage += `\nContext: ${JSON.stringify(context, null, 2)}`;
    }
    
    return formattedMessage;
}

/**
 * Formats log message for file output
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {string} - Formatted log message
 */
function formatFileMessage(level, message, context = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context
    };
    
    return JSON.stringify(logEntry) + '\n';
}

/**
 * Writes log message to file
 * @param {string} filename - Log filename
 * @param {string} formattedMessage - Formatted log message
 */
function writeToFile(filename, formattedMessage) {
    if (!LoggerConfig.logToFile) return;
    
    const logFilePath = path.join(LoggerConfig.logDirectory, filename);
    
    try {
        // Rotate log file if necessary
        if (fs.existsSync(logFilePath)) {
            rotateLogFile(logFilePath);
        }
        
        // Append to log file
        fs.appendFileSync(logFilePath, formattedMessage);
    } catch (error) {
        console.error('Failed to write to log file:', error.message);
    }
}

/**
 * Checks if log level should be logged based on configuration
 * @param {string} level - Log level to check
 * @returns {boolean} - Whether the level should be logged
 */
function shouldLog(level) {
    const currentLevel = LogLevels[LoggerConfig.logLevel] || LogLevels.INFO;
    const messageLevel = LogLevels[level] || LogLevels.INFO;
    return messageLevel.priority <= currentLevel.priority;
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function log(level, message, context = {}) {
    if (!shouldLog(level)) return;
    
    // Ensure log directory exists
    ensureLogDirectory();
    
    // Format and output to console
    const consoleMessage = formatConsoleMessage(level, message, context);
    
    if (level === 'ERROR') {
        console.error(consoleMessage);
    } else if (level === 'WARN') {
        console.warn(consoleMessage);
    } else {
        console.log(consoleMessage);
    }
    
    // Write to file if enabled
    if (LoggerConfig.logToFile) {
        const fileMessage = formatFileMessage(level, message, context);
        writeToFile('application.log', fileMessage);
    }
}

/**
 * Logs error messages
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 */
function logError(message, context = {}) {
    log('ERROR', message, context);
    
    // Also write to error-specific log file
    if (LoggerConfig.logToFile) {
        const fileMessage = formatFileMessage('ERROR', message, context);
        writeToFile('error.log', fileMessage);
    }
}

/**
 * Logs warning messages
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
function logWarning(message, context = {}) {
    log('WARN', message, context);
}

/**
 * Logs info messages
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 */
function logInfo(message, context = {}) {
    log('INFO', message, context);
}

/**
 * Logs debug messages
 * @param {string} message - Debug message
 * @param {Object} context - Additional context
 */
function logDebug(message, context = {}) {
    log('DEBUG', message, context);
}

/**
 * Logs security events with special handling
 * @param {string} eventType - Type of security event
 * @param {string} message - Security event message
 * @param {Object} context - Additional context
 */
function logSecurityEvent(eventType, message, context = {}) {
    const securityContext = {
        ...context,
        securityEvent: true,
        eventType,
        severity: eventType === SecurityEventTypes.ERROR ? 'HIGH' : 
                 eventType === SecurityEventTypes.BLOCKED ? 'MEDIUM' : 'LOW'
    };
    
    // Log as error for high severity events
    if (eventType === SecurityEventTypes.ERROR || eventType === SecurityEventTypes.BLOCKED) {
        logError(`SECURITY: ${message}`, securityContext);
    } else {
        logWarning(`SECURITY: ${message}`, securityContext);
    }
    
    // Write to security-specific log file
    if (LoggerConfig.logToFile) {
        const fileMessage = formatFileMessage('SECURITY', message, securityContext);
        writeToFile('security.log', fileMessage);
    }
}

/**
 * Logs request information for monitoring
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in milliseconds
 */
function logRequest(req, res, responseTime) {
    const requestContext = {
        request: {
            method: req.method,
            url: req.url,
            headers: {
                'user-agent': req.get('User-Agent'),
                'content-type': req.get('Content-Type'),
                'content-length': req.get('Content-Length')
            },
            ip: req.ip,
            timestamp: new Date().toISOString()
        },
        response: {
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`
        }
    };
    
    const message = `${req.method} ${req.url} - ${res.statusCode} (${responseTime}ms)`;
    
    if (res.statusCode >= 400) {
        logError(message, requestContext);
    } else {
        logInfo(message, requestContext);
    }
    
    // Write to access log file
    if (LoggerConfig.logToFile) {
        const fileMessage = formatFileMessage('ACCESS', message, requestContext);
        writeToFile('access.log', fileMessage);
    }
}

/**
 * Creates a request logging middleware
 * @returns {Function} - Express middleware function
 */
function createRequestLoggingMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();
        
        // Override res.end to capture response time
        const originalEnd = res.end;
        res.end = function(...args) {
            const responseTime = Date.now() - startTime;
            logRequest(req, res, responseTime);
            originalEnd.apply(this, args);
        };
        
        next();
    };
}

/**
 * Logs application startup information
 * @param {Object} config - Application configuration
 */
function logStartup(config) {
    logInfo('File upload server starting up', {
        startup: true,
        config: {
            maxFileSize: config.maxFileSize,
            maxFiles: config.maxFiles,
            allowedExtensions: config.allowedExtensions?.length || 0,
            port: config.port
        },
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform
    });
}

/**
 * Logs application shutdown information
 */
function logShutdown() {
    logInfo('File upload server shutting down', {
        shutdown: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    logError,
    logWarning,
    logInfo,
    logDebug,
    logSecurityEvent,
    logRequest,
    logStartup,
    logShutdown,
    createRequestLoggingMiddleware,
    LogLevels,
    SecurityEventTypes,
    LoggerConfig
};