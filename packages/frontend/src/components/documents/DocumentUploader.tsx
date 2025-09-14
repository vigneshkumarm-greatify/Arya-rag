/**
 * Document Uploader Component
 * 
 * Provides drag-and-drop interface for uploading PDF documents.
 * Shows upload progress and handles file validation.
 * 
 * @author ARYA RAG Team
 */

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { documentsApi } from '@/services/api';
import { useUsername } from '@/contexts/UsernameContext';
import { cn } from '@/lib/utils';

interface DocumentUploaderProps {
  onUploadComplete: () => void;
  maxFileSizeMB?: number;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onUploadComplete,
  maxFileSizeMB = 100
}) => {
  const { username } = useUsername();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Handle file drop/selection
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    
    if (acceptedFiles.length === 0) {
      return;
    }

    const file = acceptedFiles[0];
    
    // Validate file size
    if (file.size > maxFileSizeMB * 1024 * 1024) {
      setError(`File size must be less than ${maxFileSizeMB}MB`);
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      return;
    }

    setSelectedFile(file);
  }, [maxFileSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: uploading
  });

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile || !username) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await documentsApi.upload(
        selectedFile,
        username,
        selectedFile.name.replace('.pdf', '')
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.success) {
        // Success - reset state and notify parent
        setTimeout(() => {
          setSelectedFile(null);
          setUploadProgress(0);
          setUploading(false);
          onUploadComplete();
        }, 500);
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (err) {
      setUploading(false);
      setUploadProgress(0);
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  // Clear selected file
  const clearFile = () => {
    setSelectedFile(null);
    setError(null);
    setUploadProgress(0);
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        {!selectedFile ? (
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
              isDragActive 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50",
              uploading && "opacity-50 cursor-not-allowed"
            )}
          >
            <input {...getInputProps()} />
            
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            
            <p className="text-lg font-medium mb-2">
              {isDragActive ? "Drop your PDF here" : "Drag & drop a PDF file here"}
            </p>
            
            <p className="text-sm text-muted-foreground mb-4">
              or click to select a file
            </p>
            
            <p className="text-xs text-muted-foreground">
              Maximum file size: {maxFileSizeMB}MB
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected file info */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center space-x-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Upload button */}
            {!uploading && (
              <Button 
                onClick={handleUpload} 
                className="w-full"
                disabled={!selectedFile || !!error}
              >
                Upload Document
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};