import { useState, useEffect } from "react";
import AIchat from "./views/AIChat/AIchat";
import {
  ChatBubbleLeftIcon,
  DocumentIcon,
  GlobeAltIcon,
  ServerIcon,
  ClockIcon,
  ShieldCheckIcon,
  MicrophoneIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
  CheckCircleIcon,
  CogIcon,
  InformationCircleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { SourceItem } from "./views/AIChat/types";
import DynamicContent from "./views/AIChat/components/DynamicContent";

function App() {
  const [showChat, setShowChat] = useState(false);
  const [chatContext, setChatContext] = useState<
    "limited" | "general" | "liveexam"
  >("general");
  
  // State for PDF extraction
  const [pdfContent, setPdfContent] = useState<{
    text: string;
    filename: string;
    pageCount: number;
    extractedAt: number;
  } | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  
  // Fixed sources: 1 website + 1 text content + 1 locked PDF
  const [sources, setSources] = useState<SourceItem[]>([
    {
      type: "website",
      content: "",
      metadata: {
        title: "Website Source",
        url: "https://www.greatify.ai/",
      },
    },
    {
      type: "document",
      content: "Arya Chatbot is an advanced AI assistant developed by Greatify. It supports voice messages, real-time communication, and context-aware responses. The chatbot can operate in different modes including general assistance, limited context mode, and specialized exam guidance.",
      metadata: {
        title: "Text Content",
      },
    },
    {
      type: "pdf",
      content: "",
      metadata: {
        title: "PDF Document",
        filename: "document.pdf",
        page: 1,
      },
    },
  ]);

  // Functions to update fixed sources
  const updateSource = (index: number, updates: Partial<SourceItem>) => {
    setSources(sources.map((source, i) => 
      i === index ? { ...source, ...updates } : source
    ));
  };

  const updateSourceMetadata = (index: number, metadata: Partial<SourceItem['metadata']>) => {
    setSources(sources.map((source, i) => 
      i === index ? { 
        ...source, 
        metadata: { ...source.metadata, ...metadata } 
      } : source
    ));
  };

  // PDF upload handler function
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      return;
    }

    // Start extraction process
    setIsExtractingPdf(true);

    try {
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Call backend API to extract PDF content
      const response = await fetch('http://localhost:3001/api/extract-pdf', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Store extracted content in state
        const extractedData = {
          text: result.data.text,
          filename: result.data.metadata.filename,
          pageCount: result.data.pageCount,
          extractedAt: Date.now()
        };
        
        setPdfContent(extractedData);
        
        // Store in localStorage for persistence
        localStorage.setItem('pdfExtraction', JSON.stringify(extractedData));
        
        // Update the PDF source with extracted content using setSources directly
        setSources(prevSources => 
          prevSources.map((source, index) => 
            index === 2 ? {
              ...source,
              content: result.data.text || '', // Ensure we have the text content
              metadata: {
                ...source.metadata,
                title: result.data.metadata.filename,
                filename: result.data.metadata.filename,
                pageCount: result.data.pageCount
              }
            } : source
          )
        );
      } else {
        alert(`Failed to extract PDF: ${result.error}`);
      }
    } catch (error) {
      console.error('PDF extraction error:', error);
      alert('Failed to extract PDF content. Please try again.');
    } finally {
      setIsExtractingPdf(false);
    }
  };

  // Clear PDF content function
  const clearPdfContent = () => {
    setPdfContent(null);
    localStorage.removeItem('pdfExtraction');
    
    // Clear PDF source content using setSources directly
    setSources(prevSources => 
      prevSources.map((source, index) => 
        index === 2 ? {
          ...source,
          content: '', // Clear content
          metadata: {
            ...source.metadata,
            title: 'PDF Document',
            filename: 'document.pdf'
          }
        } : source
      )
    );
  };

  // Load PDF content from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem('pdfExtraction');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        console.log('Loading PDF from localStorage:', data); // Debug log
        setPdfContent(data);
        
        // Update sources state directly to ensure it's applied
        setSources(prevSources => 
          prevSources.map((source, index) => 
            index === 2 ? {
              ...source,
              content: data.text || '', // Ensure we have the text content
              metadata: {
                ...source.metadata,
                title: data.filename,
                filename: data.filename,
                pageCount: data.pageCount
              }
            } : source
          )
        );
      } catch (error) {
        console.error('Failed to load stored PDF content:', error);
      }
    }
  }, []); // Only run once on mount

  // Demo exam data - centralized question content
  const demoExam = {
    examId: "demo-exam",
    questionId: "demo-question", 
    title: "Python Challenge — Spiral Matrix",
    subject: "Computer Science",
    timeRemaining: 3600,
    duration: "60 minutes",
    question: "$editorvalue <div> <h1>Python Challenge — Spiral Matrix</h1><br><strong>Question:</strong><br> Write a function <code>spiral_matrix(n)</code> that returns an <code>n x n</code> matrix filled with the numbers from <code>1</code> to <code>n^2</code> in spiral order (clockwise).<br><br> <strong>Example Input:</strong><br><code>n = 3</code><br><br><strong>Example Output:</strong><br><code>[<br>&nbsp;&nbsp;[1, 2, 3],<br>&nbsp;&nbsp;[8, 9, 4],<br>&nbsp;&nbsp;[7, 6, 5]<br>]</code><br><br><strong>Requirements:</strong><br>1. No external libraries allowed.<br>2. The function should work for any <code>n &gt;= 1</code>.<br>3. Your solution should aim for <code>O(n^2)</code> time complexity.<br> </div>",
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
                  Arya Chatbot
                </h1>
                <p className="text-sm text-GreatifyNeutral-500 flex items-center gap-2">
                  <BoltIcon className="w-4 h-4" />
                  Enterprise AI Assistant Platform
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-GreatifyNeutral-900">
                    Production Ready
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-GreatifyGreen-100 text-GreatifyGreen-800">
                    v1.2.0
                  </span>
                  <span className="text-xs text-GreatifyNeutral-500">
                    Demo Environment
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="py-6">
          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Configuration */}
            <div className="lg:col-span-3 space-y-6">
              {/* Mode Selection */}
              <div className="bg-white border border-GreatifyNeutral-200 rounded-lg">
                <div className="px-4 py-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-medium text-GreatifyNeutral-900">
                      Select Assistant Mode
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Limited Context Card */}
                    <div
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all hover:shadow-sm ${
                        chatContext === "limited"
                          ? "border-GreatifyGreen-500 bg-GreatifyGreen-50 ring-1 ring-GreatifyGreen-500"
                          : "border-GreatifyNeutral-200 hover:border-GreatifyGreen-300"
                      }`}
                      onClick={() => setChatContext("limited")}
                    >
                      <div className="flex w-full h-full justify-center flex-col items-center text-center">
                        <h3 className="text-base font-medium text-GreatifyNeutral-900 mb-1">
                          Limited Context
                        </h3>
                        <p className="text-sm text-GreatifyNeutral-500">
                          Source-only responses
                        </p>
                      </div>
                    </div>

                    {/* General Assistant Card */}
                    <div
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all hover:shadow-sm ${
                        chatContext === "general"
                          ? "border-GreatifyGreen-500 bg-GreatifyGreen-50 ring-1 ring-GreatifyGreen-500"
                          : "border-GreatifyNeutral-200 hover:border-GreatifyGreen-300"
                      }`}
                      onClick={() => setChatContext("general")}
                    >
                      <div className="flex h-full w-full flex-col items-center text-center justify-center">
                        <h3 className="text-base font-medium text-GreatifyNeutral-900 mb-1">
                          General Assistant
                        </h3>
                        <p className="text-sm text-GreatifyNeutral-500">
                          Full AI + Sources
                        </p>
                      </div>
                    </div>

                    {/* Live Exam Card */}
                    <div
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all hover:shadow-sm ${
                        chatContext === "liveexam"
                          ? "border-GreatifyGreen-500 bg-GreatifyGreen-50 ring-1 ring-GreatifyGreen-500"
                          : "border-GreatifyNeutral-200 hover:border-GreatifyGreen-300"
                      }`}
                      onClick={() => setChatContext("liveexam")}
                    >
                      <div className="flex w-full h-full justify-center flex-col items-center text-center">
                        <h3 className="text-base font-medium text-GreatifyNeutral-900 mb-1">
                          Live Exam
                        </h3>
                        <p className="text-sm text-GreatifyNeutral-500">
                          Educational guidance
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capabilities Cards */}
              <div className="bg-white border border-GreatifyNeutral-200 rounded-lg p-6">
                {/* Mode Overview */}

                <div className="mb-6">
                  {chatContext === "limited" && (
                    <div>
                      <h3 className="text-lg font-semibold text-GreatifyNeutral-900">
                        Limited Context Mode
                      </h3>
                      <p className="text-sm text-GreatifyNeutral-600">
                        Uses only provided sources and documents for responses
                      </p>
                    </div>
                  )}

                  {chatContext === "general" && (
                    <div>
                      <h3 className="text-lg font-semibold text-GreatifyNeutral-900">
                        General Assistant Mode
                      </h3>
                      <p className="text-sm text-GreatifyNeutral-600">
                        Combines AI knowledge with provided context sources
                      </p>
                    </div>
                  )}

                  {chatContext === "liveexam" && (
                    <div>
                      <h3 className="text-lg font-semibold text-GreatifyNeutral-900">
                        Live Exam Mode
                      </h3>
                      <p className="text-sm text-GreatifyNeutral-600">
                        Educational guidance with hints and academic integrity
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chatContext === "limited" && (
                    <>
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Text Content Analysis
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Uses your custom text content as knowledge sources for
                          context-aware responses.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Web Scraping
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Automatically extracts content from websites you
                          provide to use as knowledge sources.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Controlled Scope
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Ensures responses stay within provided sources for
                          compliance and control.
                        </p>
                      </div>
                    </>
                  )}

                  {chatContext === "general" && (
                    <>
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Full AI Knowledge
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Access to complete AI training data for comprehensive
                          answers on any topic.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Smart Web Scraping
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Intelligently crawls websites, finds relevant pages,
                          and extracts structured content.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Multi-Source Integration
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Combines data from multiple APIs, documents, and
                          websites into unified responses.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Comprehensive Analysis
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Provides detailed, well-researched responses using
                          both AI knowledge and your data.
                        </p>
                      </div>
                    </>
                  )}

                  {chatContext === "liveexam" && (
                    <>
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Socratic Method
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Guides learning through questions and hints rather
                          than providing direct answers.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Academic Integrity
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Maintains educational standards by never providing
                          direct answers to exam questions.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Time-Aware Guidance
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Adjusts assistance level based on exam time remaining
                          and difficulty of questions.
                        </p>
                      </div>

                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 hover:border-GreatifyNeutral-300 transition-colors">
                        <h4 className="font-medium text-GreatifyNeutral-900 mb-2">
                          Learning Focus
                        </h4>
                        <p className="text-sm text-GreatifyNeutral-600">
                          Promotes understanding and critical thinking rather
                          than just finding correct answers.
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {/* Exam Question Preview - Only for Live Exam Mode */}
                {chatContext === "liveexam" && (
                  <div className="mt-6">
                    <h3 className="text-base font-semibold text-GreatifyNeutral-900 mb-3">
                      Current Question
                    </h3>
                    <div className="border border-GreatifyGreen-200 bg-GreatifyGreen-50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-sm text-GreatifyNeutral-600">
                               <DynamicContent content={demoExam.question} convert={true} />
                              </p>
                        </div>
                     
                      </div>

                    </div>
                  </div>
                )}

                {/* Sources Configuration - Only for Limited and General modes */}
                {(chatContext === 'limited' || chatContext === 'general') && (
                  <div className="mt-6">
                    <h3 className="text-base font-semibold text-GreatifyNeutral-900 mb-4">
                      Configure Sources
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Website Source */}
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                            <GlobeAltIcon className="w-4 h-4 text-green-600" />
                          </div>
                          <h4 className="font-medium text-GreatifyNeutral-900">Website Source</h4>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Website
                          </span>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={sources[0]?.metadata?.title || ''}
                              onChange={(e) => updateSourceMetadata(0, { title: e.target.value })}
                              className="w-full border border-GreatifyNeutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-GreatifyGreen-500"
                              placeholder="Enter website title"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Website URL
                            </label>
                            <input
                              type="url"
                              value={sources[0]?.metadata?.url || ''}
                              onChange={(e) => updateSourceMetadata(0, { url: e.target.value })}
                              className="w-full border border-GreatifyNeutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-GreatifyGreen-500"
                              placeholder="https://example.com"
                            />
                            <p className="text-xs text-GreatifyNeutral-500 mt-1">
                              Content will be automatically extracted from this URL
                            </p>
                          </div>
                        </div>
                        
                        {sources[0]?.metadata?.url && (
                          <div className="mt-3 bg-GreatifyNeutral-50 rounded p-3">
                            <p className="text-xs font-medium text-GreatifyNeutral-600 mb-1">Preview:</p>
                            <p className="text-sm text-GreatifyNeutral-700 italic">
                              Content will be loaded from: {sources[0].metadata.url}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Text Content Source */}
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                            <DocumentIcon className="w-4 h-4 text-blue-600" />
                          </div>
                          <h4 className="font-medium text-GreatifyNeutral-900">Text Content</h4>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            Document
                          </span>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={sources[1]?.metadata?.title || ''}
                              onChange={(e) => updateSourceMetadata(1, { title: e.target.value })}
                              className="w-full border border-GreatifyNeutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-GreatifyGreen-500"
                              placeholder="Enter content title"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Text Content
                            </label>
                            <textarea
                              value={sources[1]?.content || ''}
                              onChange={(e) => updateSource(1, { content: e.target.value })}
                              rows={4}
                              className="w-full border border-GreatifyNeutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-GreatifyGreen-500"
                              placeholder="Enter your text content here..."
                            />
                            <p className="text-xs text-GreatifyNeutral-500 mt-1">
                              This text will be used directly as source content
                            </p>
                          </div>
                        </div>
                        
                        {sources[1]?.content && (
                          <div className="mt-3 bg-GreatifyNeutral-50 rounded p-3">
                            <p className="text-xs font-medium text-GreatifyNeutral-600 mb-1">Preview:</p>
                            <p className="text-sm text-GreatifyNeutral-700 leading-relaxed">
                              {sources[1].content.length > 150 
                                ? `${sources[1].content.substring(0, 150)}...`
                                : sources[1].content}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* PDF Source - Now Active */}
                      <div className="border border-GreatifyNeutral-200 rounded-lg p-4 bg-white">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-red-100 rounded flex items-center justify-center">
                            <DocumentIcon className="w-4 h-4 text-red-600" />
                          </div>
                          <h4 className="font-medium text-GreatifyNeutral-900">PDF Document</h4>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            PDF
                          </span>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={pdfContent?.filename || sources[2]?.metadata?.title || 'PDF Document'}
                              readOnly
                              className="w-full border border-GreatifyNeutral-300 rounded-md px-3 py-2 text-sm bg-GreatifyNeutral-50"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-GreatifyNeutral-700 mb-1">
                              Upload PDF
                            </label>
                            {!pdfContent ? (
                              <label className="border-2 border-dashed border-GreatifyNeutral-300 rounded-md p-4 text-center cursor-pointer hover:border-GreatifyGreen-500 transition-colors block">
                                <input
                                  type="file"
                                  accept=".pdf"
                                  onChange={handlePdfUpload}
                                  className="hidden"
                                  disabled={isExtractingPdf}
                                />
                                <DocumentIcon className="w-8 h-8 text-GreatifyNeutral-400 mx-auto mb-2" />
                                <p className="text-sm text-GreatifyNeutral-500">
                                  {isExtractingPdf ? 'Extracting PDF content...' : 'Click to upload PDF or drag & drop'}
                                </p>
                                <p className="text-xs text-GreatifyNeutral-400 mt-1">
                                  PDF files up to 10MB
                                </p>
                              </label>
                            ) : (
                              <div className="space-y-3">
                                {/* PDF Content Preview */}
                                <div className="bg-GreatifyNeutral-50 rounded-md p-3">
                                  <div className="flex justify-between items-start mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-GreatifyNeutral-700">{pdfContent.filename}</p>
                                      <p className="text-xs text-GreatifyNeutral-500">
                                        {pdfContent.pageCount} pages • {pdfContent.text.split(/\s+/).length} words
                                      </p>
                                    </div>
                                    <button
                                      onClick={clearPdfContent}
                                      className="text-red-600 hover:text-red-700 text-sm"
                                    >
                                      <TrashIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                  
                                  {/* Text preview */}
                                  <div className="mt-2">
                                    <p className="text-xs font-medium text-GreatifyNeutral-600 mb-1">Extracted Content Preview:</p>
                                    <div className="bg-white rounded border border-GreatifyNeutral-200 p-2 max-h-32 overflow-y-auto">
                                      <p className="text-xs text-GreatifyNeutral-700 whitespace-pre-wrap">
                                        {pdfContent.text.length > 500 
                                          ? pdfContent.text.substring(0, 500) + '...'
                                          : pdfContent.text}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between mt-2">
                                    <p className="text-xs text-GreatifyNeutral-500">
                                      Extracted {new Date(pdfContent.extractedAt).toLocaleTimeString()}
                                    </p>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(pdfContent.text)}
                                      className="text-xs text-GreatifyGreen-600 hover:text-GreatifyGreen-700"
                                    >
                                      Copy full text
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Launch Button */}
              <div className="mt-6 ">
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowChat(true)}
                    className="inline-flex items-center greenGradient px-8 py-3 border border-transparent text-base font-medium rounded-lg text-white"
                  >
                    <ChatBubbleLeftIcon className="w-5 h-5 mr-3" />
                    Launch Assistant
                  </button>
                </div>
              </div>
            </div>

            {/* Status Panel */}
            <div className="space-y-6">
              <div className="bg-white border border-GreatifyNeutral-200 rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    <h3 className="text-base font-medium text-GreatifyNeutral-900">
                      System Status
                    </h3>
                  </div>

                  <dl className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                        <CogIcon className="w-4 h-4" />
                        Active Mode
                      </dt>
                      <dd className="text-GreatifyNeutral-900 font-medium">
                        {chatContext === "limited" && "Limited Context"}
                        {chatContext === "general" && "General Assistant"}
                        {chatContext === "liveexam" && "Live Exam"}
                      </dd>
                    </div>

                    {(chatContext === "limited" ||
                      chatContext === "general") && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                            <DocumentIcon className="w-4 h-4" />
                            Text Content
                          </dt>
                          <dd className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-GreatifyNeutral-900 font-medium">
                              1 Active
                            </span>
                          </dd>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                            <GlobeAltIcon className="w-4 h-4" />
                            Website Source
                          </dt>
                          <dd className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-GreatifyNeutral-900 font-medium">
                              1 Active
                            </span>
                          </dd>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                            <DocumentIcon className="w-4 h-4" />
                            PDF Support
                          </dt>
                          <dd className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${pdfContent ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                            <span className="text-GreatifyNeutral-900 font-medium">
                              {pdfContent ? 'Active' : 'Ready'}
                            </span>
                          </dd>
                        </div>
                      </>
                    )}

                    {chatContext === "liveexam" && (
                      <>
                       
                 
                        <div className="flex justify-between items-center text-sm">
                          <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                            <InformationCircleIcon className="w-4 h-4" />
                            Method
                          </dt>
                          <dd className="text-GreatifyNeutral-900 font-medium">
                            Socratic
                          </dd>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <dt className="flex items-center gap-2 text-GreatifyNeutral-500">
                            <ShieldCheckIcon className="w-4 h-4" />
                            Integrity
                          </dt>
                          <dd className="text-GreatifyNeutral-900 font-medium">
                            Enforced
                          </dd>
                        </div>
                      </>
                    )}

                    <div className="pt-3 border-t border-GreatifyNeutral-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-GreatifyGreen-400 rounded-full"></div>
                          <span className="text-sm font-medium text-GreatifyGreen-700">
                            All Systems Operational
                          </span>
                        </div>
                      
                      </div>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="bg-white border border-GreatifyNeutral-200 rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BoltIcon className="w-5 h-5 text-blue-500" />
                    <h3 className="text-base font-medium text-GreatifyNeutral-900">
                      Platform Features
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MicrophoneIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Voice Processing
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Real-time transcription with OpenAI Whisper
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <GlobeAltIcon className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Smart Web Scraping
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Intelligent content extraction and processing
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ChatBubbleLeftIcon className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-GreatifyNeutral-900">
                          Real-time Chat
                        </h4>
                        <p className="text-xs text-GreatifyNeutral-500 mt-1">
                          Socket.io powered instant messaging
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
                          Draggable and responsive chat window
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-GreatifyNeutral-100">
                    <div className="text-center">
                      <p className="text-xs text-GreatifyNeutral-500">
                        Powered by Greatify
                      </p>
                      <p className="text-xs text-GreatifyNeutral-400 mt-1">
                        Enterprise-grade security & compliance
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showChat && (
        <AIchat
          onClose={() => setShowChat(false)}
          chatContext={chatContext}
          chatContextContent={
            chatContext === "liveexam"
              ? JSON.stringify(demoExam)
              : "This is demo context content that would be provided by the parent application."
          }
          sources={chatContext !== "liveexam" ? sources : undefined}
        />
      )}
    </div>
  );
}

export default App;
