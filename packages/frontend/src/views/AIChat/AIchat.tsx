import React, { useState, useEffect, useRef, useCallback } from 'react';
import Draggable from 'react-draggable';
import { 
  XMarkIcon, 
  PaperAirplaneIcon, 
  ChatBubbleLeftIcon
} from '@heroicons/react/24/outline';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIService } from './services/OpenAIService';
import { Message, ContentItem, AIChatProps, SourceItem } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Default configurations
const defaultColors = {
  primary: '#00773F',
  secondary: '#00373A', 
  accent: '#F59E0B',
  background: '#FFFFFF',
  surface: '#F8F9FA',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444'
};

const defaultGradients = {
  header: 'linear-gradient(135deg, #00373A 0%, #00773F 100%)',
  background: 'linear-gradient(135deg, #F8F9FA 0%, #E5E7EB 100%)',
  button: 'linear-gradient(135deg, #00773F 0%, #059669 100%)',
  messageUser: 'linear-gradient(135deg, #00773F 0%, #059669 100%)',
  messageAssistant: 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)'
};

const defaultSizing = {
  width: 500,
  height: '85vh',
  maxWidth: '90vw',
  maxHeight: '90vh',
  borderRadius: '12px',
  headerHeight: 60,
  fontSize: '14px',
  messageBubbleRadius: '8px'
};

const defaultPosition = {
  x: 0,
  y: 0,
  defaultPosition: 'bottom-right' as const
};

const AIchat: React.FC<AIChatProps> = (props) => {
  // Destructure props with defaults
  const {
    onClose,
    // AI Configuration
    openaiApiKey,
    aiProvider,
    apiEndpoint,
    // User identification
    username = 'anonymous',
    // Context
    chatContext = 'general',
    chatContextContent = '',
    sources = [],
    // Basic Customization
    title = 'Arya AI Assistant',
    subtitle = 'Online • Ready to help',
    welcomeMessage,
    placeholder = 'Type a message...',
    // theme = 'light', // TODO: Implement theme switching
    // Visual Customization
    colors = {},
    gradients = {},
    icons = {},
    sizing = {},
    branding = {},
    position = {},
    // Features
    enableDragging = true,
    enableMinimize = false,
    showNewChatButton = true,
    // showTimestamps = false, // TODO: Implement timestamps
    // showTypingIndicator = true, // TODO: Implement typing indicator control
    showBranding = true,
    // enableSoundEffects = false, // TODO: Implement sound effects
    // Behavior
    autoFocus = true,
    closeOnEscape = true,
    // savePosition = false, // TODO: Implement position saving
    // saveHistory = false, // TODO: Implement history saving
    // maxMessages = 100, // TODO: Implement message limit
    // typingSpeed = 50, // TODO: Implement typing speed control
    // Styling Classes
    className = '',
    headerClassName = '',
    // bodyClassName = '', // TODO: Apply to message body
    inputClassName = '',
    buttonClassName = '',
    // Custom Components
    customHeader,
    customFooter,
    // customMessageBubble, // TODO: Implement custom message renderer
    customInputArea,
    // Callbacks
    // onMessageSent, // TODO: Implement message sent callback
    // onMessageReceived, // TODO: Implement message received callback
    onError,
    onMinimize,
    // onMaximize, // TODO: Implement maximize callback
    onPositionChange,
    // onThemeChange // TODO: Implement theme change callback
    // Metrics (always enabled)
    onMetrics,
    organizationId,
    projectId
  } = props;

  // Merge configurations with defaults
  const finalColors = { ...defaultColors, ...colors };
  const finalGradients = { ...defaultGradients, ...gradients };
  const finalSizing = { ...defaultSizing, ...sizing };
  const finalPosition = { ...defaultPosition, ...position };

  // CSS custom properties for dynamic theming
  const cssVariables: Record<string, string> = {
    '--chat-primary': finalColors.primary,
    '--chat-secondary': finalColors.secondary,
    '--chat-accent': finalColors.accent,
    '--chat-background': finalColors.background,
    '--chat-surface': finalColors.surface,
    '--chat-text': finalColors.text,
    '--chat-text-secondary': finalColors.textSecondary,
    '--chat-border': finalColors.border,
    '--chat-success': finalColors.success,
    '--chat-warning': finalColors.warning,
    '--chat-error': finalColors.error,
    '--chat-gradient-header': finalGradients.header,
    '--chat-gradient-background': finalGradients.background,
    '--chat-gradient-button': finalGradients.button,
    '--chat-gradient-user': finalGradients.messageUser,
    '--chat-gradient-assistant': finalGradients.messageAssistant,
    '--chat-width': typeof finalSizing.width === 'number' ? `${finalSizing.width}px` : finalSizing.width,
    '--chat-height': typeof finalSizing.height === 'number' ? `${finalSizing.height}px` : finalSizing.height,
    '--chat-border-radius': finalSizing.borderRadius,
    '--chat-header-height': typeof finalSizing.headerHeight === 'number' ? `${finalSizing.headerHeight}px` : finalSizing.headerHeight,
    '--chat-font-size': finalSizing.fontSize,
    '--chat-bubble-radius': finalSizing.messageBubbleRadius
  };
  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [dragging, setDragging] = useState(false);
  const [_openaiService, setOpenaiService] = useState<OpenAIService | null>(null);
  const [serviceType, setServiceType] = useState<'openai' | 'external' | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [lastContextContent, setLastContextContent] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll functionality exactly like ExamX
  const scrollToBottom = useCallback((smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  }, []);

  // Check if user is near bottom of scroll area
  const isNearBottom = (): boolean => {
    if (!messagesContainerRef.current) return true;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const threshold = 100; // pixels from bottom
    return scrollTop + clientHeight >= scrollHeight - threshold;
  };

  // Auto-scroll when messages change (only if user is near bottom)
  useEffect(() => {
    if (messages.length > 0) {
      const shouldAutoScroll = isNearBottom();
      if (shouldAutoScroll) {
        // Small delay to ensure DOM is updated before scrolling
        setTimeout(() => {
          scrollToBottom(true);
        }, 50);
      }
    }
  }, [messages]);

  // Initialize chat service based on provided configuration
  useEffect(() => {
    try {
      // Validate that only one service type is provided
      const configCount = [openaiApiKey, aiProvider, apiEndpoint].filter(Boolean).length;
      
      if (configCount === 0) {
        // If no AI service is configured, default to external backend (backward compatibility)
        setServiceType('external');
        setInitError(null);
        return;
      }
      
      if (configCount > 1) {
        setInitError('Please provide only one AI configuration: openaiApiKey, aiProvider, or apiEndpoint');
        return;
      }

      // Initialize OpenAI service if OpenAI key is provided
      if (openaiApiKey) {
        if (!OpenAIService.isValidApiKey(openaiApiKey)) {
          setInitError('Invalid OpenAI API key format');
          return;
        }
        setOpenaiService(new OpenAIService(openaiApiKey));
        setServiceType('openai');
        setInitError(null);
      }
      // Initialize based on aiProvider configuration
      else if (aiProvider) {
        if (aiProvider.type === 'openai' && aiProvider.apiKey) {
          if (!OpenAIService.isValidApiKey(aiProvider.apiKey)) {
            setInitError('Invalid OpenAI API key format');
            return;
          }
          setOpenaiService(new OpenAIService(aiProvider.apiKey));
          setServiceType('openai');
          setInitError(null);
        } else if (aiProvider.type === 'external') {
          setServiceType('external');
          setInitError(null);
        } else {
          setInitError('Invalid AI provider configuration');
          return;
        }
      }
      // Use external backend (existing functionality)
      else if (apiEndpoint) {
        setServiceType('external');
        setInitError(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize AI service';
      setInitError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [openaiApiKey, aiProvider, apiEndpoint, onError]);

  // Initialize chat - memoized with minimal dependencies
  const initializeChat = useCallback(() => {
    // Fallback to default welcome message
    const getDefaultWelcomeMessage = () => {
      if (chatContext === 'liveexam') {
        return "I'm here to help you with your exam. Feel free to ask for hints or clarifications!";
      } else if (chatContext === 'support') {
        return "Hello! I'm your support assistant. How can I help you today?";
      } else {
        return "Hello! I'm your AI assistant. How can I help you today?";
      }
    };

    const welcomeMsg: Message = {
      id: uuidv4(),
      type: 'assistant',
      content: [{
        type: 'text',
        content: welcomeMessage || getDefaultWelcomeMessage()
      }],
      isComplete: true,
      timestamp: Date.now(),
      chatContext,
      chatContextContent
    };
    
    setMessages([welcomeMsg]);
    
    // Reset context tracking for first message
    setLastContextContent('');
    
    // Scroll to bottom after initializing chat
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'end',
        });
      }
    }, 100);
  }, [chatContext, chatContextContent, welcomeMessage]);

  // Initialize with welcome message
  useEffect(() => {
    console.log('[AIChat] Init check:', { serviceType, initError, isInitialized });
    if (serviceType && !initError && !isInitialized) {
      console.log('[AIChat] Initializing chat...');
      setIsInitialized(true);
      
      // For live exam mode with context, auto-trigger AI analysis
      if (chatContext === 'liveexam' && chatContextContent) {
        console.log('[AIChat] Live exam mode - triggering AI context analysis...');
        // Reset context tracking to ensure it's sent
        setLastContextContent('');
        // Send a hidden message to trigger AI analysis of the exam context
        setTimeout(() => {
          sendMessage('__ANALYZE_EXAM_CONTEXT__', 'text', undefined, false);
        }, 100);
      } else {
        // Regular initialization with default welcome
        initializeChat();
      }
    }
  }, [serviceType, initError, isInitialized, chatContext, chatContextContent, initializeChat]);

  // Reset context tracking when chatContextContent prop changes
  useEffect(() => {
    // Only reset if the context content actually changed from what we have stored
    if (chatContextContent !== lastContextContent && lastContextContent !== '') {
      setLastContextContent('');
    }
  }, [chatContextContent]);

  // Handle dragging states
  const handleStart = () => {
    setDragging(true);
  };

  const handleStop = (_e: any, data: any) => {
    setDragging(false);
    if (onPositionChange) {
      onPositionChange({ x: data.x, y: data.y });
    }
  };

  // ESC key handler
  useEffect(() => {
    if (closeOnEscape) {
      const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [closeOnEscape, onClose]);

  // Prevent body scroll when hovering over modal
  useEffect(() => {
    const handleMouseEnter = () => {
      document.body.style.overflow = 'hidden';
    };

    const handleMouseLeave = () => {
      document.body.style.overflow = '';
    };

    const modalElement = document.getElementById('ai-chat-modal');
    if (modalElement) {
      modalElement.addEventListener('mouseenter', handleMouseEnter);
      modalElement.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (modalElement) {
        modalElement.removeEventListener('mouseenter', handleMouseEnter);
        modalElement.removeEventListener('mouseleave', handleMouseLeave);
      }
      document.body.style.overflow = '';
    };
  }, []);

  const getCurrentTime = (): string => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  };


  // Helper function to detect markdown blocks that need to be rendered as complete units
  const isMarkdownBlock = (text: string, startIndex: number): { isBlock: boolean; endIndex: number } => {
    const remainingText = text.slice(startIndex);
    
    // Table detection (starts with |)
    if (remainingText.startsWith('|')) {
      // Enhanced table detection - find the complete table including headers, separators, and all rows
      const lines = remainingText.split('\n');
      let tableEndIndex = 0;
      let foundSeparator = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // If it's a table row (starts and ends with |)
        if (line.match(/^\|.*\|$/)) {
          tableEndIndex += lines[i].length + 1; // +1 for newline
          
          // Check if this is a separator line (contains only |, -, :, spaces)
          if (line.match(/^\|[\s\-:]+\|$/)) {
            foundSeparator = true;
          }
        } 
        // If we found a separator and this line doesn't look like a table row, end the table
        else if (foundSeparator && line.length > 0) {
          break;
        }
        // If no separator found yet and this line doesn't look like a table row, not a valid table
        else if (!foundSeparator && line.length > 0) {
          return { isBlock: false, endIndex: startIndex };
        }
        // Empty line - could be end of table
        else if (line.length === 0) {
          tableEndIndex += lines[i].length + 1;
          break;
        }
      }
      
      // Only consider it a table if we found at least a header and separator
      if (foundSeparator && tableEndIndex > 0) {
        return { isBlock: true, endIndex: startIndex + tableEndIndex - 1 }; // -1 to not include the last newline
      }
    }
    
    // Code block detection (```)
    if (remainingText.startsWith('```')) {
      const codeBlockMatch = remainingText.match(/^```[\s\S]*?```/);
      if (codeBlockMatch) {
        return { isBlock: true, endIndex: startIndex + codeBlockMatch[0].length };
      }
    }
    
    // No markdown block found
    return { isBlock: false, endIndex: startIndex };
  };

  // Enhanced typing animation that handles markdown blocks
  const simulateTyping = (content: ContentItem[]) => {
    // Check if content contains tables - if so, skip typing animation for better UX
    const hasTable = content.some(item => 
      item.type === 'text' && item.content.includes('|') && item.content.includes('---')
    );
    
    if (hasTable) {
      // Skip typing animation for tables, show content immediately
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        const lastMessageIndex = newMessages.length - 1;
        
        if (newMessages[lastMessageIndex]) {
          newMessages[lastMessageIndex] = {
            ...newMessages[lastMessageIndex],
            content: content,
            isComplete: true
          };
        }
        return newMessages;
      });
      setLoading(false);
      return Promise.resolve();
    }
    
    // Calculate total content length for adaptive speed
    const totalLength = content.reduce((sum, item) => {
      return sum + (item.type === 'text' ? item.content.length : 0);
    }, 0);

    // Adaptive speed based on content length
    let baseSpeed: number;
    let charsPerInterval: number;

    if (totalLength < 100) {
      baseSpeed = 50; // Slower for short messages to be readable
      charsPerInterval = 1;
    } else if (totalLength < 300) {
      baseSpeed = 30; // Medium speed
      charsPerInterval = 2;
    } else if (totalLength < 600) {
      baseSpeed = 20; // Faster for long messages
      charsPerInterval = 3;
    } else {
      baseSpeed = 15; // Very fast for very long messages
      charsPerInterval = 4;
    }

    return new Promise<void>((resolve) => {
      let currentItemIndex = 0;
      let currentCharIndex = 0;
      let displayedText = '';

      typingIntervalRef.current = setInterval(() => {
        if (currentItemIndex < content.length) {
          const currentItem = content[currentItemIndex];

          if (currentItem.type === 'text') {
            if (currentCharIndex < currentItem.content.length) {
              // Check if we're at the start of a markdown block
              const blockCheck = isMarkdownBlock(currentItem.content, currentCharIndex);
              
              let endIndex: number;
              if (blockCheck.isBlock) {
                // Add the entire markdown block at once
                endIndex = blockCheck.endIndex;
              } else {
                // Add characters normally
                endIndex = Math.min(currentCharIndex + charsPerInterval, currentItem.content.length);
              }
              
              const newChars = currentItem.content.slice(currentCharIndex, endIndex);
              displayedText += newChars;
              currentCharIndex = endIndex;

              // Update the message with current displayed text
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages];
                const lastMessageIndex = newMessages.length - 1;
                
                if (newMessages[lastMessageIndex]) {
                  newMessages[lastMessageIndex] = {
                    ...newMessages[lastMessageIndex],
                    content: [{
                      type: 'text',
                      content: displayedText
                    }],
                    isComplete: false
                  };
                }

                return newMessages;
              });
            } else {
              // Move to next item
              currentItemIndex++;
              currentCharIndex = 0;
            }
          } else if (currentItem.type === 'button') {
            // Add button items immediately
            setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              const lastMessageIndex = newMessages.length - 1;
              
              if (newMessages[lastMessageIndex]) {
                const currentContent = [...(newMessages[lastMessageIndex].content || [])];
                currentContent.push(currentItem);
                
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: currentContent,
                  isComplete: false
                };
              }

              return newMessages;
            });
            currentItemIndex++;
          }
        } else {
          // Typing complete
          setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            const lastMessageIndex = newMessages.length - 1;
            
            if (newMessages[lastMessageIndex]) {
              newMessages[lastMessageIndex] = {
                ...newMessages[lastMessageIndex],
                isComplete: true
              };
            }

            return newMessages;
          });

          clearInterval(typingIntervalRef.current!);
          setLoading(false);
          resolve();
        }
      }, baseSpeed);
    });
  };

  // Cleanup typing animation
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, []);

  // Send message
  const sendMessage = async (
    message?: string,
    noReply: boolean = false
  ) => {
    // Handle text messages
    const messageText = message || input.trim();
    if (!messageText || loading) return;

    // Clear any ongoing typing simulation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    // Check if this is the special exam context analysis message
    const isExamContextAnalysis = messageText === '__ANALYZE_EXAM_CONTEXT__';
    
    // For noReply messages or exam context analysis, don't add user message
    if (!noReply && !isExamContextAnalysis) {
      // Normal messages - show both user and assistant messages
      const userMessage: Message = {
        id: uuidv4(),
        type: 'user',
        content: [{
          type: 'text',
          content: messageText
        }],
        isComplete: true,
        timestamp: Date.now(),
        chatContext: chatContext,
        chatContextContent: chatContextContent,
        sources: sources
      };

      // Add assistant message placeholder immediately to show loading dots
      const assistantPlaceholder: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: [], // Empty content will show loading dots
        isComplete: false,
        timestamp: Date.now(),
        chatContext: chatContext,
        chatContextContent: chatContextContent,
        sources: sources
      };

      setMessages(prev => [...prev, userMessage, assistantPlaceholder]);
      setInput('');
      setLoading(true);
    } else if (isExamContextAnalysis) {
      // For exam context analysis, only add assistant placeholder
      const assistantPlaceholder: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: [], // Empty content will show loading dots
        isComplete: false,
        timestamp: Date.now(),
        chatContext: chatContext,
        chatContextContent: chatContextContent,
        sources: sources
      };

      setMessages(prev => [...prev, assistantPlaceholder]);
      setLoading(true);
    }

    // Immediately scroll to bottom when user sends a message
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);

    try {
      // For exam context analysis or live exam mode, always send context content
      // For regular messages, only send if content has changed
      const shouldSendContextContent = isExamContextAnalysis || chatContext === 'liveexam' || (chatContextContent !== lastContextContent);
      const contextContentToSend = shouldSendContextContent ? chatContextContent : '';
      
      // Debug logging for context handling
      console.log('[AIChat] Context handling:', {
        isExamContextAnalysis,
        chatContext,
        shouldSendContextContent,
        currentContextContent: chatContextContent?.substring(0, 50) + '...',
        lastContextContent: lastContextContent?.substring(0, 50) + '...',
        contextContentToSend: contextContentToSend?.substring(0, 50) + '...'
      });
      
      // Update last context content if it changed and not in live exam mode
      if (shouldSendContextContent && !isExamContextAnalysis && chatContext !== 'liveexam') {
        setLastContextContent(chatContextContent);
      }
      
      // Import the queriesApi from the API service
      const { queriesApi } = await import('../../services/api');
      
      // Use RAG query API instead of chat_bot_v3
      const result = await queriesApi.process(messageText, username, {
        maxResults: 5,
        responseStyle: 'detailed'
      });
      
      if (result.success && result.data) {
        const ragResponse = result.data;
        
        // Create message content from RAG response
        const messageContent: ContentItem[] = [{
          type: 'text' as const,
          content: ragResponse.response
        }];
        
        // Convert RAG sources to chat sources format
        const ragSources: SourceItem[] = ragResponse.sources.map(source => ({
          type: 'document' as const,
          content: source.excerpt,
          metadata: {
            title: source.documentName,
            page: source.pageNumber,
            source: `${source.documentName} (Page ${source.pageNumber})`,
            confidence: source.confidence
          }
        }));

        // Update the placeholder message with actual content
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0 && newMessages[lastIndex].type === 'assistant') {
            newMessages[lastIndex].id = uuidv4();
            newMessages[lastIndex].timestamp = Date.now();
            newMessages[lastIndex].sources = ragSources;
          }
          return newMessages;
        });

        // Start typing animation with the RAG answer
        await simulateTyping(messageContent);
        
        // Capture metrics (always enabled) - convert RAG metrics to expected format
        if (onMetrics) {
          const metrics = {
            responseTime: ragResponse.responseTime,
            confidence: ragResponse.confidence,
            sourcesFound: ragResponse.totalSourcesFound || ragResponse.sources.length,
            processingTime: ragResponse.processingTime,
            searchTime: ragResponse.metadata?.searchTime,
            generationTime: ragResponse.metadata?.generationTime,
            model: ragResponse.metadata?.model
          };
          onMetrics(metrics);
        }
      } else if (result.success && noReply) {
        // NoReply case - just finish, no UI updates needed
        setLoading(false);
      } else {
        setLoading(false);
        throw new Error(result.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error sending message:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack',
        errorDetails: error
      });
      setLoading(false);
      
      // Update the placeholder message with error content
      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (lastIndex >= 0 && newMessages[lastIndex].type === 'assistant') {
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            content: [{
              type: 'text',
              content: 'Sorry, I encountered an error. Please try again.'
            }],
            isComplete: true
          };
        }
        return newMessages;
      });
    }
  };



  // Handle input key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle New Chat
  const handleNewChat = () => {
    // Clear any ongoing typing simulation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }


    // Clear messages and reset states
    setMessages([]);
    setInput('');
    setLoading(false);
    
    // Reset context tracking to allow fresh context to be sent
    setLastContextContent('');
    
    // Reset initialization flag to allow re-initialization
    setIsInitialized(false);
    
    // Scroll to bottom after clearing messages
    setTimeout(() => {
      scrollToBottom(false);
    }, 100);
  };


  return (
    <Draggable 
      onStart={handleStart}
      onStop={handleStop}
      handle=".draggable-handle"
      cancel=".no-drag"
      bounds="parent" 
      defaultPosition={{ x: finalPosition.x, y: finalPosition.y }}
      disabled={!enableDragging}
    >
      <div 
        className={`fixed z-[999999] bottom-14 right-5 ${dragging ? 'cursor-grabbing' : enableDragging ? 'cursor-grab' : ''} ${className}`} 
        style={{ 
          ...cssVariables,
          fontFamily: finalSizing.fontSize || 'Yellix, sans-serif'
        } as React.CSSProperties}
        id="ai-chat-modal"
      >
        <div 
          className="min-h-[400px] relative"
          style={{
            width: cssVariables['--chat-width'],
            height: cssVariables['--chat-height'],
            maxWidth: finalSizing.maxWidth,
            maxHeight: finalSizing.maxHeight
          }}
        >
          <div 
            className="h-full w-full flex flex-col overflow-hidden shadow-2xl border border-GreatifyNeutral-200/50"
            style={{
              borderRadius: cssVariables['--chat-border-radius'],
              backgroundColor: cssVariables['--chat-background']
            }}
          >
            {/* Header */}
            {customHeader || (
              <div
                style={{
                  background: cssVariables['--chat-gradient-header'],
                  boxShadow: '0 4px 30px rgba(0, 55, 58, 0.1)',
                  height: cssVariables['--chat-header-height']
                }}
                className={`flex items-center justify-between px-4 py-3 relative z-10 ${enableDragging ? 'draggable-handle' : ''} ${headerClassName}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {branding?.logo ? (
                      typeof branding.logo === 'string' ? (
                        <img src={branding.logo} alt="Logo" className="w-8 h-8 rounded-lg" />
                      ) : (
                        branding.logo
                      )
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-xl flex items-center justify-center">
                        {icons.assistant || <ChatBubbleLeftIcon className="h-5 w-5 text-white" />}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
                         style={{ backgroundColor: cssVariables['--chat-success'] }}></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white/90 text-base font-semibold">
                      {branding?.brandName || title}
                      {chatContext === 'liveexam' && (
                        <span className="text-white/60 text-xs ml-2">• Exam Mode</span>
                      )}
                    </span>
                    <span className="text-white/60 text-[11px]">
                      {branding?.brandSubtitle || subtitle}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {showNewChatButton && messages.length > 0 && (
                    <button
                      onClick={handleNewChat}
                      className="bg-white/10 backdrop-blur-sm font-medium text-sm text-white py-1 px-3 rounded-md hover:bg-white/20 transition-all duration-200 no-drag"
                    >
                      {icons.newChat ? (
                        typeof icons.newChat === 'string' ? icons.newChat : icons.newChat
                      ) : (
                        'New Chat'
                      )}
                    </button>
                  )}
                  {enableMinimize && (
                    <button
                      onClick={onMinimize}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all duration-200 no-drag"
                    >
                      {icons.minimize || <span className="text-white text-sm">−</span>}
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all duration-200 no-drag"
                    style={{ color: cssVariables['--chat-success'] }}
                  >
                    {icons.close || <XMarkIcon className="h-5 w-5 stroke-2" />}
                  </button>
                </div>
              </div>
            )}

            {/* Messages - Exact ExamX layout */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 bg-gray-50 min-h-0"
            >
              <div className="">
                {messages.map((message, index) => {
                  const messageId = message.id || `message_${index}_${Date.now()}`;


                  // Text message rendering - Exact ExamX structure
                  return (
                    <div key={messageId} className={`flex mb-3 mt-4 ${message.type === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                      {message.type === 'assistant' ? (
                        <div className="flex gap-2 max-w-[85%]">
                          <div className="w-8 h-8 rounded-full bg-GreatifyGreen-600 flex items-center justify-center flex-shrink-0">
                            <ChatBubbleLeftIcon className="h-4 w-4 text-white stroke-2" />
                          </div>
                          <div>
                            <div className="bg-white text-GreatifyNeutral-900 border border-GreatifyNeutral-200/50 py-2 px-3 rounded-lg text-sm leading-relaxed">
                              {message.content.length === 0 ? (
                                <div className="flex items-center">
                                  <div className="flex gap-1.5">
                                    <div
                                      className="h-2 w-2 bg-GreatifyGreen-600 rounded-full animate-bounce"
                                      style={{ animationDelay: '0ms' }}
                                    ></div>
                                    <div
                                      className="h-2 w-2 bg-GreatifyGreen-600 rounded-full animate-bounce"
                                      style={{ animationDelay: '200ms' }}
                                    ></div>
                                    <div
                                      className="h-2 w-2 bg-GreatifyGreen-600 rounded-full animate-bounce"
                                      style={{ animationDelay: '400ms' }}
                                    ></div>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  {message.content.map((item, itemIndex) => (
                                    <React.Fragment key={itemIndex}>
                                      {item.type === 'text' && (
                                        <div className="prose-reset">
                                          <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                              h1: ({children}) => <h1 className="text-2xl font-bold mt-2 mb-1">{children}</h1>,
                                              h2: ({children}) => <h2 className="text-xl font-bold mt-2 mb-1">{children}</h2>,
                                              h3: ({children}) => <h3 className="text-lg font-semibold mt-1.5 mb-1">{children}</h3>,
                                              p: ({children}) => <p className="mb-1.5 leading-relaxed">{children}</p>,
                                              ul: ({children}) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5">{children}</ul>,
                                              ol: ({children}) => <ol className="list-decimal ml-4 mb-1.5 space-y-0.5">{children}</ol>,
                                              li: ({children}) => <li className="mb-0">{children}</li>,
                                              strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                                              em: ({children}) => <em className="italic">{children}</em>,
                                              code: ({children, className}) => {
                                                const isInline = !className;
                                                return isInline ? (
                                                  <code className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono">{children}</code>
                                                ) : (
                                                  <code className="block p-2 bg-gray-100 rounded-lg overflow-x-auto my-1 text-sm font-mono">{children}</code>
                                                );
                                              },
                                              pre: ({children}) => <pre className="overflow-x-auto">{children}</pre>,
                                              blockquote: ({children}) => (
                                                <blockquote className="border-l-4 border-gray-300 pl-4 my-1 italic text-gray-700">
                                                  {children}
                                                </blockquote>
                                              ),
                                              table: ({children}) => (
                                                <table className="my-2 w-full border-collapse border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm">
                                                  {children}
                                                </table>
                                              ),
                                              thead: ({children}) => <thead className="bg-gray-100 border-b-2 border-gray-400">{children}</thead>,
                                              tr: ({children}) => <tr className="border-b border-gray-300 hover:bg-gray-50">{children}</tr>,
                                              th: ({children}) => <th className="text-left p-3 font-bold text-gray-800 border-r border-gray-300 last:border-r-0">{children}</th>,
                                              td: ({children}) => <td className="p-3 border-r border-gray-300 last:border-r-0 text-gray-700">{children}</td>,
                                            }}
                                          >
                                            {item.content}
                                          </ReactMarkdown>
                                        </div>
                                      )}
                                      {item.type === 'button' && (
                                        <a
                                          href={item.link}
                                          className="inline-flex items-center px-3 py-2 bg-GreatifyGreen-500 text-white rounded-md hover:bg-GreatifyGreen-600 transition-colors duration-200 mt-4"
                                        >
                                          {item.content}
                                        </a>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] text-GreatifyNeutral-500 mt-2 text-right">
                              {getCurrentTime()}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[85%]">
                          <div className="bg-GreatifyGreen-600 text-white py-2 px-3 rounded-lg text-sm leading-relaxed">
                            {message.content.length > 0 && message.content[0].content}
                          </div>
                          <div className="text-[10px] text-GreatifyNeutral-400 mt-2 text-right">
                            {getCurrentTime()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}


                {/* Invisible element to scroll to */}
                <div 
                  ref={messagesEndRef}
                  style={{ height: '1px' }} 
                />
              </div>
            </div>

            {/* Input - Exact ExamX styling */}
            <div className="p-4 border-t border-GreatifyNeutral-200/50 relative bg-white sticky bottom-0">
              {customInputArea || (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className={`flex items-center rounded-lg px-2 py-1 border ${inputClassName}`}
                  style={{
                    backgroundColor: cssVariables['--chat-surface'],
                    borderColor: cssVariables['--chat-border']
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 bg-transparent border-none py-2 px-2 text-sm resize-none min-h-8 max-h-20 overflow-y-auto focus:outline-none no-drag"
                    style={{
                      color: cssVariables['--chat-text'],
                      fontSize: cssVariables['--chat-font-size']
                    }}
                    placeholder={placeholder}
                    rows={1}
                    disabled={loading}
                    autoFocus={autoFocus}
                  />
                  <div className="flex items-center justify-center gap-2 pl-2">
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className={`w-8 h-8 rounded-md flex items-center justify-center text-white hover:opacity-90 transition-all duration-200 no-drag disabled:opacity-50 disabled:cursor-not-allowed ${buttonClassName}`}
                      style={{
                        background: cssVariables['--chat-gradient-button']
                      }}
                    >
                      {icons.send || <PaperAirplaneIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </form>
              )}


              {/* Custom Footer or Branding */}
              {(customFooter || (showBranding && (branding?.footerText || branding?.watermark))) && (
                <div className="mt-2 text-center">
                  {customFooter || (
                    <div className="text-xs" style={{ color: cssVariables['--chat-text-secondary'] }}>
                      {branding?.footerText || branding?.watermark}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Draggable>
  );
};

export default AIchat;