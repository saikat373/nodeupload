/**
 * Unit tests for the centralized error handling system
 */

const { 
    errorHandler, 
    notFoundHandler, 
    asyncErrorHandler, 
    createCustomError,
    ErrorTypes,
    StatusCodes,
    classifyError,
    getStatusCodeForError,
    sanitizeErrorMessage
} = require('../src/middleware/errorHandler');

const multer = require('multer');

// Mock the logger module
jest.mock('../src/utils/logger', () => ({
    logError: jest.fn(),
    logSecurityEvent: jest.fn()
}));

const { logError, logSecurityEvent } = require('../src/utils/logger');

describe('Error Handler Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            method: 'POST',
            url: '/upload/single',
            path: '/upload/single',
            headers: { 'user-agent': 'test-agent' },
            ip: '127.0.0.1',
            get: jest.fn((header) => {
                if (header === 'User-Agent') return 'test-agent';
                return null;
            })
        };

        res = {
            headersSent: false,
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };

        next = jest.fn();

        // Clear mocks
        logError.mockClear();
        logSecurityEvent.mockClear();
    });

    describe('classifyError', () => {
        test('should classify Multer errors correctly', () => {
            const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
            expect(classifyError(multerError)).toBe(ErrorTypes.MULTER);
        });

        test('should classify security errors correctly', () => {
            const securityError = new Error('Test error');
            securityError.code = 'MALICIOUS_FILE_DETECTED';
            expect(classifyError(securityError)).toBe(ErrorTypes.SECURITY);
        });

        test('should classify validation errors correctly', () => {
            const validationError = new Error('Validation failed');
            expect(classifyError(validationError)).toBe(ErrorTypes.VALIDATION);
        });

        test('should classify storage errors correctly', () => {
            const storageError = new Error('Storage operation failed');
            expect(classifyError(storageError)).toBe(ErrorTypes.STORAGE);
        });

        test('should classify network errors correctly', () => {
            const networkError = new Error('Network timeout occurred');
            expect(classifyError(networkError)).toBe(ErrorTypes.NETWORK);
        });

        test('should default to system error for unknown errors', () => {
            const unknownError = new Error('Unknown error');
            expect(classifyError(unknownError)).toBe(ErrorTypes.SYSTEM);
        });
    });

    describe('getStatusCodeForError', () => {
        test('should return correct status code for Multer LIMIT_FILE_SIZE', () => {
            const error = new multer.MulterError('LIMIT_FILE_SIZE');
            expect(getStatusCodeForError(error, ErrorTypes.MULTER)).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
        });

        test('should return correct status code for Multer LIMIT_FILE_COUNT', () => {
            const error = new multer.MulterError('LIMIT_FILE_COUNT');
            expect(getStatusCodeForError(error, ErrorTypes.MULTER)).toBe(StatusCodes.BAD_REQUEST);
        });

        test('should return correct status code for validation errors', () => {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            expect(getStatusCodeForError(error, ErrorTypes.VALIDATION)).toBe(StatusCodes.BAD_REQUEST);
        });

        test('should return correct status code for file not found', () => {
            const error = new Error('File not found');
            error.code = 'FILE_NOT_FOUND';
            expect(getStatusCodeForError(error, ErrorTypes.VALIDATION)).toBe(StatusCodes.NOT_FOUND);
        });

        test('should return correct status code for security errors', () => {
            const error = new Error('Malicious file detected');
            error.code = 'MALICIOUS_FILE_DETECTED';
            expect(getStatusCodeForError(error, ErrorTypes.SECURITY)).toBe(StatusCodes.FORBIDDEN);
        });

        test('should return correct status code for storage errors', () => {
            const error = new Error('Storage failed');
            error.code = 'STORAGE_ERROR';
            expect(getStatusCodeForError(error, ErrorTypes.STORAGE)).toBe(StatusCodes.INSUFFICIENT_STORAGE);
        });

        test('should return 500 for system errors', () => {
            const error = new Error('System error');
            expect(getStatusCodeForError(error, ErrorTypes.SYSTEM)).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        });
    });

    describe('sanitizeErrorMessage', () => {
        test('should sanitize security error messages', () => {
            const error = new Error('Detailed security info');
            error.code = 'MALICIOUS_FILE_DETECTED';
            expect(sanitizeErrorMessage(error, ErrorTypes.SECURITY)).toBe('File type not allowed for security reasons');
        });

        test('should sanitize system error messages', () => {
            const error = new Error('Internal system details');
            expect(sanitizeErrorMessage(error, ErrorTypes.SYSTEM)).toBe('An internal server error occurred');
        });

        test('should provide helpful storage error messages', () => {
            const error = new Error('ENOSPC: no space left on device');
            expect(sanitizeErrorMessage(error, ErrorTypes.STORAGE)).toBe('Insufficient storage space available');
        });

        test('should preserve validation error messages', () => {
            const error = new Error('File type not allowed');
            expect(sanitizeErrorMessage(error, ErrorTypes.VALIDATION)).toBe('File type not allowed');
        });

        test('should provide generic network error messages', () => {
            const error = new Error('Connection timeout');
            expect(sanitizeErrorMessage(error, ErrorTypes.NETWORK)).toBe('Network operation failed, please try again');
        });
    });

    describe('errorHandler middleware', () => {
        test('should handle Multer file size error correctly', () => {
            const error = new multer.MulterError('LIMIT_FILE_SIZE');
            
            errorHandler(error, req, res, next);

            expect(res.status).toHaveBeenCalledWith(413);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: error.message,
                    details: expect.any(Array),
                    timestamp: expect.any(String)
                }
            });
            expect(logError).toHaveBeenCalled();
        });

        test('should handle security errors and log security events', () => {
            const error = new Error('Malicious file detected');
            error.code = 'MALICIOUS_FILE_DETECTED';
            
            errorHandler(error, req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(logSecurityEvent).toHaveBeenCalledWith(
                'error',
                'File type not allowed for security reasons',
                expect.any(Object)
            );
        });

        test('should handle validation errors correctly', () => {
            const error = new Error('File validation failed');
            error.code = 'FILE_VALIDATION_ERROR';
            
            errorHandler(error, req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'FILE_VALIDATION_ERROR',
                    message: 'File validation failed',
                    details: expect.any(Array),
                    timestamp: expect.any(String)
                }
            });
        });

        test('should handle storage errors correctly', () => {
            const error = new Error('Storage operation failed');
            error.code = 'STORAGE_ERROR';
            
            errorHandler(error, req, res, next);

            expect(res.status).toHaveBeenCalledWith(507);
            expect(logError).toHaveBeenCalled();
        });

        test('should handle system errors with generic message', () => {
            const error = new Error('Internal system failure with sensitive details');
            
            errorHandler(error, req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'An internal server error occurred',
                    details: expect.any(Array),
                    timestamp: expect.any(String)
                }
            });
        });

        test('should skip if response headers already sent', () => {
            res.headersSent = true;
            const error = new Error('Test error');
            
            errorHandler(error, req, res, next);

            expect(next).toHaveBeenCalledWith(error);
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });

        test('should include error details in development mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at test.js:1:1';
            
            errorHandler(error, req, res, next);

            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'An internal server error occurred',
                    details: expect.arrayContaining([
                        expect.objectContaining({
                            field: 'request',
                            code: 'REQUEST_CONTEXT'
                        }),
                        expect.objectContaining({
                            field: 'stack',
                            code: 'STACK_TRACE'
                        })
                    ]),
                    timestamp: expect.any(String)
                }
            });

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('notFoundHandler middleware', () => {
        test('should handle 404 errors correctly', () => {
            notFoundHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Endpoint not found',
                    details: [{
                        field: 'url',
                        message: 'POST /upload/single is not a valid endpoint',
                        code: 'INVALID_ENDPOINT'
                    }],
                    timestamp: expect.any(String)
                }
            });
            expect(logError).toHaveBeenCalled();
        });
    });

    describe('asyncErrorHandler wrapper', () => {
        test('should catch async errors and pass to next', async () => {
            const asyncFunction = jest.fn().mockRejectedValue(new Error('Async error'));
            const wrappedFunction = asyncErrorHandler(asyncFunction);

            await wrappedFunction(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Async error');
        });

        test('should handle successful async functions', async () => {
            const asyncFunction = jest.fn().mockResolvedValue('success');
            const wrappedFunction = asyncErrorHandler(asyncFunction);

            await wrappedFunction(req, res, next);

            expect(asyncFunction).toHaveBeenCalledWith(req, res, next);
            expect(next).not.toHaveBeenCalled();
        });

        test('should handle sync functions that throw', () => {
            const syncFunction = jest.fn().mockImplementation(() => {
                throw new Error('Sync error');
            });
            const wrappedFunction = asyncErrorHandler(syncFunction);

            // Call the wrapped function - it should not throw but should call next
            wrappedFunction(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Sync error');
        });
    });

    describe('createCustomError', () => {
        test('should create error with all properties', () => {
            const details = [{ field: 'test', message: 'test error' }];
            const error = createCustomError('Test message', 'TEST_CODE', 400, details);

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe('Test message');
            expect(error.code).toBe('TEST_CODE');
            expect(error.statusCode).toBe(400);
            expect(error.details).toBe(details);
        });

        test('should create error with default values', () => {
            const error = createCustomError('Test message', 'TEST_CODE');

            expect(error.statusCode).toBe(500);
            expect(error.details).toEqual([]);
        });
    });
});

describe('Error Handler Integration', () => {
    let mockApp, mockReq, mockRes;

    beforeEach(() => {
        mockReq = {
            method: 'POST',
            url: '/upload/test',
            path: '/upload/test',
            headers: { 'user-agent': 'test-agent' },
            ip: '127.0.0.1',
            get: jest.fn((header) => header === 'User-Agent' ? 'test-agent' : null)
        };

        mockRes = {
            headersSent: false,
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };

        logError.mockClear();
        logSecurityEvent.mockClear();
    });

    test('should handle multiple error types in sequence', () => {
        const errors = [
            new multer.MulterError('LIMIT_FILE_SIZE'),
            createCustomError('Validation failed', 'VALIDATION_ERROR', 400),
            new Error('System error')
        ];

        errors.forEach(error => {
            errorHandler(error, mockReq, mockRes, jest.fn());
        });

        expect(mockRes.status).toHaveBeenCalledTimes(3);
        expect(mockRes.json).toHaveBeenCalledTimes(3);
        expect(logError).toHaveBeenCalledTimes(3);
    });

    test('should maintain error context across different error types', () => {
        const securityError = createCustomError('Security violation', 'MALICIOUS_FILE_DETECTED', 403);
        
        errorHandler(securityError, mockReq, mockRes, jest.fn());

        expect(logSecurityEvent).toHaveBeenCalledWith(
            'error',
            'File type not allowed for security reasons',
            expect.objectContaining({
                error: expect.objectContaining({
                    code: 'MALICIOUS_FILE_DETECTED',
                    type: ErrorTypes.SECURITY
                }),
                request: expect.objectContaining({
                    method: 'POST',
                    url: '/upload/test'
                })
            })
        );
    });
});