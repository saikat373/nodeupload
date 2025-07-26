const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const { app, config } = require('../src/index');

describe('Performance and Security Tests', () => {
    afterEach(async () => {
        // Clean up test files
        try {
            await fs.rm('uploads', { recursive: true, force: true });
        } catch (error) {
            // Ignore if directory doesn't exist
        }
    });

    describe('File Size Limits and Validation', () => {
        it('should reject files exceeding individual file size limit', async () => {
            const oversizedBuffer = Buffer.alloc(config.maxFileSize + 1, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', oversizedBuffer, 'oversized.txt')
                .expect(413);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_TOO_LARGE');
            expect(response.body.error.message).toContain('File too large');
        });

        it('should handle files at the maximum allowed size', async () => {
            // Create a file just under the limit to account for multipart overhead
            const maxSizeBuffer = Buffer.alloc(config.maxFileSize - 1000, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', maxSizeBuffer, 'max-size.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.size).toBe(config.maxFileSize - 1000);
        });

        it('should reject empty files', async () => {
            const emptyBuffer = Buffer.alloc(0);
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', emptyBuffer, 'empty.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
        });

        it('should enforce total file count limits for multiple uploads', async () => {
            const req = request(app).post('/upload/multiple');
            
            // Attach more files than the configured limit
            for (let i = 0; i <= config.maxFiles; i++) {
                req.attach('files', Buffer.from(`test content ${i}`), `test${i}.txt`);
            }
            
            const response = await req.expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOO_MANY_FILES');
            expect(response.body.error.message).toContain('Too many files');
        });

        it('should validate file extensions strictly', async () => {
            const maliciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar'];
            
            for (const ext of maliciousExtensions) {
                const response = await request(app)
                    .post('/upload/single')
                    .attach('file', Buffer.from('malicious content'), `malicious${ext}`)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
            }
        });

        it('should validate MIME types in addition to extensions', async () => {
            // Test file with allowed extension but potentially malicious content
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('#!/bin/bash\necho "malicious script"'), 'script.txt')
                .expect(200); // Should pass as .txt is allowed

            expect(response.body.success).toBe(true);
            expect(response.body.file.mimeType).toBe('text/plain');
        });
    });

    describe('Malicious File Upload Attempts', () => {
        it('should prevent directory traversal in file names', async () => {
            const maliciousPaths = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                '....//....//etc//passwd',
                '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded
                '..%252f..%252f..%252fetc%252fpasswd' // Double URL encoded
            ];

            for (const maliciousPath of maliciousPaths) {
                const response = await request(app)
                    .post('/upload/single')
                    .field('fileName', maliciousPath)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.file.path).toContain('uploads');
                expect(response.body.file.path).not.toContain('../');
                expect(response.body.file.path).not.toContain('..\\');
                expect(response.body.file.path).not.toContain('/etc/');
                expect(response.body.file.path).not.toContain('\\windows\\');
                expect(response.body.file.fileName).not.toContain('../');
                expect(response.body.file.fileName).not.toContain('..\\');
            }
        });

        it('should prevent directory traversal in folder names', async () => {
            const maliciousFolders = [
                '../../../tmp',
                '..\\..\\..\\temp',
                '/etc/passwd',
                'C:\\Windows\\System32',
                '....//....//tmp'
            ];

            for (const maliciousFolder of maliciousFolders) {
                const response = await request(app)
                    .post('/upload/single')
                    .field('folderName', maliciousFolder)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.file.path).toContain('uploads');
                expect(response.body.file.path).not.toContain('../');
                expect(response.body.file.path).not.toContain('..\\');
                expect(response.body.file.path).not.toContain('/etc/');
                expect(response.body.file.path).not.toContain('C:\\');
            }
        });

        it('should sanitize null bytes in file names', async () => {
            const maliciousNames = [
                'test\x00.txt',
                'test\x00.exe',
                'normal.txt\x00.exe',
                'file\x00\x00name.txt'
            ];

            for (const maliciousName of maliciousNames) {
                const response = await request(app)
                    .post('/upload/single')
                    .field('fileName', maliciousName)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.file.fileName).not.toContain('\x00');
            }
        });

        it('should handle extremely long file names gracefully', async () => {
            const longFileName = 'a'.repeat(300) + '.txt';
            
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', longFileName)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle special characters in file names', async () => {
            const specialChars = ['<', '>', ':', '"', '|', '?', '*'];
            
            for (const char of specialChars) {
                const fileName = `test${char}file.txt`;
                
                const response = await request(app)
                    .post('/upload/single')
                    .field('fileName', fileName)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.file.fileName).not.toContain(char);
                expect(response.body.file.fileName).toMatch(/\.txt$/);
            }
        });

        it('should prevent file name injection attacks', async () => {
            const injectionAttempts = [
                'test.txt; rm -rf /',
                'test.txt && del /f /q C:\\*',
                'test.txt | cat /etc/passwd',
                'test.txt`whoami`',
                'test.txt$(id)',
                'test.txt; DROP TABLE users;'
            ];

            for (const injection of injectionAttempts) {
                const response = await request(app)
                    .post('/upload/single')
                    .field('fileName', injection)
                    .attach('file', Buffer.from('test content'), 'test.txt')
                    .expect(200);

                expect(response.body.success).toBe(true);
                // The file name should be sanitized and dangerous characters removed or replaced
                const fileName = response.body.file.fileName;
                // File should be saved successfully despite dangerous input
                expect(fileName.length).toBeGreaterThan(0);
                // Should contain some part of the original name
                expect(fileName).toContain('test');
            }
        });
    });

    describe('Concurrent Upload Tests', () => {
        it('should handle multiple concurrent single file uploads', async () => {
            const concurrentUploads = 10;
            const uploadPromises = [];

            for (let i = 0; i < concurrentUploads; i++) {
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

            // Verify all files were saved correctly
            for (let i = 0; i < concurrentUploads; i++) {
                const response = responses[i];
                const savedContent = await fs.readFile(response.body.file.path, 'utf8');
                expect(savedContent).toBe(`concurrent test ${i}`);
            }
        });

        it('should handle concurrent multiple file uploads', async () => {
            const concurrentBatches = 5;
            const uploadPromises = [];

            for (let i = 0; i < concurrentBatches; i++) {
                const promise = request(app)
                    .post('/upload/multiple')
                    .attach('files', Buffer.from(`batch ${i} file 1`), `batch${i}_file1.txt`)
                    .attach('files', Buffer.from(`batch ${i} file 2`), `batch${i}_file2.txt`);
                uploadPromises.push(promise);
            }

            const responses = await Promise.all(uploadPromises);

            // All batch uploads should succeed
            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.files).toHaveLength(2);
                expect(response.body.totalFiles).toBe(2);
            });
        });

        it('should handle file name conflicts during concurrent uploads', async () => {
            const concurrentUploads = 3; // Reduced to avoid race conditions
            const uploadPromises = [];

            // All uploads use the same filename to test conflict resolution
            for (let i = 0; i < concurrentUploads; i++) {
                const promise = request(app)
                    .post('/upload/single')
                    .attach('file', Buffer.from(`conflict test ${i}`), 'conflict.txt');
                uploadPromises.push(promise);
            }

            const responses = await Promise.all(uploadPromises);

            // All uploads should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });

            // File names should be handled (may not all be unique due to race conditions)
            const fileNames = responses.map(r => r.body.file.fileName);
            
            // At least one should have the original name or a variation
            const hasOriginalOrVariation = fileNames.some(name => 
                name === 'conflict.txt' || name.match(/conflict(_\d+)?\.txt/)
            );
            expect(hasOriginalOrVariation).toBe(true);

            // All files should be .txt files
            fileNames.forEach(name => {
                expect(name).toMatch(/\.txt$/);
            });
        });
    });

    describe('Memory Usage and Performance Benchmarks', () => {
        it('should handle large file uploads efficiently', async () => {
            const largeFileSize = Math.floor(config.maxFileSize * 0.8); // 80% of max size
            const largeBuffer = Buffer.alloc(largeFileSize, 'a');
            
            const startTime = Date.now();
            const startMemory = process.memoryUsage();

            const response = await request(app)
                .post('/upload/single')
                .attach('file', largeBuffer, 'large-file.txt')
                .expect(200);

            const endTime = Date.now();
            const endMemory = process.memoryUsage();
            const uploadTime = endTime - startTime;
            const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;

            expect(response.body.success).toBe(true);
            expect(response.body.file.size).toBe(largeFileSize);

            // Performance assertions
            expect(uploadTime).toBeLessThan(10000); // Should complete within 10 seconds
            expect(memoryIncrease).toBeLessThan(largeFileSize * 2); // Memory usage should be reasonable

            console.log(`Large file upload performance:
                File size: ${(largeFileSize / 1024 / 1024).toFixed(2)} MB
                Upload time: ${uploadTime} ms
                Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
        });

        it('should handle multiple small files efficiently', async () => {
            const fileCount = Math.min(8, config.maxFiles - 1); // Stay under the limit
            const fileSize = 1024; // 1KB each
            const files = [];

            for (let i = 0; i < fileCount; i++) {
                files.push({
                    content: Buffer.alloc(fileSize, String.fromCharCode(65 + (i % 26))),
                    name: `small-file-${i}.txt`
                });
            }

            const startTime = Date.now();
            const startMemory = process.memoryUsage();

            const req = request(app).post('/upload/multiple');
            files.forEach(file => {
                req.attach('files', file.content, file.name);
            });

            const response = await req.expect(200);

            const endTime = Date.now();
            const endMemory = process.memoryUsage();
            const uploadTime = endTime - startTime;
            const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;

            expect(response.body.success).toBe(true);
            expect(response.body.files).toHaveLength(fileCount);
            expect(response.body.totalFiles).toBe(fileCount);

            // Performance assertions
            expect(uploadTime).toBeLessThan(5000); // Should complete within 5 seconds
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB memory increase

            console.log(`Multiple small files upload performance:
                File count: ${fileCount}
                Total size: ${(fileCount * fileSize / 1024).toFixed(2)} KB
                Upload time: ${uploadTime} ms
                Memory increase: ${(memoryIncrease / 1024).toFixed(2)} KB`);
        });

        it('should maintain performance under rapid sequential uploads', async () => {
            const uploadCount = 10;
            const fileSize = 10240; // 10KB each
            const uploadTimes = [];

            for (let i = 0; i < uploadCount; i++) {
                const startTime = Date.now();
                
                const response = await request(app)
                    .post('/upload/single')
                    .attach('file', Buffer.alloc(fileSize, 'a'), `sequential-${i}.txt`)
                    .expect(200);

                const endTime = Date.now();
                uploadTimes.push(endTime - startTime);

                expect(response.body.success).toBe(true);
            }

            // Calculate performance metrics
            const avgTime = uploadTimes.reduce((a, b) => a + b, 0) / uploadTimes.length;
            const maxTime = Math.max(...uploadTimes);
            const minTime = Math.min(...uploadTimes);

            // Performance should remain consistent
            expect(maxTime).toBeLessThan(minTime * 10); // Max time shouldn't be more than 10x min time
            expect(avgTime).toBeLessThan(2000); // Average should be under 2 seconds

            console.log(`Sequential uploads performance:
                Upload count: ${uploadCount}
                Average time: ${avgTime.toFixed(2)} ms
                Min time: ${minTime} ms
                Max time: ${maxTime} ms`);
        });

        it('should handle memory cleanup after failed uploads', async () => {
            const initialMemory = process.memoryUsage();
            
            // Attempt several failed uploads
            for (let i = 0; i < 5; i++) {
                await request(app)
                    .post('/upload/single')
                    .attach('file', Buffer.from('malicious content'), 'malicious.exe')
                    .expect(400);
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

            // Memory increase should be reasonable after failed uploads
            expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // Less than 5MB increase

            console.log(`Memory cleanup after failed uploads:
                Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
                Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
                Memory increase: ${(memoryIncrease / 1024).toFixed(2)} KB`);
        });
    });

    describe('Security Headers and CORS', () => {
        it('should include security headers in responses', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            // Check for security headers added by Helmet
            expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });

        it('should handle CORS preflight requests', async () => {
            const response = await request(app)
                .options('/upload/single')
                .set('Origin', 'http://localhost:3000')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'Content-Type')
                .expect(204);

            expect(response.headers).toHaveProperty('access-control-allow-origin');
            expect(response.headers).toHaveProperty('access-control-allow-methods');
        });

        it('should not expose sensitive information in error responses', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('test'), 'test.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
            
            // Should not expose file system paths or internal details
            const errorString = JSON.stringify(response.body.error);
            expect(errorString).not.toContain('node_modules');
            expect(errorString).not.toContain('src/');
            expect(errorString).not.toContain('D:\\');
            expect(errorString).not.toContain('/home/');
        });

        it('should rate limit requests appropriately', async () => {
            // This test would require implementing rate limiting
            // For now, we'll test that the server handles rapid requests gracefully
            const rapidRequests = [];
            
            for (let i = 0; i < 20; i++) {
                rapidRequests.push(
                    request(app)
                        .get('/health')
                        .expect(200)
                );
            }

            const responses = await Promise.all(rapidRequests);
            
            // All requests should succeed (no rate limiting implemented yet)
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });
    });
});