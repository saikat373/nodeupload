/**
 * Request logging and monitoring middleware
 */

/**
 * Logs incoming requests with relevant details
 */
function logRequest(req, res, next) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Log request details
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    
    // Log file information if present
    if (req.file) {
        console.log(`  Single file: ${req.file.originalname} (${req.file.size} bytes)`);
    }
    
    if (req.files && req.files.length > 0) {
        console.log(`  Multiple files: ${req.files.length} files`);
        req.files.forEach((file, index) => {
            console.log(`    ${index + 1}. ${file.originalname} (${file.size} bytes)`);
        });
    }
    
    // Log request parameters
    if (req.body.folderName) {
        console.log(`  Folder: ${req.body.folderName}`);
    }
    
    if (req.body.fileName) {
        console.log(`  Custom filename: ${req.body.fileName}`);
    }
    
    if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
        console.log(`  Custom filenames: ${req.body.fileNames.join(', ')}`);
    }

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(body) {
        const duration = Date.now() - startTime;
        const responseTimestamp = new Date().toISOString();
        
        console.log(`[${responseTimestamp}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        
        if (!body.success) {
            console.log(`  Error: ${body.error?.code} - ${body.error?.message}`);
        } else if (body.files) {
            if (Array.isArray(body.files)) {
                console.log(`  Success: ${body.files.length} files uploaded`);
            } else {
                console.log(`  Success: File uploaded to ${body.files.path}`);
            }
        }
        
        return originalJson.call(this, body);
    };

    next();
}

/**
 * Monitors upload performance and logs metrics
 */
function monitorUpload(req, res, next) {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();
    
    // Override res.json to capture metrics
    const originalJson = res.json;
    res.json = function(body) {
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
        
        // Log performance metrics
        console.log(`UPLOAD_METRICS: {
            "timestamp": "${new Date().toISOString()}",
            "method": "${req.method}",
            "path": "${req.path}",
            "duration_ms": ${duration.toFixed(2)},
            "memory_delta_bytes": ${memoryDelta},
            "status_code": ${res.statusCode},
            "success": ${body.success || false},
            "file_count": ${req.files ? req.files.length : (req.file ? 1 : 0)},
            "total_size_bytes": ${req.files ? req.files.reduce((sum, f) => sum + f.size, 0) : (req.file ? req.file.size : 0)}
        }`);
        
        return originalJson.call(this, body);
    };

    next();
}

/**
 * Logs security-related events
 */
function logSecurityEvents(req, res, next) {
    // Check for suspicious patterns
    const suspiciousPatterns = [
        /\.\./,  // Directory traversal
        /[<>]/,  // HTML/XML injection attempts
        /script/i,  // Script injection attempts
        /exec|eval|system/i  // Code execution attempts
    ];
    
    const checkForSuspiciousContent = (value, field) => {
        if (typeof value === 'string') {
            suspiciousPatterns.forEach(pattern => {
                if (pattern.test(value)) {
                    console.warn(`SECURITY_EVENT: Suspicious pattern detected in ${field}: ${value}`);
                }
            });
        }
    };
    
    // Check request parameters
    if (req.body.folderName) {
        checkForSuspiciousContent(req.body.folderName, 'folderName');
    }
    
    if (req.body.fileName) {
        checkForSuspiciousContent(req.body.fileName, 'fileName');
    }
    
    if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
        req.body.fileNames.forEach((name, index) => {
            checkForSuspiciousContent(name, `fileNames[${index}]`);
        });
    }
    
    // Check file names
    if (req.file && req.file.originalname) {
        checkForSuspiciousContent(req.file.originalname, 'file.originalname');
    }
    
    if (req.files) {
        req.files.forEach((file, index) => {
            if (file.originalname) {
                checkForSuspiciousContent(file.originalname, `files[${index}].originalname`);
            }
        });
    }

    next();
}

module.exports = {
    logRequest,
    monitorUpload,
    logSecurityEvents
};