const request = require('supertest');
const { app } = require('../src/index');

describe('Express Server', () => {
    describe('Health Check', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                timestamp: expect.any(String),
                uptime: expect.any(Number),
                config: {
                    maxFileSize: expect.any(Number),
                    maxFiles: expect.any(Number),
                    allowedExtensions: expect.any(Number)
                }
            });
        });
    });

    describe('404 Handler', () => {
        test('should return 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/unknown-endpoint')
                .expect(404);

            expect(response.body).toEqual({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Endpoint not found',
                    details: []
                }
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle JSON parsing errors', async () => {
            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send('invalid json')
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: {
                    code: 'INVALID_JSON',
                    message: 'Invalid JSON in request body',
                    details: []
                }
            });
        });
    });
});