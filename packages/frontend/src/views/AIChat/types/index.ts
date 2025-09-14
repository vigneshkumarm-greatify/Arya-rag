// Exact interfaces from ExamX
export interface Message {
  id: string;
  type: 'assistant' | 'user';
  content: ContentItem[];
  isComplete: boolean;
  voiceData?: VoiceData;
  timestamp: number;
  chatContext?: string;
  chatContextContent?: string;
  sources?: SourceItem[];
}

export interface VoiceData {
  duration: number;
  audioUrl: string;
  progress: number;
  transcription?: string;
  status: 'uploading' | 'completed' | 'failed';
}

export interface ContentItem {
  type: 'text' | 'button';
  content: string;
  link?: string;
}

export interface SourceItem {
  type: 'pdf' | 'website' | 'document' | 'api' | 'database';
  content: string;
  metadata?: {
    title?: string;
    url?: string;
    filename?: string;
    page?: number;
    source?: string;
  };
}

// Additional types for voice recording
export interface RecordingState {
  isRecording: boolean;
  recordingTime: number;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
}

// Socket event types
export interface SocketMessage {
  event: string;
  data: any;
  messageId?: string;
}

// AI Provider interface for future-proofing
export interface AIProvider {
  type: 'openai' | 'external';
  apiKey?: string;
  model?: string;
  customEndpoint?: string;
  headers?: Record<string, string>;
}

// API response types
export interface ChatResponse {
  success: boolean;
  message?: Message;
  error?: string;
}

export interface VoiceResponse {
  success: boolean;
  transcription?: string;
  audio_base64?: string;
  filename?: string;
  error?: string;
}

// Customization interfaces
export interface ChatColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
  textSecondary?: string;
  border?: string;
  success?: string;
  warning?: string;
  error?: string;
}

export interface ChatGradients {
  header?: string;
  background?: string;
  button?: string;
  messageUser?: string;
  messageAssistant?: string;
}

export interface ChatIcons {
  close?: string | React.ReactElement;
  minimize?: string | React.ReactElement;
  send?: string | React.ReactElement;
  newChat?: string | React.ReactElement;
  user?: string | React.ReactElement;
  assistant?: string | React.ReactElement;
}

export interface ChatSizing {
  width?: string | number;
  height?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;
  borderRadius?: string;
  headerHeight?: string | number;
  fontSize?: string;
  messageBubbleRadius?: string;
}

export interface ChatBranding {
  logo?: string | React.ReactElement;
  logoPosition?: 'left' | 'center' | 'right';
  brandName?: string;
  brandSubtitle?: string;
  footerText?: string;
  watermark?: string;
}

export interface ChatPosition {
  x?: number;
  y?: number;
  defaultPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
}

// Enhanced props for complete customization
export interface AIChatProps {
  // Required
  onClose: () => void;
  
  // AI Configuration (choose one method - future-proof)
  openaiApiKey?: string;                    // Simple built-in OpenAI integration
  aiProvider?: AIProvider;                  // Advanced provider config
  apiEndpoint?: string;                     // External backend endpoint (existing)
  
  // User identification for RAG system
  username?: string;
  
  // Context
  chatContext?: 'limited' | 'general' | 'liveexam';
  chatContextContent?: string;
  sources?: SourceItem[];
  
  // Basic Customization
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  theme?: 'light' | 'dark' | 'auto';
  
  // Visual Customization
  colors?: ChatColors;
  gradients?: ChatGradients;
  icons?: ChatIcons;
  sizing?: ChatSizing;
  branding?: ChatBranding;
  position?: ChatPosition;
  
  // Features
  enableDragging?: boolean;
  enableMinimize?: boolean;
  showNewChatButton?: boolean;
  showTimestamps?: boolean;
  showTypingIndicator?: boolean;
  showBranding?: boolean;
  enableSoundEffects?: boolean;
  
  // Behavior
  autoFocus?: boolean;
  closeOnEscape?: boolean;
  savePosition?: boolean;
  saveHistory?: boolean;
  maxMessages?: number;
  typingSpeed?: number;
  
  // Styling Classes (for advanced customization)
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  
  // Custom Components (for complete control)
  customHeader?: React.ReactElement;
  customFooter?: React.ReactElement;
  customMessageBubble?: (message: Message) => React.ReactElement;
  customInputArea?: React.ReactElement;
  
  // Callbacks
  onMessageSent?: (message: string) => void;
  onMessageReceived?: (message: any) => void;
  onError?: (error: string) => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onThemeChange?: (theme: string) => void;
  
  // Metrics callbacks (always enabled)
  onMetrics?: (metrics: any) => void;
  organizationId?: string;
  projectId?: string;
}