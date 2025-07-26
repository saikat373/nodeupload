const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const { app, config } = require('../src/index');

describe('Comprehensive Integration Tests', () => {
    afterEach(async () => {
        // Clean up test files
        try {
            await fs.rm('uploads', { recursive: true, force: true });
        } catch (error) {
            // Ignore if directory doesn't exist
        }
    });

    describe('End-to-End Single File Upload Workflow', () => {
        it('should complete full single file upload workflow with all validations', async () => {
            // Test complete workflow: validation -> processing -> storage -> response
            const testContent = 'Complete integration test content for single file upload';
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from(testContent), 'integration-test.txt')
                .expect(200);

            // Verify response structure
            expect(response.body).toMatchObject({
                success: true,
                message: 'File uploaded successfully',
                file: {
                    originalName: 'integration-test.txt',
                    fileName: 'integration-test.txt',
                    size: testContent.length,
                    mimeType: 'text/plain',
                    path: expect.stringContaining('uploads'),
                    uploadedAt: expect.any(String)
                },
                timestamp: expect.any(String)
            });

            // Verify file was actually saved with correct content
            const savedContent = await fs.readFile(response.body.file.path, 'utf8');
            expect(savedContent).toBe(testContent);

            // Verify file metadata
            const stats = await fs.stat(response.body.file.path);
            expect(stats.size).toBe(testContent.length);
            expect(stats.isFile()).toBe(true);
        });

        it('should handle single file upload with custom folder and filename workflow', async () => {
            const testContent = 'Custom folder and filename test content';
            
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', 'integration-test-folder')
                .field('fileName', 'custom-integration-file.txt')
                .attach('file', Buffer.from(testContent), 'original-name.txt')
                .expect(200);

            // Verify custom naming was applied
            expect(response.body.file.fileName).toBe('custom-integration-file.txt');
            expect(response.body.file.originalName).toBe('original-name.txt');
            expect(response.body.file.path).toContain('integration-test-folder');

            // Verify file exists in correct location
            const expectedPath = path.join('uploads', 'integration-test-folder', 'custom-integration-file.txt');
            const fileExists = await fs.access(expectedPath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);

            // Verify content integrity
            const savedContent = await fs.readFile(expectedPath, 'utf8');
            expect(savedContent).toBe(testContent);
        });

        it('should handle file name conflicts with unique name generation', async () => {
            const content1 = 'First file content';
            const content2 = 'Second file content with same name';
            
            // Upload first file
            const response1 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from(content1), 'conflict-test.txt')
                .expect(200);

            // Upload second file with same name
            const response2 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from(content2), 'conflict-test.txt')
                .expect(200);

            // Verify unique names were generated
            expect(response1.body.file.fileName).toBe('conflict-test.txt');
            expect(response2.body.file.fileName).toMatch(/conflict-test_\d+\.txt/);
            expect(response1.body.file.fileName).not.toBe(response2.body.file.fileName);

            // Verify both files exist with correct content
            const content1Saved = await fs.readFile(response1.body.file.path, 'utf8');
            const content2Saved = await fs.readFile(response2.body.file.path, 'utf8');
            expect(content1Saved).toBe(content1);
            expect(content2Saved).toBe(content2);
        });
    });

    describe('End-to-End Multiple File Upload Workflow', () => {
        it('should complete full multiple file upload workflow', async () => {
            const files = [
                { content: 'Multi file test 1', name: 'multi1.txt' },
                { content: 'Multi file test 2', name: 'multi2.txt' },
                { content: 'Multi file test 3', name: 'multi3.txt' }
            ];

            const req = request(app).post('/upload/multiple');
            files.forEach(file => {
                req.attach('files', Buffer.from(file.content), file.name);
            });

            const response = await req.expect(200);

            // Verify response structure
            expect(response.body).toMatchObject({
                success: true,
                message: 'Successfully uploaded 3 files',
                files: expect.arrayContaining([
                    expect.objectContaining({
                        originalName: expect.any(String),
                        fileName: expect.any(String),
                        path: expect.any(String),
                        size: expect.any(Number),
                        mimeType: expect.any(String),
                        uploadedAt: expect.any(String)
                    })
                ]),
                totalFiles: 3,
                totalSize: expect.any(Number),
                timestamp: expect.any(String)
            });

            // Verify all files were saved with correct content
            for (let i = 0; i < files.length; i++) {
                const file = response.body.files[i];
                const savedContent = await fs.readFile(file.path, 'utf8');
                expect(savedContent).toBe(files[i].content);
                expect(file.originalName).toBe(files[i].name);
            }
        });

        it('should handle multiple file upload with custom folder and filenames', async () => {
            const files = [
                { content: 'Custom multi file 1', originalName: 'orig1.txt', customName: 'custom1.txt' },
                { content: 'Custom multi file 2', originalName: 'orig2.txt', customName: 'custom2.txt' }
            ];

            const response = await request(app)
                .post('/upload/multiple')
                .field('folderName', 'multi-custom-folder')
                .field('fileNames', files[0].customName)
                .field('fileNames', files[1].customName)
                .attach('files', Buffer.from(files[0].content), files[0].originalName)
                .attach('files', Buffer.from(files[1].content), files[1].originalName)
                .expect(200);

            // Verify custom naming and folder were applied
            expect(response.body.success).toBe(true);
            expect(response.body.files).toHaveLength(2);
            
            for (let i = 0; i < files.length; i++) {
                const file = response.body.files[i];
                expect(file.fileName).toBe(files[i].customName);
                expect(file.originalName).toBe(files[i].originalName);
                expect(file.path).toContain('multi-custom-folder');
                
                // Verify file content
                const savedContent = await fs.readFile(file.path, 'utf8');
                expect(savedContent).toBe(files[i].content);
            }
        });

        it('should handle batch upload failure with rollback', async () => {
            // Upload one valid file and one invalid file - should fail entire batch
            const response = await request(app)
                .post('/upload/multiple')
                .attach('files', Buffer.from('valid content'), 'valid.txt')
                .attach('files', Buffer.from('invalid content'), 'invalid.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
            expect(response.body.error.message).toBe('One or more files failed validation');

            // Verify no files were saved (rollback occurred)
            const uploadsExists = await fs.access('uploads').then(() => true).catch(() => false);
            if (uploadsExists) {
                const files = await fs.readdir('uploads', { recursive: true });
                expect(files.length).toBe(0);
            }
        });
    });

    describe('Error Conditions and Edge Cases', () => {
        it('should handle disk space simulation error', async () => {
            // This test simulates a disk space error by trying to write a very large file
            const largeBuffer = Buffer.alloc(config.maxFileSize + 1, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', largeBuffer, 'large.txt')
                .expect(413);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_TOO_LARGE');
            expect(response.body.error.message).toContain('File too large');
        });

        it('should handle concurrent uploads without conflicts', async () => {
            const uploadPromises = [];
            
            // Create 5 concurrent upload requests
            for (let i = 0; i < 5; i++) {
                const promise = request(app)
                    .post('/upload/single')
                    .attach('file', Buffer.from(`concurrent test ${i}`), `concurrent${i}.txt`);
                uploadPromises.push(promise);
            }

            const responses = await Promise.all(uploadPromises);

            // All uploads should succeed
            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.file.fileName).toBe(`concurrent${index}.txt`);
            });

            // Verify all files were saved
            for (let i = 0; i < 5; i++) {
                const response = responses[i];
                const savedContent = await fs.readFile(response.body.file.path, 'utf8');
                expect(savedContent).toBe(`concurrent test ${i}`);
            }
        });

        it('should handle empty file uploads', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.alloc(0), 'empty.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
        });

        it('should handle extremely long filenames', async () => {
            const longFilename = 'a'.repeat(300) + '.txt';
            
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', longFilename)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle directory traversal attempts in folder names', async () => {
            const maliciousPaths = [
                '../../../etc/passwd',
                '..\\..\\windows\\system32',
                '/etc/passwd'
            ];

            for (const maliciousPath of maliciousPaths) {
                const response = await request(app)
                    .post('/upload/single')
                    .field('folderName', maliciousPath)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.file.path).toContain('uploads');
                expect(response.body.file.path).not.toContain('../');
                expect(response.body.file.path).not.toContain('..\\');
                expect(response.body.file.path).not.toContain('/etc/');
            }
        });
    });

    describe('Configuration Loading and Validation', () => {
        it('should load configuration correctly on server startup', () => {
            // Verify config was loaded and has expected structure
            expect(config).toBeDefined();
            expect(config).toHaveProperty('maxFileSize');
            expect(config).toHaveProperty('maxFiles');
            expect(config).toHaveProperty('allowedExtensions');
            expect(config).toHaveProperty('defaultUploadDir');
            expect(config).toHaveProperty('tempDir');
            expect(config).toHaveProperty('port');
            
            // Verify config values are reasonable
            expect(config.maxFileSize).toBeGreaterThan(0);
            expect(config.maxFiles).toBeGreaterThan(0);
            expect(Array.isArray(config.allowedExtensions)).toBe(true);
            expect(config.allowedExtensions.length).toBeGreaterThan(0);
            expect(typeof config.defaultUploadDir).toBe('string');
            expect(typeof config.tempDir).toBe('string');
            expect(config.port).toBeGreaterThan(0);
        });

        it('should respect file size limits from configuration', async () => {
            // Test file slightly under the limit (Multer has some overhead)
            const maxSizeBuffer = Buffer.alloc(config.maxFileSize - 1000, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', maxSizeBuffer, 'max-size.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.size).toBe(config.maxFileSize - 1000);
        });

        it('should respect allowed extensions from configuration', async () => {
            // Test with an allowed extension
            const allowedExt = config.allowedExtensions[0];
            const filename = `test${allowedExt}`;
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test content'), filename)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.fileName).toMatch(new RegExp(`\\${allowedExt}$`));
        });

        it('should reject files with disallowed extensions', async () => {
            // Test with a disallowed extension
            const disallowedExt = '.exe';
            const filename = `malicious${disallowedExt}`;
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('malicious content'), filename)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
        });

        it('should use default upload directory from configuration', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.path).toContain(config.defaultUploadDir);
        });
    });
});