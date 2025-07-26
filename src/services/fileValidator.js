const path = require('path');

/**
 * File Validation Service
 * Provides comprehensive file validation including type, size, and name validation
 */
class FileValidator {
    constructor(config) {
        this.config = config;
        this.allowedExtensions = config.allowedExtensions || [];
        this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB default
        this.maxTotalSize = config.maxTotalSize || 50 * 1024 * 1024; // 50MB default for total uploads
        
        // Dangerous file extensions that should never be allowed
        this.dangerousExtensions = [
            '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
            '.app', '.deb', '.pkg', '.dmg', '.rpm', '.msi', '.run', '.bin',
            '.sh', '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1', '.pssc',
            '.asp', '.aspx', '.php', '.jsp', '.jspx', '.cfm', '.cgi', '.pl',
            '.py', '.rb', '.go', '.rs', '.cpp', '.c', '.h', '.hpp'
        ];
        
        // Suspicious MIME types that could indicate malicious content
        this.suspiciousMimeTypes = [
            'application/x-executable',
            'application/x-msdownload',
            'application/x-msdos-program',
            'application/x-winexe',
            'application/x-javascript',
            'text/javascript',
            'application/javascript',
            'application/x-shellscript',
            'text/x-script',
            'application/x-php',
            'text/x-php'
        ];
    }

    /**
     * Validates file type using MIME types and extensions
     * @param {Express.Multer.File} file - The uploaded file object
     * @returns {boolean} - True if file type is valid
     */
    validateFileType(file) {
        if (!file || !file.originalname) {
            return false;
        }

        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        // Check if extension is in allowed list
        return this.allowedExtensions.includes(fileExtension);
    }

    /**
     * Validates file size against configurable limits
     * @param {Express.Multer.File} file - The uploaded file object
     * @returns {boolean} - True if file size is valid
     */
    validateFileSize(file) {
        if (!file || typeof file.size !== 'number') {
            return false;
        }

        return file.size <= this.maxFileSize && file.size > 0;
    }

    /**
     * Validates filename for security and compatibility
     * @param {string} filename - The filename to validate
     * @returns {boolean} - True if filename is valid
     */
    validateFileName(filename) {
        if (!filename || typeof filename !== 'string') {
            return false;
        }

        // Check for empty or whitespace-only names
        if (filename.trim().length === 0) {
            return false;
        }

        // Check for directory traversal attempts
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return false;
        }

        // Check for invalid characters (Windows and Unix)
        const invalidChars = /[<>:"|?*\x00-\x1f]/;
        if (invalidChars.test(filename)) {
            return false;
        }

        // Check for reserved names (Windows)
        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
        if (reservedNames.test(filename)) {
            return false;
        }

        // Check length (255 is typical filesystem limit)
        if (filename.length > 255) {
            return false;
        }

        return true;
    }

    /**
     * Sanitizes filename by removing or replacing invalid characters
     * @param {string} filename - The filename to sanitize
     * @returns {string} - Sanitized filename
     */
    sanitizeFileName(filename) {
        if (!filename || typeof filename !== 'string') {
            return 'unnamed_file';
        }

        let sanitized = filename.trim();

        // Remove directory traversal attempts
        sanitized = sanitized.replace(/\.\./g, '');
        sanitized = sanitized.replace(/[/\\]/g, '');

        // Replace invalid characters with underscores
        sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');

        // Handle reserved names by appending underscore
        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
        if (reservedNames.test(sanitized)) {
            sanitized = '_' + sanitized;
        }

        // Ensure it's not empty after sanitization
        if (sanitized.length === 0) {
            sanitized = 'unnamed_file';
        }

        // Truncate if too long, preserving extension
        if (sanitized.length > 255) {
            const ext = path.extname(sanitized);
            const nameWithoutExt = path.basename(sanitized, ext);
            const maxNameLength = 255 - ext.length;
            sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
        }

        return sanitized;
    }

    /**
     * Validates folder name for security and compatibility
     * @param {string} folderName - The folder name to validate
     * @returns {boolean} - True if folder name is valid
     */
    validateFolderName(folderName) {
        if (!folderName || typeof folderName !== 'string') {
            return false;
        }

        // Check for empty or whitespace-only names
        if (folderName.trim().length === 0) {
            return false;
        }

        // Check for directory traversal attempts
        if (folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
            return false;
        }

        // Check for invalid characters
        const invalidChars = /[<>:"|?*\x00-\x1f]/;
        if (invalidChars.test(folderName)) {
            return false;
        }

        // Check for reserved names
        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
        if (reservedNames.test(folderName)) {
            return false;
        }

        // Check length
        if (folderName.length > 255) {
            return false;
        }

        return true;
    }

    /**
     * Sanitizes folder name by removing or replacing invalid characters
     * @param {string} folderName - The folder name to sanitize
     * @returns {string} - Sanitized folder name
     */
    sanitizeFolderName(folderName) {
        if (!folderName || typeof folderName !== 'string') {
            return 'uploads';
        }

        let sanitized = folderName.trim();

        // Remove directory traversal attempts
        sanitized = sanitized.replace(/\.\./g, '');
        sanitized = sanitized.replace(/[/\\]/g, '');

        // Replace invalid characters with underscores
        sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');

        // Handle reserved names
        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
        if (reservedNames.test(sanitized)) {
            sanitized = '_' + sanitized;
        }

        // Ensure it's not empty after sanitization
        if (sanitized.length === 0) {
            sanitized = 'uploads';
        }

        // Truncate if too long
        if (sanitized.length > 255) {
            sanitized = sanitized.substring(0, 255);
        }

        return sanitized;
    }

    /**
     * Enhanced directory traversal prevention in path validation
     * @param {string} filePath - The file path to validate
     * @returns {boolean} - True if path is safe
     */
    validatePathSecurity(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            return false;
        }

        // Normalize path separators
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Check for various directory traversal patterns
        const traversalPatterns = [
            /\.\./,           // Basic ..
            /%2e%2e/i,        // URL encoded ..
            /%252e%252e/i,    // Double URL encoded ..
            /\.\%2f/i,        // Mixed encoding
            /\%2e\./i,        // Mixed encoding
            /\.\//,           // Current directory reference
            /\/\.\./,         // Absolute traversal
            /^\//,            // Absolute path
            /^[a-zA-Z]:/,     // Windows drive letter
            /\x00/,           // Null byte injection
            /%00/i            // URL encoded null byte
        ];

        return !traversalPatterns.some(pattern => pattern.test(normalizedPath));
    }

    /**
     * Detects potentially malicious file types beyond basic extension checking
     * @param {Express.Multer.File} file - The uploaded file object
     * @returns {boolean} - True if file appears safe
     */
    validateFileSecurity(file) {
        if (!file) {
            return false;
        }

        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        // Check against dangerous extensions
        if (this.dangerousExtensions.includes(fileExtension)) {
            return false;
        }

        // Check MIME type if available
        if (file.mimetype && this.suspiciousMimeTypes.includes(file.mimetype.toLowerCase())) {
            return false;
        }

        // Check for double extensions (e.g., file.txt.exe)
        const filename = file.originalname.toLowerCase();
        const doubleExtensionPattern = /\.(txt|pdf|jpg|jpeg|png|gif|doc|docx)\.(exe|bat|cmd|scr|pif|com|vbs|js)$/;
        if (doubleExtensionPattern.test(filename)) {
            return false;
        }

        // Check for executable disguised as other file types
        const disguisedExecutablePattern = /\.(exe|bat|cmd|scr|pif|com|vbs)$/;
        if (disguisedExecutablePattern.test(filename) && !filename.endsWith(fileExtension)) {
            return false;
        }

        return true;
    }

    /**
     * Validates total upload size limits for batch uploads
     * @param {Express.Multer.File[]} files - Array of uploaded files
     * @returns {boolean} - True if total size is within limits
     */
    validateTotalUploadSize(files) {
        if (!Array.isArray(files)) {
            return false;
        }

        const totalSize = files.reduce((sum, file) => {
            return sum + (file && typeof file.size === 'number' ? file.size : 0);
        }, 0);

        return totalSize <= this.maxTotalSize && totalSize > 0;
    }

    /**
     * Comprehensive security validation for a single file
     * @param {Express.Multer.File} file - The uploaded file object
     * @returns {Object} - Security validation result
     */
    validateFileSafety(file) {
        const errors = [];

        if (!this.validatePathSecurity(file.originalname)) {
            errors.push({
                field: 'filename',
                message: 'Filename contains directory traversal attempts',
                code: 'DIRECTORY_TRAVERSAL_DETECTED'
            });
        }

        if (!this.validateFileSecurity(file)) {
            errors.push({
                field: 'file',
                message: 'File type appears to be malicious or dangerous',
                code: 'MALICIOUS_FILE_DETECTED'
            });
        }

        return {
            success: errors.length === 0,
            errors
        };
    }

    /**
     * Comprehensive file validation combining all checks including security
     * @param {Express.Multer.File} file - The uploaded file object
     * @returns {Object} - Validation result with success flag and errors
     */
    validateFile(file) {
        const errors = [];

        if (!this.validateFileType(file)) {
            errors.push({
                field: 'file',
                message: `File type not allowed. Allowed extensions: ${this.allowedExtensions.join(', ')}`,
                code: 'INVALID_FILE_TYPE'
            });
        }

        if (!this.validateFileSize(file)) {
            errors.push({
                field: 'file',
                message: `File size exceeds limit of ${this.maxFileSize} bytes`,
                code: 'FILE_TOO_LARGE'
            });
        }

        if (!this.validateFileName(file.originalname)) {
            errors.push({
                field: 'filename',
                message: 'Invalid filename',
                code: 'INVALID_FILENAME'
            });
        }

        // Add security validations
        const securityResult = this.validateFileSafety(file);
        errors.push(...securityResult.errors);

        return {
            success: errors.length === 0,
            errors
        };
    }

    /**
     * Validates multiple files including total size limits
     * @param {Express.Multer.File[]} files - Array of uploaded files
     * @returns {Object} - Validation result for all files
     */
    validateMultipleFiles(files) {
        const errors = [];
        const fileResults = [];

        if (!Array.isArray(files) || files.length === 0) {
            errors.push({
                field: 'files',
                message: 'No files provided for validation',
                code: 'NO_FILES'
            });
            return { success: false, errors, fileResults };
        }

        // Validate total upload size
        if (!this.validateTotalUploadSize(files)) {
            errors.push({
                field: 'files',
                message: `Total upload size exceeds limit of ${this.maxTotalSize} bytes`,
                code: 'TOTAL_SIZE_EXCEEDED'
            });
        }

        // Validate each file individually
        files.forEach((file, index) => {
            const fileResult = this.validateFile(file);
            fileResults.push({
                index,
                filename: file.originalname,
                ...fileResult
            });

            if (!fileResult.success) {
                errors.push(...fileResult.errors.map(error => ({
                    ...error,
                    fileIndex: index,
                    filename: file.originalname
                })));
            }
        });

        return {
            success: errors.length === 0,
            errors,
            fileResults
        };
    }
}

module.exports = FileValidator;