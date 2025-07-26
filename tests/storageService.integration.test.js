const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const StorageService = require('../src/services/storageService');

// Mock configuration for integration tests
const integrationConfig = {
    defaultUploadDir: 'integration-uploads',
    tempDir: 'integration-temp',
    maxFileSize: 10 * 1024 * 1024,
    maxStorageSize: 50 * 1024 * 1024, // 50MB for testing
    storageWarningThreshold: 0.8,
    allowedExtensions: ['.txt', '.jpg', '.png', '.pdf']
};

// Helper to create mock files
const createMockFile = (options = {}) => ({
    originalname: options.originalname || 'test.txt',
    mimetype: options.mimetype || 'text/plain',
    size: options.size || 1024,
    buffer: options.buffer || Buffer.from('test file content'),
    ...options
});

describe('StorageService Integration Tests', () => {
    let storageService;
    const testDirs = ['integration-uploads', 'integration-temp', 'integration-test', 'limited-uploads'];

    beforeEach(() => {
        storageService = new StorageService(integrationConfig);
    });

    afterEach(async () => {
        // Clean up all test directories
        for (const dir of testDirs) {
            try {
                if (fsSync.existsSync(dir)) {
                    await fs.rm(dir, { recursive: true, force: true });
                }
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    });

    describe('Complete Upload Workflow', () => {
        test('should handle complete single file upload workflow', async () => {
            const mockFile = createMockFile({
                originalname: 'workflow-test.txt',
                buffer: Buffer.from('Complete workflow test content'),
                size: 30
            });

            // 1. Validate storage space
            const spaceValidation = await storageService.validateStorageSpace(mockFile.size);
            expect(spaceValidation.valid).toBe(true);

            // 2. Save file with metadata
            const saveResult = await storageService.saveFileWithMetadata(
                mockFile,
                'workflow-folder',
                'final-name.txt',
                {
                    uploadSource: 'integration-test',
                    userAgent: 'test-runner',
                    ipAddress: '127.0.0.1'
                }
            );

            // 3. Verify file was saved correctly
            expect(saveResult.originalName).toBe('workflow-test.txt');
            expect(saveResult.fileName).toBe('final-name.txt');
            expect(saveResult.metadata.checksum).toBeDefined();
            expect(await storageService.fileExists(saveResult.path)).toBe(true);

            // 4. Get file info
            const fileInfo = await storageService.getFileInfo(saveResult.path);
            expect(fileInfo.size).toBe(30);
            expect(fileInfo.isFile).toBe(true);

            // 5. Get storage stats
            const stats = await storageService.getStorageStats();
            expect(stats.fileCount).toBeGreaterThan(0);
            expect(stats.currentSize).toBeGreaterThan(0);
        });

        test('should handle batch upload workflow with rollback on failure', async () => {
            const files = [
                createMockFile({ originalname: 'batch1.txt', size: 100 }),
                createMockFile({ originalname: 'batch2.txt', size: 200 }),
                createMockFile({ originalname: 'batch3.txt', size: 300 })
            ];

            // 1. Validate batch storage space
            const spaceValidation = await storageService.validateBatchStorageSpace(files);
            expect(spaceValidation.valid).toBe(true);
            expect(spaceValidation.totalRequiredSpace).toBe(600);

            // 2. Save files successfully
            const savedFiles = [];
            for (let i = 0; i < files.length; i++) {
                const result = await storageService.saveFileWithCustomPath(
                    files[i],
                    'batch-folder',
                    `batch-file-${i + 1}.txt`
                );
                savedFiles.push(result.path);
            }

            // 3. Verify all files were saved
            for (const filePath of savedFiles) {
                expect(await storageService.fileExists(filePath)).toBe(true);
            }

            // 4. Simulate failure and rollback
            const rollbackResult = await storageService.rollbackFiles(savedFiles);
            expect(rollbackResult.success).toHaveLength(3);
            expect(rollbackResult.failed).toHaveLength(0);

            // 5. Verify all files were removed
            for (const filePath of savedFiles) {
                expect(await storageService.fileExists(filePath)).toBe(false);
            }
        });
    });

    describe('Storage Space Management', () => {
        test('should handle storage limit scenarios', async () => {
            // Create a service with very small storage limit for testing
            const limitedService = new StorageService({
                ...integrationConfig,
                defaultUploadDir: 'limited-uploads',
                maxStorageSize: 800 // 800 bytes limit
            });

            // Create files with actual buffer content that matches size
            const smallFile = createMockFile({ 
                size: 200,
                buffer: Buffer.from('a'.repeat(200))
            });
            const largeFile = createMockFile({ 
                size: 700,
                buffer: Buffer.from('b'.repeat(700))
            });

            // 1. First file should fit
            const validation1 = await limitedService.validateStorageSpace(smallFile.size, 'limited-uploads');
            expect(validation1.valid).toBe(true);

            const result1 = await limitedService.saveFileWithCustomPath(smallFile, null, 'small.txt');
            expect(await limitedService.fileExists(result1.path)).toBe(true);

            // 2. Second file should exceed limit (current size + new file size > limit)
            const validation2 = await limitedService.validateStorageSpace(largeFile.size, 'limited-uploads');
            expect(validation2.valid).toBe(false);
            expect(validation2.message).toContain('Storage limit exceeded');

            // 3. Check storage stats
            const stats = await limitedService.getStorageStats('limited-uploads');
            expect(stats.usagePercentage).toBeGreaterThan(0.2); // More than 20% used
        });

        test('should handle storage warning threshold', async () => {
            // Create service with warning threshold
            const warningService = new StorageService({
                ...integrationConfig,
                maxStorageSize: 1000,
                storageWarningThreshold: 0.7 // 70% warning
            });

            const file = createMockFile({ size: 750 }); // 75% of limit

            const validation = await warningService.validateStorageSpace(file.size);
            expect(validation.valid).toBe(true);
            expect(validation.warning).toBe(true);
            expect(validation.message).toContain('Storage usage warning');
        });
    });

    describe('Cleanup and Maintenance', () => {
        test('should handle temporary file cleanup workflow', async () => {
            const tempDir = 'integration-temp';
            await fs.mkdir(tempDir, { recursive: true });

            // Create temporary files with different ages
            const oldFile1 = path.join(tempDir, 'old1.tmp');
            const oldFile2 = path.join(tempDir, 'old2.tmp');
            const newFile = path.join(tempDir, 'new.tmp');

            await fs.writeFile(oldFile1, 'old content 1');
            await fs.writeFile(oldFile2, 'old content 2');
            await fs.writeFile(newFile, 'new content');

            // Set old files' mtime to 2 hours ago
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            await fs.utimes(oldFile1, twoHoursAgo, twoHoursAgo);
            await fs.utimes(oldFile2, twoHoursAgo, twoHoursAgo);

            // Cleanup files older than 1 hour
            const cleanupResult = await storageService.cleanupTempFiles(60 * 60 * 1000);

            expect(cleanupResult.removed).toHaveLength(2);
            expect(cleanupResult.failed).toHaveLength(0);
            expect(cleanupResult.total).toBe(3);

            // Verify old files are removed, new file remains
            expect(await storageService.fileExists(oldFile1)).toBe(false);
            expect(await storageService.fileExists(oldFile2)).toBe(false);
            expect(await storageService.fileExists(newFile)).toBe(true);
        });

        test('should handle complex directory structure cleanup', async () => {
            const baseDir = 'integration-test';
            const subDirs = ['sub1', 'sub2', 'sub1/nested'];

            // Create complex directory structure
            for (const subDir of subDirs) {
                await fs.mkdir(path.join(baseDir, subDir), { recursive: true });
            }

            // Create files in different directories
            const filesToCreate = [
                'file1.txt',
                'sub1/file2.txt',
                'sub2/file3.txt',
                'sub1/nested/file4.txt'
            ];

            for (const file of filesToCreate) {
                await fs.writeFile(path.join(baseDir, file), `Content of ${file}`);
            }

            // Get initial directory size
            const initialSize = await storageService.getDirectorySize(baseDir);
            expect(initialSize).toBeGreaterThan(0);

            // Get storage stats
            const stats = await storageService.getStorageStats(baseDir);
            expect(stats.fileCount).toBe(4);
            expect(stats.currentSize).toBe(initialSize);

            // Remove some files
            const filesToRemove = [
                path.join(baseDir, 'file1.txt'),
                path.join(baseDir, 'sub1/file2.txt')
            ];

            const removeResult = await storageService.removeFiles(filesToRemove);
            expect(removeResult.success).toHaveLength(2);

            // Verify directory size decreased
            const newSize = await storageService.getDirectorySize(baseDir);
            expect(newSize).toBeLessThan(initialSize);

            // Verify remaining files
            expect(await storageService.fileExists(path.join(baseDir, 'sub2/file3.txt'))).toBe(true);
            expect(await storageService.fileExists(path.join(baseDir, 'sub1/nested/file4.txt'))).toBe(true);
        });
    });

    describe('Error Handling and Recovery', () => {
        test('should handle partial batch upload failure and recovery', async () => {
            const files = [
                createMockFile({ originalname: 'success1.txt' }),
                createMockFile({ originalname: 'success2.txt' }),
                createMockFile({ originalname: 'success3.txt' })
            ];

            const savedFiles = [];

            try {
                // Save first two files successfully
                for (let i = 0; i < 2; i++) {
                    const result = await storageService.saveFileWithCustomPath(
                        files[i],
                        'recovery-test',
                        `file${i + 1}.txt`
                    );
                    savedFiles.push(result.path);
                }

                // Verify files were saved
                for (const filePath of savedFiles) {
                    expect(await storageService.fileExists(filePath)).toBe(true);
                }

                // Simulate failure during third file (e.g., validation error)
                // In real scenario, this would be a validation or storage error
                throw new Error('Simulated batch upload failure');

            } catch (error) {
                // Recovery: rollback all saved files
                const rollbackResult = await storageService.rollbackFiles(savedFiles);
                expect(rollbackResult.success).toHaveLength(2);

                // Verify cleanup was successful
                for (const filePath of savedFiles) {
                    expect(await storageService.fileExists(filePath)).toBe(false);
                }
            }
        });

        test('should handle concurrent file operations', async () => {
            const files = Array.from({ length: 5 }, (_, i) => 
                createMockFile({ 
                    originalname: `concurrent${i}.txt`,
                    buffer: Buffer.from(`Concurrent content ${i}`)
                })
            );

            // Perform concurrent saves
            const savePromises = files.map((file, index) => 
                storageService.saveFileWithCustomPath(
                    file,
                    'concurrent-test',
                    `concurrent-${index}.txt`
                )
            );

            const results = await Promise.all(savePromises);

            // Verify all files were saved with unique names
            expect(results).toHaveLength(5);
            const savedPaths = results.map(r => r.path);
            const uniquePaths = new Set(savedPaths);
            expect(uniquePaths.size).toBe(5); // All paths should be unique

            // Verify all files exist
            for (const result of results) {
                expect(await storageService.fileExists(result.path)).toBe(true);
            }

            // Cleanup all files concurrently
            const cleanupPromises = savedPaths.map(filePath => 
                storageService.removeFile(filePath)
            );

            const cleanupResults = await Promise.all(cleanupPromises);
            expect(cleanupResults.every(result => result === true)).toBe(true);
        });
    });

    describe('Metadata and Logging Integration', () => {
        test('should maintain metadata consistency across operations', async () => {
            const mockFile = createMockFile({
                originalname: 'metadata-consistency.txt',
                buffer: Buffer.from('Metadata test content'),
                mimetype: 'text/plain'
            });

            const metadata = {
                uploadSource: 'integration-test',
                userAgent: 'test-browser',
                ipAddress: '192.168.1.1',
                sessionId: 'test-session-123'
            };

            // Save file with metadata
            const result = await storageService.saveFileWithMetadata(
                mockFile,
                'metadata-test',
                'consistent-name.txt',
                metadata
            );

            // Verify metadata integrity
            expect(result.metadata.originalName).toBe(mockFile.originalname);
            expect(result.metadata.fileName).toBe('consistent-name.txt');
            expect(result.metadata.size).toBe(mockFile.size);
            expect(result.metadata.mimeType).toBe(mockFile.mimetype);
            expect(result.metadata.uploadSource).toBe(metadata.uploadSource);
            expect(result.metadata.userAgent).toBe(metadata.userAgent);
            expect(result.metadata.ipAddress).toBe(metadata.ipAddress);
            expect(result.metadata.sessionId).toBe(metadata.sessionId);

            // Verify checksum matches file content
            const expectedChecksum = storageService.calculateChecksum(mockFile.buffer);
            expect(result.metadata.checksum).toBe(expectedChecksum);

            // Verify file was actually saved with correct content
            const savedContent = await fs.readFile(result.path);
            const savedChecksum = storageService.calculateChecksum(savedContent);
            expect(savedChecksum).toBe(result.metadata.checksum);
        });
    });
});