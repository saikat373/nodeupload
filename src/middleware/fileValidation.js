const FileValidator = require('../services/fileValidator');

/**
 * File validation middleware that uses the FileValidator service
 */

/**
 * Creates file validation middleware with the provided configuration
 */
function createFileValidationMiddleware(config) {
    const validator = new FileValidator(config);

    /**
     * Validates single file upload
     */
    function validateSingleFile(req, res, next) {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'NO_FILE_PROVIDED',
                    message: 'No file was provided in the request',
                    details: [],
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Validate the file
        const validationResult = validator.validateFile(req.file);
        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'FILE_VALIDATION_ERROR',
                    message: 'File validation failed',
                    details: validationResult.errors,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Validate and sanitize folder name if provided
        if (req.body.folderName) {
            if (!validator.validateFolderName(req.body.folderName)) {
                req.body.folderName = validator.sanitizeFolderName(req.body.folderName);
            }
        }

        // Validate and sanitize file name if provided
        if (req.body.fileName) {
            if (!validator.validateFileName(req.body.fileName)) {
                req.body.fileName = validator.sanitizeFileName(req.body.fileName);
            }
        }

        next();
    }

    /**
     * Validates multiple file upload
     */
    function validateMultipleFiles(req, res, next) {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'NO_FILES_PROVIDED',
                    message: 'No files were provided in the request',
                    details: [],
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Calculate total size
        const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > validator.maxTotalSize) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'TOTAL_SIZE_EXCEEDED',
                    message: `Total upload size exceeds limit of ${validator.maxTotalSize} bytes`,
                    details: [],
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Validate each file
        const allErrors = [];
        req.files.forEach((file, index) => {
            const validationResult = validator.validateFile(file);
            if (!validationResult.success) {
                validationResult.errors.forEach(error => {
                    allErrors.push({
                        ...error,
                        field: `files[${index}].${error.field}`,
                        message: `File ${index + 1}: ${error.message}`
                    });
                });
            }
        });

        if (allErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'FILE_VALIDATION_ERROR',
                    message: 'One or more files failed validation',
                    details: allErrors,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Validate and sanitize folder name if provided
        if (req.body.folderName) {
            if (!validator.validateFolderName(req.body.folderName)) {
                req.body.folderName = validator.sanitizeFolderName(req.body.folderName);
            }
        }

        // Validate and sanitize file names if provided
        if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
            req.body.fileNames = req.body.fileNames.map(fileName => {
                if (!validator.validateFileName(fileName)) {
                    return validator.sanitizeFileName(fileName);
                }
                return fileName;
            });
        }

        next();
    }

    return {
        validateSingleFile,
        validateMultipleFiles
    };
}

module.exports = createFileValidationMiddleware;