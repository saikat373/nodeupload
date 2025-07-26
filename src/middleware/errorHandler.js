/**
 * Centralized error handling middleware for the file upload server
 * Provides consistent error responses and logging capabilities
 */

const multer = require('multer');
const { createErrorResponse, sendFormattedResponse } = require('../utils/responseFormatter');
const { logError, logSecurityEvent } = require('../utils/logger');

/**
 * Error classification system
 */
const ErrorTypes = {
    VALIDATION: 'validation',
    STORAGE: 'storage',
    SECURITY: 'security',
    MULTER: 'multer',
    SYSTEM: 'system',
    NETWORK: 'network'
};

/**
 * HTTP status code mappings for different error types
 */
const StatusCodes = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    REQUEST_TIMEOUT: 408,
    PAYLOAD_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    INSUFFICIENT_STORAGE: 507
};

/**
 * Security-related error codes that should be logged as security events
 */
const SecurityErrorCodes = [
    'MALICIOUS_FILE_DETECTED',
    'DIRECTORY_TRAVERSAL_DETECTED',
    'SUSPICIOUS_UPLOAD_PATTERN',
    'RATE_LIMIT_EXCEEDED',
    'INVALID_FILE_TYPE',
    'FILE_TOO_LARGE'
];

/**
 * Classifies error based on error object properties
 * @param {Error} error - The error object
 * @returns {string} - Error type classification
 */
function classifyError(error) {
    if (error instanceof multer.MulterError) {
        return ErrorTypes.MULTER;
    }
    
    if (error.code && SecurityErrorCodes.includes(error.code)) {
        return ErrorTypes.SECURITY;
    }
    
    if (error.message) {
        const message = error.message.toLowerCase();
        
        if (message.includes('validation') || message.includes('invalid')) {
            return ErrorTypes.VALIDATION;
        }
        
        if (message.includes('storage') || message.includes('disk') || 
            message.includes('enospc') || message.includes('eacces')) {
            return ErrorTypes.STORAGE;
        }
        
        if (message.includes('timeout') || message.includes('network') || 
            message.includes('connection')) {
            return ErrorTypes.NETWORK;
        }
    }
    
    return ErrorTypes.SYSTEM;
}

/**
 * Determines appropriate HTTP status code based on error
 * @param {Error} error - The error object
 * @param {string} errorType - Error type classification
 * @returns {number} - HTTP status code
 */
function getStatusCodeForError(error, errorType) {
    // Handle Multer-specific errors
    if (error instanceof multer.MulterError) {
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                return StatusCodes.PAYLOAD_TOO_LARGE;
            case 'LIMIT_FILE_COUNT':
                return StatusCodes.BAD_REQUEST;
            case 'LIMIT_UNEXPECTED_FILE':
                return StatusCodes.BAD_REQUEST;
            case 'LIMIT_FIELD_KEY':
            case 'LIMIT_FIELD_VALUE':
            case 'LIMIT_FIELD_COUNT':
                return StatusCodes.BAD_REQUEST;
            case 'LIMIT_PART_COUNT':
                return StatusCodes.BAD_REQUEST;
            default:
                return StatusCodes.BAD_REQUEST;
        }
    }
    
    // Handle custom error codes
    if (error.code) {
        switch (error.code) {
            case 'VALIDATION_ERROR':
            case 'FILE_VALIDATION_ERROR':
            case 'NO_FILE_PROVIDED':
            case 'NO_FILES_PROVIDED':
            case 'INVALID_FILE_TYPE':
            case 'EMPTY_CUSTOM_FILENAME':
            case 'DUPLICATE_FILENAME_IN_BATCH':
                return StatusCodes.BAD_REQUEST;
                
            case 'FILE_NOT_FOUND':
                return StatusCodes.NOT_FOUND;
                
            case 'MALICIOUS_FILE_DETECTED':
            case 'DIRECTORY_TRAVERSAL_DETECTED':
                return StatusCodes.FORBIDDEN;
                
            case 'STORAGE_ERROR':
            case 'STORAGE_SPACE_EXCEEDED':
                return StatusCodes.INSUFFICIENT_STORAGE;
                
            case 'RATE_LIMIT_EXCEEDED':
                return StatusCodes.TOO_MANY_REQUESTS;
                
            case 'REQUEST_TIMEOUT':
                return StatusCodes.REQUEST_TIMEOUT;
                
            case 'UNSUPPORTED_MEDIA_TYPE':
                return StatusCodes.UNSUPPORTED_MEDIA_TYPE;
        }
    }
    
    // Handle by error type
    switch (errorType) {
        case ErrorTypes.VALIDATION:
            return StatusCodes.BAD_REQUEST;
        case ErrorTypes.STORAGE:
            return StatusCodes.INSUFFICIENT_STORAGE;
        case ErrorTypes.SECURITY:
            return StatusCodes.FORBIDDEN;
        case ErrorTypes.NETWORK:
            return StatusCodes.BAD_GATEWAY;
        case ErrorTypes.MULTER:
            return StatusCodes.BAD_REQUEST;
        default:
            return StatusCodes.INTERNAL_SERVER_ERROR;
    }
}

/**
 * Sanitizes error message to prevent information disclosure
 * @param {Error} error - The error object
 * @param {string} errorType - Error type classification
 * @returns {string} - Sanitized error message
 */
function sanitizeErrorMessage(error, errorType) {
    const originalMessage = error.message || 'Unknown error';
    
    // For security errors, use generic messages
    if (errorType === ErrorTypes.SECURITY) {
        switch (error.code) {
            case 'MALICIOUS_FILE_DETECTED':
                return 'File type not allowed for security reasons';
            case 'DIRECTORY_TRAVERSAL_DETECTED':
                return 'Invalid file path detected';
            default:
                return 'Security validation failed';
        }
    }
    
    // For system errors, use generic messages to avoid information disclosure
    if (errorType === ErrorTypes.SYSTEM) {
        return 'An internal server error occurred';
    }
    
    // For storage errors, provide helpful but not too detailed messages
    if (errorType === ErrorTypes.STORAGE) {
        if (originalMessage.includes('ENOSPC')) {
            return 'Insufficient storage space available';
        }
        if (originalMessage.includes('EACCES')) {
            return 'Storage access denied';
        }
        if (originalMessage.includes('EMFILE') || originalMessage.includes('ENFILE')) {
            return 'Too many files open, please try again later';
        }
        return 'Storage operation failed';
    }
    
    // For validation and multer errors, the original message is usually safe
    if (errorType === ErrorTypes.VALIDATION || errorType === ErrorTypes.MULTER) {
        return originalMessage;
    }
    
    // For network errors, provide generic message
    if (errorType === ErrorTypes.NETWORK) {
        return 'Network operation failed, please try again';
    }
    
    return originalMessage;
}

/**
 * Creates error details array with sanitized information
 * @param {Error} error - The error object
 * @param {Object} req - Express request object
 * @returns {Array} - Error details array
 */
function createErrorDetails(error, req) {
    const details = [];
    
    // Add request context for debugging (but not in production)
    if (process.env.NODE_ENV !== 'production') {
        details.push({
            field: 'request',
            message: `${req.method} ${req.path}`,
            code: 'REQUEST_CONTEXT'
        });
        
        if (error.stack) {
            details.push({
                field: 'stack',
                message: error.stack.split('\n').slice(0, 3).join('\n'),
                code: 'STACK_TRACE'
            });
        }
    }
    
    // Add error-specific details
    if (error.details && Array.isArray(error.details)) {
        details.push(...error.details);
    }
    
    return details;
}

/**
 * Main error handling middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
    // Skip if response already sent
    if (res.headersSent) {
        return next(err);
    }
    
    // Classify the error
    const errorType = classifyError(err);
    const statusCode = getStatusCodeForError(err, errorType);
    const sanitizedMessage = sanitizeErrorMessage(err, errorType);
    const errorDetails = createErrorDetails(err, req);
    
    // Create error context for logging
    const errorContext = {
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code,
            type: errorType
        },
        request: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        },
        response: {
            statusCode
        }
    };
    
    // Log the error
    if (errorType === ErrorTypes.SECURITY) {
        logSecurityEvent('error', sanitizedMessage, errorContext);
    } else {
        logError(sanitizedMessage, errorContext);
    }
    
    // Determine error code for response
    let errorCode = err.code || 'INTERNAL_ERROR';
    
    // Handle Multer errors
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                errorCode = 'FILE_TOO_LARGE';
                break;
            case 'LIMIT_FILE_COUNT':
                errorCode = 'TOO_MANY_FILES';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                errorCode = 'UNEXPECTED_FILE';
                break;
            default:
                errorCode = 'UPLOAD_ERROR';
        }
    }
    
    // Create and send error response
    const errorResponse = createErrorResponse(
        errorCode,
        sanitizedMessage,
        errorDetails,
        statusCode
    );
    
    sendFormattedResponse(res, errorResponse);
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
    const errorResponse = createErrorResponse(
        'NOT_FOUND',
        'Endpoint not found',
        [{
            field: 'url',
            message: `${req.method} ${req.path} is not a valid endpoint`,
            code: 'INVALID_ENDPOINT'
        }],
        StatusCodes.NOT_FOUND
    );
    
    // Log 404 for monitoring
    logError('404 Not Found', {
        request: {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        }
    });
    
    sendFormattedResponse(res, errorResponse);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped function with error handling
 */
function asyncErrorHandler(fn) {
    return (req, res, next) => {
        try {
            Promise.resolve(fn(req, res, next)).catch(next);
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Creates a custom error with additional properties
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code
 * @param {Array} details - Error details array
 * @returns {Error} - Custom error object
 */
function createCustomError(message, code, statusCode = 500, details = []) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    return error;
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncErrorHandler,
    createCustomError,
    ErrorTypes,
    StatusCodes,
    classifyError,
    getStatusCodeForError,
    sanitizeErrorMessage
};