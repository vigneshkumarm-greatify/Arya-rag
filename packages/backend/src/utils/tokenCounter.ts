/**
 * Token Counter Utility
 * 
 * Provides accurate token counting for text chunking.
 * Essential for staying within model context limits and consistent chunk sizes.
 * 
 * @author ARYA RAG Team
 */

import { encode } from 'gpt-tokenizer';

/**
 * Count tokens in a text string using GPT tokenizer
 * This is compatible with most models including OpenAI and approximates well for others
 * 
 * @param text - The text to count tokens for
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
  try {
    // Using gpt-tokenizer which is compatible with GPT-3/4 tokenization
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback to simple word-based estimation if tokenizer fails
    // Roughly 1 token = 0.75 words on average
    console.warn('Token counting failed, using fallback estimation:', error);
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return Math.ceil(words.length / 0.75);
  }
}

/**
 * Estimate tokens without full encoding (faster for large texts)
 * Uses character-based estimation
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated number of tokens
 */
export function estimateTokens(text: string): number {
  // Average of ~4 characters per token for English text
  // This is faster but less accurate than full tokenization
  return Math.ceil(text.length / 4);
}

/**
 * Split text at a specific token count, respecting word boundaries
 * 
 * @param text - The text to split
 * @param maxTokens - Maximum tokens for the first part
 * @returns Tuple of [firstPart, remainingPart]
 */
export function splitTextAtTokenCount(
  text: string, 
  maxTokens: number
): [string, string] {
  // Quick check if text is likely under limit
  if (estimateTokens(text) <= maxTokens) {
    const actualTokens = countTokens(text);
    if (actualTokens <= maxTokens) {
      return [text, ''];
    }
  }

  // Binary search to find the split point
  const words = text.split(/\s+/);
  let left = 0;
  let right = words.length;
  let bestSplit = 0;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const testText = words.slice(0, mid + 1).join(' ');
    const tokenCount = countTokens(testText);

    if (tokenCount <= maxTokens) {
      bestSplit = mid + 1;
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const firstPart = words.slice(0, bestSplit).join(' ');
  const remainingPart = words.slice(bestSplit).join(' ');

  return [firstPart, remainingPart];
}

/**
 * Find the last sentence boundary before a character position
 * Used to avoid splitting in the middle of sentences
 * 
 * @param text - The text to search in
 * @param maxPosition - Maximum character position
 * @returns Position of the last sentence boundary
 */
export function findSentenceBoundary(text: string, maxPosition: number): number {
  const searchText = text.substring(0, maxPosition);
  
  // Look for sentence endings (. ! ?) followed by space or end
  const sentenceEndings = /[.!?](?:\s|$)/g;
  let lastBoundary = 0;
  let match;

  while ((match = sentenceEndings.exec(searchText)) !== null) {
    lastBoundary = match.index + match[0].length;
  }

  // If no sentence boundary found, look for paragraph breaks
  if (lastBoundary === 0) {
    const paragraphBreak = searchText.lastIndexOf('\n\n');
    if (paragraphBreak > 0) {
      lastBoundary = paragraphBreak + 2;
    }
  }

  // If still no boundary, fall back to word boundary
  if (lastBoundary === 0) {
    const lastSpace = searchText.lastIndexOf(' ');
    if (lastSpace > 0) {
      lastBoundary = lastSpace + 1;
    }
  }

  return lastBoundary || maxPosition;
}

/**
 * Token counting statistics for debugging and monitoring
 */
export interface TokenStats {
  totalTokens: number;
  avgTokensPerWord: number;
  avgCharsPerToken: number;
  wordCount: number;
  charCount: number;
}

/**
 * Get detailed token statistics for a text
 * Useful for debugging and optimizing chunk sizes
 * 
 * @param text - The text to analyze
 * @returns Token statistics
 */
export function getTokenStats(text: string): TokenStats {
  const tokens = countTokens(text);
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const chars = text.length;

  return {
    totalTokens: tokens,
    avgTokensPerWord: words.length > 0 ? tokens / words.length : 0,
    avgCharsPerToken: tokens > 0 ? chars / tokens : 0,
    wordCount: words.length,
    charCount: chars
  };
}

/**
 * Validate if text fits within token limit
 * 
 * @param text - The text to validate
 * @param maxTokens - Maximum allowed tokens
 * @returns True if within limit
 */
export function isWithinTokenLimit(text: string, maxTokens: number): boolean {
  return countTokens(text) <= maxTokens;
}