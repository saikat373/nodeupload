# File Upload Server API Documentation

## Overview

The File Upload Server provides RESTful endpoints for uploading single or multiple files with dynamic folder and filename configuration. The server supports secure file validation, custom storage paths, and comprehensive error handling.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently, no authentication is required. All endpoints are publicly accessible.

## Content Type

All upload endpoints require `multipart/form-data` content type.

## Global Configuration

- **Maximum file size**: 10 MB (10,485,760 bytes)
- **Maximum files per request**: 10
- **Allowed file extensions**: .jpg, .jpeg, .png, .gif, .pdf, .txt, .doc, .docx
- **Default upload directory**: `uploads/`

## Endpoints

### Health Check

Check server status and configuration.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "config": {
    "maxFileSize": 10485760,
    "maxFiles": 10,
    "allowedExtensions": 8
  }
}
```

### Single File Upload

Upload a single file with optional custom folder and filename.

**Endpoint**: `POST /upload/single`

**Content-Type**: `multipart/form-data`

**Parameters**:
- `file` (required): The file to upload
- `folderName` (optional): Custom folder name for storage
- `fileName` (optional): Custom filename (without extension)

**Success Response** (200):
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "originalName": "document.pdf",
    "fileName": "custom-name.pdf",
    "path": "uploads/my-folder/custom-name.pdf",
    "size": 1024000,
    "mimeType": "application/pdf",
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response** (400/413/415/500):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "File validation failed",
    "details": [
      {
        "field": "file",
        "message": "File type not allowed",
        "code": "INVALID_FILE_TYPE"
      }
    ]
  }
}
```

### Multiple File Upload

Upload multiple files simultaneously with optional custom folder and filenames.

**Endpoint**: `POST /upload/multiple`

**Content-Type**: `multipart/form-data`

**Parameters**:
- `files` (required): Array of files to upload
- `folderName` (optional): Custom folder name for all files
- `fileNames` (optional): Array of custom filenames (without extensions)

**Success Response** (200):
```json
{
  "success": true,
  "message": "Successfully uploaded 3 files",
  "files": [
    {
      "originalName": "image1.jpg",
      "fileName": "photo-1.jpg",
      "path": "uploads/gallery/photo-1.jpg",
      "size": 2048000,
      "mimeType": "image/jpeg",
      "uploadedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "originalName": "image2.jpg",
      "fileName": "photo-2.jpg",
      "path": "uploads/gallery/photo-2.jpg",
      "size": 1536000,
      "mimeType": "image/jpeg",
      "uploadedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "originalName": "document.pdf",
      "fileName": "document.pdf",
      "path": "uploads/gallery/document.pdf",
      "size": 512000,
      "mimeType": "application/pdf",
      "uploadedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Response** (400/413/415/500):
```json
{
  "success": false,
  "error": {
    "code": "BATCH_VALIDATION_FAILED",
    "message": "2 files failed pre-validation",
    "details": [
      {
        "index": 0,
        "originalName": "invalid.exe",
        "error": "File type not allowed",
        "code": "INVALID_FILE_TYPE",
        "field": "files[0]"
      },
      {
        "index": 2,
        "originalName": "large-file.zip",
        "error": "File size exceeds maximum limit",
        "code": "FILE_TOO_LARGE",
        "field": "files[2]"
      }
    ]
  }
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `NO_FILE_PROVIDED` | No file was included in the request | 400 |
| `NO_FILES_PROVIDED` | No files were included in the request | 400 |
| `INVALID_FILE_TYPE` | File extension not in allowed list | 415 |
| `FILE_TOO_LARGE` | File exceeds maximum size limit | 413 |
| `INVALID_FILENAME` | Filename contains invalid characters | 400 |
| `INVALID_FOLDER_NAME` | Folder name contains invalid characters | 400 |
| `DUPLICATE_FILENAME_IN_BATCH` | Multiple files with same name in batch | 400 |
| `BATCH_VALIDATION_FAILED` | One or more files in batch failed validation | 400 |
| `STORAGE_ERROR` | File system error during save | 500 |
| `STORAGE_SPACE_EXCEEDED` | Insufficient disk space | 507 |
| `INTERNAL_ERROR` | Unexpected server error | 500 |

## File Validation Rules

### Allowed File Types
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`
- Documents: `.pdf`, `.txt`, `.doc`, `.docx`

### Size Limits
- Maximum file size: 10 MB per file
- Maximum total request size: 100 MB
- Maximum files per request: 10

### Filename Rules
- Must not contain: `< > : " | ? * \ /`
- Must not start with `.` (hidden files)
- Must not be empty or only whitespace
- Maximum length: 255 characters

### Folder Name Rules
- Must not contain: `< > : " | ? * \ /`
- Must not contain `..` (path traversal)
- Must not start with `.` (hidden folders)
- Must not be empty or only whitespace
- Maximum length: 255 characters

## Rate Limiting

Currently, no rate limiting is implemented. Consider implementing rate limiting for production use.

## Security Considerations

1. **File Type Validation**: Only whitelisted file extensions are allowed
2. **Path Traversal Prevention**: Folder and file names are sanitized
3. **Size Limits**: Enforced to prevent DoS attacks
4. **MIME Type Checking**: Files are validated by both extension and MIME type
5. **Temporary File Cleanup**: Failed uploads are automatically cleaned up

## Examples

See the `examples/` directory for complete code examples in various programming languages.