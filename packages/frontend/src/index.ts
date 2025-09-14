// Main component export
export { default as AIChat } from './views/AIChat/AIchat';
export { default } from './views/AIChat/AIchat';

// Type exports
export type {
  AIChatProps,
  Message,
  ContentItem,
  VoiceData,
  AIProvider,
  ChatResponse
} from './views/AIChat/types';

// Service exports
export { OpenAIService } from './views/AIChat/services/OpenAIService';

// Styles export
import './index.css';