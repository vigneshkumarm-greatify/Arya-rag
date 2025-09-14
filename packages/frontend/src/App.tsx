/**
 * ARYA-RAG Main Application Component
 * 
 * Main app component that provides document management and RAG-based Q&A interface.
 * Manages username state and document uploads with integrated chat.
 * 
 * @author ARYA RAG Team
 */

import React, { useState } from 'react';
import { UsernameProvider, useUsername } from './contexts/UsernameContext';
import { UsernameInput } from './components/username/UsernameInput';
import { DocumentUploader } from './components/documents/DocumentUploader';
import { DocumentList } from './components/documents/DocumentList';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import AIchat from './views/AIChat/AIchat';
import { 
  ChatBubbleLeftIcon,
  DocumentIcon,
  ServerIcon,
  CheckCircleIcon,
  BoltIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';

// Main App Content Component
function AppContent() {
  const { username, isUsernameSet } = useUsername();
  const [showChat, setShowChat] = useState(false);
  const [refreshDocuments, setRefreshDocuments] = useState(0);

  // Handle document upload completion
  const handleUploadComplete = () => {
    setRefreshDocuments(prev => prev + 1);
  };

  // Handle document deletion
  const handleDocumentDeleted = () => {
    setRefreshDocuments(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-GreatifyNeutral-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white border-b border-GreatifyNeutral-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-GreatifyGreen-600 rounded-lg flex items-center justify-center">
                <ChatBubbleLeftIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-GreatifyNeutral-900">
                  ARYA RAG
                </h1>
                <p className="text-sm text-GreatifyNeutral-500 flex items-center gap-2">
                  <BoltIcon className="w-4 h-4" />
                  Document Q&A with Accurate Citations
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-GreatifyNeutral-900">
                    RAG System Ready
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-GreatifyGreen-100 text-GreatifyGreen-800">
                    POC v0.1.0
                  </span>
                  <span className="text-xs text-GreatifyNeutral-500">
                    Development Environment
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="py-6 px-6">
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Document Management */}
            <div className="lg:col-span-2 space-y-6">
              {/* Username Section */}
              {!isUsernameSet && (
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome to ARYA RAG</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-GreatifyNeutral-600 mb-4">
                      Please enter a username to get started. This will be used to manage your documents.
                    </p>
                    <UsernameInput />
                  </CardContent>
                </Card>
              )}

              {isUsernameSet && (
                <>
                  {/* User Info */}
                  <UsernameInput />

                  {/* Document Upload */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Upload Documents</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-GreatifyNeutral-600 mb-4">
                        Upload PDF documents to create your knowledge base. Each document will be processed
                        and indexed for accurate Q&A with page-level citations.
                      </p>
                      <DocumentUploader onUploadComplete={handleUploadComplete} />
                    </CardContent>
                  </Card>

                  {/* Document List */}
                  <DocumentList 
                    refreshTrigger={refreshDocuments}
                    onDocumentDeleted={handleDocumentDeleted}
                  />
                </>
              )}
            </div>

            {/* Right Column - System Status & Launch */}
            <div className="space-y-6">
              {/* System Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">System Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                      How ARYA RAG Works
                    </h4>
                    <div className="space-y-3 text-sm text-GreatifyNeutral-600">
                      <div className="flex items-start gap-2">
                        <DocumentIcon className="w-4 h-4 mt-0.5 text-GreatifyGreen-600" />
                        <div>
                          <p className="font-medium text-GreatifyNeutral-900">Upload PDFs</p>
                          <p>Support for documents up to 100MB, processed with page preservation</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2">
                        <ServerIcon className="w-4 h-4 mt-0.5 text-GreatifyGreen-600" />
                        <div>
                          <p className="font-medium text-GreatifyNeutral-900">Smart Processing</p>
                          <p>Documents are chunked and embedded while preserving page boundaries</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2">
                        <ChatBubbleLeftIcon className="w-4 h-4 mt-0.5 text-GreatifyGreen-600" />
                        <div>
                          <p className="font-medium text-GreatifyNeutral-900">Ask Questions</p>
                          <p>Get accurate answers with document name and page number citations</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div className="pt-4 border-t border-GreatifyNeutral-100">
                    <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                      Key Capabilities
                    </h4>
                    <ul className="space-y-1 text-sm text-GreatifyNeutral-600">
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-GreatifyGreen-600" />
                        <span>Handle 5-8 documents per user</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-GreatifyGreen-600" />
                        <span>Up to 1000 pages per document</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-GreatifyGreen-600" />
                        <span>Accurate page-level citations</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-GreatifyGreen-600" />
                        <span>Multi-document search</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Launch Chat Button */}
              {isUsernameSet && (
                <Card>
                  <CardContent className="pt-6">
                    <Button
                      onClick={() => setShowChat(true)}
                      className="w-full greenGradient text-white"
                      size="lg"
                    >
                      <ChatBubbleLeftIcon className="w-5 h-5 mr-2" />
                      Launch Q&A Assistant
                    </Button>
                    
                    <p className="text-xs text-center text-GreatifyNeutral-500 mt-3">
                      Ask questions about your uploaded documents
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Platform Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <DocumentIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Smart Document Processing
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Intelligent chunking with page boundary preservation
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BoltIcon className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Vector Search
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Semantic search across thousands of pages
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ChatBubbleLeftIcon className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          RAG-Powered Q&A
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Accurate answers with source citations
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ArrowsPointingOutIcon className="w-4 h-4 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Flexible Interface
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Draggable chat window for convenience
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-GreatifyNeutral-100">
                    <div className="text-center">
                      <p className="text-xs text-GreatifyNeutral-500">
                        Powered by ARYA RAG
                      </p>
                      <p className="text-xs text-GreatifyNeutral-400 mt-1">
                        Enterprise-grade document Q&A
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Component */}
      {showChat && (
        <AIchat
          onClose={() => setShowChat(false)}
          chatContext="general"
          username={username}
        />
      )}
    </div>
  );
}

// Main App Component with Providers
function App() {
  return (
    <UsernameProvider>
      <AppContent />
    </UsernameProvider>
  );
}

export default App;