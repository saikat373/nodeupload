const express = require('express');
const FileValidator = require('../services/fileValidator');
const StorageService = require('../services/storageService');
const createFileValidationMiddleware = require('../middleware/fileValidation');
const { validateSingleUploadRequest, validateMultipleUploadRequest, preprocessRequest } = require('../middleware/requestValidation');
const { 
    createFileUploadSuccessResponse, 
    createErrorResponseFromError,
    sendFormattedResponse,
    addResponseFormatters
} = require('../utils/responseFormatter');
const { asyncErrorHandler, createCustomError } = require('../middleware/errorHandler');

/**
 * Creates upload routes with the provided configuration and multer instance
 */
function createUploadRoutes(config, upload) {
    const router = express.Router();
    const fileValidator = new FileValidator(config);
    const storageService = new StorageService(config);
    const fileValidationMiddleware = createFileValidationMiddleware(config);

    /**
     * POST /upload/single - Single file upload endpoint
     */
    router.post('/single', 
        // Add response formatters
        addResponseFormatters,
        
        // Multer middleware for single file
        upload.single('file'),
        
        // Request preprocessing
        preprocessRequest,
        
        // Request validation
        validateSingleUploadRequest,
        
        // File validation
        fileValidationMiddleware.validateSingleFile,
        
        // Route handler with async error handling
        asyncErrorHandler(async (req, res) => {
            const { folderName, fileName } = req.body;
            const file = req.file;

            // Additional check for file presence (in case middleware didn't catch it)
            if (!file) {
                throw createCustomError('No file was provided in the request', 'NO_FILE_PROVIDED', 400);
            }

            // Save file with custom path
            const saveResult = await storageService.saveFileWithMetadata(
                file,
                folderName,
                fileName,
                {
                    uploadSource: 'single_upload',
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip,
                    sessionId: req.sessionID || null
                }
            );

            // Success response using formatter
            res.sendFileUploadSuccess(saveResult, 'File uploaded successfully');
        })
    );

    /**
     * POST /upload/multiple - Multiple file upload endpoint
     */
    router.post('/multiple', 
        // Add response formatters
        addResponseFormatters,
        
        // Multer middleware for multiple files
        upload.array('files'),
        
        // Request preprocessing
        preprocessRequest,
        
        // Request validation
        validateMultipleUploadRequest,
        
        // File validation
        fileValidationMiddleware.validateMultipleFiles,
        
        // Route handler with async error handling
        asyncErrorHandler(async (req, res) => {
            const { folderName, fileNames } = req.body;
            const files = req.files;

            // Additional check for files presence (in case middleware didn't catch it)
            if (!files || files.length === 0) {
                throw createCustomError('No files were provided in the request', 'NO_FILES_PROVIDED', 400);
            }

            // Validate storage space for batch upload
            const spaceValidation = await storageService.validateBatchStorageSpace(files, folderName);
            if (!spaceValidation.valid) {
                throw createCustomError(spaceValidation.message, 'STORAGE_SPACE_EXCEEDED', 507);
            }

            // Process files in a transaction-like manner
            const savedFiles = [];
            const errors = [];
            let transactionId = null;
            // Generate a unique transaction ID for this batch
            transactionId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Pre-validate all files before starting to save any
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const customFileName = fileNames && fileNames[i] ? fileNames[i] : null;
                
                // Additional pre-save validation
                if (customFileName && customFileName.length === 0) {
                    errors.push({
                        index: i,
                        originalName: file.originalname,
                        error: 'Custom filename cannot be empty',
                        code: 'EMPTY_CUSTOM_FILENAME',
                        field: `fileNames[${i}]`
                    });
                }
                
                // Check for potential filename conflicts within the batch
                if (customFileName) {
                    for (let j = i + 1; j < files.length; j++) {
                        const otherFileName = fileNames && fileNames[j] ? fileNames[j] : files[j].originalname;
                        if (customFileName === otherFileName) {
                            errors.push({
                                index: i,
                                originalName: file.originalname,
                                error: `Duplicate filename in batch: ${customFileName}`,
                                code: 'DUPLICATE_FILENAME_IN_BATCH',
                                field: `fileNames[${i}]`
                            });
                            break; // Only report once per file
                        }
                    }
                }
            }
            
            // If pre-validation failed, throw error immediately
            if (errors.length > 0) {
                const error = createCustomError(
                    `${errors.length} files failed pre-validation`,
                    'BATCH_VALIDATION_FAILED',
                    400,
                    errors
                );
                throw error;
            }
            
            // Process each file in the batch
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const customFileName = fileNames && fileNames[i] ? fileNames[i] : null;
                
                // Save file with custom path and metadata - let asyncErrorHandler catch any errors
                const saveResult = await storageService.saveFileWithMetadata(
                    file,
                    folderName,
                    customFileName,
                    {
                        uploadSource: 'multiple_upload',
                        batchId: transactionId,
                        batchIndex: i,
                        batchSize: files.length,
                        userAgent: req.get('User-Agent'),
                        ipAddress: req.ip,
                        sessionId: req.sessionID || null
                    }
                );
                
                savedFiles.push(saveResult);
            }
            
            // Log successful batch completion
            console.log(`Batch ${transactionId}: Successfully uploaded ${savedFiles.length} files`);

            // Success response using formatter
            res.sendMultipleFileUploadSuccess(savedFiles, `Successfully uploaded ${savedFiles.length} files`);
        })
    );

    return router;
}

module.exports = createUploadRoutes;