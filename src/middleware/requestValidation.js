/**
 * Request validation middleware for upload endpoints
 */

/**
 * Validates request parameters for single file upload
 */
function validateSingleUploadRequest(req, res, next) {
    const errors = [];

    // Validate folderName if provided
    if (req.body.folderName !== undefined) {
        if (typeof req.body.folderName !== 'string') {
            errors.push({
                field: 'folderName',
                message: 'Folder name must be a string',
                code: 'INVALID_FOLDER_NAME_TYPE'
            });
        } else if (req.body.folderName.length > 255) {
            errors.push({
                field: 'folderName',
                message: 'Folder name too long (max 255 characters)',
                code: 'FOLDER_NAME_TOO_LONG'
            });
        }
    }

    // Validate fileName if provided
    if (req.body.fileName !== undefined) {
        if (typeof req.body.fileName !== 'string') {
            errors.push({
                field: 'fileName',
                message: 'File name must be a string',
                code: 'INVALID_FILE_NAME_TYPE'
            });
        } else if (req.body.fileName.length > 255) {
            errors.push({
                field: 'fileName',
                message: 'File name too long (max 255 characters)',
                code: 'FILE_NAME_TOO_LONG'
            });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: errors,
                timestamp: new Date().toISOString()
            }
        });
    }

    next();
}

/**
 * Validates request parameters for multiple file upload
 */
function validateMultipleUploadRequest(req, res, next) {
    const errors = [];

    // Validate folderName if provided
    if (req.body.folderName !== undefined) {
        if (typeof req.body.folderName !== 'string') {
            errors.push({
                field: 'folderName',
                message: 'Folder name must be a string',
                code: 'INVALID_FOLDER_NAME_TYPE'
            });
        } else if (req.body.folderName.length > 255) {
            errors.push({
                field: 'folderName',
                message: 'Folder name too long (max 255 characters)',
                code: 'FOLDER_NAME_TOO_LONG'
            });
        }
    }

    // Validate fileNames if provided
    if (req.body.fileNames !== undefined) {
        if (!Array.isArray(req.body.fileNames)) {
            errors.push({
                field: 'fileNames',
                message: 'File names must be an array',
                code: 'INVALID_FILE_NAMES_TYPE'
            });
        } else {
            req.body.fileNames.forEach((fileName, index) => {
                if (typeof fileName !== 'string') {
                    errors.push({
                        field: `fileNames[${index}]`,
                        message: `File name at index ${index} must be a string`,
                        code: 'INVALID_FILE_NAME_TYPE'
                    });
                } else if (fileName.length > 255) {
                    errors.push({
                        field: `fileNames[${index}]`,
                        message: `File name at index ${index} too long (max 255 characters)`,
                        code: 'FILE_NAME_TOO_LONG'
                    });
                }
            });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: errors,
                timestamp: new Date().toISOString()
            }
        });
    }

    next();
}

/**
 * Preprocesses request data by trimming strings and normalizing values
 */
function preprocessRequest(req, res, next) {
    // Ensure req.body exists
    if (!req.body) {
        req.body = {};
    }

    // Trim string values
    if (req.body.folderName && typeof req.body.folderName === 'string') {
        req.body.folderName = req.body.folderName.trim();
    }

    if (req.body.fileName && typeof req.body.fileName === 'string') {
        req.body.fileName = req.body.fileName.trim();
    }

    if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
        req.body.fileNames = req.body.fileNames.map(name => 
            typeof name === 'string' ? name.trim() : name
        );
    }

    // Remove empty strings
    if (req.body.folderName === '') {
        delete req.body.folderName;
    }

    if (req.body.fileName === '') {
        delete req.body.fileName;
    }

    if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
        req.body.fileNames = req.body.fileNames.filter(name => name !== '');
        if (req.body.fileNames.length === 0) {
            delete req.body.fileNames;
        }
    }

    next();
}

module.exports = {
    validateSingleUploadRequest,
    validateMultipleUploadRequest,
    preprocessRequest
};