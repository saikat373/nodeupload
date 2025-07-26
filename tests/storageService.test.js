const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const StorageService = require('../src/services/storageService');

// Mock configuration
const mockConfig = {
    defaultUploadDir: 'test-uploads',
    tempDir: 'test-temp',
    maxFileSize: 10 * 1024 * 1024,
    allowedExtensions: ['.txt', '.jpg', '.png']
};

// Mock file object
const createMockFile = (options = {}) => ({
    originalname: options.originalname || 'test.txt',
    mimetype: options.mimetype || 'text/plain',
    size: options.size || 1024,
    buffer: options.buffer || Buffer.from('test file content'),
    ...options
});

describe('StorageService', () => {
    let storageService;
    const testDir = 'test-storage';

    beforeEach(() => {
        storageService = new StorageService(mockConfig);
    });

    afterEach(async () => {
        // Clean up test directories
        try {
            if (fsSync.existsSync(testDir)) {
                await fs.rm(testDir, { recursive: true, force: true });
            }
            if (fsSync.existsSync('test-uploads')) {
                await fs.rm('test-uploads', { recursive: true, force: true });
            }
            if (fsSync.existsSync('test-temp')) {
                await fs.rm('test-temp', { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('ensureDirectory', () => {
        test('should create directory if it does not exist', async () => {
            const dirPath = path.join(testDir, 'new-folder');
            
            await storageService.ensureDirectory(dirPath);
            
            const stats = await fs.stat(dirPath);
            expect(stats.isDirectory()).toBe(true);
        });

        test('should not throw error if directory already exists', async () => {
            const dirPath = path.join(testDir, 'existing-folder');
            
            // Create directory first
            await fs.mkdir(dirPath, { recursive: true });
            
            // Should not throw
            await expect(storageService.ensureDirectory(dirPath)).resolves.not.toThrow();
        });

        test('should create nested directories recursively', async () => {
            const dirPath = path.join(testDir, 'level1', 'level2', 'level3');
            
            await storageService.ensureDirectory(dirPath);
            
            const stats = await fs.stat(dirPath);
            expect(stats.isDirectory()).toBe(true);
        });

        test('should throw error for invalid directory path', async () => {
            const invalidPaths = [
                '../outside',
                '/absolute/path',
                'path/with/../traversal',
                'path/with/null\x00byte'
            ];

            for (const invalidPath of invalidPaths) {
                await expect(storageService.ensureDirectory(invalidPath))
                    .rejects.toThrow('Invalid directory path');
            }
        });

        test('should throw error if path exists but is not a directory', async () => {
            const filePath = path.join(testDir, 'test-file.txt');
            
            // Create parent directory and file
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(filePath, 'test content');
            
            await expect(storageService.ensureDirectory(filePath))
                .rejects.toThrow('Path exists but is not a directory');
        });
    });

    describe('validateDirectoryPath', () => {
        test('should return true for valid relative paths', () => {
            const validPaths = [
                'uploads',
                'uploads/subfolder',
                'path/to/folder',
                'folder-name',
                'folder_name'
            ];

            validPaths.forEach(validPath => {
                expect(storageService.validateDirectoryPath(validPath)).toBe(true);
            });
        });

        test('should return false for invalid paths', () => {
            const invalidPaths = [
                null,
                undefined,
                '',
                '../outside',
                '/absolute/path',
                'path/../traversal',
                'path/with/null\x00byte',
                'path/with<invalid>chars',
                'path/with|pipe'
            ];

            invalidPaths.forEach(invalidPath => {
                expect(storageService.validateDirectoryPath(invalidPath)).toBe(false);
            });
        });
    });

    describe('fileExists', () => {
        test('should return true for existing file', async () => {
            const filePath = path.join(testDir, 'existing-file.txt');
            
            // Create directory and file
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(filePath, 'test content');
            
            const exists = await storageService.fileExists(filePath);
            expect(exists).toBe(true);
        });

        test('should return false for non-existing file', async () => {
            const filePath = path.join(testDir, 'non-existing-file.txt');
            
            const exists = await storageService.fileExists(filePath);
            expect(exists).toBe(false);
        });
    });

    describe('generateUniqueFileName', () => {
        test('should return original name if no conflict', async () => {
            const originalName = 'unique-file.txt';
            const targetDir = testDir;
            
            await fs.mkdir(targetDir, { recursive: true });
            
            const uniqueName = await storageService.generateUniqueFileName(originalName, targetDir);
            expect(uniqueName).toBe(originalName);
        });

        test('should generate unique name when file exists', async () => {
            const originalName = 'existing-file.txt';
            const targetDir = testDir;
            
            // Create directory and existing file
            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(path.join(targetDir, originalName), 'existing content');
            
            const uniqueName = await storageService.generateUniqueFileName(originalName, targetDir);
            expect(uniqueName).toBe('existing-file_1.txt');
        });

        test('should handle multiple conflicts', async () => {
            const originalName = 'conflict-file.txt';
            const targetDir = testDir;
            
            // Create directory and multiple existing files
            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(path.join(targetDir, 'conflict-file.txt'), 'content');
            await fs.writeFile(path.join(targetDir, 'conflict-file_1.txt'), 'content');
            await fs.writeFile(path.join(targetDir, 'conflict-file_2.txt'), 'content');
            
            const uniqueName = await storageService.generateUniqueFileName(originalName, targetDir);
            expect(uniqueName).toBe('conflict-file_3.txt');
        });

        test('should handle files without extensions', async () => {
            const originalName = 'no-extension';
            const targetDir = testDir;
            
            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(path.join(targetDir, originalName), 'content');
            
            const uniqueName = await storageService.generateUniqueFileName(originalName, targetDir);
            expect(uniqueName).toBe('no-extension_1');
        });

        test('should throw error for invalid original name', async () => {
            const targetDir = testDir;
            await fs.mkdir(targetDir, { recursive: true });

            await expect(storageService.generateUniqueFileName(null, targetDir))
                .rejects.toThrow('Original filename is required');
            
            await expect(storageService.generateUniqueFileName('', targetDir))
                .rejects.toThrow('Original filename is required');
        });
    });

    describe('saveFile', () => {
        test('should save file successfully', async () => {
            const mockFile = createMockFile({
                originalname: 'test-save.txt',
                buffer: Buffer.from('test file content for saving')
            });
            const targetPath = path.join(testDir, 'test-save.txt');
            
            const savedPath = await storageService.saveFile(mockFile, targetPath);
            
            expect(savedPath).toBe(targetPath);
            
            // Verify file was saved
            const savedContent = await fs.readFile(savedPath);
            expect(savedContent.toString()).toBe('test file content for saving');
        });

        test('should create directory if it does not exist', async () => {
            const mockFile = createMockFile({
                originalname: 'test-nested.txt',
                buffer: Buffer.from('nested file content')
            });
            const targetPath = path.join(testDir, 'nested', 'folder', 'test-nested.txt');
            
            const savedPath = await storageService.saveFile(mockFile, targetPath);
            
            expect(savedPath).toBe(targetPath);
            
            // Verify directory was created
            const dirStats = await fs.stat(path.dirname(targetPath));
            expect(dirStats.isDirectory()).toBe(true);
        });

        test('should generate unique filename for conflicts', async () => {
            const mockFile = createMockFile({
                originalname: 'conflict.txt',
                buffer: Buffer.from('new content')
            });
            const targetPath = path.join(testDir, 'conflict.txt');
            
            // Create existing file
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(targetPath, 'existing content');
            
            const savedPath = await storageService.saveFile(mockFile, targetPath);
            
            expect(savedPath).toBe(path.join(testDir, 'conflict_1.txt'));
            
            // Verify both files exist with different content
            const existingContent = await fs.readFile(targetPath, 'utf8');
            const newContent = await fs.readFile(savedPath, 'utf8');
            
            expect(existingContent).toBe('existing content');
            expect(newContent).toBe('new content');
        });

        test('should throw error for invalid file object', async () => {
            const targetPath = path.join(testDir, 'test.txt');

            await expect(storageService.saveFile(null, targetPath))
                .rejects.toThrow('Invalid file object or missing file buffer');
            
            await expect(storageService.saveFile({}, targetPath))
                .rejects.toThrow('Invalid file object or missing file buffer');
            
            await expect(storageService.saveFile({ originalname: 'test.txt' }, targetPath))
                .rejects.toThrow('Invalid file object or missing file buffer');
        });

        test('should throw error for invalid target path', async () => {
            const mockFile = createMockFile();

            await expect(storageService.saveFile(mockFile, null))
                .rejects.toThrow('Target path is required');
            
            await expect(storageService.saveFile(mockFile, ''))
                .rejects.toThrow('Target path is required');
            
            await expect(storageService.saveFile(mockFile, '../outside/file.txt'))
                .rejects.toThrow('Invalid target path');
        });

        test('should verify file after write', async () => {
            const mockFile = createMockFile({
                originalname: 'verify-test.txt',
                buffer: Buffer.from('content to verify')
            });
            const targetPath = path.join(testDir, 'verify-test.txt');
            
            const savedPath = await storageService.saveFile(mockFile, targetPath);
            
            // Verify file stats match
            const stats = await fs.stat(savedPath);
            expect(stats.size).toBe(mockFile.buffer.length);
            expect(stats.isFile()).toBe(true);
        });
    });

    describe('saveFileWithCustomPath', () => {
        test('should save file with custom folder and filename', async () => {
            const mockFile = createMockFile({
                originalname: 'original.txt',
                buffer: Buffer.from('custom path content')
            });
            
            const result = await storageService.saveFileWithCustomPath(
                mockFile, 
                'custom-folder', 
                'custom-name.txt'
            );
            
            expect(result.originalName).toBe('original.txt');
            expect(result.fileName).toBe('custom-name.txt');
            expect(result.path).toBe(path.join('test-uploads', 'custom-folder', 'custom-name.txt'));
            expect(result.directory).toBe(path.join('test-uploads', 'custom-folder'));
            expect(result.size).toBe(mockFile.size);
            expect(result.mimeType).toBe(mockFile.mimetype);
            expect(result.savedAt).toBeDefined();
            
            // Verify file was saved
            const savedContent = await fs.readFile(result.path, 'utf8');
            expect(savedContent).toBe('custom path content');
        });

        test('should use default folder when no folder specified', async () => {
            const mockFile = createMockFile({
                originalname: 'default-folder.txt'
            });
            
            const result = await storageService.saveFileWithCustomPath(mockFile);
            
            expect(result.path).toBe(path.join('test-uploads', 'default-folder.txt'));
            expect(result.directory).toBe('test-uploads');
        });

        test('should use original filename when no custom filename specified', async () => {
            const mockFile = createMockFile({
                originalname: 'keep-original.txt'
            });
            
            const result = await storageService.saveFileWithCustomPath(
                mockFile, 
                'some-folder'
            );
            
            expect(result.fileName).toBe('keep-original.txt');
            expect(result.originalName).toBe('keep-original.txt');
        });
    });

    describe('getFileInfo', () => {
        test('should return file information for existing file', async () => {
            const filePath = path.join(testDir, 'info-test.txt');
            const content = 'file info test content';
            
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(filePath, content);
            
            const info = await storageService.getFileInfo(filePath);
            
            expect(info.path).toBe(filePath);
            expect(info.size).toBe(content.length);
            expect(info.isFile).toBe(true);
            expect(info.isDirectory).toBe(false);
            expect(info.created).toBeInstanceOf(Date);
            expect(info.modified).toBeInstanceOf(Date);
            expect(info.accessed).toBeInstanceOf(Date);
        });

        test('should throw error for non-existing file', async () => {
            const filePath = path.join(testDir, 'non-existing.txt');
            
            await expect(storageService.getFileInfo(filePath))
                .rejects.toThrow('Failed to get file info');
        });
    });

    describe('checkDiskSpace', () => {
        test('should return space information', async () => {
            const spaceInfo = await storageService.checkDiskSpace();
            
            expect(spaceInfo.available).toBe(true);
            expect(spaceInfo.path).toBeDefined();
        });

        test('should handle custom directory path', async () => {
            await fs.mkdir(testDir, { recursive: true });
            
            const spaceInfo = await storageService.checkDiskSpace(testDir);
            
            expect(spaceInfo.available).toBe(true);
            expect(spaceInfo.path).toBe(testDir);
        });
    });

    describe('createTempFilePath', () => {
        test('should create unique temporary file path', async () => {
            const originalName = 'temp-test.txt';
            
            const tempPath1 = await storageService.createTempFilePath(originalName);
            const tempPath2 = await storageService.createTempFilePath(originalName);
            
            expect(tempPath1).not.toBe(tempPath2);
            expect(tempPath1).toContain('temp-test.txt');
            expect(tempPath2).toContain('temp-test.txt');
            expect(tempPath1).toContain('test-temp');
            expect(tempPath2).toContain('test-temp');
            
            // Verify temp directory was created
            const tempDirStats = await fs.stat('test-temp');
            expect(tempDirStats.isDirectory()).toBe(true);
        });
    });

    // Advanced storage features tests
    describe('Advanced Storage Features', () => {
        describe('removeFile', () => {
            test('should remove existing file', async () => {
                const filePath = path.join(testDir, 'to-remove.txt');
                
                // Create file
                await fs.mkdir(testDir, { recursive: true });
                await fs.writeFile(filePath, 'content to remove');
                
                const result = await storageService.removeFile(filePath);
                
                expect(result).toBe(true);
                expect(await storageService.fileExists(filePath)).toBe(false);
            });

            test('should return true for non-existing file', async () => {
                const filePath = path.join(testDir, 'non-existing.txt');
                
                const result = await storageService.removeFile(filePath);
                
                expect(result).toBe(true);
            });
        });

        describe('removeFiles', () => {
            test('should remove multiple files', async () => {
                const filePaths = [
                    path.join(testDir, 'file1.txt'),
                    path.join(testDir, 'file2.txt'),
                    path.join(testDir, 'file3.txt')
                ];
                
                // Create files
                await fs.mkdir(testDir, { recursive: true });
                for (const filePath of filePaths) {
                    await fs.writeFile(filePath, 'content');
                }
                
                const result = await storageService.removeFiles(filePaths);
                
                expect(result.success).toHaveLength(3);
                expect(result.failed).toHaveLength(0);
                
                // Verify files are removed
                for (const filePath of filePaths) {
                    expect(await storageService.fileExists(filePath)).toBe(false);
                }
            });

            test('should handle mix of existing and non-existing files', async () => {
                const filePaths = [
                    path.join(testDir, 'existing.txt'),
                    path.join(testDir, 'non-existing.txt')
                ];
                
                // Create only one file
                await fs.mkdir(testDir, { recursive: true });
                await fs.writeFile(filePaths[0], 'content');
                
                const result = await storageService.removeFiles(filePaths);
                
                expect(result.success).toHaveLength(2); // Both should succeed
                expect(result.failed).toHaveLength(0);
            });
        });

        describe('cleanupTempFiles', () => {
            test('should remove old temporary files', async () => {
                const tempDir = 'test-temp';
                await fs.mkdir(tempDir, { recursive: true });
                
                // Create old file (simulate by setting mtime)
                const oldFilePath = path.join(tempDir, 'old-temp.txt');
                await fs.writeFile(oldFilePath, 'old content');
                
                // Create new file
                const newFilePath = path.join(tempDir, 'new-temp.txt');
                await fs.writeFile(newFilePath, 'new content');
                
                // Set old file's mtime to 2 hours ago
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                await fs.utimes(oldFilePath, twoHoursAgo, twoHoursAgo);
                
                const result = await storageService.cleanupTempFiles(60 * 60 * 1000); // 1 hour
                
                expect(result.removed).toHaveLength(1);
                expect(result.removed[0].path).toBe(oldFilePath);
                expect(await storageService.fileExists(oldFilePath)).toBe(false);
                expect(await storageService.fileExists(newFilePath)).toBe(true);
            });
        });

        describe('rollbackFiles', () => {
            test('should rollback saved files', async () => {
                const filePaths = [
                    path.join(testDir, 'rollback1.txt'),
                    path.join(testDir, 'rollback2.txt')
                ];
                
                // Create files
                await fs.mkdir(testDir, { recursive: true });
                for (const filePath of filePaths) {
                    await fs.writeFile(filePath, 'rollback content');
                }
                
                const result = await storageService.rollbackFiles(filePaths);
                
                expect(result.success).toHaveLength(2);
                expect(result.failed).toHaveLength(0);
                expect(result.message).toContain('2 files removed');
                
                // Verify files are removed
                for (const filePath of filePaths) {
                    expect(await storageService.fileExists(filePath)).toBe(false);
                }
            });

            test('should handle empty array', async () => {
                const result = await storageService.rollbackFiles([]);
                
                expect(result.message).toBe('No files to rollback');
            });
        });

        describe('createFileMetadata', () => {
            test('should create comprehensive file metadata', () => {
                const mockFile = createMockFile({
                    originalname: 'metadata-test.txt',
                    size: 2048,
                    mimetype: 'text/plain'
                });
                const savedPath = path.join(testDir, 'saved-file.txt');
                const options = {
                    checksum: 'abc123',
                    uploadSource: 'web-form',
                    userAgent: 'test-agent',
                    ipAddress: '127.0.0.1'
                };
                
                const metadata = storageService.createFileMetadata(mockFile, savedPath, options);
                
                expect(metadata.id).toBeDefined();
                expect(metadata.originalName).toBe('metadata-test.txt');
                expect(metadata.fileName).toBe('saved-file.txt');
                expect(metadata.path).toBe(savedPath);
                expect(metadata.directory).toBe(testDir);
                expect(metadata.size).toBe(2048);
                expect(metadata.mimeType).toBe('text/plain');
                expect(metadata.uploadedAt).toBeDefined();
                expect(metadata.checksum).toBe('abc123');
                expect(metadata.uploadSource).toBe('web-form');
                expect(metadata.userAgent).toBe('test-agent');
                expect(metadata.ipAddress).toBe('127.0.0.1');
            });
        });

        describe('calculateChecksum', () => {
            test('should calculate SHA256 checksum by default', () => {
                const buffer = Buffer.from('test content for checksum');
                
                const checksum = storageService.calculateChecksum(buffer);
                
                expect(checksum).toHaveLength(64); // SHA256 produces 64 character hex string
                expect(typeof checksum).toBe('string');
            });

            test('should calculate checksum with different algorithms', () => {
                const buffer = Buffer.from('test content');
                
                const md5 = storageService.calculateChecksum(buffer, 'md5');
                const sha1 = storageService.calculateChecksum(buffer, 'sha1');
                
                expect(md5).toHaveLength(32); // MD5 produces 32 character hex string
                expect(sha1).toHaveLength(40); // SHA1 produces 40 character hex string
            });
        });

        describe('saveFileWithMetadata', () => {
            test('should save file with comprehensive metadata', async () => {
                const mockFile = createMockFile({
                    originalname: 'metadata-save.txt',
                    buffer: Buffer.from('content with metadata')
                });
                const metadata = {
                    uploadSource: 'api',
                    userAgent: 'test-client'
                };
                
                const result = await storageService.saveFileWithMetadata(
                    mockFile, 
                    'metadata-folder', 
                    'custom-name.txt',
                    metadata
                );
                
                expect(result.originalName).toBe('metadata-save.txt');
                expect(result.fileName).toBe('custom-name.txt');
                expect(result.metadata).toBeDefined();
                expect(result.metadata.checksum).toBeDefined();
                expect(result.metadata.uploadSource).toBe('api');
                expect(result.metadata.userAgent).toBe('test-client');
                
                // Verify file was saved
                expect(await storageService.fileExists(result.path)).toBe(true);
            });
        });

        describe('getDirectorySize', () => {
            test('should calculate directory size recursively', async () => {
                const baseDir = path.join(testDir, 'size-test');
                const subDir = path.join(baseDir, 'subdir');
                
                await fs.mkdir(subDir, { recursive: true });
                
                // Create files with known sizes
                await fs.writeFile(path.join(baseDir, 'file1.txt'), 'a'.repeat(100));
                await fs.writeFile(path.join(baseDir, 'file2.txt'), 'b'.repeat(200));
                await fs.writeFile(path.join(subDir, 'file3.txt'), 'c'.repeat(300));
                
                const totalSize = await storageService.getDirectorySize(baseDir);
                
                expect(totalSize).toBe(600); // 100 + 200 + 300
            });

            test('should return 0 for non-existing directory', async () => {
                const size = await storageService.getDirectorySize('non-existing-dir');
                
                expect(size).toBe(0);
            });
        });

        describe('validateStorageSpace', () => {
            test('should validate sufficient storage space', async () => {
                const targetDir = path.join(testDir, 'space-test');
                await fs.mkdir(targetDir, { recursive: true });
                
                // Create a small file
                await fs.writeFile(path.join(targetDir, 'small.txt'), 'small content');
                
                const result = await storageService.validateStorageSpace(1000, targetDir);
                
                expect(result.valid).toBe(true);
                expect(result.currentSize).toBeGreaterThan(0);
                expect(result.requiredSpace).toBe(1000);
                expect(result.availableSpace).toBeGreaterThan(1000);
                expect(result.usagePercentage).toBeLessThan(1);
            });

            test('should detect insufficient storage space', async () => {
                const targetDir = path.join(testDir, 'space-test');
                await fs.mkdir(targetDir, { recursive: true });
                
                // Mock a very large required space
                const largeSpace = 2 * 1024 * 1024 * 1024; // 2GB (larger than default 1GB limit)
                
                const result = await storageService.validateStorageSpace(largeSpace, targetDir);
                
                expect(result.valid).toBe(false);
                expect(result.message).toContain('Storage limit exceeded');
            });
        });

        describe('validateBatchStorageSpace', () => {
            test('should validate space for multiple files', async () => {
                const files = [
                    createMockFile({ size: 1000 }),
                    createMockFile({ size: 2000 }),
                    createMockFile({ size: 3000 })
                ];
                
                const result = await storageService.validateBatchStorageSpace(files);
                
                expect(result.valid).toBe(true);
                expect(result.fileCount).toBe(3);
                expect(result.totalRequiredSpace).toBe(6000);
                expect(result.averageFileSize).toBe(2000);
            });

            test('should handle empty file array', async () => {
                const result = await storageService.validateBatchStorageSpace([]);
                
                expect(result.valid).toBe(true);
                expect(result.totalRequiredSpace).toBe(0);
                expect(result.message).toBe('No files to validate');
            });
        });

        describe('getStorageStats', () => {
            test('should return comprehensive storage statistics', async () => {
                const targetDir = path.join(testDir, 'stats-test');
                await fs.mkdir(targetDir, { recursive: true });
                
                // Create some test files
                await fs.writeFile(path.join(targetDir, 'file1.txt'), 'content1');
                await fs.writeFile(path.join(targetDir, 'file2.txt'), 'content2');
                
                const stats = await storageService.getStorageStats(targetDir);
                
                expect(stats.directory).toBe(targetDir);
                expect(stats.currentSize).toBeGreaterThan(0);
                expect(stats.maxStorageSize).toBeDefined();
                expect(stats.availableSpace).toBeGreaterThan(0);
                expect(stats.usagePercentage).toBeGreaterThanOrEqual(0);
                expect(stats.fileCount).toBe(2);
                expect(stats.averageFileSize).toBeGreaterThan(0);
                expect(stats.lastUpdated).toBeDefined();
            });
        });
    });
});