/**
 * Unit tests for the logging utility
 */

const fs = require('fs');
const path = require('path');
const {
    logError,
    logWarning,
    logInfo,
    logDebug,
    logSecurityEvent,
    logRequest,
    logStartup,
    logShutdown,
    createRequestLoggingMiddleware,
    LogLevels,
    SecurityEventTypes,
    LoggerConfig
} = require('../src/utils/logger');

// Mock fs module
jest.mock('fs');

describe('Logger Utility', () => {
    let originalConsole;
    let mockConsole;

    beforeEach(() => {
        // Mock console methods
        originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn
        };

        mockConsole = {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        console.log = mockConsole.log;
        console.error = mockConsole.error;
        console.warn = mockConsole.warn;

        // Reset fs mocks
        fs.existsSync.mockClear();
        fs.mkdirSync.mockClear();
        fs.statSync.mockClear();
        fs.appendFileSync.mockClear();
        fs.renameSync.mockClear();
        fs.readdirSync.mockClear();
        fs.unlinkSync.mockClear();

        // Reset environment variables
        delete process.env.LOG_LEVEL;
        delete process.env.LOG_TO_FILE;
        delete process.env.LOG_DIRECTORY;
        delete process.env.ENABLE_CONSOLE_COLORS;
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
    });

    describe('Basic Logging Functions', () => {
        test('logError should log error messages', () => {
            const message = 'Test error message';
            const context = { error: 'details' };

            logError(message, context);

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR: Test error message')
            );
        });

        test('logWarning should log warning messages', () => {
            const message = 'Test warning message';
            const context = { warning: 'details' };

            logWarning(message, context);

            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('WARN: Test warning message')
            );
        });

        test('logInfo should log info messages', () => {
            const message = 'Test info message';
            const context = { info: 'details' };

            logInfo(message, context);

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('INFO: Test info message')
            );
        });

        test('logDebug should log debug messages when log level allows', () => {
            process.env.LOG_LEVEL = 'DEBUG';
            
            // Need to reload the module to pick up new env var
            jest.resetModules();
            const logger = require('../src/utils/logger');
            
            const message = 'Test debug message';
            logger.logDebug(message);

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG: Test debug message')
            );
        });

        test('should respect log level configuration', () => {
            process.env.LOG_LEVEL = 'ERROR';
            
            jest.resetModules();
            const logger = require('../src/utils/logger');
            
            logger.logInfo('This should not appear');
            logger.logError('This should appear');

            expect(mockConsole.log).not.toHaveBeenCalled();
            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR: This should appear')
            );
        });
    });

    describe('Security Event Logging', () => {
        test('should log security errors with high severity', () => {
            const message = 'Malicious file detected';
            const context = { file: 'test.exe' };

            logSecurityEvent(SecurityEventTypes.ERROR, message, context);

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY: Malicious file detected')
            );
        });

        test('should log security warnings with medium severity', () => {
            const message = 'Suspicious activity detected';
            const context = { ip: '192.168.1.1' };

            logSecurityEvent(SecurityEventTypes.WARNING, message, context);

            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY: Suspicious activity detected')
            );
        });

        test('should log blocked events with medium severity', () => {
            const message = 'Request blocked';
            const context = { reason: 'rate_limit' };

            logSecurityEvent(SecurityEventTypes.BLOCKED, message, context);

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('SECURITY: Request blocked')
            );
        });
    });

    describe('Request Logging', () => {
        test('should log successful requests as info', () => {
            const req = {
                method: 'POST',
                url: '/upload/single',
                get: jest.fn((header) => {
                    if (header === 'User-Agent') return 'test-agent';
                    if (header === 'Content-Type') return 'multipart/form-data';
                    return null;
                }),
                ip: '127.0.0.1'
            };

            const res = { statusCode: 200 };
            const responseTime = 150;

            logRequest(req, res, responseTime);

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('POST /upload/single - 200 (150ms)')
            );
        });

        test('should log error requests as errors', () => {
            const req = {
                method: 'POST',
                url: '/upload/single',
                get: jest.fn(() => null),
                ip: '127.0.0.1'
            };

            const res = { statusCode: 400 };
            const responseTime = 50;

            logRequest(req, res, responseTime);

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('POST /upload/single - 400 (50ms)')
            );
        });
    });

    describe('File Logging', () => {
        test('should handle file logging configuration', () => {
            // Test that the logger configuration can be set
            const originalLogToFile = process.env.LOG_TO_FILE;
            const originalLogDirectory = process.env.LOG_DIRECTORY;
            
            process.env.LOG_TO_FILE = 'true';
            process.env.LOG_DIRECTORY = '/test/logs';
            
            jest.resetModules();
            const logger = require('../src/utils/logger');
            
            expect(logger.LoggerConfig.logToFile).toBe(true);
            expect(logger.LoggerConfig.logDirectory).toBe('/test/logs');
            
            // Restore original values
            if (originalLogToFile) {
                process.env.LOG_TO_FILE = originalLogToFile;
            } else {
                delete process.env.LOG_TO_FILE;
            }
            if (originalLogDirectory) {
                process.env.LOG_DIRECTORY = originalLogDirectory;
            } else {
                delete process.env.LOG_DIRECTORY;
            }
        });

        test('should handle file system operations gracefully', () => {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ size: 1000 });
            fs.appendFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });
            
            // Should not throw when file operations fail
            expect(() => logError('Test message')).not.toThrow();
            
            // Should still log to console
            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR: Test message')
            );
        });

        test('should validate file system mock setup', () => {
            // Test that our mocks are working correctly
            fs.existsSync.mockReturnValue(false);
            expect(fs.existsSync('/test/path')).toBe(false);
            
            fs.statSync.mockReturnValue({ size: 1000 });
            expect(fs.statSync('/test/file').size).toBe(1000);
            
            fs.appendFileSync.mockImplementation(() => {});
            expect(() => fs.appendFileSync('/test/file', 'content')).not.toThrow();
        });
    });

    describe('Request Logging Middleware', () => {
        test('should create middleware that logs requests', () => {
            const middleware = createRequestLoggingMiddleware();
            expect(typeof middleware).toBe('function');

            const req = {
                method: 'GET',
                url: '/health',
                get: jest.fn(() => 'test-agent'),
                ip: '127.0.0.1'
            };

            const res = {
                statusCode: 200,
                end: jest.fn()
            };

            const next = jest.fn();

            // Execute middleware
            middleware(req, res, next);
            expect(next).toHaveBeenCalled();

            // Simulate response end
            res.end();

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('GET /health - 200')
            );
        });

        test('should measure response time accurately', (done) => {
            const middleware = createRequestLoggingMiddleware();
            
            const req = {
                method: 'POST',
                url: '/upload',
                get: jest.fn(() => null),
                ip: '127.0.0.1'
            };

            const res = {
                statusCode: 200,
                end: jest.fn()
            };

            const next = jest.fn();

            middleware(req, res, next);

            // Simulate some processing time
            setTimeout(() => {
                res.end();
                
                expect(mockConsole.log).toHaveBeenCalledWith(
                    expect.stringMatching(/POST \/upload - 200 \(\d+ms\)/)
                );
                done();
            }, 10);
        });
    });

    describe('Startup and Shutdown Logging', () => {
        test('should log startup information', () => {
            const config = {
                maxFileSize: 1024000,
                maxFiles: 5,
                allowedExtensions: ['.jpg', '.png'],
                port: 3000
            };

            logStartup(config);

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('File upload server starting up')
            );
        });

        test('should log shutdown information', () => {
            logShutdown();

            expect(mockConsole.log).toHaveBeenCalledWith(
                expect.stringContaining('File upload server shutting down')
            );
        });
    });

    describe('Configuration', () => {
        test('should use environment variables for configuration', () => {
            process.env.LOG_LEVEL = 'DEBUG';
            process.env.LOG_TO_FILE = 'true';
            process.env.LOG_DIRECTORY = '/custom/logs';
            process.env.ENABLE_CONSOLE_COLORS = 'false';

            jest.resetModules();
            const logger = require('../src/utils/logger');

            expect(logger.LoggerConfig.logLevel).toBe('DEBUG');
            expect(logger.LoggerConfig.logToFile).toBe(true);
            expect(logger.LoggerConfig.logDirectory).toBe('/custom/logs');
            expect(logger.LoggerConfig.enableConsoleColors).toBe(false);
        });

        test('should use default values when environment variables are not set', () => {
            jest.resetModules();
            const logger = require('../src/utils/logger');

            expect(logger.LoggerConfig.logLevel).toBe('INFO');
            expect(logger.LoggerConfig.logToFile).toBe(false);
            expect(logger.LoggerConfig.enableConsoleColors).toBe(true);
        });
    });

    describe('Log Levels', () => {
        test('should have correct log level priorities', () => {
            expect(LogLevels.ERROR.priority).toBe(0);
            expect(LogLevels.WARN.priority).toBe(1);
            expect(LogLevels.INFO.priority).toBe(2);
            expect(LogLevels.DEBUG.priority).toBe(3);
        });

        test('should filter messages based on log level', () => {
            process.env.LOG_LEVEL = 'WARN';
            
            jest.resetModules();
            const logger = require('../src/utils/logger');
            
            logger.logDebug('Debug message');
            logger.logInfo('Info message');
            logger.logWarning('Warning message');
            logger.logError('Error message');

            expect(mockConsole.log).not.toHaveBeenCalled(); // Debug and Info should be filtered
            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('WARN: Warning message')
            );
            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR: Error message')
            );
        });
    });
});