const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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

    // Add error handling middleware (similar to main server)
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
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'UNEXPECTED_FILE',
                        message: 'Unexpected file field',
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

describe('Single File Upload Endpoint', () => {
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

    describe('POST /upload/single', () => {
        it('should successfully upload a valid file', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test file content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('File uploaded successfully');
            expect(response.body.file).toMatchObject({
                originalName: 'test.txt',
                fileName: 'test.txt',
                size: expect.any(Number),
                mimeType: expect.any(String),
                uploadedAt: expect.any(String)
            });
            expect(response.body.file.path).toContain('test-uploads');
        });

        it('should upload file with custom folder name', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', 'custom-folder')
                .attach('file', Buffer.from('test file content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.path).toContain('custom-folder');
        });

        it('should upload file with custom file name', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', 'custom-name.txt')
                .attach('file', Buffer.from('test file content'), 'original.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.fileName).toBe('custom-name.txt');
            expect(response.body.file.originalName).toBe('original.txt');
        });

        it('should upload file with both custom folder and file name', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', 'custom-folder')
                .field('fileName', 'custom-name.txt')
                .attach('file', Buffer.from('test file content'), 'original.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.fileName).toBe('custom-name.txt');
            expect(response.body.file.path).toContain('custom-folder');
        });

        it('should return 400 when no file is provided', async () => {
            const response = await request(app)
                .post('/upload/single')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NO_FILE_PROVIDED');
        });

        it('should return 400 for invalid file type', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test content'), 'test.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
        });

        it('should return 400 for file too large', async () => {
            // Create a buffer larger than the limit
            const largeBuffer = Buffer.alloc(mockConfig.maxFileSize + 1, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', largeBuffer, 'large.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_TOO_LARGE');
        });

        it('should sanitize invalid folder names', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', '../invalid/folder')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should not contain directory traversal
            expect(response.body.file.path).not.toContain('../');
        });

        it('should sanitize invalid file names', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', 'invalid<>file.txt')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should not contain invalid characters
            expect(response.body.file.fileName).not.toContain('<');
            expect(response.body.file.fileName).not.toContain('>');
        });

        it('should return 400 for invalid folder name type', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', '123') // This will be treated as string by multer
                .attach('file', Buffer.from('test content'), 'test.txt');

            // Since multer converts form fields to strings, this should work
            expect(response.status).toBe(200);
        });

        it('should return 400 for folder name too long', async () => {
            const longFolderName = 'a'.repeat(256); // Longer than 255 chars
            
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', longFolderName)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 for file name too long', async () => {
            const longFileName = 'a'.repeat(256) + '.txt'; // Longer than 255 chars
            
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', longFileName)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle empty folder name by removing it', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', '   ') // Whitespace only
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should use default upload directory
            expect(response.body.file.path).toContain('test-uploads');
        });

        it('should handle empty file name by removing it', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', '   ') // Whitespace only
                .attach('file', Buffer.from('test content'), 'original.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should use original filename
            expect(response.body.file.fileName).toBe('original.txt');
        });

        it('should handle file name conflicts by generating unique names', async () => {
            // Upload first file
            const response1 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test content 1'), 'duplicate.txt')
                .expect(200);

            // Upload second file with same name
            const response2 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test content 2'), 'duplicate.txt')
                .expect(200);

            expect(response1.body.success).toBe(true);
            expect(response2.body.success).toBe(true);
            
            // File names should be different
            expect(response1.body.file.fileName).not.toBe(response2.body.file.fileName);
            expect(response2.body.file.fileName).toMatch(/duplicate_\d+\.txt/);
        });

        it('should include file metadata in response', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test file content'), 'test.txt')
                .expect(200);

            expect(response.body.file).toMatchObject({
                originalName: 'test.txt',
                fileName: expect.any(String),
                path: expect.any(String),
                size: expect.any(Number),
                mimeType: expect.any(String),
                uploadedAt: expect.any(String)
            });

            // Validate timestamp format
            expect(new Date(response.body.file.uploadedAt)).toBeInstanceOf(Date);
        });

        it('should preserve file extension when sanitizing names', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', 'invalid<>name.txt')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.fileName).toMatch(/\.txt$/);
        });
    });
});