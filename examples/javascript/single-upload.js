/**
 * JavaScript example for single file upload
 * Works in both browser and Node.js environments
 */

// Browser example using fetch API
async function uploadSingleFileBrowser(file, folderName = null, fileName = null) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (folderName) {
        formData.append('folderName', folderName);
    }
    
    if (fileName) {
        formData.append('fileName', fileName);
    }
    
    try {
        const response = await fetch('http://localhost:3000/upload/single', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Upload successful:', result.file);
            return result.file;
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

async function uploadSingleFileNode(filePath, folderName = null, fileName = null) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    if (folderName) {
        form.append('folderName', folderName);
    }
    
    if (fileName) {
        form.append('fileName', fileName);
    }
    
    try {
        const response = await fetch('http://localhost:3000/upload/single', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Upload successful:', result.file);
            return result.file;
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
function createSingleUploadForm() {
    return `
    <form id="singleUploadForm" enctype="multipart/form-data">
        <div>
            <label for="file">Select file:</label>
            <input type="file" id="file" name="file" required>
        </div>
        
        <div>
            <label for="folderName">Folder name (optional):</label>
            <input type="text" id="folderName" name="folderName" placeholder="my-folder">
        </div>
        
        <div>
            <label for="fileName">Custom filename (optional):</label>
            <input type="text" id="fileName" name="fileName" placeholder="custom-name">
        </div>
        
        <button type="submit">Upload File</button>
    </form>
    
    <script>
        document.getElementById('singleUploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('file');
            const folderName = document.getElementById('folderName').value;
            const fileName = document.getElementById('fileName').value;
            
            if (fileInput.files.length === 0) {
                alert('Please select a file');
                return;
            }
            
            try {
                const result = await uploadSingleFileBrowser(
                    fileInput.files[0],
                    folderName || null,
                    fileName || null
                );
                alert('Upload successful! File saved to: ' + result.path);
            } catch (error) {
                alert('Upload failed: ' + error.message);
            }
        });
    </script>
    `;
}

// Usage examples
if (typeof window !== 'undefined') {
    // Browser environment
    console.log('Browser environment detected');
    
    // Example: Upload file when user selects it
    // const fileInput = document.querySelector('input[type="file"]');
    // fileInput.addEventListener('change', async (e) => {
    //     if (e.target.files.length > 0) {
    //         await uploadSingleFileBrowser(e.target.files[0], 'photos', 'my-photo');
    //     }
    // });
    
} else {
    // Node.js environment
    console.log('Node.js environment detected');
    
    // Example usage
    // uploadSingleFileNode('./test-file.jpg', 'photos', 'my-photo')
    //     .then(result => console.log('Success:', result))
    //     .catch(error => console.error('Error:', error));
}

module.exports = {
    uploadSingleFileBrowser,
    uploadSingleFileNode,
    createSingleUploadForm
};