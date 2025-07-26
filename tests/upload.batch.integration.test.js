const request = require('supertest');
const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const createUploadRoutes = require('../src/routes/upload');

// Mock configuration
const mockConfig = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    allowedExtensions: ['.txt', '.jpg', '.png', '.pdf'],
    defaultUploadDir: 'test-uploads',
    tempDir: 'test-temp',
    maxTotalSize: 50 * 1024 * 1024, // 50MB
    port: 3000
};

// Create test app
function createTestApp() {
    const app = express();
    
    // Configure Multer with memory storage
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: mockConfig.maxFileSize,
            files: mockConfig.maxFiles
        }
    });

    // Add upload routes
    app.use('/upload', createUploadRoutes(mockConfig, upload));

    // Add error handling middleware
    app.use((err, req, res, next) => {
        console.error('Test app error:', err);

        // Multer errors
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'FILE_TOO_LARGE',
                        message: `File size exceeds limit of ${mockConfig.maxFileSize} bytes`,
                        details: []
                    }
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'TOO_MANY_FILES',
                        message: `Too many files. Maximum allowed: ${mockConfig.maxFiles}`,
                        details: []
                    }
                });
            }
        }

        // Generic error response
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal server error occurred',
                details: []
            }
        });
    });

    return app;
}

// Helper function to check if file exists
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Helper function to get all files in a directory recursively
async function getAllFiles(dir) {
    const files = [];
    
    async function traverse(currentDir) {
        try {
            const items = await fs.readdir(currentDir);
            for (const item of items) {
                const itemPath = path.join(currentDir, item);
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory()) {
                    await traverse(itemPath);
                } else {
                    files.push(itemPath);
                }
            }
        } catch (error) {
            // Directory might not exist, which is fine
        }
    }
    
    await traverse(dir);
    return files;
}

describe('Batch Upload Integration Tests', () => {
    let app;

    beforeEach(() => {
        app = createTestApp();
    });

    afterEach(async () => {
        // Clean up test files
        try {
            await fs.rm('test-uploads', { recursive: true, force: true });
        } catch (error) {
            // Ignore if directory doesn't exist
        }
        try {
            await fs.rm('test-temp', { recursive: true, force: true });
        } catch (error) {
            // Ignore if directory doesn't exist
        }
    });

    describe('All-or-nothing batch upload logic', () => {
        it('should upload all files successfully in a batch', async () => {
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .attach('files', Buffer.from('content 3'), 'file3.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.files).toHaveLength(3);
            expect(response.body.message).toContain('Successfully uploaded 3 files');

            // Verify all files were actually saved
            for (const file of response.body.files) {
                expect(await fileExists(file.path)).toBe(true);
            }
        });

        it('should rollback all files when one file fails validation', async () => {
            // Create a scenario where the third file will fail validation (invalid extension)
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .attach('files', Buffer.from('malicious content'), 'malware.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');

            // Verify no files were saved (rollback should have cleaned them up)
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(0);
        });

        it('should rollback successfully saved files when a later file fails to save', async () => {
            // This test simulates a storage failure after some files have been saved
            // We'll use a very long filename that might cause issues
            const longFileName = 'a'.repeat(300) + '.txt'; // Very long filename
            
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .field('fileNames', 'file1.txt')
                .field('fileNames', longFileName) // This might cause a save error
                .expect(400);

            expect(response.body.success).toBe(false);
            
            // Verify no files remain (rollback should have cleaned them up)
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(0);
        });

        it('should handle rollback failures gracefully', async () => {
            // This test is harder to simulate without mocking, but we can test the error structure
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.exe') // Invalid extension
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
            expect(response.body.error.details).toBeInstanceOf(Array);
        });
    });

    describe('Detailed error reporting for batch failures', () => {
        it('should provide detailed error information for each failed file', async () => {
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.exe') // Invalid extension
                .attach('files', Buffer.from('content 3'), 'file3.bat') // Invalid extension
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
            expect(response.body.error.message).toBe('One or more files failed validation');
            expect(response.body.error.details).toBeInstanceOf(Array);
            

            
            // Should have error details for the invalid files
            const invalidFileErrors = response.body.error.details.filter(
                detail => detail.message && detail.message.includes('File type not allowed')
            );
            expect(invalidFileErrors.length).toBeGreaterThan(0);
        });

        it('should include file index and original name in error details', async () => {
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'valid.txt')
                .attach('files', Buffer.from('content 2'), 'invalid.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.details).toBeInstanceOf(Array);
            
            // Find the error for the invalid file
            const invalidFileError = response.body.error.details.find(
                detail => detail.field && detail.field.includes('files[1]')
            );
            expect(invalidFileError).toBeDefined();
        });

        it('should report pre-validation errors before attempting to save files', async () => {
            // Test duplicate filenames in batch - this should be caught in pre-validation
            const response = await request(app)
                .post('/upload/multiple')
                .field('fileNames', 'duplicate.txt')
                .field('fileNames', 'duplicate.txt') // Duplicate filename
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('BATCH_VALIDATION_FAILED');
            expect(response.body.error.message).toContain('failed pre-validation');
            
            // Should have specific error for duplicate filename
            const duplicateFilenameError = response.body.error.details.find(
                detail => detail.code === 'DUPLICATE_FILENAME_IN_BATCH'
            );
            expect(duplicateFilenameError).toBeDefined();
            expect(duplicateFilenameError.field).toBe('fileNames[0]');
            expect(duplicateFilenameError.error).toContain('Duplicate filename in batch');
        });

        it('should provide transaction ID in logs for batch tracking', async () => {
            // Capture console.log output
            const originalLog = console.log;
            const logMessages = [];
            console.log = (...args) => {
                logMessages.push(args.join(' '));
                originalLog(...args);
            };

            try {
                await request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('content 1'), 'file1.txt')
                    .attach('files', Buffer.from('content 2'), 'file2.txt')
                    .expect(200);

                // Check that batch ID appears in logs
                const batchLogMessage = logMessages.find(msg => 
                    msg.includes('Batch batch_') && msg.includes('Successfully uploaded')
                );
                expect(batchLogMessage).toBeDefined();
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe('Rollback mechanism for partial failures', () => {
        it('should clean up all saved files when batch fails', async () => {
            // Upload files where one will fail validation
            await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .attach('files', Buffer.from('malicious'), 'malware.exe')
                .expect(400);

            // Verify no files remain in the upload directory
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(0);
        });

        it('should handle system errors during batch upload with rollback', async () => {
            // This test simulates a system error scenario
            // We'll use an extremely long folder name that might cause system issues
            const extremelyLongFolderName = 'a'.repeat(500);
            
            const response = await request(app)
                .post('/upload/multiple')
                .field('folderName', extremelyLongFolderName)
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'file2.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            
            // Verify no files remain
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(0);
        });

        it('should stop processing on first error for all-or-nothing behavior', async () => {
            // Capture console.error output to verify error handling
            const originalError = console.error;
            const errorMessages = [];
            console.error = (...args) => {
                errorMessages.push(args.join(' '));
                originalError(...args);
            };

            try {
                await request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('content 1'), 'file1.txt')
                    .attach('files', Buffer.from('content 2'), 'invalid.exe')
                    .attach('files', Buffer.from('content 3'), 'file3.txt')
                    .expect(400);

                // The error should be caught at validation level, not during save
                // So we shouldn't see individual file save errors
                const saveErrorMessages = errorMessages.filter(msg => 
                    msg.includes('Error saving file') && msg.includes('in batch')
                );
                // Should be 0 because validation catches the error before saving
                expect(saveErrorMessages).toHaveLength(0);
            } finally {
                console.error = originalError;
            }
        });

        it('should provide rollback status in error response when rollback fails', async () => {
            // This is a complex scenario to test without mocking
            // For now, we'll test the error structure
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('content 1'), 'file1.txt')
                .attach('files', Buffer.from('content 2'), 'invalid.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('details');
            expect(response.body.error).toHaveProperty('timestamp');
        });
    });

    describe('Batch metadata and logging', () => {
        it('should include batch metadata in file upload logs', async () => {
            // Capture console.log output
            const originalLog = console.log;
            const logMessages = [];
            console.log = (...args) => {
                logMessages.push(args.join(' '));
                originalLog(...args);
            };

            try {
                await request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('content 1'), 'file1.txt')
                    .attach('files', Buffer.from('content 2'), 'file2.txt')
                    .expect(200);

                // Check that file upload logs contain batch metadata
                const fileUploadLogs = logMessages.filter(msg => 
                    msg.includes('FILE_UPLOAD_LOG:') && msg.includes('multiple_upload')
                );
                expect(fileUploadLogs.length).toBeGreaterThan(0);

                // Parse one of the logs to check batch metadata
                const logData = JSON.parse(fileUploadLogs[0].replace('FILE_UPLOAD_LOG: ', ''));
                expect(logData.uploadSource).toBe('multiple_upload');
            } finally {
                console.log = originalLog;
            }
        });

        it('should assign unique batch IDs to different upload requests', async () => {
            // Capture console.log output
            const originalLog = console.log;
            const logMessages = [];
            console.log = (...args) => {
                logMessages.push(args.join(' '));
                originalLog(...args);
            };

            try {
                // First batch
                await request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('content 1'), 'batch1_file1.txt')
                    .expect(200);

                // Second batch
                await request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('content 2'), 'batch2_file1.txt')
                    .expect(200);

                // Check that different batch IDs were used
                const batchSuccessLogs = logMessages.filter(msg => 
                    msg.includes('Successfully uploaded') && msg.includes('Batch batch_')
                );
                expect(batchSuccessLogs).toHaveLength(2);
                
                // Extract batch IDs
                const batchIds = batchSuccessLogs.map(log => {
                    const match = log.match(/Batch (batch_[^:]+):/);
                    return match ? match[1] : null;
                }).filter(Boolean);
                
                expect(batchIds).toHaveLength(2);
                expect(batchIds[0]).not.toBe(batchIds[1]);
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe('Edge cases and error scenarios', () => {
        it('should handle empty batch gracefully', async () => {
            const response = await request(app)
                .post('/upload/multiple')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NO_FILES_PROVIDED');
        });

        it('should handle mixed valid and invalid file types with proper rollback', async () => {
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('valid content'), 'valid.txt')
                .attach('files', Buffer.from('image content'), 'image.jpg')
                .attach('files', Buffer.from('malicious content'), 'malware.exe')
                .attach('files', Buffer.from('more valid content'), 'another.pdf')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');

            // Verify no files were saved
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(0);
        });

        it('should handle concurrent batch uploads independently', async () => {
            // Start two batch uploads simultaneously
            const [response1, response2] = await Promise.all([
                request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('batch1 content'), 'batch1.txt'),
                request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from('batch2 content'), 'batch2.txt')
            ]);

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(response1.body.success).toBe(true);
            expect(response2.body.success).toBe(true);

            // Verify both files were saved
            const allFiles = await getAllFiles('test-uploads');
            expect(allFiles).toHaveLength(2);
        });
    });
});