import OpenAI from 'openai';
import { Message, ChatResponse, SourceItem } from '../types';

export class OpenAIService {
  private openai: OpenAI;
  
  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Allow client-side usage
    });
  }

  async generateResponse(
    message: string,
    history: Message[],
    chatContext: 'limited' | 'general' | 'liveexam',
    chatContextContent: string,
    sources?: SourceItem[],
    onError?: (error: string) => void
  ): Promise<ChatResponse> {
    try {
      // Format message history for OpenAI
      const messages = this.formatMessageHistory(history, chatContext, chatContextContent, sources);
      
      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        max_tokens: 500,
        temperature: chatContext === 'liveexam' ? 0.3 : 0.7,
        stream: false
      });

      const responseContent = response.choices[0]?.message?.content || 'I apologize, but I cannot provide a response at this time.';
      
      return {
        success: true,
        message: {
          id: this.generateMessageId(),
          type: 'assistant',
          content: [{
            type: 'text',
            content: responseContent
          }],
          isComplete: true,
          timestamp: Date.now(),
          chatContext,
          chatContextContent,
          sources: sources || []
        }
      };

    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (onError) {
        onError(errorMessage);
      }
      
      return {
        success: false,
        error: `Failed to generate response: ${errorMessage}`
      };
    }
  }

  async processVoiceMessage(
    audioBlob: Blob,
    chatContext: 'limited' | 'general' | 'liveexam',
    chatContextContent: string,
    history: Message[],
    sources?: SourceItem[],
    onError?: (error: string) => void
  ): Promise<ChatResponse> {
    try {
      // First, transcribe the audio using Whisper
      const transcriptionResponse = await this.openai.audio.transcriptions.create({
        file: new File([audioBlob], 'audio.webm', { type: 'audio/webm' }),
        model: 'whisper-1'
      });

      const transcription = transcriptionResponse.text;
      
      if (!transcription) {
        return {
          success: false,
          error: 'Voice transcription failed'
        };
      }

      // Generate response based on transcribed text
      return await this.generateResponse(
        transcription,
        history,
        chatContext,
        chatContextContent,
        sources,
        onError
      );

    } catch (error) {
      console.error('Error processing voice message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (onError) {
        onError(errorMessage);
      }
      
      return {
        success: false,
        error: 'Failed to process voice message'
      };
    }
  }

  private formatMessageHistory(history: Message[], chatContext: 'limited' | 'general' | 'liveexam', chatContextContent: string, sources?: SourceItem[]) {
    const systemPrompt = this.getSystemPrompt(chatContext, chatContextContent, sources);
    
    const messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}> = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add last 5 messages for context
    const recentHistory = history.slice(-5);
    
    for (const msg of recentHistory) {
      const role = msg.type === 'assistant' ? 'assistant' : 'user';
      const content = msg.content
        .filter(item => item.type === 'text')
        .map(item => item.content)
        .join(' ');
      
      if (content) {
        messages.push({
          role: role,
          content: content
        });
      }
    }

    return messages;
  }

  private getSystemPrompt(chatContext: 'limited' | 'general' | 'liveexam', chatContextContent: string, sources?: SourceItem[]): string {
    const currentTime = new Date().toISOString();
    
    if (chatContext === 'liveexam' && chatContextContent) {
      try {
        const examData = JSON.parse(chatContextContent);
        return `You are an AI tutor helping with exam question.
        
FIRST PRIORITY - ANALYZE USER INTENT:
Before responding, analyze if the user is declining help or saying no to assistance.
Look for patterns like "no", "nope", "noo", "no thanks", "i'm good", "don't need help", etc.
If they're declining help, respond gracefully: "Alright, let me know if you need help later!"

CRITICAL EXAM RULES (if user wants help):
1. NEVER give direct answers to the exam question
2. NEVER provide complete explanations that could be copied
3. DO provide conceptual guidance and partial explanations
4. DO use a mix of questions and guidance
5. DO help students understand the approach, not the answer

RESPONSE STYLE:
- Use encouraging, supportive tone
- Ask guiding questions to help them think
- Provide hints about the approach or methodology
- Reference relevant concepts without solving directly
- Keep responses concise and focused

CONTEXT INFORMATION:
- Exam ID: ${examData.examId || 'unknown'}
- Subject: ${examData.subject || 'unknown'}
- Time remaining: ${examData.timeRemaining || 'unknown'} seconds
- Current time: ${currentTime}

Remember: Your goal is to guide learning, not provide answers. Help them discover the solution through questions and hints.`;
      } catch (e) {
        // If JSON parsing fails, fall back to general exam context
        return `You are an AI tutor helping with exam questions. Guide the student's learning without giving direct answers. Current time: ${currentTime}.`;
      }
    }
    
    // Combine context and sources for limited/general modes
    const combinedContext = this.combineContextSources(chatContext, chatContextContent, sources);
    
    if (chatContext === 'limited') {
      return `You are a helpful AI assistant with access to specific context information. Current time: ${currentTime}.

IMPORTANT: You should primarily use the provided context information to answer questions. If the information is not available in the context, politely indicate that you don't have that specific information.

${combinedContext ? `\n---\nProvided Context:\n${combinedContext}\n---\n` : ''}`;
    } else if (chatContext === 'general') {
      return `You are a helpful AI assistant with access to both general knowledge and specific context information. Current time: ${currentTime}.

You can use your general knowledge along with any provided context information to give comprehensive and helpful answers.

${combinedContext ? `\n---\nAdditional Context:\n${combinedContext}\n---\n` : ''}`;
    }
    
    // Default fallback
    return `You are a helpful AI assistant. Be friendly, informative, and helpful. Current time: ${currentTime}.`;
  }

  private combineContextSources(
    chatContext: 'limited' | 'general' | 'liveexam',
    chatContextContent: string,
    sources?: SourceItem[]
  ): string {
    const contextParts: string[] = [];
    
    // Always include chatContextContent if provided
    if (chatContextContent && chatContextContent.trim()) {
      contextParts.push(`Context Information:\n${chatContextContent}`);
    }
    
    // Add sources only for limited and general modes (not liveexam)
    if (sources && sources.length > 0 && chatContext !== 'liveexam') {
      const sourceContent = sources.map((source, index) => {
        let sourceText = `Source ${index + 1} (${source.type}):`;
        if (source.metadata?.title) sourceText += ` ${source.metadata.title}`;
        if (source.metadata?.url) sourceText += ` (${source.metadata.url})`;
        if (source.metadata?.filename) sourceText += ` [${source.metadata.filename}]`;
        sourceText += `\n${source.content}`;
        return sourceText;
      }).join('\n\n');
      
      contextParts.push(`Additional Sources:\n${sourceContent}`);
    }
    
    return contextParts.join('\n\n---\n\n');
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility method to check if API key is valid format
  static isValidApiKey(apiKey: string): boolean {
    return Boolean(apiKey && apiKey.startsWith('sk-') && apiKey.length > 20);
  }
}