/**
 * JavaScript example for multiple file upload
 * Works in both browser and Node.js environments
 */

// Browser example using fetch API
async function uploadMultipleFilesBrowser(files, folderName = null, fileNames = null) {
    const formData = new FormData();
    
    // Add all files to form data
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    if (folderName) {
        formData.append('folderName', folderName);
    }
    
    if (fileNames && fileNames.length > 0) {
        // Add custom filenames as JSON array
        formData.append('fileNames', JSON.stringify(fileNames));
    }
    
    try {
        const response = await fetch('http://localhost:3000/upload/multiple', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Upload successful:', result.files);
            return result.files;
        } else {
            console.error('Upload failed:', result.error);
            throw new Error(result.error.message);
        }
    } catch (error) {
        console.error('Network error:', error);
        throw error;
    }
}

// Node.js example using form-data
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch'); // npm install node-fetch

async function uploadMultipleFilesNode(filePaths, folderName = null, fileNames = null) {
    const form = new FormData();
    
    // Add all files to form data
    for (const filePath of filePaths) {
        form.append('files', fs.createReadStream(filePath));
    }
    
    if (folderName) {
        form.append('folderName', folderName);
    }
    
    if (fileNames && fileNames.length > 0) {
        form.append('fileNames', JSON.stringify(fileNames));
    }
    
    try {
        const response = await fetch('http://localhost:3000/upload/multiple', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Upload successful:', result.files);
            return result.files;
        } else {
            console.error('Upload failed:', result.error);
            throw new Error(result.error.message);
        }
    } catch (error) {
        console.error('Network error:', error);
        throw error;
    }
}

// HTML form example
function createMultipleUploadForm() {
    return `
    <form id="multipleUploadForm" enctype="multipart/form-data">
        <div>
            <label for="files">Select files:</label>
            <input type="file" id="files" name="files" multiple required>
        </div>
        
        <div>
            <label for="folderName">Folder name (optional):</label>
            <input type="text" id="folderName" name="folderName" placeholder="my-folder">
        </div>
        
        <div>
            <label for="fileNames">Custom filenames (optional, comma-separated):</label>
            <input type="text" id="fileNames" name="fileNames" placeholder="file1,file2,file3">
            <small>Leave empty to keep original names</small>
        </div>
        
        <button type="submit">Upload Files</button>
    </form>
    
    <div id="uploadProgress" style="display: none;">
        <p>Uploading files...</p>
        <div id="progressBar" style="width: 100%; background-color: #f0f0f0;">
            <div id="progressFill" style="width: 0%; height: 20px; background-color: #4CAF50;"></div>
        </div>
    </div>
    
    <script>
        document.getElementById('multipleUploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const filesInput = document.getElementById('files');
            const folderName = document.getElementById('folderName').value;
            const fileNamesInput = document.getElementById('fileNames').value;
            
            if (filesInput.files.length === 0) {
                alert('Please select at least one file');
                return;
            }
            
            // Parse custom filenames
            let fileNames = null;
            if (fileNamesInput.trim()) {
                fileNames = fileNamesInput.split(',').map(name => name.trim());
                if (fileNames.length !== filesInput.files.length) {
                    alert('Number of custom filenames must match number of selected files');
                    return;
                }
            }
            
            // Show progress
            document.getElementById('uploadProgress').style.display = 'block';
            document.getElementById('progressFill').style.width = '50%';
            
            try {
                const result = await uploadMultipleFilesBrowser(
                    Array.from(filesInput.files),
                    folderName || null,
                    fileNames
                );
                
                document.getElementById('progressFill').style.width = '100%';
                
                const fileList = result.map(file => file.path).join('\\n');
                alert(\`Upload successful! Files saved to:\\n\${fileList}\`);
                
            } catch (error) {
                alert('Upload failed: ' + error.message);
            } finally {
                document.getElementById('uploadProgress').style.display = 'none';
                document.getElementById('progressFill').style.width = '0%';
            }
        });
    </script>
    `;
}

// Advanced example with progress tracking and error handling
async function uploadMultipleFilesWithProgress(files, folderName = null, fileNames = null, onProgress = null) {
    const formData = new FormData();
    
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    if (folderName) {
        formData.append('folderName', folderName);
    }
    
    if (fileNames && fileNames.length > 0) {
        formData.append('fileNames', JSON.stringify(fileNames));
    }
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const percentComplete = (e.loaded / e.total) * 100;
                onProgress(percentComplete);
            }
        });
        
        xhr.addEventListener('load', () => {
            try {
                const result = JSON.parse(xhr.responseText);
                if (result.success) {
                    resolve(result.files);
                } else {
                    reject(new Error(result.error.message));
                }
            } catch (error) {
                reject(new Error('Invalid response from server'));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Network error occurred'));
        });
        
        xhr.open('POST', 'http://localhost:3000/upload/multiple');
        xhr.send(formData);
    });
}

// Usage examples
if (typeof window !== 'undefined') {
    // Browser environment
    console.log('Browser environment detected');
    
    // Example: Upload multiple files with progress
    // const fileInput = document.querySelector('input[type="file"][multiple]');
    // fileInput.addEventListener('change', async (e) => {
    //     if (e.target.files.length > 0) {
    //         await uploadMultipleFilesWithProgress(
    //             Array.from(e.target.files),
    //             'batch-upload',
    //             null,
    //             (progress) => console.log(\`Upload progress: \${progress.toFixed(1)}%\`)
    //         );
    //     }
    // });
    
} else {
    // Node.js environment
    console.log('Node.js environment detected');
    
    // Example usage
    // const filePaths = ['./file1.jpg', './file2.pdf', './file3.txt'];
    // const customNames = ['image', 'document', 'notes'];
    // 
    // uploadMultipleFilesNode(filePaths, 'my-batch', customNames)
    //     .then(results => {
    //         console.log('All files uploaded successfully:');
    //         results.forEach(file => console.log(\`- \${file.path}\`));
    //     })
    //     .catch(error => console.error('Batch upload failed:', error));
}

module.exports = {
    uploadMultipleFilesBrowser,
    uploadMultipleFilesNode,
    uploadMultipleFilesWithProgress,
    createMultipleUploadForm
};