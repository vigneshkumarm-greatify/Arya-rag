/**
 * Supabase Storage Service
 * 
 * Handles file upload, download, and management operations with Supabase Storage.
 * Provides secure file storage for PDF documents with proper access controls.
 * 
 * @author ARYA RAG Team
 */

import { DatabaseClient } from '../../config/database.js';
import { createHash } from 'crypto';

export interface FileUploadResult {
  success: boolean;
  filePath?: string;
  fileUrl?: string;
  error?: string;
}

export interface FileDownloadResult {
  success: boolean;
  buffer?: Buffer;
  metadata?: {
    size: number;
    mimeType: string;
    lastModified: Date;
  };
  error?: string;
}

/**
 * Storage Service for handling file operations with Supabase Storage
 */
export class StorageService {
  private static instance: StorageService;
  private bucketName = 'documents';

  private constructor() {}

  /**
   * Get singleton instance of StorageService
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Upload a file to Supabase Storage
   * 
   * @param fileBuffer - File content as buffer
   * @param fileName - Original filename
   * @param userId - User ID for path organization
   * @param mimeType - File MIME type
   * @returns Upload result with file path and URL
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    userId: string,
    mimeType: string = 'application/pdf'
  ): Promise<FileUploadResult> {
    try {
      const dbClient = DatabaseClient.getInstance();
      const supabase = dbClient.getClient();

      // Generate unique file path
      const fileHash = createHash('md5').update(fileBuffer).digest('hex');
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${userId}/${timestamp}_${fileHash}_${sanitizedFileName}`;

      console.log(`📤 Uploading file to Supabase Storage: ${filePath}`);

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          duplex: 'half'
        });

      if (error) {
        console.error('❌ File upload failed:', error);
        return {
          success: false,
          error: `File upload failed: ${error.message}`
        };
      }

      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      console.log(`✅ File uploaded successfully: ${filePath}`);

      return {
        success: true,
        filePath: data.path,
        fileUrl: urlData.publicUrl
      };

    } catch (error) {
      console.error('💥 Storage upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }

  /**
   * Download a file from Supabase Storage
   * 
   * @param filePath - Path to the file in storage
   * @returns Download result with file buffer and metadata
   */
  async downloadFile(filePath: string): Promise<FileDownloadResult> {
    try {
      const dbClient = DatabaseClient.getInstance();
      const supabase = dbClient.getClient();

      console.log(`📥 Downloading file from Supabase Storage: ${filePath}`);

      // Download file from Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .download(filePath);

      if (error) {
        console.error('❌ File download failed:', error);
        return {
          success: false,
          error: `File download failed: ${error.message}`
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'No file data received'
        };
      }

      // Convert blob to buffer
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`✅ File downloaded successfully: ${filePath} (${buffer.length} bytes)`);

      return {
        success: true,
        buffer,
        metadata: {
          size: buffer.length,
          mimeType: data.type || 'application/pdf',
          lastModified: new Date() // Supabase doesn't provide last modified in download
        }
      };

    } catch (error) {
      console.error('💥 Storage download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }

  /**
   * Delete a file from Supabase Storage
   * 
   * @param filePath - Path to the file in storage
   * @returns Success status
   */
  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const dbClient = DatabaseClient.getInstance();
      const supabase = dbClient.getClient();

      console.log(`🗑️ Deleting file from Supabase Storage: ${filePath}`);

      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        console.error('❌ File deletion failed:', error);
        return {
          success: false,
          error: `File deletion failed: ${error.message}`
        };
      }

      console.log(`✅ File deleted successfully: ${filePath}`);
      return { success: true };

    } catch (error) {
      console.error('💥 Storage deletion error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }

  /**
   * Get file metadata without downloading
   * 
   * @param filePath - Path to the file in storage
   * @returns File metadata
   */
  async getFileMetadata(filePath: string): Promise<{
    success: boolean;
    metadata?: {
      name: string;
      size: number;
      lastModified: Date;
      mimeType: string;
    };
    error?: string;
  }> {
    try {
      const dbClient = DatabaseClient.getInstance();
      const supabase = dbClient.getClient();

      // List files to get metadata
      const pathParts = filePath.split('/');
      const folder = pathParts.slice(0, -1).join('/');
      const fileName = pathParts[pathParts.length - 1];

      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list(folder, {
          limit: 100,
          search: fileName
        });

      if (error) {
        return {
          success: false,
          error: `Failed to get file metadata: ${error.message}`
        };
      }

      const fileInfo = data?.find(file => file.name === fileName);
      if (!fileInfo) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      return {
        success: true,
        metadata: {
          name: fileInfo.name,
          size: fileInfo.metadata?.size || 0,
          lastModified: new Date(fileInfo.updated_at || fileInfo.created_at),
          mimeType: fileInfo.metadata?.mimetype || 'application/pdf'
        }
      };

    } catch (error) {
      console.error('💥 Storage metadata error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }

  /**
   * List files for a user
   * 
   * @param userId - User ID to list files for
   * @param limit - Maximum number of files to return
   * @returns List of file paths and metadata
   */
  async listUserFiles(userId: string, limit: number = 100): Promise<{
    success: boolean;
    files?: Array<{
      path: string;
      name: string;
      size: number;
      lastModified: Date;
    }>;
    error?: string;
  }> {
    try {
      const dbClient = DatabaseClient.getInstance();
      const supabase = dbClient.getClient();

      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list(userId, {
          limit,
          sortBy: { column: 'updated_at', order: 'desc' }
        });

      if (error) {
        return {
          success: false,
          error: `Failed to list files: ${error.message}`
        };
      }

      const files = data?.map(file => ({
        path: `${userId}/${file.name}`,
        name: file.name,
        size: file.metadata?.size || 0,
        lastModified: new Date(file.updated_at || file.created_at)
      })) || [];

      return {
        success: true,
        files
      };

    } catch (error) {
      console.error('💥 Storage list error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }
}

export default StorageService;