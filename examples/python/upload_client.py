#!/usr/bin/env python3
"""
Python client examples for the File Upload Server
Requires: pip install requests
"""

import requests
import json
import os
from typing import List, Optional, Dict, Any


class FileUploadClient:
    """Client for interacting with the File Upload Server API"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
    
    def health_check(self) -> Dict[str, Any]:
        """Check server health and get configuration info"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Health check failed: {e}")
    
    def upload_single_file(self, 
                          file_path: str, 
                          folder_name: Optional[str] = None,
                          file_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Upload a single file to the server
        
        Args:
            file_path: Path to the file to upload
            folder_name: Optional custom folder name
            file_name: Optional custom filename (without extension)
            
        Returns:
            Server response as dictionary
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Prepare form data
        files = {'file': open(file_path, 'rb')}
        data = {}
        
        if folder_name:
            data['folderName'] = folder_name
        
        if file_name:
            data['fileName'] = file_name
        
        try:
            response = self.session.post(
                f"{self.base_url}/upload/single",
                files=files,
                data=data
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if response.status_code >= 400:
                try:
                    error_data = response.json()
                    raise Exception(f"Upload failed: {error_data.get('error', {}).get('message', str(e))}")
                except json.JSONDecodeError:
                    raise Exception(f"Upload failed: {e}")
            raise Exception(f"Network error: {e}")
        
        finally:
            files['file'].close()
    
    def upload_multiple_files(self,
                             file_paths: List[str],
                             folder_name: Optional[str] = None,
                             file_names: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Upload multiple files to the server
        
        Args:
            file_paths: List of paths to files to upload
            folder_name: Optional custom folder name for all files
            file_names: Optional list of custom filenames (without extensions)
            
        Returns:
            Server response as dictionary
        """
        # Validate file paths
        for file_path in file_paths:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")
        
        # Validate file_names length if provided
        if file_names and len(file_names) != len(file_paths):
            raise ValueError("Number of custom filenames must match number of files")
        
        # Prepare form data
        files = []
        for file_path in file_paths:
            files.append(('files', open(file_path, 'rb')))
        
        data = {}
        if folder_name:
            data['folderName'] = folder_name
        
        if file_names:
            data['fileNames'] = json.dumps(file_names)
        
        try:
            response = self.session.post(
                f"{self.base_url}/upload/multiple",
                files=files,
                data=data
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if hasattr(response, 'status_code') and response.status_code >= 400:
                try:
                    error_data = response.json()
                    raise Exception(f"Upload failed: {error_data.get('error', {}).get('message', str(e))}")
                except json.JSONDecodeError:
                    raise Exception(f"Upload failed: {e}")
            raise Exception(f"Network error: {e}")
        
        finally:
            # Close all file handles
            for _, file_handle in files:
                file_handle.close()


def main():
    """Example usage of the FileUploadClient"""
    client = FileUploadClient()
    
    try:
        # Check server health
        print("Checking server health...")
        health = client.health_check()
        print(f"Server status: {health['status']}")
        print(f"Max file size: {health['config']['maxFileSize']} bytes")
        print(f"Max files: {health['config']['maxFiles']}")
        print()
        
        # Example 1: Single file upload
        print("Example 1: Single file upload")
        try:
            # Create a test file if it doesn't exist
            test_file = "test_upload.txt"
            if not os.path.exists(test_file):
                with open(test_file, 'w') as f:
                    f.write("This is a test file for upload demonstration.")
            
            result = client.upload_single_file(
                file_path=test_file,
                folder_name="python-examples",
                file_name="single-upload-test"
            )
            
            print(f"✅ Upload successful!")
            print(f"   Original name: {result['file']['originalName']}")
            print(f"   Final path: {result['file']['path']}")
            print(f"   File size: {result['file']['size']} bytes")
            print()
            
        except Exception as e:
            print(f"❌ Single upload failed: {e}")
            print()
        
        # Example 2: Multiple file upload
        print("Example 2: Multiple file upload")
        try:
            # Create test files
            test_files = []
            for i in range(3):
                filename = f"test_file_{i+1}.txt"
                with open(filename, 'w') as f:
                    f.write(f"This is test file number {i+1}")
                test_files.append(filename)
            
            custom_names = ["first-file", "second-file", "third-file"]
            
            result = client.upload_multiple_files(
                file_paths=test_files,
                folder_name="python-batch",
                file_names=custom_names
            )
            
            print(f"✅ Batch upload successful!")
            print(f"   Uploaded {len(result['files'])} files:")
            for file_info in result['files']:
                print(f"   - {file_info['originalName']} → {file_info['path']}")
            print()
            
            # Clean up test files
            for filename in test_files:
                if os.path.exists(filename):
                    os.remove(filename)
                    
        except Exception as e:
            print(f"❌ Multiple upload failed: {e}")
            print()
        
        # Example 3: Error handling
        print("Example 3: Error handling (invalid file type)")
        try:
            # Try to upload a file with invalid extension
            invalid_file = "test.exe"
            with open(invalid_file, 'w') as f:
                f.write("This should fail")
            
            result = client.upload_single_file(invalid_file)
            print("❌ This should not succeed!")
            
        except Exception as e:
            print(f"✅ Expected error caught: {e}")
            if os.path.exists(invalid_file):
                os.remove(invalid_file)
            print()
        
    except Exception as e:
        print(f"❌ Client error: {e}")


class ProgressUploadClient(FileUploadClient):
    """Extended client with upload progress tracking"""
    
    def upload_with_progress(self, file_path: str, **kwargs):
        """Upload file with progress callback"""
        import time
        
        file_size = os.path.getsize(file_path)
        print(f"Uploading {os.path.basename(file_path)} ({file_size} bytes)...")
        
        # Simulate progress tracking (requests doesn't have built-in progress)
        start_time = time.time()
        
        try:
            result = self.upload_single_file(file_path, **kwargs)
            
            end_time = time.time()
            duration = end_time - start_time
            speed = file_size / duration if duration > 0 else 0
            
            print(f"✅ Upload completed in {duration:.2f}s ({speed:.0f} bytes/s)")
            return result
            
        except Exception as e:
            print(f"❌ Upload failed: {e}")
            raise


if __name__ == "__main__":
    main()