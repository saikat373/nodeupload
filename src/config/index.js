const fs = require('fs');
const path = require('path');

/**
 * Configuration schema with validation rules
 */
const CONFIG_SCHEMA = {
    maxFileSize: {
        type: 'number',
        min: 1024, // 1KB minimum
        max: 100 * 1024 * 1024, // 100MB maximum
        default: 10 * 1024 * 1024 // 10MB default
    },
    maxFiles: {
        type: 'number',
        min: 1,
        max: 100,
        default: 10
    },
    allowedExtensions: {
        type: 'array',
        default: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt', '.doc', '.docx']
    },
    defaultUploadDir: {
        type: 'string',
        default: 'uploads'
    },
    tempDir: {
        type: 'string',
        default: 'temp'
    },
    maxTotalSize: {
        type: 'number',
        min: 1024, // 1KB minimum
        max: 1024 * 1024 * 1024, // 1GB maximum
        default: 50 * 1024 * 1024 // 50MB default
    },
    port: {
        type: 'number',
        min: 1000,
        max: 65535,
        default: 3000
    }
};

/**
 * Validates a configuration value against its schema
 */
function validateConfigValue(key, value, schema) {
    const rule = schema[key];
    if (!rule) {
        throw new Error(`Unknown configuration key: ${key}`);
    }

    // Type validation
    if (rule.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
            throw new Error(`Configuration ${key} must be a number, got: ${typeof value}`);
        }
        if (rule.min !== undefined && num < rule.min) {
            throw new Error(`Configuration ${key} must be at least ${rule.min}, got: ${num}`);
        }
        if (rule.max !== undefined && num > rule.max) {
            throw new Error(`Configuration ${key} must be at most ${rule.max}, got: ${num}`);
        }
        return num;
    }

    if (rule.type === 'string') {
        if (typeof value !== 'string') {
            throw new Error(`Configuration ${key} must be a string, got: ${typeof value}`);
        }
        return value;
    }

    if (rule.type === 'array') {
        if (!Array.isArray(value)) {
            throw new Error(`Configuration ${key} must be an array, got: ${typeof value}`);
        }
        return value;
    }

    return value;
}

/**
 * Loads configuration from file
 */
function loadConfigFromFile(configPath) {
    try {
        if (!fs.existsSync(configPath)) {
            return {};
        }

        const configContent = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configContent);
    } catch (error) {
        throw new Error(`Failed to load configuration from ${configPath}: ${error.message}`);
    }
}

/**
 * Loads configuration from environment variables
 */
function loadConfigFromEnv() {
    const envConfig = {};

    // Map environment variables to config keys
    const envMappings = {
        'UPLOAD_MAX_FILE_SIZE': 'maxFileSize',
        'UPLOAD_MAX_FILES': 'maxFiles',
        'UPLOAD_ALLOWED_EXTENSIONS': 'allowedExtensions',
        'UPLOAD_DEFAULT_DIR': 'defaultUploadDir',
        'UPLOAD_TEMP_DIR': 'tempDir',
        'UPLOAD_MAX_TOTAL_SIZE': 'maxTotalSize',
        'PORT': 'port'
    };

    Object.entries(envMappings).forEach(([envKey, configKey]) => {
        const envValue = process.env[envKey];
        if (envValue !== undefined) {
            // Special handling for arrays
            if (configKey === 'allowedExtensions') {
                envConfig[configKey] = envValue.split(',').map(ext => ext.trim());
            } else if (CONFIG_SCHEMA[configKey].type === 'number') {
                envConfig[configKey] = parseInt(envValue, 10);
            } else {
                envConfig[configKey] = envValue;
            }
        }
    });

    return envConfig;
}

/**
 * Creates default configuration with secure values
 */
function createDefaultConfig() {
    const defaultConfig = {};

    Object.entries(CONFIG_SCHEMA).forEach(([key, rule]) => {
        defaultConfig[key] = rule.default;
    });

    return defaultConfig;
}

/**
 * Validates entire configuration object
 */
function validateConfig(config) {
    const validatedConfig = {};

    // Check for unknown keys first
    Object.keys(config).forEach(key => {
        if (!CONFIG_SCHEMA[key]) {
            throw new Error(`Unknown configuration key: ${key}`);
        }
    });

    Object.entries(CONFIG_SCHEMA).forEach(([key, rule]) => {
        const value = config[key];
        if (value !== undefined) {
            validatedConfig[key] = validateConfigValue(key, value, CONFIG_SCHEMA);
        } else {
            validatedConfig[key] = rule.default;
        }
    });

    return validatedConfig;
}

/**
 * Main configuration loader
 */
function loadConfig(configPath = null) {
    try {
        // Start with defaults
        let config = createDefaultConfig();

        // Override with file config if provided
        if (configPath) {
            const fileConfig = loadConfigFromFile(configPath);
            config = { ...config, ...fileConfig };
        }

        // Override with environment variables
        const envConfig = loadConfigFromEnv();
        config = { ...config, ...envConfig };

        // Validate final configuration
        const validatedConfig = validateConfig(config);

        return validatedConfig;
    } catch (error) {
        throw new Error(`Configuration loading failed: ${error.message}`);
    }
}

module.exports = {
    loadConfig,
    validateConfig,
    createDefaultConfig,
    loadConfigFromFile,
    loadConfigFromEnv,
    CONFIG_SCHEMA
};