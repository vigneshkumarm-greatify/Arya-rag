/**
 * API Service Layer for ARYA-RAG Frontend
 * 
 * Handles all communication with the backend API endpoints.
 * Provides type-safe methods for document management and RAG queries.
 * 
 * @author ARYA RAG Team
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  ApiResponse,
  UserDocument,
  DocumentUploadResponse,
  ProcessingStatusResponse,
  RAGResponse,
  UserQuery
} from '@arya-rag/types';

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding authentication or other headers
apiClient.interceptors.request.use(
  (config) => {
    // Add any auth tokens or custom headers here
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle common errors
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          console.error('Unauthorized access');
          break;
        case 413:
          console.error('File too large');
          break;
        case 429:
          console.error('Too many requests');
          break;
        case 500:
          console.error('Server error');
          break;
      }
    }
    
    return Promise.reject(error);
  }
);

/**
 * Document Management API Methods
 */
export const documentsApi = {
  /**
   * Upload a PDF document for processing
   * @param file - PDF file to upload
   * @param userId - User identifier
   * @param title - Optional document title
   * @param description - Optional document description
   */
  async upload(
    file: File,
    userId: string,
    title?: string,
    description?: string
  ): Promise<ApiResponse<DocumentUploadResponse>> {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('userId', userId);
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);

    const response = await apiClient.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },

  /**
   * Get list of user's documents
   * @param userId - User identifier
   * @param params - Query parameters for filtering and pagination
   */
  async list(
    userId: string,
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }
  ): Promise<ApiResponse<UserDocument[]>> {
    const response = await apiClient.get('/documents', {
      params: {
        userId,
        ...params,
      },
    });
    
    return response.data;
  },

  /**
   * Get document processing status
   * @param documentId - Document identifier
   * @param userId - User identifier
   */
  async getStatus(
    documentId: string,
    userId: string
  ): Promise<ApiResponse<ProcessingStatusResponse>> {
    const response = await apiClient.get(`/documents/${documentId}/status`, {
      params: { userId },
    });
    
    return response.data;
  },

  /**
   * Delete a document and its chunks
   * @param documentId - Document identifier
   * @param userId - User identifier
   */
  async delete(
    documentId: string,
    userId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    const response = await apiClient.delete(`/documents/${documentId}`, {
      params: { userId },
    });
    
    return response.data;
  },

  /**
   * Get document details
   * @param documentId - Document identifier
   * @param userId - User identifier
   */
  async getDetails(
    documentId: string,
    userId: string
  ): Promise<ApiResponse<UserDocument>> {
    const response = await apiClient.get(`/documents/${documentId}`, {
      params: { userId },
    });
    
    return response.data;
  },
};

/**
 * RAG Query API Methods
 */
export const queriesApi = {
  /**
   * Process a RAG query
   * @param query - Question text
   * @param userId - User identifier
   * @param options - Query options
   */
  async process(
    query: string,
    userId: string,
    options?: {
      documentIds?: string[];
      maxResults?: number;
      responseStyle?: 'detailed' | 'concise';
    }
  ): Promise<ApiResponse<RAGResponse>> {
    const response = await apiClient.post('/queries/process', {
      query,
      userId,
      ...options,
    });
    
    return response.data;
  },

  /**
   * Get query history
   * @param userId - User identifier
   * @param params - Query parameters for filtering and pagination
   */
  async getHistory(
    userId: string,
    params?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<ApiResponse<UserQuery[]>> {
    const response = await apiClient.get('/queries/history', {
      params: {
        userId,
        ...params,
      },
    });
    
    return response.data;
  },

  /**
   * Get query analytics
   * @param userId - User identifier
   * @param timeframe - Analytics timeframe (7d, 30d, 90d)
   */
  async getAnalytics(
    userId: string,
    timeframe: '7d' | '30d' | '90d' = '7d'
  ): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/queries/analytics/summary', {
      params: {
        userId,
        timeframe,
      },
    });
    
    return response.data;
  },
};

/**
 * System API Methods
 */
export const systemApi = {
  /**
   * Check system health
   */
  async health(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/system/health');
    return response.data;
  },

  /**
   * Test RAG pipeline connectivity
   */
  async testConnectivity(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/queries/test/connectivity');
    return response.data;
  },
};

// Export the API client for custom requests
export { apiClient };