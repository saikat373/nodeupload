const { 
    requestValidation, 
    fileValidation, 
    requestLogging 
} = require('../src/middleware');

describe('Request Validation Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
    });

    describe('validateSingleUploadRequest', () => {
        test('should pass validation with valid parameters', () => {
            req.body = {
                folderName: 'test-folder',
                fileName: 'test-file.txt'
            };

            requestValidation.validateSingleUploadRequest(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should reject invalid folderName type', () => {
            req.body = {
                folderName: 123
            };

            requestValidation.validateSingleUploadRequest(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: [{
                        field: 'folderName',
                        message: 'Folder name must be a string',
                        code: 'INVALID_FOLDER_NAME_TYPE'
                    }],
                    timestamp: expect.any(String)
                })
            }));
            expect(next).not.toHaveBeenCalled();
        });

        test('should reject too long folderName', () => {
            req.body = {
                folderName: 'a'.repeat(256)
            };

            requestValidation.validateSingleUploadRequest(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: [{
                        field: 'folderName',
                        message: 'Folder name too long (max 255 characters)',
                        code: 'FOLDER_NAME_TOO_LONG'
                    }],
                    timestamp: expect.any(String)
                })
            }));
        });

        test('should reject invalid fileName type', () => {
            req.body = {
                fileName: 123
            };

            requestValidation.validateSingleUploadRequest(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: [{
                        field: 'fileName',
                        message: 'File name must be a string',
                        code: 'INVALID_FILE_NAME_TYPE'
                    }],
                    timestamp: expect.any(String)
                })
            }));
        });

        test('should pass with undefined optional parameters', () => {
            req.body = {};

            requestValidation.validateSingleUploadRequest(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('validateMultipleUploadRequest', () => {
        test('should pass validation with valid parameters', () => {
            req.body = {
                folderName: 'test-folder',
                fileNames: ['file1.txt', 'file2.txt']
            };

            requestValidation.validateMultipleUploadRequest(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should reject invalid fileNames type', () => {
            req.body = {
                fileNames: 'not-an-array'
            };

            requestValidation.validateMultipleUploadRequest(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: [{
                        field: 'fileNames',
                        message: 'File names must be an array',
                        code: 'INVALID_FILE_NAMES_TYPE'
                    }],
                    timestamp: expect.any(String)
                })
            }));
        });

        test('should reject invalid fileName in array', () => {
            req.body = {
                fileNames: ['valid.txt', 123, 'also-valid.txt']
            };

            requestValidation.validateMultipleUploadRequest(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: [{
                        field: 'fileNames[1]',
                        message: 'File name at index 1 must be a string',
                        code: 'INVALID_FILE_NAME_TYPE'
                    }],
                    timestamp: expect.any(String)
                })
            }));
        });
    });

    describe('preprocessRequest', () => {
        test('should trim string values', () => {
            req.body = {
                folderName: '  test-folder  ',
                fileName: '  test-file.txt  ',
                fileNames: ['  file1.txt  ', '  file2.txt  ']
            };

            requestValidation.preprocessRequest(req, res, next);

            expect(req.body.folderName).toBe('test-folder');
            expect(req.body.fileName).toBe('test-file.txt');
            expect(req.body.fileNames).toEqual(['file1.txt', 'file2.txt']);
            expect(next).toHaveBeenCalled();
        });

        test('should remove empty strings', () => {
            req.body = {
                folderName: '',
                fileName: '',
                fileNames: ['file1.txt', '', 'file2.txt']
            };

            requestValidation.preprocessRequest(req, res, next);

            expect(req.body.folderName).toBeUndefined();
            expect(req.body.fileName).toBeUndefined();
            expect(req.body.fileNames).toEqual(['file1.txt', 'file2.txt']);
            expect(next).toHaveBeenCalled();
        });

        test('should remove empty fileNames array', () => {
            req.body = {
                fileNames: ['', '', '']
            };

            requestValidation.preprocessRequest(req, res, next);

            expect(req.body.fileNames).toBeUndefined();
            expect(next).toHaveBeenCalled();
        });
    });
});

describe('File Validation Middleware', () => {
    let req, res, next, middleware;
    const mockConfig = {
        maxFileSize: 1024 * 1024, // 1MB
        maxTotalSize: 5 * 1024 * 1024, // 5MB
        allowedExtensions: ['.txt', '.jpg', '.png']
    };

    beforeEach(() => {
        req = {
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        middleware = fileValidation(mockConfig);
    });

    describe('validateSingleFile', () => {
        test('should reject request without file', () => {
            middleware.validateSingleFile(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'NO_FILE_PROVIDED',
                    message: 'No file was provided in the request',
                    details: [],
                    timestamp: expect.any(String)
                })
            }));
            expect(next).not.toHaveBeenCalled();
        });

        test('should pass validation with valid file', () => {
            req.file = {
                originalname: 'test.txt',
                size: 1024,
                mimetype: 'text/plain',
                buffer: Buffer.from('test content')
            };

            middleware.validateSingleFile(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should sanitize invalid folder name', () => {
            req.file = {
                originalname: 'test.txt',
                size: 1024,
                mimetype: 'text/plain',
                buffer: Buffer.from('test content')
            };
            req.body.folderName = 'invalid/folder\\name';

            middleware.validateSingleFile(req, res, next);

            expect(req.body.folderName).toBe('invalidfoldername');
            expect(next).toHaveBeenCalled();
        });
    });

    describe('validateMultipleFiles', () => {
        test('should reject request without files', () => {
            middleware.validateMultipleFiles(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'NO_FILES_PROVIDED',
                    message: 'No files were provided in the request',
                    details: [],
                    timestamp: expect.any(String)
                })
            }));
            expect(next).not.toHaveBeenCalled();
        });

        test('should reject when total size exceeds limit', () => {
            req.files = [
                {
                    originalname: 'large1.txt',
                    size: 3 * 1024 * 1024, // 3MB
                    mimetype: 'text/plain',
                    buffer: Buffer.alloc(3 * 1024 * 1024)
                },
                {
                    originalname: 'large2.txt',
                    size: 3 * 1024 * 1024, // 3MB
                    mimetype: 'text/plain',
                    buffer: Buffer.alloc(3 * 1024 * 1024)
                }
            ];

            middleware.validateMultipleFiles(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'TOTAL_SIZE_EXCEEDED',
                    message: `Total upload size exceeds limit of ${mockConfig.maxTotalSize} bytes`,
                    details: [],
                    timestamp: expect.any(String)
                })
            }));
            expect(next).not.toHaveBeenCalled();
        });

        test('should pass validation with valid files', () => {
            req.files = [
                {
                    originalname: 'test1.txt',
                    size: 1024,
                    mimetype: 'text/plain',
                    buffer: Buffer.from('test content 1')
                },
                {
                    originalname: 'test2.txt',
                    size: 1024,
                    mimetype: 'text/plain',
                    buffer: Buffer.from('test content 2')
                }
            ];

            middleware.validateMultipleFiles(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});

describe('Request Logging Middleware', () => {
    let req, res, next, consoleSpy;

    beforeEach(() => {
        req = {
            method: 'POST',
            path: '/upload/single',
            ip: '127.0.0.1',
            body: {}
        };
        res = {
            json: jest.fn(),
            statusCode: 200
        };
        next = jest.fn();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('logRequest', () => {
        test('should log basic request information', () => {
            requestLogging.logRequest(req, res, next);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringMatching(/\[.*\] POST \/upload\/single - 127\.0\.0\.1/)
            );
            expect(next).toHaveBeenCalled();
        });

        test('should log single file information', () => {
            req.file = {
                originalname: 'test.txt',
                size: 1024
            };

            requestLogging.logRequest(req, res, next);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Single file: test.txt (1024 bytes)')
            );
        });

        test('should log multiple files information', () => {
            req.files = [
                { originalname: 'file1.txt', size: 1024 },
                { originalname: 'file2.txt', size: 2048 }
            ];

            requestLogging.logRequest(req, res, next);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Multiple files: 2 files')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('1. file1.txt (1024 bytes)')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('2. file2.txt (2048 bytes)')
            );
        });

        test('should log request parameters', () => {
            req.body = {
                folderName: 'test-folder',
                fileName: 'custom-name.txt'
            };

            requestLogging.logRequest(req, res, next);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Folder: test-folder')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Custom filename: custom-name.txt')
            );
        });
    });

    describe('logSecurityEvents', () => {
        let warnSpy;

        beforeEach(() => {
            warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        test('should detect directory traversal attempts', () => {
            req.body.folderName = '../../../etc/passwd';

            requestLogging.logSecurityEvents(req, res, next);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY_EVENT: Suspicious pattern detected in folderName')
            );
            expect(next).toHaveBeenCalled();
        });

        test('should detect script injection attempts', () => {
            req.body.fileName = '<script>alert("xss")</script>';

            requestLogging.logSecurityEvents(req, res, next);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY_EVENT: Suspicious pattern detected in fileName')
            );
        });

        test('should check file names for suspicious patterns', () => {
            req.file = {
                originalname: 'malicious..exe'
            };

            requestLogging.logSecurityEvents(req, res, next);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY_EVENT: Suspicious pattern detected in file.originalname')
            );
        });
    });
});