const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  validateConfig,
  createDefaultConfig,
  loadConfigFromFile,
  loadConfigFromEnv,
  CONFIG_SCHEMA
} = require('../src/config');

// Mock fs for testing
jest.mock('fs');

describe('Configuration Management System', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.UPLOAD_MAX_FILE_SIZE;
    delete process.env.UPLOAD_MAX_FILES;
    delete process.env.UPLOAD_ALLOWED_EXTENSIONS;
    delete process.env.UPLOAD_DEFAULT_DIR;
    delete process.env.UPLOAD_TEMP_DIR;
    delete process.env.UPLOAD_MAX_TOTAL_SIZE;
    delete process.env.PORT;
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('createDefaultConfig', () => {
    it('should create configuration with secure default values', () => {
      const config = createDefaultConfig();
      
      expect(config).toEqual({
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt', '.doc', '.docx'],
        defaultUploadDir: 'uploads',
        tempDir: 'temp',
        maxTotalSize: 50 * 1024 * 1024, // 50MB
        port: 3000
      });
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const config = {
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 5,
        allowedExtensions: ['.jpg', '.png'],
        defaultUploadDir: 'custom-uploads',
        tempDir: 'custom-temp',
        port: 8080
      };

      const result = validateConfig(config);
      expect(result).toEqual({
        ...config,
        maxTotalSize: 50 * 1024 * 1024 // default value added
      });
    });

    it('should use defaults for missing values', () => {
      const config = {
        maxFileSize: 5 * 1024 * 1024
      };

      const result = validateConfig(config);
      expect(result.maxFileSize).toBe(5 * 1024 * 1024);
      expect(result.maxFiles).toBe(10); // default
      expect(result.maxTotalSize).toBe(50 * 1024 * 1024); // default
      expect(result.port).toBe(3000); // default
    });

    it('should throw error for invalid number values', () => {
      const config = {
        maxFileSize: 'invalid'
      };

      expect(() => validateConfig(config)).toThrow('Configuration maxFileSize must be a number');
    });

    it('should throw error for number below minimum', () => {
      const config = {
        maxFileSize: 500 // below 1KB minimum
      };

      expect(() => validateConfig(config)).toThrow('Configuration maxFileSize must be at least 1024');
    });

    it('should throw error for number above maximum', () => {
      const config = {
        maxFileSize: 200 * 1024 * 1024 // above 100MB maximum
      };

      expect(() => validateConfig(config)).toThrow('Configuration maxFileSize must be at most 104857600');
    });

    it('should throw error for invalid string type', () => {
      const config = {
        defaultUploadDir: 123
      };

      expect(() => validateConfig(config)).toThrow('Configuration defaultUploadDir must be a string');
    });

    it('should throw error for invalid array type', () => {
      const config = {
        allowedExtensions: 'not-an-array'
      };

      expect(() => validateConfig(config)).toThrow('Configuration allowedExtensions must be an array');
    });

    it('should throw error for unknown configuration key', () => {
      const config = {
        unknownKey: 'value'
      };

      expect(() => validateConfig(config)).toThrow('Unknown configuration key: unknownKey');
    });
  });

  describe('loadConfigFromFile', () => {
    it('should load valid JSON configuration file', () => {
      const mockConfig = {
        maxFileSize: 5 * 1024 * 1024,
        port: 8080
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfigFromFile('/path/to/config.json');
      expect(result).toEqual(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf8');
    });

    it('should return empty object if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadConfigFromFile('/path/to/nonexistent.json');
      expect(result).toEqual({});
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should throw error for invalid JSON', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      expect(() => loadConfigFromFile('/path/to/config.json'))
        .toThrow('Failed to load configuration from /path/to/config.json');
    });

    it('should throw error for file read error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => loadConfigFromFile('/path/to/config.json'))
        .toThrow('Failed to load configuration from /path/to/config.json: Permission denied');
    });
  });

  describe('loadConfigFromEnv', () => {
    it('should load configuration from environment variables', () => {
      process.env.UPLOAD_MAX_FILE_SIZE = '5242880'; // 5MB
      process.env.UPLOAD_MAX_FILES = '5';
      process.env.UPLOAD_ALLOWED_EXTENSIONS = '.jpg,.png,.gif';
      process.env.UPLOAD_DEFAULT_DIR = 'env-uploads';
      process.env.UPLOAD_TEMP_DIR = 'env-temp';
      process.env.UPLOAD_MAX_TOTAL_SIZE = '20971520'; // 20MB
      process.env.PORT = '8080';

      const result = loadConfigFromEnv();
      
      expect(result).toEqual({
        maxFileSize: 5242880,
        maxFiles: 5,
        allowedExtensions: ['.jpg', '.png', '.gif'],
        defaultUploadDir: 'env-uploads',
        tempDir: 'env-temp',
        maxTotalSize: 20971520,
        port: 8080
      });
    });

    it('should return empty object when no environment variables are set', () => {
      const result = loadConfigFromEnv();
      expect(result).toEqual({});
    });

    it('should handle array parsing correctly', () => {
      process.env.UPLOAD_ALLOWED_EXTENSIONS = '.jpg, .png , .gif';

      const result = loadConfigFromEnv();
      expect(result.allowedExtensions).toEqual(['.jpg', '.png', '.gif']);
    });

    it('should handle number parsing correctly', () => {
      process.env.UPLOAD_MAX_FILE_SIZE = '1048576';
      process.env.PORT = '3001';

      const result = loadConfigFromEnv();
      expect(result.maxFileSize).toBe(1048576);
      expect(result.port).toBe(3001);
    });
  });

  describe('loadConfig', () => {
    it('should load configuration with defaults only', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadConfig();
      const expected = createDefaultConfig();
      
      expect(result).toEqual(expected);
    });

    it('should override defaults with file configuration', () => {
      const fileConfig = {
        maxFileSize: 5 * 1024 * 1024,
        port: 8080
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));

      const result = loadConfig('/path/to/config.json');
      
      expect(result.maxFileSize).toBe(5 * 1024 * 1024);
      expect(result.port).toBe(8080);
      expect(result.maxFiles).toBe(10); // default value
    });

    it('should override file config with environment variables', () => {
      const fileConfig = {
        maxFileSize: 5 * 1024 * 1024,
        port: 8080
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));
      process.env.PORT = '9000';
      process.env.UPLOAD_MAX_FILES = '20';

      const result = loadConfig('/path/to/config.json');
      
      expect(result.maxFileSize).toBe(5 * 1024 * 1024); // from file
      expect(result.port).toBe(9000); // from env (overrides file)
      expect(result.maxFiles).toBe(20); // from env (overrides default)
    });

    it('should validate final configuration', () => {
      process.env.UPLOAD_MAX_FILE_SIZE = 'invalid';

      expect(() => loadConfig()).toThrow('Configuration loading failed');
    });

    it('should throw error for configuration validation failure', () => {
      const fileConfig = {
        maxFileSize: 500 // below minimum
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));

      expect(() => loadConfig('/path/to/config.json'))
        .toThrow('Configuration loading failed');
    });
  });

  describe('CONFIG_SCHEMA', () => {
    it('should have proper schema structure', () => {
      expect(CONFIG_SCHEMA).toHaveProperty('maxFileSize');
      expect(CONFIG_SCHEMA).toHaveProperty('maxFiles');
      expect(CONFIG_SCHEMA).toHaveProperty('allowedExtensions');
      expect(CONFIG_SCHEMA).toHaveProperty('defaultUploadDir');
      expect(CONFIG_SCHEMA).toHaveProperty('tempDir');
      expect(CONFIG_SCHEMA).toHaveProperty('maxTotalSize');
      expect(CONFIG_SCHEMA).toHaveProperty('port');

      // Check that each schema entry has required properties
      Object.values(CONFIG_SCHEMA).forEach(rule => {
        expect(rule).toHaveProperty('type');
        expect(rule).toHaveProperty('default');
      });
    });
  });
});