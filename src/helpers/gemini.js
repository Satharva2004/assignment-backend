// helpers/gemini.js
import fetch from "node-fetch";
import { RESEARCH_ASSISTANT_PROMPT } from "../prompts/researchAssistantPrompt.js";
import env from "../config/env.js";

const GEMINI_API_KEYS = [
  env.GEMINI_API_KEY,
  env.GEMINI_API_KEY2 
].filter(Boolean);

const MODEL_ID = "gemini-2.5-flash";
const GENERATE_CONTENT_API = "streamGenerateContent";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Configuration constants
const CONFIG = {
  MAX_HISTORY_LENGTH: 10, // Increased for better context
  MAX_OUTPUT_TOKENS: 8192, // Significantly increased output tokens
  MAX_USERS: 100, // Prevent memory leaks
  RETRY_DELAY: 1000, // 1 second delay between retries
  REQUEST_TIMEOUT: 30000, // 30 second timeout
};

// Retryable HTTP status codes
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// Enhanced chat history management with LRU-like behavior
class ChatHistoryManager {
  constructor(maxUsers = CONFIG.MAX_USERS) {
    this.history = new Map();
    this.maxUsers = maxUsers;
    this.accessOrder = new Map(); // Track access time for LRU
  }

  get(userId) {
    this.accessOrder.set(userId, Date.now());
    return this.history.get(userId) || [];
  }

  set(userId, messages) {
    // Implement LRU eviction if we exceed max users
    if (this.history.size >= this.maxUsers && !this.history.has(userId)) {
      const oldestUser = [...this.accessOrder.entries()]
        .sort((a, b) => a[1] - b[1])[0][0];
      this.history.delete(oldestUser);
      this.accessOrder.delete(oldestUser);
    }

    this.history.set(userId, messages);
    this.accessOrder.set(userId, Date.now());
  }

  clear(userId) {
    this.history.delete(userId);
    this.accessOrder.delete(userId);
  }
}

// API key rotation with backoff
class APIKeyManager {
  constructor(keys) {
    this.keys = keys;
    this.currentIndex = 0;
    this.failedKeys = new Set();
    this.keyRetryTime = new Map();
  }

  getCurrentKey() {
    if (this.keys.length === 0) return null;
    return this.keys[this.currentIndex];
  }

  markKeyFailed(keyIndex, retryAfter = 60000) { // 1 minute default
    this.failedKeys.add(keyIndex);
    this.keyRetryTime.set(keyIndex, Date.now() + retryAfter);
  }

  getNextAvailableKey() {
    const now = Date.now();
    
    // Reset failed keys that are ready for retry
    for (const [keyIndex, retryTime] of this.keyRetryTime.entries()) {
      if (now >= retryTime) {
        this.failedKeys.delete(keyIndex);
        this.keyRetryTime.delete(keyIndex);
      }
    }

    // Find next available key
    for (let i = 0; i < this.keys.length; i++) {
      const keyIndex = (this.currentIndex + i) % this.keys.length;
      if (!this.failedKeys.has(keyIndex)) {
        this.currentIndex = keyIndex;
        return { key: this.keys[keyIndex], index: keyIndex };
      }
    }

    return null; // All keys failed
  }

  rotateKey() {
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
  }
}

// Enhanced response processor that handles both streaming and non-streaming responses
function processGeminiResponse(response) {
  const result = { content: '', sources: new Set() };

  try {
    // Handle streaming response (array of chunks) vs single response
    const responseChunks = Array.isArray(response) ? response : [response];
    console.log(`Processing ${responseChunks.length} response chunks`);

    let hasValidContent = false;
    let lastFinishReason = null;

    for (let i = 0; i < responseChunks.length; i++) {
      const chunk = responseChunks[i];
      console.log(`Processing chunk ${i + 1}:`, JSON.stringify(chunk, null, 2));

      const candidates = chunk.candidates;
      if (!candidates?.length) {
        console.warn(`No candidates in chunk ${i + 1}`);
        
        // Check for prompt feedback only in first chunk
        if (i === 0 && chunk.promptFeedback) {
          console.warn('Prompt feedback:', chunk.promptFeedback);
          if (chunk.promptFeedback.blockReason) {
            result.content = `Content blocked: ${chunk.promptFeedback.blockReason}`;
            return { content: result.content, sources: [] };
          }
        }
        continue;
      }

      const candidate = candidates[0];
      
      // Track finish reason from last chunk
      if (candidate.finishReason) {
        lastFinishReason = candidate.finishReason;
        console.log(`Chunk ${i + 1} finish reason:`, candidate.finishReason);
      }

      // Extract content from this chunk
      const parts = candidate.content?.parts;
      if (parts && Array.isArray(parts)) {
        const textParts = parts.filter(part => part.text && typeof part.text === 'string');
        
        if (textParts.length > 0) {
          const chunkContent = textParts.map(part => part.text).join('');
          result.content += chunkContent;
          hasValidContent = true;
          console.log(`Chunk ${i + 1} added ${chunkContent.length} characters`);
        }
      }
      
      // Extract sources from this chunk
      const groundingChunks = candidate.groundingMetadata?.groundingChunks;
      if (groundingChunks && Array.isArray(groundingChunks)) {
        groundingChunks
          .filter(chunk => chunk.web?.uri)
          .forEach(chunk => result.sources.add(chunk.web.uri));
      }
    }

    // Check final finish reason for blocking
    if (lastFinishReason === 'SAFETY') {
      result.content = 'Response blocked due to safety filters';
      return { content: result.content, sources: [] };
    }
    if (lastFinishReason === 'RECITATION') {
      result.content = 'Response blocked due to recitation concerns';
      return { content: result.content, sources: [] };
    }

    // Clean content if we have any
    if (result.content && result.content.length > 0) {
      const originalLength = result.content.length;
      result.content = result.content
        .replace(/\*\*\*.*?\*\*\*/g, '') // Remove markdown bold
        .replace(/\[.*?\]\(.*?\)/g, '')  // Remove markdown links
        .replace(/\n{3,}/g, '\n\n')       // Remove extra newlines
        .trim();
      console.log(`Content cleaned: ${originalLength} -> ${result.content.length} chars`);
    }

    console.log('Final processing result:', { 
      contentLength: result.content?.length || 0, 
      sourcesCount: result.sources.size || 0,
      hasValidContent,
      lastFinishReason
    });

  } catch (error) {
    console.error('Error processing Gemini response:', error);
    result.content = `Error processing response: ${error.message}`;
  }
  return {
    content: result.content,
    sources: Array.from(result.sources)
  };
}


function buildRequestBody(messages, includeSearch = true) {
  const body = {
    contents: messages.map(msg => ({
      role: msg.role,
      parts: msg.parts
    })),
    generationConfig: {
      temperature: 0.1, 
      topP: 0.95,
      topK: 40,
      maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS,
      candidateCount: 1,
      stopSequences: []
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_ONLY_HIGH"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH", 
        threshold: "BLOCK_ONLY_HIGH" 
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_ONLY_HIGH" 
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_ONLY_HIGH" 
      }
    ]
  };

  if (includeSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  console.log('Built request body:', JSON.stringify(body, null, 2));
  return body;
}

async function fetchWithTimeout(url, options, timeout = CONFIG.REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Initialize singletons
const chatHistory = new ChatHistoryManager();
const keyManager = new APIKeyManager(GEMINI_API_KEYS);

export async function generateContent(
  prompt, 
  userId = 'default', 
  systemPrompt = RESEARCH_ASSISTANT_PROMPT,
  options = {}
) {
  // Validate API keys
  if (!GEMINI_API_KEYS?.length) {
    return {
      content: 'Error: No Gemini API keys configured. Please set at least one GEMINI_API_KEY in your .env file.',
      sources: [],
      timestamp: new Date().toISOString(),
      error: 'MISSING_API_KEYS'
    };
  }

  const startTime = Date.now();
  
  try {
    // Get user history and prepare messages
    const userHistory = chatHistory.get(userId);
    const userMessage = {
      role: 'user',
      parts: [{ text: prompt }]
    };

    let messages = [];
    
    // Only add system prompt for new conversations
    if (userHistory.length === 0) {
      messages.push({
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
      });
    } else {
      // Use existing history + new message
      messages = [
        ...userHistory.slice(-(CONFIG.MAX_HISTORY_LENGTH * 2)),
        userMessage
      ];
    }

    const requestBody = buildRequestBody(messages, options.includeSearch !== false);
    let lastError = null;
    let attemptsCount = 0;
    const maxAttempts = Math.min(GEMINI_API_KEYS.length * 2, 5); // Limit total attempts

    // Retry logic with exponential backoff
    while (attemptsCount < maxAttempts) {
      const keyInfo = keyManager.getNextAvailableKey();
      
      if (!keyInfo) {
        lastError = new Error('All API keys are currently unavailable');
        break;
      }

      attemptsCount++;
      console.log(`Attempt ${attemptsCount}/${maxAttempts} using API key index: ${keyInfo.index}`);

      try {
        const url = `${BASE_URL}/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${keyInfo.key}`;
        
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Research-Assistant/1.0'
          },
          body: JSON.stringify(requestBody)
        });

        // Log response details for debugging
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        const data = await response.json().catch(err => {
          console.error('Failed to parse response as JSON:', err);
          return { error: { message: 'Invalid JSON response' } };
        });
        
        console.log('Raw response data:', JSON.stringify(data, null, 2));
        
        if (!response.ok) {
          const error = new Error(data?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
          
          // Handle retryable errors
          if (RETRYABLE_STATUS_CODES.has(response.status)) {
            console.warn(`Retryable error (${response.status}), trying next key...`);
            keyManager.markKeyFailed(keyInfo.index, response.status === 429 ? 300000 : 60000);
            keyManager.rotateKey();
            
            if (attemptsCount < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attemptsCount));
              continue;
            }
          }
          
          throw error;
        }
        
        // Process successful response
        const result = processGeminiResponse(data);
        
        // Check if we got empty content and handle it
        if (!result.content || result.content.trim().length === 0) {
          console.warn('Received empty content from API');
          
          // If we have attempts left and this might be a temporary issue, retry
          if (attemptsCount < maxAttempts) {
            console.log('Retrying due to empty content...');
            keyManager.rotateKey();
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            continue;
          } else {
            // Last attempt - return with helpful message
            result.content = 'No content generated. This might be due to safety filters or the prompt being too restrictive.';
            result.warning = 'EMPTY_CONTENT';
          }
        }
        
        // Update chat history only on successful response with content
        if (result.content?.trim()) {
          const updatedHistory = [...userHistory];
          
          // Add user message (without system prompt for history)
          if (userHistory.length === 0) {
            updatedHistory.push({
              role: 'user',
              parts: [{ text: prompt }] // Store without system prompt
            });
          } else {
            updatedHistory.push(userMessage);
          }
          
          // Add assistant response
          updatedHistory.push({
            role: 'model',
            parts: [{ text: result.content }]
          });

          // Maintain history size
          if (updatedHistory.length > CONFIG.MAX_HISTORY_LENGTH * 2) {
            updatedHistory.splice(0, updatedHistory.length - (CONFIG.MAX_HISTORY_LENGTH * 2));
          }
          
          chatHistory.set(userId, updatedHistory);
        }
        
        // Add metadata
        result.timestamp = new Date().toISOString();
        result.processingTime = Date.now() - startTime;
        result.attempts = attemptsCount;
        
        console.log(`Request completed successfully in ${result.processingTime}ms`);
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attemptsCount} failed:`, error.message);
        
        // For non-retryable errors, break immediately
        if (!error.message.includes('timeout') && !error.message.includes('fetch')) {
          break;
        }
        
        keyManager.rotateKey();
        
        if (attemptsCount < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attemptsCount));
        }
      }
    }
    
    // All attempts failed
    console.error('All attempts failed:', lastError);
    return {
      content: `Error: ${lastError?.message || 'All API attempts failed'}`,
      sources: [],
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      attempts: attemptsCount,
      error: 'API_FAILURE'
    };
    
  } catch (error) {
    console.error('Unexpected error in generateContent:', error);
    return {
      content: `Unexpected error: ${error.message}`,
      sources: [],
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      error: 'UNEXPECTED_ERROR'
    };
  }
}

// Utility functions for chat management
export function clearChatHistory(userId) {
  chatHistory.clear(userId);
}

export function getChatHistory(userId) {
  return chatHistory.get(userId);
}

export function getAPIKeyStatus() {
  return {
    totalKeys: GEMINI_API_KEYS.length,
    currentKeyIndex: keyManager.currentIndex,
    failedKeys: Array.from(keyManager.failedKeys),
    availableKeys: GEMINI_API_KEYS.length - keyManager.failedKeys.size
  };
}