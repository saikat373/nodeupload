const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Storage Service
 * Handles file system operations for uploaded files
 */
class StorageService {
    constructor(config) {
        this.config = config;
        this.defaultUploadDir = config.defaultUploadDir || 'uploads';
        this.tempDir = config.tempDir || 'temp';
    }

    /**
     * Ensures a directory exists, creating it if necessary
     * @param {string} dirPath - The directory path to ensure exists
     * @returns {Promise<void>}
     */
    async ensureDirectory(dirPath) {
        try {
            // Validate the directory path for security
            if (!this.validateDirectoryPath(dirPath)) {
                throw new Error(`Invalid directory path: ${dirPath}`);
            }

            // Check if directory already exists
            try {
                const stats = await fs.stat(dirPath);
                if (stats.isDirectory()) {
                    return; // Directory already exists
                } else {
                    throw new Error(`Path exists but is not a directory: ${dirPath}`);
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error; // Re-throw if it's not a "file not found" error
                }
            }

            // Create directory recursively
            await fs.mkdir(dirPath, { recursive: true });
            
            // Verify directory was created successfully
            const stats = await fs.stat(dirPath);
            if (!stats.isDirectory()) {
                throw new Error(`Failed to create directory: ${dirPath}`);
            }
        } catch (error) {
            throw new Error(`Directory creation failed for ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Validates directory path for security
     * @param {string} dirPath - The directory path to validate
     * @returns {boolean} - True if path is valid and safe
     */
    validateDirectoryPath(dirPath) {
        if (!dirPath || typeof dirPath !== 'string') {
            return false;
        }

        // Check for empty string after trim
        if (dirPath.trim().length === 0) {
            return false;
        }

        // Check for directory traversal attempts (before normalization)
        if (dirPath.includes('..')) {
            return false;
        }

        // Check for absolute paths (should be relative to project root)
        if (path.isAbsolute(dirPath)) {
            return false;
        }

        // Normalize path after initial checks
        const normalizedPath = path.normalize(dirPath);

        // Double-check for traversal after normalization
        if (normalizedPath.includes('..')) {
            return false;
        }

        // Check for invalid characters
        const invalidChars = /[<>:"|?*\x00-\x1f]/;
        if (invalidChars.test(normalizedPath)) {
            return false;
        }

        return true;
    }

    /**
     * Generates a unique filename using UUID and timestamp
     * @param {string} originalName - The original filename
     * @param {string} targetDir - The target directory
     * @param {boolean} forceUnique - Force unique filename even if no conflict exists
     * @returns {Promise<string>} - Unique filename
     */
    async generateUniqueFileName(originalName, targetDir, forceUnique = false) {
        if (!originalName || typeof originalName !== 'string') {
            throw new Error('Original filename is required');
        }

        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);

        // Ensure target directory exists
        await this.ensureDirectory(targetDir);

        // If forceUnique is true, always generate a unique name
        if (forceUnique) {
            const timestamp = Date.now();
            const randomString = crypto.randomBytes(6).toString('hex');
            return `${nameWithoutExt}_${timestamp}_${randomString}${ext}`;
        }

        // Check if original name already exists
        if (!(await this.fileExists(path.join(targetDir, originalName)))) {
            return originalName;
        }

        // Generate unique name with timestamp and random string
        let uniqueName = originalName;
        let counter = 1;

        // Keep trying until we find a unique name
        while (await this.fileExists(path.join(targetDir, uniqueName))) {
            uniqueName = `${nameWithoutExt}_${counter}${ext}`;
            counter++;
            
            // Prevent infinite loops - use timestamp and random string as fallback
            if (counter > 10000) {
                const timestamp = Date.now();
                const randomString = crypto.randomBytes(6).toString('hex');
                uniqueName = `${nameWithoutExt}_${timestamp}_${randomString}${ext}`;
                break;
            }
        }

        return uniqueName;
    }

    /**
     * Generates a UUID-based unique filename
     * @param {string} originalName - The original filename
     * @returns {string} - UUID-based unique filename
     */
    generateUUIDFileName(originalName) {
        if (!originalName || typeof originalName !== 'string') {
            throw new Error('Original filename is required');
        }

        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);
        const uuid = crypto.randomUUID();
        const timestamp = Date.now();
        
        return `${nameWithoutExt}_${timestamp}_${uuid}${ext}`;
    }

    /**
     * Checks if a file exists
     * @param {string} filePath - The file path to check
     * @returns {Promise<boolean>} - True if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Saves a file to the specified target path with proper error handling
     * @param {Express.Multer.File} file - The uploaded file object
     * @param {string} targetPath - The target file path
     * @returns {Promise<string>} - The final saved file path
     */
    async saveFile(file, targetPath) {
        try {
            if (!file || !file.buffer) {
                throw new Error('Invalid file object or missing file buffer');
            }

            if (!targetPath || typeof targetPath !== 'string') {
                throw new Error('Target path is required');
            }

            // Validate target path
            const normalizedPath = path.normalize(targetPath);
            if (!this.validateDirectoryPath(path.dirname(normalizedPath))) {
                throw new Error(`Invalid target path: ${targetPath}`);
            }

            // Ensure target directory exists
            const targetDir = path.dirname(normalizedPath);
            await this.ensureDirectory(targetDir);

            // Generate unique filename if file already exists
            const fileName = path.basename(normalizedPath);
            const uniqueFileName = await this.generateUniqueFileName(fileName, targetDir, true); // Force unique
            const finalPath = path.join(targetDir, uniqueFileName);

            // Write file to disk
            await fs.writeFile(finalPath, file.buffer);

            // Verify file was written successfully
            const stats = await fs.stat(finalPath);
            if (!stats.isFile() || stats.size !== file.buffer.length) {
                throw new Error('File verification failed after write');
            }

            return finalPath;
        } catch (error) {
            throw new Error(`File save failed: ${error.message}`);
        }
    }

    /**
     * Saves a file with custom folder and filename
     * @param {Express.Multer.File} file - The uploaded file object
     * @param {string} folderName - Custom folder name (optional)
     * @param {string} fileName - Custom filename (optional)
     * @returns {Promise<Object>} - Save result with file info
     */
    async saveFileWithCustomPath(file, folderName = null, fileName = null) {
        try {
            // Determine target directory
            const targetDir = folderName ? 
                path.join(this.defaultUploadDir, folderName) : 
                this.defaultUploadDir;

            // Determine target filename
            const targetFileName = fileName || file.originalname;

            // Construct full target path
            const targetPath = path.join(targetDir, targetFileName);

            // Save the file
            const finalPath = await this.saveFile(file, targetPath);

            // Return file information
            return {
                originalName: file.originalname,
                fileName: path.basename(finalPath),
                path: finalPath,
                directory: path.dirname(finalPath),
                size: file.size,
                mimeType: file.mimetype,
                savedAt: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Custom file save failed: ${error.message}`);
        }
    }

    /**
     * Gets file information without saving
     * @param {string} filePath - The file path
     * @returns {Promise<Object>} - File information
     */
    async getFileInfo(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return {
                path: filePath,
                size: stats.size,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                created: new Date(stats.birthtime),
                modified: new Date(stats.mtime),
                accessed: new Date(stats.atime)
            };
        } catch (error) {
            throw new Error(`Failed to get file info for ${filePath}: ${error.message}`);
        }
    }

    /**
     * Checks available disk space (basic implementation)
     * @param {string} dirPath - Directory to check
     * @returns {Promise<Object>} - Space information
     */
    async checkDiskSpace(dirPath = '.') {
        try {
            // This is a basic implementation - in production you might want to use a library like 'check-disk-space'
            const stats = await fs.stat(dirPath);
            
            // For now, we'll return a basic response
            // In a real implementation, you'd use system calls to get actual disk space
            return {
                available: true,
                path: dirPath,
                // These would be actual values in production
                free: null,
                size: null,
                used: null
            };
        } catch (error) {
            throw new Error(`Failed to check disk space for ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Creates a temporary file path for processing
     * @param {string} originalName - Original filename
     * @returns {Promise<string>} - Temporary file path
     */
    async createTempFilePath(originalName) {
        const tempFileName = `temp_${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${originalName}`;
        const tempPath = path.join(this.tempDir, tempFileName);
        
        // Ensure temp directory exists
        await this.ensureDirectory(this.tempDir);
        
        return tempPath;
    }

    /**
     * Cleanup mechanisms for failed uploads
     */

    /**
     * Removes a file if it exists
     * @param {string} filePath - Path to file to remove
     * @returns {Promise<boolean>} - True if file was removed or didn't exist
     */
    async removeFile(filePath) {
        try {
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return true; // File didn't exist, which is fine
            }
            throw new Error(`Failed to remove file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Removes multiple files
     * @param {string[]} filePaths - Array of file paths to remove
     * @returns {Promise<Object>} - Cleanup result
     */
    async removeFiles(filePaths) {
        const results = {
            success: [],
            failed: []
        };

        for (const filePath of filePaths) {
            try {
                await this.removeFile(filePath);
                results.success.push(filePath);
            } catch (error) {
                results.failed.push({
                    path: filePath,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Cleans up temporary files older than specified age
     * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
     * @returns {Promise<Object>} - Cleanup result
     */
    async cleanupTempFiles(maxAgeMs = 60 * 60 * 1000) {
        try {
            // Ensure temp directory exists
            await this.ensureDirectory(this.tempDir);

            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            const cleanupResults = {
                removed: [],
                failed: [],
                total: files.length
            };

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                
                try {
                    const stats = await fs.stat(filePath);
                    const fileAge = now - stats.mtime.getTime();
                    
                    if (fileAge > maxAgeMs) {
                        await this.removeFile(filePath);
                        cleanupResults.removed.push({
                            path: filePath,
                            age: fileAge,
                            size: stats.size
                        });
                    }
                } catch (error) {
                    cleanupResults.failed.push({
                        path: filePath,
                        error: error.message
                    });
                }
            }

            return cleanupResults;
        } catch (error) {
            throw new Error(`Temp file cleanup failed: ${error.message}`);
        }
    }

    /**
     * Rollback mechanism for failed batch uploads
     * @param {string[]} savedFiles - Array of file paths that were saved
     * @returns {Promise<Object>} - Rollback result
     */
    async rollbackFiles(savedFiles) {
        if (!Array.isArray(savedFiles) || savedFiles.length === 0) {
            return { success: [], failed: [], message: 'No files to rollback' };
        }

        const rollbackResult = await this.removeFiles(savedFiles);
        
        return {
            ...rollbackResult,
            message: `Rollback completed: ${rollbackResult.success.length} files removed, ${rollbackResult.failed.length} failed`
        };
    }

    /**
     * File metadata tracking and logging
     */

    /**
     * Creates file metadata object
     * @param {Express.Multer.File} file - The uploaded file object
     * @param {string} savedPath - The path where file was saved
     * @param {Object} options - Additional options
     * @returns {Object} - File metadata
     */
    createFileMetadata(file, savedPath, options = {}) {
        return {
            id: crypto.randomUUID(),
            originalName: file.originalname,
            fileName: path.basename(savedPath),
            path: savedPath,
            directory: path.dirname(savedPath),
            size: file.size,
            mimeType: file.mimetype,
            uploadedAt: new Date().toISOString(),
            checksum: options.checksum || null,
            uploadSource: options.uploadSource || 'unknown',
            userAgent: options.userAgent || null,
            ipAddress: options.ipAddress || null,
            sessionId: options.sessionId || null
        };
    }

    /**
     * Calculates file checksum for integrity verification
     * @param {Buffer} buffer - File buffer
     * @param {string} algorithm - Hash algorithm (default: 'sha256')
     * @returns {string} - File checksum
     */
    calculateChecksum(buffer, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(buffer).digest('hex');
    }

    /**
     * Saves file with comprehensive metadata tracking
     * @param {Express.Multer.File} file - The uploaded file object
     * @param {string} folderName - Custom folder name (optional)
     * @param {string} fileName - Custom filename (optional)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} - Save result with metadata
     */
    async saveFileWithMetadata(file, folderName = null, fileName = null, metadata = {}) {
        try {
            // Calculate checksum for integrity
            const checksum = this.calculateChecksum(file.buffer);

            // Save the file
            const saveResult = await this.saveFileWithCustomPath(file, folderName, fileName);

            // Create comprehensive metadata
            const fileMetadata = this.createFileMetadata(file, saveResult.path, {
                checksum,
                ...metadata
            });

            // Log the upload (in production, this would go to a proper logging system)
            this.logFileUpload(fileMetadata);

            return {
                ...saveResult,
                metadata: fileMetadata
            };
        } catch (error) {
            throw new Error(`File save with metadata failed: ${error.message}`);
        }
    }

    /**
     * Logs file upload information
     * @param {Object} metadata - File metadata to log
     */
    logFileUpload(metadata) {
        // In production, this would integrate with a proper logging system
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: 'FILE_UPLOAD',
            fileId: metadata.id,
            originalName: metadata.originalName,
            savedPath: metadata.path,
            size: metadata.size,
            mimeType: metadata.mimeType,
            checksum: metadata.checksum,
            uploadSource: metadata.uploadSource
        };

        // For now, just console.log (in production, use proper logger)
        console.log('FILE_UPLOAD_LOG:', JSON.stringify(logEntry));
    }

    /**
     * Storage space validation
     */

    /**
     * Gets directory size recursively
     * @param {string} dirPath - Directory path
     * @returns {Promise<number>} - Total size in bytes
     */
    async getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const items = await fs.readdir(dirPath);

            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);

                if (stats.isDirectory()) {
                    totalSize += await this.getDirectorySize(itemPath);
                } else {
                    totalSize += stats.size;
                }
            }

            return totalSize;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return 0; // Directory doesn't exist
            }
            throw new Error(`Failed to calculate directory size for ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Validates storage space before upload
     * @param {number} requiredSpace - Required space in bytes
     * @param {string} targetDir - Target directory (optional)
     * @returns {Promise<Object>} - Space validation result
     */
    async validateStorageSpace(requiredSpace, targetDir = this.defaultUploadDir) {
        try {
            // Get current directory size
            const currentSize = await this.getDirectorySize(targetDir);
            
            // Define storage limits (in production, these would be configurable)
            const maxStorageSize = this.config.maxStorageSize || 1024 * 1024 * 1024; // 1GB default
            const warningThreshold = this.config.storageWarningThreshold || 0.8; // 80% warning
            
            const projectedSize = currentSize + requiredSpace;
            const usagePercentage = projectedSize / maxStorageSize;

            return {
                valid: projectedSize <= maxStorageSize,
                currentSize,
                requiredSpace,
                projectedSize,
                maxStorageSize,
                availableSpace: maxStorageSize - currentSize,
                usagePercentage,
                warning: usagePercentage > warningThreshold,
                message: projectedSize > maxStorageSize 
                    ? `Storage limit exceeded. Required: ${requiredSpace}, Available: ${maxStorageSize - currentSize}`
                    : usagePercentage > warningThreshold
                    ? `Storage usage warning: ${Math.round(usagePercentage * 100)}% of limit`
                    : 'Storage space sufficient'
            };
        } catch (error) {
            throw new Error(`Storage space validation failed: ${error.message}`);
        }
    }

    /**
     * Validates space for multiple files
     * @param {Express.Multer.File[]} files - Array of files to validate
     * @param {string} targetDir - Target directory (optional)
     * @returns {Promise<Object>} - Space validation result
     */
    async validateBatchStorageSpace(files, targetDir = this.defaultUploadDir) {
        if (!Array.isArray(files) || files.length === 0) {
            return {
                valid: true,
                totalRequiredSpace: 0,
                message: 'No files to validate'
            };
        }

        const totalRequiredSpace = files.reduce((sum, file) => sum + (file.size || 0), 0);
        const spaceValidation = await this.validateStorageSpace(totalRequiredSpace, targetDir);

        return {
            ...spaceValidation,
            fileCount: files.length,
            totalRequiredSpace,
            averageFileSize: totalRequiredSpace / files.length
        };
    }

    /**
     * Gets storage statistics
     * @param {string} targetDir - Target directory (optional)
     * @returns {Promise<Object>} - Storage statistics
     */
    async getStorageStats(targetDir = this.defaultUploadDir) {
        try {
            const currentSize = await this.getDirectorySize(targetDir);
            const maxStorageSize = this.config.maxStorageSize || 1024 * 1024 * 1024;
            
            // Count files
            let fileCount = 0;
            const countFiles = async (dir) => {
                try {
                    const items = await fs.readdir(dir);
                    for (const item of items) {
                        const itemPath = path.join(dir, item);
                        const stats = await fs.stat(itemPath);
                        if (stats.isDirectory()) {
                            await countFiles(itemPath);
                        } else {
                            fileCount++;
                        }
                    }
                } catch (error) {
                    // Ignore errors for individual files/directories
                }
            };

            await countFiles(targetDir);

            return {
                directory: targetDir,
                currentSize,
                maxStorageSize,
                availableSpace: maxStorageSize - currentSize,
                usagePercentage: currentSize / maxStorageSize,
                fileCount,
                averageFileSize: fileCount > 0 ? currentSize / fileCount : 0,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get storage statistics: ${error.message}`);
        }
    }
}

module.exports = StorageService;