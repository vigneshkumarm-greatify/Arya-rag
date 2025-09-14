/**
 * Document List Component
 * 
 * Displays user's uploaded documents with status, metadata, and actions.
 * Shows processing progress for pending documents.
 * 
 * @author ARYA RAG Team
 */

import React, { useEffect, useState } from 'react';
import { FileText, Trash2, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { documentsApi } from '@/services/api';
import { useUsername } from '@/contexts/UsernameContext';
import { UserDocument, ProcessingStatusResponse } from '@arya-rag/types';
import { cn } from '@/lib/utils';

interface DocumentListProps {
  refreshTrigger?: number;
  onDocumentDeleted?: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  refreshTrigger = 0,
  onDocumentDeleted
}) => {
  const { username } = useUsername();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Map<string, ProcessingStatusResponse>>(new Map());

  // Fetch documents
  const fetchDocuments = async () => {
    if (!username) return;

    try {
      setLoading(true);
      const response = await documentsApi.list(username);
      
      if (response.success && response.data) {
        setDocuments(response.data);
        
        // Start polling for processing documents
        const processingDocs = response.data.filter(
          doc => doc.status === 'pending' || doc.status === 'processing'
        );
        
        processingDocs.forEach(doc => {
          pollDocumentStatus(doc.document_id);
        });
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll document status for processing documents
  const pollDocumentStatus = async (documentId: string) => {
    if (!username) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await documentsApi.getStatus(documentId, username);
        
        if (response.success && response.data) {
          setStatusMap(prev => new Map(prev).set(documentId, response.data));
          
          // Stop polling if completed or failed
          if (response.data.status === 'completed' || response.data.status === 'failed') {
            clearInterval(pollInterval);
            // Refresh document list to get updated metadata
            fetchDocuments();
          }
        }
      } catch (error) {
        console.error('Failed to fetch document status:', error);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    // Clean up on unmount
    return () => clearInterval(pollInterval);
  };

  // Delete document
  const handleDelete = async (documentId: string) => {
    if (!username || deletingId) return;

    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    setDeletingId(documentId);

    try {
      const response = await documentsApi.delete(documentId, username);
      
      if (response.success) {
        // Remove from local state
        setDocuments(prev => prev.filter(doc => doc.document_id !== documentId));
        onDocumentDeleted?.();
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'processing':
        return 'text-blue-600 bg-blue-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [username, refreshTrigger]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No documents uploaded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {documents.map((doc) => {
          const status = statusMap.get(doc.document_id);
          const isProcessing = doc.status === 'pending' || doc.status === 'processing';
          
          return (
            <div
              key={doc.document_id}
              className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <FileText className="w-10 h-10 text-primary flex-shrink-0" />
              
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{doc.title || doc.filename}</h4>
                
                <div className="flex items-center space-x-4 mt-1 text-sm text-muted-foreground">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>•</span>
                  <span>{doc.total_pages} pages</span>
                  <span>•</span>
                  <span>{doc.total_chunks} chunks</span>
                </div>
                
                <div className="flex items-center space-x-2 mt-2">
                  {getStatusIcon(doc.status)}
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    getStatusColor(doc.status)
                  )}>
                    {doc.status === 'failed' && status?.progress?.stage
                      ? `Failed: ${status.progress.stage.replace('failed_', '')}`
                      : doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                  </span>
                  
                  {isProcessing && status?.progress && (
                    <div className="flex items-center space-x-2 flex-1 max-w-xs">
                      <Progress value={status.progress.percentage} className="h-2" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {status.progress.percentage}%
                      </span>
                    </div>
                  )}
                </div>
                
                {status?.progress?.message && (isProcessing || doc.status === 'failed') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {status.progress.message}
                  </p>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  Uploaded {formatDate(doc.uploaded_at)}
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(doc.document_id)}
                disabled={deletingId === doc.document_id}
                className="flex-shrink-0"
              >
                {deletingId === doc.document_id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};