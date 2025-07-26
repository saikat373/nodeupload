const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');

// Test if we can import the server
describe('Server Import Test', () => {
    it('should import server successfully', () => {
        const { app, config } = require('../src/index');
        expect(app).toBeDefined();
        expect(config).toBeDefined();
    });
});

describe('Comprehensive Integration Tests', () => {
    let app, config;

    beforeAll(() => {
        const serverModule = require('../src/index');
        app = serverModule.app;
        config = serverModule.config;
    });

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
    });
});