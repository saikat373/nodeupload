const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { app, upload, config } = require('../src/index');

describe('Upload Integration Tests', () => {
    afterEach(async () => {
        // Clean up test files
        try {
            await fs.rm('uploads', { recursive: true, force: true });
        } catch (error) {
            // Ignore if directory doesn't exist
        }
    });

    describe('Single File Upload Integration', () => {
        it('should handle complete single file upload workflow', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('integration test content'), 'integration.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('File uploaded successfully');
            expect(response.body.file).toMatchObject({
                originalName: 'integration.txt',
                fileName: 'integration.txt',
                size: expect.any(Number),
                mimeType: expect.any(String),
                uploadedAt: expect.any(String)
            });
            expect(response.body.file.path).toContain('uploads');
            expect(response.body.timestamp).toBeDefined();

            // Verify file was actually saved
            const filePath = response.body.file.path;
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);

            // Verify file content
            const savedContent = await fs.readFile(filePath, 'utf8');
            expect(savedContent).toBe('integration test content');
        });

        it('should handle single file upload with custom folder and filename', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', 'integration-test')
                .field('fileName', 'custom-integration.txt')
                .attach('file', Buffer.from('custom integration test'), 'original.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.file.fileName).toBe('custom-integration.txt');
            expect(response.body.file.originalName).toBe('original.txt');
            expect(response.body.file.path).toContain('integration-test');

            // Verify file was saved in correct location
            const filePath = response.body.file.path;
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);
        });

        it('should handle file name conflicts by generating unique names', async () => {
            // Upload first file
            const response1 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('first file content'), 'conflict.txt')
                .expect(200);

            // Upload second file with same name
            const response2 = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('second file content'), 'conflict.txt')
                .expect(200);

            expect(response1.body.success).toBe(true);
            expect(response2.body.success).toBe(true);
            
            // File names should be different
            expect(response1.body.file.fileName).not.toBe(response2.body.file.fileName);
            expect(response2.body.file.fileName).toMatch(/conflict_\d+\.txt/);

            // Both files should exist
            const file1Exists = await fs.access(response1.body.file.path).then(() => true).catch(() => false);
            const file2Exists = await fs.access(response2.body.file.path).then(() => true).catch(() => false);
            expect(file1Exists).toBe(true);
            expect(file2Exists).toBe(true);

            // Files should have different content
            const content1 = await fs.readFile(response1.body.file.path, 'utf8');
            const content2 = await fs.readFile(response2.body.file.path, 'utf8');
            expect(content1).toBe('first file content');
            expect(content2).toBe('second file content');
        });

        it('should properly sanitize dangerous folder names', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', '../../../dangerous/path')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should not contain directory traversal
            expect(response.body.file.path).not.toContain('../');
            expect(response.body.file.path).toContain('uploads');

            // Verify file was saved safely
            const filePath = response.body.file.path;
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);
        });

        it('should properly sanitize dangerous file names', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', 'dangerous<>file|name.txt')
                .attach('file', Buffer.from('test content'), 'original.txt')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Should not contain dangerous characters
            expect(response.body.file.fileName).not.toContain('<');
            expect(response.body.file.fileName).not.toContain('>');
            expect(response.body.file.fileName).not.toContain('|');
            expect(response.body.file.fileName).toMatch(/\.txt$/);

            // Verify file was saved safely
            const filePath = response.body.file.path;
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);
        });
    });

    describe('Error Handling Integration', () => {
        it('should return proper error for missing file', async () => {
            const response = await request(app)
                .post('/upload/single')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NO_FILE_PROVIDED');
            expect(response.body.error.message).toBe('No file was provided in the request');
            expect(response.body.error.timestamp).toBeDefined();
        });

        it('should return proper error for invalid file type', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('malicious content'), 'malicious.exe')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
            expect(response.body.error.message).toBe('File validation failed');
            expect(response.body.error.details).toBeInstanceOf(Array);
            expect(response.body.error.details.length).toBeGreaterThan(0);
        });

        it('should return proper error for file too large', async () => {
            // Create a buffer larger than the configured limit
            const largeBuffer = Buffer.alloc(config.maxFileSize + 1, 'a');
            
            const response = await request(app)
                .post('/upload/single')
                .attach('file', largeBuffer, 'large.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FILE_TOO_LARGE');
            expect(response.body.error.message).toContain('File size exceeds limit');
        });

        it('should return proper error for invalid folder name', async () => {
            const longFolderName = 'a'.repeat(256); // Longer than 255 chars
            
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', longFolderName)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.message).toBe('Request validation failed');
        });

        it('should return proper error for invalid file name', async () => {
            const longFileName = 'a'.repeat(256) + '.txt'; // Longer than 255 chars
            
            const response = await request(app)
                .post('/upload/single')
                .field('fileName', longFileName)
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.message).toBe('Request validation failed');
        });

        it('should handle multiple validation errors', async () => {
            const response = await request(app)
                .post('/upload/single')
                .field('folderName', 'a'.repeat(256))
                .field('fileName', 'b'.repeat(256) + '.txt')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeInstanceOf(Array);
            expect(response.body.error.details.length).toBeGreaterThan(1);
        });

        it('should handle unexpected file field', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('wrongField', Buffer.from('test content'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNEXPECTED_FILE');
            expect(response.body.error.message).toBe('Unexpected file field');
        });
    });

    describe('Response Format Validation', () => {
        it('should return consistent response format for success', async () => {
            const response = await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('format test'), 'format.txt')
                .expect(200);

            // Validate response structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('file');
            
            // Validate file object structure
            expect(response.body.file).toHaveProperty('originalName');
            expect(response.body.file).toHaveProperty('fileName');
            expect(response.body.file).toHaveProperty('path');
            expect(response.body.file).toHaveProperty('size');
            expect(response.body.file).toHaveProperty('mimeType');
            expect(response.body.file).toHaveProperty('uploadedAt');

            // Validate timestamp format
            expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
            expect(new Date(response.body.file.uploadedAt)).toBeInstanceOf(Date);
        });

        it('should return consistent response format for errors', async () => {
            const response = await request(app)
                .post('/upload/single')
                .expect(400);

            // Validate error response structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('details');
            expect(response.body.error).toHaveProperty('timestamp');

            // Validate error details structure
            expect(Array.isArray(response.body.error.details)).toBe(true);
            
            // Validate timestamp format
            expect(new Date(response.body.error.timestamp)).toBeInstanceOf(Date);
        });

        it('should include proper HTTP status codes', async () => {
            // Test success status
            await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('status test'), 'status.txt')
                .expect(200);

            // Test validation error status
            await request(app)
                .post('/upload/single')
                .expect(400);

            // Test file validation error status
            await request(app)
                .post('/upload/single')
                .attach('file', Buffer.from('invalid'), 'invalid.exe')
                .expect(400);

            // Test file too large status
            const largeBuffer = Buffer.alloc(config.maxFileSize + 1, 'a');
            await request(app)
                .post('/upload/single')
                .attach('file', largeBuffer, 'large.txt')
                .expect(400);
        });
    });

    describe('Health Check Integration', () => {
        it('should return healthy status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.timestamp).toBeDefined();
            expect(response.body.uptime).toBeGreaterThan(0);
            expect(response.body.config).toBeDefined();
        });
    });

    describe('404 Handling', () => {
        it('should return 404 for non-existent endpoints', async () => {
            const response = await request(app)
                .get('/non-existent')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
            expect(response.body.error.message).toBe('Endpoint not found');
        });
    });
});