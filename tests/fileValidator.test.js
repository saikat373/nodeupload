const FileValidator = require('../src/services/fileValidator');

describe('FileValidator', () => {
    let validator;
    let config;

    beforeEach(() => {
        config = {
            allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf', '.txt'],
            maxFileSize: 5 * 1024 * 1024 // 5MB
        };
        validator = new FileValidator(config);
    });

    describe('validateFileType', () => {
        test('should return true for allowed file extensions', () => {
            const file = { originalname: 'test.jpg' };
            expect(validator.validateFileType(file)).toBe(true);
        });

        test('should return true for case-insensitive extensions', () => {
            const file = { originalname: 'test.JPG' };
            expect(validator.validateFileType(file)).toBe(true);
        });

        test('should return false for disallowed file extensions', () => {
            const file = { originalname: 'test.exe' };
            expect(validator.validateFileType(file)).toBe(false);
        });

        test('should return false for files without extensions', () => {
            const file = { originalname: 'test' };
            expect(validator.validateFileType(file)).toBe(false);
        });

        test('should return false for null or undefined file', () => {
            expect(validator.validateFileType(null)).toBe(false);
            expect(validator.validateFileType(undefined)).toBe(false);
        });

        test('should return false for file without originalname', () => {
            const file = { size: 1000 };
            expect(validator.validateFileType(file)).toBe(false);
        });
    });

    describe('validateFileSize', () => {
        test('should return true for files within size limit', () => {
            const file = { size: 1024 * 1024 }; // 1MB
            expect(validator.validateFileSize(file)).toBe(true);
        });

        test('should return true for files at exact size limit', () => {
            const file = { size: 5 * 1024 * 1024 }; // 5MB (exact limit)
            expect(validator.validateFileSize(file)).toBe(true);
        });

        test('should return false for files exceeding size limit', () => {
            const file = { size: 6 * 1024 * 1024 }; // 6MB
            expect(validator.validateFileSize(file)).toBe(false);
        });

        test('should return false for zero-sized files', () => {
            const file = { size: 0 };
            expect(validator.validateFileSize(file)).toBe(false);
        });

        test('should return false for negative file sizes', () => {
            const file = { size: -1000 };
            expect(validator.validateFileSize(file)).toBe(false);
        });

        test('should return false for null or undefined file', () => {
            expect(validator.validateFileSize(null)).toBe(false);
            expect(validator.validateFileSize(undefined)).toBe(false);
        });

        test('should return false for file without size property', () => {
            const file = { originalname: 'test.jpg' };
            expect(validator.validateFileSize(file)).toBe(false);
        });
    });

    describe('validateFileName', () => {
        test('should return true for valid filenames', () => {
            expect(validator.validateFileName('test.jpg')).toBe(true);
            expect(validator.validateFileName('my-file_123.pdf')).toBe(true);
            expect(validator.validateFileName('document (1).txt')).toBe(true);
        });

        test('should return false for filenames with directory traversal', () => {
            expect(validator.validateFileName('../test.jpg')).toBe(false);
            expect(validator.validateFileName('test/../file.jpg')).toBe(false);
            expect(validator.validateFileName('..\\test.jpg')).toBe(false);
        });

        test('should return false for filenames with path separators', () => {
            expect(validator.validateFileName('folder/test.jpg')).toBe(false);
            expect(validator.validateFileName('folder\\test.jpg')).toBe(false);
        });

        test('should return false for filenames with invalid characters', () => {
            expect(validator.validateFileName('test<file>.jpg')).toBe(false);
            expect(validator.validateFileName('test|file.jpg')).toBe(false);
            expect(validator.validateFileName('test"file".jpg')).toBe(false);
            expect(validator.validateFileName('test:file.jpg')).toBe(false);
            expect(validator.validateFileName('test*file.jpg')).toBe(false);
            expect(validator.validateFileName('test?file.jpg')).toBe(false);
        });

        test('should return false for reserved Windows names', () => {
            expect(validator.validateFileName('CON.txt')).toBe(false);
            expect(validator.validateFileName('PRN.jpg')).toBe(false);
            expect(validator.validateFileName('AUX.pdf')).toBe(false);
            expect(validator.validateFileName('NUL.doc')).toBe(false);
            expect(validator.validateFileName('COM1.txt')).toBe(false);
            expect(validator.validateFileName('LPT1.txt')).toBe(false);
        });

        test('should return false for empty or whitespace-only filenames', () => {
            expect(validator.validateFileName('')).toBe(false);
            expect(validator.validateFileName('   ')).toBe(false);
            expect(validator.validateFileName('\t\n')).toBe(false);
        });

        test('should return false for null or undefined filenames', () => {
            expect(validator.validateFileName(null)).toBe(false);
            expect(validator.validateFileName(undefined)).toBe(false);
        });

        test('should return false for non-string filenames', () => {
            expect(validator.validateFileName(123)).toBe(false);
            expect(validator.validateFileName({})).toBe(false);
            expect(validator.validateFileName([])).toBe(false);
        });

        test('should return false for very long filenames', () => {
            const longName = 'a'.repeat(256) + '.txt';
            expect(validator.validateFileName(longName)).toBe(false);
        });
    });

    describe('sanitizeFileName', () => {
        test('should preserve valid filenames', () => {
            expect(validator.sanitizeFileName('test.jpg')).toBe('test.jpg');
            expect(validator.sanitizeFileName('my-file_123.pdf')).toBe('my-file_123.pdf');
        });

        test('should remove directory traversal attempts', () => {
            expect(validator.sanitizeFileName('../test.jpg')).toBe('test.jpg');
            expect(validator.sanitizeFileName('test/../file.jpg')).toBe('testfile.jpg');
        });

        test('should remove path separators', () => {
            expect(validator.sanitizeFileName('folder/test.jpg')).toBe('foldertest.jpg');
            expect(validator.sanitizeFileName('folder\\test.jpg')).toBe('foldertest.jpg');
        });

        test('should replace invalid characters with underscores', () => {
            expect(validator.sanitizeFileName('test<file>.jpg')).toBe('test_file_.jpg');
            expect(validator.sanitizeFileName('test|file.jpg')).toBe('test_file.jpg');
            expect(validator.sanitizeFileName('test"file".jpg')).toBe('test_file_.jpg');
        });

        test('should handle reserved Windows names', () => {
            expect(validator.sanitizeFileName('CON.txt')).toBe('_CON.txt');
            expect(validator.sanitizeFileName('PRN.jpg')).toBe('_PRN.jpg');
        });

        test('should return default name for empty input', () => {
            expect(validator.sanitizeFileName('')).toBe('unnamed_file');
            expect(validator.sanitizeFileName('   ')).toBe('unnamed_file');
            expect(validator.sanitizeFileName(null)).toBe('unnamed_file');
            expect(validator.sanitizeFileName(undefined)).toBe('unnamed_file');
        });

        test('should truncate very long filenames while preserving extension', () => {
            const longName = 'a'.repeat(250) + '.txt';
            const sanitized = validator.sanitizeFileName(longName);
            expect(sanitized.length).toBeLessThanOrEqual(255);
            expect(sanitized.endsWith('.txt')).toBe(true);
        });

        test('should handle non-string input', () => {
            expect(validator.sanitizeFileName(123)).toBe('unnamed_file');
            expect(validator.sanitizeFileName({})).toBe('unnamed_file');
        });
    });

    describe('validateFolderName', () => {
        test('should return true for valid folder names', () => {
            expect(validator.validateFolderName('uploads')).toBe(true);
            expect(validator.validateFolderName('my-folder_123')).toBe(true);
            expect(validator.validateFolderName('documents')).toBe(true);
        });

        test('should return false for folder names with directory traversal', () => {
            expect(validator.validateFolderName('../uploads')).toBe(false);
            expect(validator.validateFolderName('folder/../other')).toBe(false);
        });

        test('should return false for folder names with path separators', () => {
            expect(validator.validateFolderName('parent/child')).toBe(false);
            expect(validator.validateFolderName('parent\\child')).toBe(false);
        });

        test('should return false for folder names with invalid characters', () => {
            expect(validator.validateFolderName('folder<name>')).toBe(false);
            expect(validator.validateFolderName('folder|name')).toBe(false);
            expect(validator.validateFolderName('folder"name"')).toBe(false);
        });

        test('should return false for reserved Windows names', () => {
            expect(validator.validateFolderName('CON')).toBe(false);
            expect(validator.validateFolderName('PRN')).toBe(false);
            expect(validator.validateFolderName('AUX')).toBe(false);
        });

        test('should return false for empty or whitespace-only folder names', () => {
            expect(validator.validateFolderName('')).toBe(false);
            expect(validator.validateFolderName('   ')).toBe(false);
        });

        test('should return false for null or undefined folder names', () => {
            expect(validator.validateFolderName(null)).toBe(false);
            expect(validator.validateFolderName(undefined)).toBe(false);
        });
    });

    describe('sanitizeFolderName', () => {
        test('should preserve valid folder names', () => {
            expect(validator.sanitizeFolderName('uploads')).toBe('uploads');
            expect(validator.sanitizeFolderName('my-folder_123')).toBe('my-folder_123');
        });

        test('should remove directory traversal attempts', () => {
            expect(validator.sanitizeFolderName('../uploads')).toBe('uploads');
            expect(validator.sanitizeFolderName('folder/../other')).toBe('folderother');
        });

        test('should remove path separators', () => {
            expect(validator.sanitizeFolderName('parent/child')).toBe('parentchild');
            expect(validator.sanitizeFolderName('parent\\child')).toBe('parentchild');
        });

        test('should replace invalid characters with underscores', () => {
            expect(validator.sanitizeFolderName('folder<name>')).toBe('folder_name_');
            expect(validator.sanitizeFolderName('folder|name')).toBe('folder_name');
        });

        test('should handle reserved Windows names', () => {
            expect(validator.sanitizeFolderName('CON')).toBe('_CON');
            expect(validator.sanitizeFolderName('PRN')).toBe('_PRN');
        });

        test('should return default name for empty input', () => {
            expect(validator.sanitizeFolderName('')).toBe('uploads');
            expect(validator.sanitizeFolderName('   ')).toBe('uploads');
            expect(validator.sanitizeFolderName(null)).toBe('uploads');
            expect(validator.sanitizeFolderName(undefined)).toBe('uploads');
        });

        test('should truncate very long folder names', () => {
            const longName = 'a'.repeat(300);
            const sanitized = validator.sanitizeFolderName(longName);
            expect(sanitized.length).toBeLessThanOrEqual(255);
        });
    });

    describe('validateFile', () => {
        test('should return success for valid file', () => {
            const file = {
                originalname: 'test.jpg',
                size: 1024 * 1024 // 1MB
            };
            const result = validator.validateFile(file);
            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should return errors for invalid file type', () => {
            const file = {
                originalname: 'test.exe',
                size: 1024 * 1024
            };
            const result = validator.validateFile(file);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.map(e => e.code)).toContain('INVALID_FILE_TYPE');
        });

        test('should return errors for oversized file', () => {
            const file = {
                originalname: 'test.jpg',
                size: 10 * 1024 * 1024 // 10MB (exceeds 5MB limit)
            };
            const result = validator.validateFile(file);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('FILE_TOO_LARGE');
        });

        test('should return errors for invalid filename', () => {
            const file = {
                originalname: '../test.jpg',
                size: 1024 * 1024
            };
            const result = validator.validateFile(file);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
            expect(result.errors.map(e => e.code)).toContain('INVALID_FILENAME');
        });

        test('should return multiple errors for multiple validation failures', () => {
            const file = {
                originalname: '../test.exe',
                size: 10 * 1024 * 1024
            };
            const result = validator.validateFile(file);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
            expect(result.errors.map(e => e.code)).toContain('INVALID_FILE_TYPE');
            expect(result.errors.map(e => e.code)).toContain('FILE_TOO_LARGE');
            expect(result.errors.map(e => e.code)).toContain('INVALID_FILENAME');
            // Should also contain security-related errors
            expect(result.errors.map(e => e.code)).toContain('DIRECTORY_TRAVERSAL_DETECTED');
            expect(result.errors.map(e => e.code)).toContain('MALICIOUS_FILE_DETECTED');
        });
    });

    describe('validatePathSecurity', () => {
        test('should return true for safe paths', () => {
            expect(validator.validatePathSecurity('test.jpg')).toBe(true);
            expect(validator.validatePathSecurity('my-file_123.pdf')).toBe(true);
            expect(validator.validatePathSecurity('document.txt')).toBe(true);
        });

        test('should return false for directory traversal attempts', () => {
            expect(validator.validatePathSecurity('../test.jpg')).toBe(false);
            expect(validator.validatePathSecurity('../../etc/passwd')).toBe(false);
            expect(validator.validatePathSecurity('folder/../test.jpg')).toBe(false);
        });

        test('should return false for URL encoded traversal attempts', () => {
            expect(validator.validatePathSecurity('%2e%2e/test.jpg')).toBe(false);
            expect(validator.validatePathSecurity('%252e%252e/test.jpg')).toBe(false);
            expect(validator.validatePathSecurity('.%2f../test.jpg')).toBe(false);
        });

        test('should return false for absolute paths', () => {
            expect(validator.validatePathSecurity('/etc/passwd')).toBe(false);
            expect(validator.validatePathSecurity('C:\\Windows\\System32')).toBe(false);
        });

        test('should return false for null or undefined paths', () => {
            expect(validator.validatePathSecurity(null)).toBe(false);
            expect(validator.validatePathSecurity(undefined)).toBe(false);
        });

        test('should return false for non-string paths', () => {
            expect(validator.validatePathSecurity(123)).toBe(false);
            expect(validator.validatePathSecurity({})).toBe(false);
        });
    });

    describe('validateFileSecurity', () => {
        test('should return true for safe file types', () => {
            const file = { originalname: 'test.jpg', mimetype: 'image/jpeg' };
            expect(validator.validateFileSecurity(file)).toBe(true);
        });

        test('should return false for dangerous extensions', () => {
            const file = { originalname: 'malware.exe', mimetype: 'application/x-executable' };
            expect(validator.validateFileSecurity(file)).toBe(false);
        });

        test('should return false for suspicious MIME types', () => {
            const file = { originalname: 'script.txt', mimetype: 'application/x-executable' };
            expect(validator.validateFileSecurity(file)).toBe(false);
        });

        test('should return false for double extensions', () => {
            const file = { originalname: 'document.pdf.exe', mimetype: 'application/pdf' };
            expect(validator.validateFileSecurity(file)).toBe(false);
        });

        test('should return false for disguised executables', () => {
            const file = { originalname: 'image.jpg.exe', mimetype: 'image/jpeg' };
            expect(validator.validateFileSecurity(file)).toBe(false);
        });

        test('should handle files without MIME type', () => {
            const file = { originalname: 'test.jpg' };
            expect(validator.validateFileSecurity(file)).toBe(true);
        });

        test('should return false for null or undefined file', () => {
            expect(validator.validateFileSecurity(null)).toBe(false);
            expect(validator.validateFileSecurity(undefined)).toBe(false);
        });
    });

    describe('validateTotalUploadSize', () => {
        test('should return true for files within total size limit', () => {
            const files = [
                { size: 1024 * 1024 }, // 1MB
                { size: 2 * 1024 * 1024 }, // 2MB
                { size: 1024 * 1024 } // 1MB
            ]; // Total: 4MB
            expect(validator.validateTotalUploadSize(files)).toBe(true);
        });

        test('should return false for files exceeding total size limit', () => {
            const files = [
                { size: 30 * 1024 * 1024 }, // 30MB
                { size: 25 * 1024 * 1024 } // 25MB
            ]; // Total: 55MB (exceeds 50MB default limit)
            expect(validator.validateTotalUploadSize(files)).toBe(false);
        });

        test('should return false for empty file array', () => {
            expect(validator.validateTotalUploadSize([])).toBe(false);
        });

        test('should return false for non-array input', () => {
            expect(validator.validateTotalUploadSize(null)).toBe(false);
            expect(validator.validateTotalUploadSize(undefined)).toBe(false);
            expect(validator.validateTotalUploadSize('not-array')).toBe(false);
        });

        test('should handle files with missing size property', () => {
            const files = [
                { size: 1024 * 1024 },
                { originalname: 'test.jpg' }, // No size property
                { size: 2 * 1024 * 1024 }
            ];
            expect(validator.validateTotalUploadSize(files)).toBe(true);
        });
    });

    describe('validateFileSafety', () => {
        test('should return success for safe file', () => {
            const file = { originalname: 'test.jpg', mimetype: 'image/jpeg' };
            const result = validator.validateFileSafety(file);
            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should return error for directory traversal in filename', () => {
            const file = { originalname: '../test.jpg', mimetype: 'image/jpeg' };
            const result = validator.validateFileSafety(file);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('DIRECTORY_TRAVERSAL_DETECTED');
        });

        test('should return error for malicious file type', () => {
            const file = { originalname: 'malware.exe', mimetype: 'application/x-executable' };
            const result = validator.validateFileSafety(file);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('MALICIOUS_FILE_DETECTED');
        });

        test('should return multiple errors for multiple security issues', () => {
            const file = { originalname: '../malware.exe', mimetype: 'application/x-executable' };
            const result = validator.validateFileSafety(file);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors.map(e => e.code)).toContain('DIRECTORY_TRAVERSAL_DETECTED');
            expect(result.errors.map(e => e.code)).toContain('MALICIOUS_FILE_DETECTED');
        });
    });

    describe('validateMultipleFiles', () => {
        test('should return success for valid multiple files', () => {
            const files = [
                { originalname: 'test1.jpg', size: 1024 * 1024, mimetype: 'image/jpeg' },
                { originalname: 'test2.pdf', size: 2 * 1024 * 1024, mimetype: 'application/pdf' }
            ];
            const result = validator.validateMultipleFiles(files);
            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.fileResults).toHaveLength(2);
            expect(result.fileResults[0].success).toBe(true);
            expect(result.fileResults[1].success).toBe(true);
        });

        test('should return error for total size exceeded', () => {
            const files = [
                { originalname: 'large1.jpg', size: 30 * 1024 * 1024, mimetype: 'image/jpeg' },
                { originalname: 'large2.jpg', size: 25 * 1024 * 1024, mimetype: 'image/jpeg' }
            ];
            const result = validator.validateMultipleFiles(files);
            expect(result.success).toBe(false);
            expect(result.errors.some(e => e.code === 'TOTAL_SIZE_EXCEEDED')).toBe(true);
        });

        test('should return error for empty files array', () => {
            const result = validator.validateMultipleFiles([]);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('NO_FILES');
        });

        test('should return error for non-array input', () => {
            const result = validator.validateMultipleFiles(null);
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].code).toBe('NO_FILES');
        });

        test('should return individual file errors with file context', () => {
            const files = [
                { originalname: 'valid.jpg', size: 1024 * 1024, mimetype: 'image/jpeg' },
                { originalname: 'invalid.exe', size: 1024 * 1024, mimetype: 'application/x-executable' }
            ];
            const result = validator.validateMultipleFiles(files);
            expect(result.success).toBe(false);
            expect(result.fileResults).toHaveLength(2);
            expect(result.fileResults[0].success).toBe(true);
            expect(result.fileResults[1].success).toBe(false);
            
            const fileError = result.errors.find(e => e.fileIndex === 1);
            expect(fileError).toBeDefined();
            expect(fileError.filename).toBe('invalid.exe');
        });
    });

    describe('constructor', () => {
        test('should use provided config values', () => {
            const customConfig = {
                allowedExtensions: ['.doc', '.docx'],
                maxFileSize: 2 * 1024 * 1024,
                maxTotalSize: 20 * 1024 * 1024
            };
            const customValidator = new FileValidator(customConfig);
            expect(customValidator.allowedExtensions).toEqual(['.doc', '.docx']);
            expect(customValidator.maxFileSize).toBe(2 * 1024 * 1024);
            expect(customValidator.maxTotalSize).toBe(20 * 1024 * 1024);
        });

        test('should use default values for missing config', () => {
            const emptyValidator = new FileValidator({});
            expect(emptyValidator.allowedExtensions).toEqual([]);
            expect(emptyValidator.maxFileSize).toBe(10 * 1024 * 1024);
            expect(emptyValidator.maxTotalSize).toBe(50 * 1024 * 1024);
        });

        test('should initialize dangerous extensions and suspicious MIME types', () => {
            const testValidator = new FileValidator({});
            expect(testValidator.dangerousExtensions).toContain('.exe');
            expect(testValidator.dangerousExtensions).toContain('.bat');
            expect(testValidator.suspiciousMimeTypes).toContain('application/x-executable');
        });
    });

    describe('Security Validation - Additional Edge Cases', () => {
        describe('Advanced Directory Traversal Prevention', () => {
            test('should detect encoded directory traversal attempts', () => {
                const maliciousPaths = [
                    '%2e%2e%2ftest.jpg',
                    '%252e%252e%252ftest.jpg',
                    '..%2ftest.jpg',
                    '%2e%2e\\test.jpg',
                    '....//test.jpg',
                    '..\\..\\test.jpg'
                ];

                maliciousPaths.forEach(path => {
                    expect(validator.validatePathSecurity(path)).toBe(false);
                });
            });

            test('should detect null byte injection attempts', () => {
                const nullBytePaths = [
                    'test.jpg\x00.exe',
                    'test\x00.jpg',
                    'test.jpg%00.exe'
                ];

                nullBytePaths.forEach(path => {
                    expect(validator.validatePathSecurity(path)).toBe(false);
                });
            });
        });

        describe('Advanced Malicious File Detection', () => {
            test('should detect polyglot files', () => {
                const polyglotFiles = [
                    { originalname: 'image.jpg.exe', mimetype: 'image/jpeg' },
                    { originalname: 'document.pdf.bat', mimetype: 'application/pdf' },
                    { originalname: 'archive.zip.scr', mimetype: 'application/zip' }
                ];

                polyglotFiles.forEach(file => {
                    expect(validator.validateFileSecurity(file)).toBe(false);
                });
            });

            test('should detect script files with safe extensions', () => {
                const scriptFiles = [
                    { originalname: 'script.js', mimetype: 'text/javascript' },
                    { originalname: 'shell.sh', mimetype: 'application/x-shellscript' },
                    { originalname: 'powershell.ps1', mimetype: 'text/plain' }
                ];

                scriptFiles.forEach(file => {
                    expect(validator.validateFileSecurity(file)).toBe(false);
                });
            });

            test('should detect files with multiple dangerous extensions', () => {
                const multiExtFiles = [
                    { originalname: 'file.tar.gz.exe', mimetype: 'application/gzip' },
                    { originalname: 'backup.sql.bat', mimetype: 'text/plain' },
                    { originalname: 'config.json.vbs', mimetype: 'application/json' }
                ];

                multiExtFiles.forEach(file => {
                    expect(validator.validateFileSecurity(file)).toBe(false);
                });
            });
        });

        describe('Total Upload Size Security', () => {
            test('should prevent memory exhaustion attacks', () => {
                const largeFiles = Array(100).fill(null).map((_, i) => ({
                    originalname: `file${i}.jpg`,
                    size: 1024 * 1024 // 1MB each, total 100MB
                }));

                expect(validator.validateTotalUploadSize(largeFiles)).toBe(false);
            });

            test('should handle edge case with exactly at limit', () => {
                const files = [
                    { size: 50 * 1024 * 1024 } // Exactly 50MB
                ];

                expect(validator.validateTotalUploadSize(files)).toBe(true);
            });

            test('should handle edge case with one byte over limit', () => {
                const files = [
                    { size: 50 * 1024 * 1024 + 1 } // 50MB + 1 byte
                ];

                expect(validator.validateTotalUploadSize(files)).toBe(false);
            });
        });

        describe('Comprehensive Security Integration', () => {
            test('should detect and report all security issues in a malicious file', () => {
                const maliciousFile = {
                    originalname: '../../../etc/passwd.exe',
                    size: 1024,
                    mimetype: 'application/x-executable'
                };

                const result = validator.validateFile(maliciousFile);
                expect(result.success).toBe(false);
                
                const errorCodes = result.errors.map(e => e.code);
                expect(errorCodes).toContain('DIRECTORY_TRAVERSAL_DETECTED');
                expect(errorCodes).toContain('MALICIOUS_FILE_DETECTED');
                expect(errorCodes).toContain('INVALID_FILE_TYPE');
                expect(errorCodes).toContain('INVALID_FILENAME');
            });

            test('should validate batch upload with mixed security issues', () => {
                const files = [
                    { originalname: 'safe.jpg', size: 1024, mimetype: 'image/jpeg' },
                    { originalname: '../malware.exe', size: 2048, mimetype: 'application/x-executable' },
                    { originalname: 'script.js', size: 512, mimetype: 'text/javascript' }
                ];

                const result = validator.validateMultipleFiles(files);
                expect(result.success).toBe(false);
                expect(result.fileResults[0].success).toBe(true);
                expect(result.fileResults[1].success).toBe(false);
                expect(result.fileResults[2].success).toBe(false);
            });
        });

        describe('Configuration-based Security', () => {
            test('should respect custom maxTotalSize configuration', () => {
                const customConfig = {
                    allowedExtensions: ['.jpg'],
                    maxFileSize: 5 * 1024 * 1024,
                    maxTotalSize: 10 * 1024 * 1024 // 10MB total limit
                };
                const customValidator = new FileValidator(customConfig);

                const files = [
                    { size: 6 * 1024 * 1024 }, // 6MB
                    { size: 5 * 1024 * 1024 }  // 5MB, total 11MB
                ];

                expect(customValidator.validateTotalUploadSize(files)).toBe(false);
            });

            test('should use secure defaults when no maxTotalSize provided', () => {
                const minimalConfig = { allowedExtensions: ['.jpg'] };
                const minimalValidator = new FileValidator(minimalConfig);

                expect(minimalValidator.maxTotalSize).toBe(50 * 1024 * 1024);
            });
        });
    });
});