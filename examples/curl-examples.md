# cURL Examples for File Upload Server

This document provides comprehensive cURL examples for testing the file upload server endpoints.

## Prerequisites

- Server running on `http://localhost:3000`
- Test files available in your current directory
- cURL installed on your system

## Health Check

Check if the server is running and view configuration:

```bash
curl -X GET http://localhost:3000/health
```

Expected response:
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

## Single File Upload

### Basic single file upload

Upload a file to the default uploads directory:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@test-image.jpg"
```

### Upload with custom folder

Upload a file to a custom folder:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@document.pdf" \
  -F "folderName=documents"
```

### Upload with custom filename

Upload a file with a custom filename:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@photo.jpg" \
  -F "fileName=profile-picture"
```

### Upload with both custom folder and filename

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@report.pdf" \
  -F "folderName=reports" \
  -F "fileName=monthly-report"
```

### Upload with verbose output

See detailed request/response information:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@test.txt" \
  -F "folderName=text-files" \
  -v
```

## Multiple File Upload

### Basic multiple file upload

Upload multiple files to the default directory:

```bash
curl -X POST http://localhost:3000/upload/multiple \
  -F "files=@image1.jpg" \
  -F "files=@image2.png" \
  -F "files=@document.pdf"
```

### Upload multiple files to custom folder

```bash
curl -X POST http://localhost:3000/upload/multiple \
  -F "files=@photo1.jpg" \
  -F "files=@photo2.jpg" \
  -F "files=@photo3.png" \
  -F "folderName=gallery"
```

### Upload with custom filenames

Upload multiple files with custom names (as JSON array):

```bash
curl -X POST http://localhost:3000/upload/multiple \
  -F "files=@file1.txt" \
  -F "files=@file2.txt" \
  -F "files=@file3.txt" \
  -F "folderName=batch-upload" \
  -F 'fileNames=["first-file","second-file","third-file"]'
```

### Large batch upload

Upload many files at once:

```bash
curl -X POST http://localhost:3000/upload/multiple \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.pdf" \
  -F "files=@doc3.pdf" \
  -F "files=@doc4.pdf" \
  -F "files=@doc5.pdf" \
  -F "folderName=documents" \
  -F 'fileNames=["contract","invoice","receipt","report","manual"]'
```

## Error Testing

### Test invalid file type

Try uploading a file with disallowed extension:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@script.exe"
```

Expected error response:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "File type not allowed",
    "details": [...]
  }
}
```

### Test file too large

Create a large test file and try uploading:

```bash
# Create a 15MB test file (exceeds 10MB limit)
dd if=/dev/zero of=large-file.txt bs=1M count=15

# Try to upload it
curl -X POST http://localhost:3000/upload/single \
  -F "file=@large-file.txt"
```

### Test missing file

Try uploading without providing a file:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "folderName=test"
```

### Test invalid folder name

Try using invalid characters in folder name:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@test.txt" \
  -F "folderName=../../../etc"
```

## Advanced Examples

### Upload with custom headers

Add custom headers to the request:

```bash
curl -X POST http://localhost:3000/upload/single \
  -H "User-Agent: MyApp/1.0" \
  -H "X-Client-Version: 2.1.0" \
  -F "file=@document.pdf" \
  -F "folderName=client-uploads"
```

### Save response to file

Save the server response to a file for analysis:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@test.jpg" \
  -o upload-response.json
```

### Upload with progress bar

Show upload progress:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@large-image.jpg" \
  -F "folderName=images" \
  --progress-bar
```

### Silent upload (no output)

Upload without showing progress or response:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@background-task.txt" \
  -s -o /dev/null
```

### Upload with timeout

Set connection and transfer timeouts:

```bash
curl -X POST http://localhost:3000/upload/single \
  -F "file=@document.pdf" \
  --connect-timeout 30 \
  --max-time 300
```

## Batch Testing Script

Create a shell script to test multiple scenarios:

```bash
#!/bin/bash

echo "Testing File Upload Server..."

# Test health check
echo "1. Health check:"
curl -s http://localhost:3000/health | jq .

# Test single upload
echo -e "\n2. Single file upload:"
curl -s -X POST http://localhost:3000/upload/single \
  -F "file=@test.txt" \
  -F "folderName=test-folder" | jq .

# Test multiple upload
echo -e "\n3. Multiple file upload:"
curl -s -X POST http://localhost:3000/upload/multiple \
  -F "files=@file1.txt" \
  -F "files=@file2.txt" \
  -F "folderName=batch-test" | jq .

# Test error case
echo -e "\n4. Error test (invalid file type):"
curl -s -X POST http://localhost:3000/upload/single \
  -F "file=@invalid.exe" | jq .

echo -e "\nTesting complete!"
```

Save as `test-upload.sh`, make executable with `chmod +x test-upload.sh`, and run with `./test-upload.sh`.

## Response Format

All successful uploads return JSON in this format:

**Single file:**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "originalName": "document.pdf",
    "fileName": "custom-name.pdf",
    "path": "uploads/folder/custom-name.pdf",
    "size": 1024000,
    "mimeType": "application/pdf",
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Multiple files:**
```json
{
  "success": true,
  "message": "Successfully uploaded 3 files",
  "files": [
    {
      "originalName": "file1.txt",
      "fileName": "file1.txt",
      "path": "uploads/batch/file1.txt",
      "size": 1024,
      "mimeType": "text/plain",
      "uploadedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": []
  }
}
```