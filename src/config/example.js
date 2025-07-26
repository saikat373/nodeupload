const { loadConfig } = require('./index');

// Example usage of the configuration system

try {
  // Load configuration with defaults only
  console.log('Loading default configuration:');
  const defaultConfig = loadConfig();
  console.log(JSON.stringify(defaultConfig, null, 2));

  // Load configuration from file
  console.log('\nLoading configuration from file:');
  const fileConfig = loadConfig('./config/default.json');
  console.log(JSON.stringify(fileConfig, null, 2));

  // Example with environment variables
  console.log('\nExample with environment variables:');
  process.env.UPLOAD_MAX_FILE_SIZE = '5242880'; // 5MB
  process.env.PORT = '8080';
  
  const envConfig = loadConfig('./config/default.json');
  console.log(JSON.stringify(envConfig, null, 2));

} catch (error) {
  console.error('Configuration error:', error.message);
}