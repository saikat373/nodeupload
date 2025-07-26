/**
 * Response formatting utilities for consistent API responses
 */

/**
 * Creates a standardized success response
 * @param {string} message - Success message
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} - Formatted success response
 */
function createSuccessResponse(message, data = null, statusCode = 200) {
    const response = {
        success: true,
        message,
        timestamp: new Date().toISOString()
    };

    if (data !== null) {
        // Handle different data types
        if (Array.isArray(data)) {
            response.data = data;
            response.count = data.length;
        } else if (typeof data === 'object') {
            // Merge data properties into response
            Object.assign(response, data);
        } else {
            response.data = data;
        }
    }

    return {
        statusCode,
        body: response
    };
}

/**
 * Creates a standardized error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Array} details - Error details array
 * @param {number} statusCode - HTTP status code (default: 400)
 * @returns {Object} - Formatted error response
 */
function createErrorResponse(code, message, details = [], statusCode = 400) {
    return {
        statusCode,
        body: {
            success: false,
            error: {
                code,
                message,
                details,
                timestamp: new Date().toISOString()
            }
        }
    };
}

/**
 * Creates a file upload success response
 * @param {Object} fileInfo - File information object
 * @param {string} message - Success message (optional)
 * @returns {Object} - Formatted file upload response
 */
function createFileUploadSuccessResponse(fileInfo, message = 'File uploaded successfully') {
    return createSuccessResponse(message, {
        file: {
            originalName: fileInfo.originalName,
            fileName: fileInfo.fileName,
            path: fileInfo.path,
            size: fileInfo.size,
            mimeType: fileInfo.mimeType,
            uploadedAt: fileInfo.savedAt || fileInfo.uploadedAt
        }
    });
}

/**
 * Creates a multiple file upload success response
 * @param {Array} filesInfo - Array of file information objects
 * @param {string} message - Success message (optional)
 * @returns {Object} - Formatted multiple file upload response
 */
function createMultipleFileUploadSuccessResponse(filesInfo, message = 'Files uploaded successfully') {
    const files = filesInfo.map(fileInfo => ({
        originalName: fileInfo.originalName,
        fileName: fileInfo.fileName,
        path: fileInfo.path,
        size: fileInfo.size,
        mimeType: fileInfo.mimeType,
        uploadedAt: fileInfo.savedAt || fileInfo.uploadedAt
    }));

    return createSuccessResponse(message, {
        files,
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0)
    });
}

/**
 * Creates a validation error response
 * @param {Array} validationErrors - Array of validation error objects
 * @param {string} message - Error message (optional)
 * @returns {Object} - Formatted validation error response
 */
function createValidationErrorResponse(validationErrors, message = 'Validation failed') {
    return createErrorResponse('VALIDATION_ERROR', message, validationErrors, 400);
}

/**
 * Creates a file validation error response
 * @param {Array} validationErrors - Array of file validation error objects
 * @param {string} message - Error message (optional)
 * @returns {Object} - Formatted file validation error response
 */
function createFileValidationErrorResponse(validationErrors, message = 'File validation failed') {
    return createErrorResponse('FILE_VALIDATION_ERROR', message, validationErrors, 400);
}

/**
 * Creates a storage error response
 * @param {string} message - Error message (optional)
 * @returns {Object} - Formatted storage error response
 */
function createStorageErrorResponse(message = 'Storage operation failed') {
    return createErrorResponse('STORAGE_ERROR', message, [], 507);
}

/**
 * Creates a file not found error response
 * @param {string} fileName - Name of the file that wasn't found (optional)
 * @returns {Object} - Formatted file not found error response
 */
function createFileNotFoundErrorResponse(fileName = null) {
    const message = fileName ? `File not found: ${fileName}` : 'File not found';
    return createErrorResponse('FILE_NOT_FOUND', message, [], 404);
}

/**
 * Creates a file too large error response
 * @param {number} maxSize - Maximum allowed file size
 * @param {number} actualSize - Actual file size (optional)
 * @returns {Object} - Formatted file too large error response
 */
function createFileTooLargeErrorResponse(maxSize, actualSize = null) {
    const message = actualSize 
        ? `File size ${actualSize} bytes exceeds limit of ${maxSize} bytes`
        : `File size exceeds limit of ${maxSize} bytes`;
    
    return createErrorResponse('FILE_TOO_LARGE', message, [], 400);
}

/**
 * Creates a too many files error response
 * @param {number} maxFiles - Maximum allowed number of files
 * @param {number} actualFiles - Actual number of files (optional)
 * @returns {Object} - Formatted too many files error response
 */
function createTooManyFilesErrorResponse(maxFiles, actualFiles = null) {
    const message = actualFiles 
        ? `Number of files ${actualFiles} exceeds limit of ${maxFiles}`
        : `Too many files. Maximum allowed: ${maxFiles}`;
    
    return createErrorResponse('TOO_MANY_FILES', message, [], 400);
}

/**
 * Creates a no file provided error response
 * @returns {Object} - Formatted no file error response
 */
function createNoFileProvidedErrorResponse() {
    return createErrorResponse('NO_FILE_PROVIDED', 'No file was provided in the request', [], 400);
}

/**
 * Creates a no files provided error response
 * @returns {Object} - Formatted no files error response
 */
function createNoFilesProvidedErrorResponse() {
    return createErrorResponse('NO_FILES_PROVIDED', 'No files were provided in the request', [], 400);
}

/**
 * Creates an internal server error response
 * @param {string} message - Error message (optional)
 * @returns {Object} - Formatted internal server error response
 */
function createInternalServerErrorResponse(message = 'An internal server error occurred') {
    return createErrorResponse('INTERNAL_ERROR', message, [], 500);
}

/**
 * Creates a malicious file detected error response
 * @param {string} fileName - Name of the malicious file (optional)
 * @returns {Object} - Formatted malicious file error response
 */
function createMaliciousFileErrorResponse(fileName = null) {
    const message = fileName 
        ? `Malicious file detected: ${fileName}`
        : 'Malicious file detected';
    
    return createErrorResponse('MALICIOUS_FILE_DETECTED', message, [], 400);
}

/**
 * Creates a directory traversal error response
 * @param {string} path - The problematic path (optional)
 * @returns {Object} - Formatted directory traversal error response
 */
function createDirectoryTraversalErrorResponse(path = null) {
    const message = path 
        ? `Directory traversal attempt detected in path: ${path}`
        : 'Directory traversal attempt detected';
    
    return createErrorResponse('DIRECTORY_TRAVERSAL_DETECTED', message, [], 400);
}

/**
 * Determines appropriate error response based on error type
 * @param {Error} error - The error object
 * @param {Object} config - Configuration object with limits
 * @returns {Object} - Formatted error response
 */
function createErrorResponseFromError(error, config = {}) {
    const errorMessage = error.message || 'Unknown error';
    
    // Check for specific error types
    if (errorMessage.includes('validation')) {
        return createValidationErrorResponse([], errorMessage);
    }
    
    if (errorMessage.includes('storage') || errorMessage.includes('disk')) {
        return createStorageErrorResponse(errorMessage);
    }
    
    if (errorMessage.includes('file not found')) {
        return createFileNotFoundErrorResponse();
    }
    
    if (errorMessage.includes('malicious') || errorMessage.includes('dangerous')) {
        return createMaliciousFileErrorResponse();
    }
    
    if (errorMessage.includes('directory traversal')) {
        return createDirectoryTraversalErrorResponse();
    }
    
    if (errorMessage.includes('file size') || errorMessage.includes('too large')) {
        return createFileTooLargeErrorResponse(config.maxFileSize || 0);
    }
    
    // Default to internal server error
    return createInternalServerErrorResponse(errorMessage);
}

/**
 * Sends a formatted response using Express response object
 * @param {Object} res - Express response object
 * @param {Object} formattedResponse - Formatted response from utility functions
 */
function sendFormattedResponse(res, formattedResponse) {
    res.status(formattedResponse.statusCode).json(formattedResponse.body);
}

/**
 * Middleware to add response formatting utilities to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function addResponseFormatters(req, res, next) {
    // Add formatting utilities to response object
    res.sendSuccess = (message, data = null, statusCode = 200) => {
        const formatted = createSuccessResponse(message, data, statusCode);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendError = (code, message, details = [], statusCode = 400) => {
        const formatted = createErrorResponse(code, message, details, statusCode);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendFileUploadSuccess = (fileInfo, message) => {
        const formatted = createFileUploadSuccessResponse(fileInfo, message);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendMultipleFileUploadSuccess = (filesInfo, message) => {
        const formatted = createMultipleFileUploadSuccessResponse(filesInfo, message);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendValidationError = (validationErrors, message) => {
        const formatted = createValidationErrorResponse(validationErrors, message);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendFileValidationError = (validationErrors, message) => {
        const formatted = createFileValidationErrorResponse(validationErrors, message);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendStorageError = (message) => {
        const formatted = createStorageErrorResponse(message);
        sendFormattedResponse(res, formatted);
    };
    
    res.sendInternalError = (message) => {
        const formatted = createInternalServerErrorResponse(message);
        sendFormattedResponse(res, formatted);
    };
    
    next();
}

module.exports = {
    createSuccessResponse,
    createErrorResponse,
    createFileUploadSuccessResponse,
    createMultipleFileUploadSuccessResponse,
    createValidationErrorResponse,
    createFileValidationErrorResponse,
    createStorageErrorResponse,
    createFileNotFoundErrorResponse,
    createFileTooLargeErrorResponse,
    createTooManyFilesErrorResponse,
    createNoFileProvidedErrorResponse,
    createNoFilesProvidedErrorResponse,
    createInternalServerErrorResponse,
    createMaliciousFileErrorResponse,
    createDirectoryTraversalErrorResponse,
    createErrorResponseFromError,
    sendFormattedResponse,
    addResponseFormatters
};