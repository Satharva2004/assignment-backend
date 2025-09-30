// helpers/gemini.js
import fetch from "node-fetch";
import { RESEARCH_ASSISTANT_PROMPT } from "../prompts/researchAssistantPrompt.js";
import { REAL_ESTATE_EXPERT_PROMPT } from "../prompts/realestateexpert.js";
import { CRYPTO_EXPERT_PROMPT } from "../prompts/cryptoexpert.js";
import { PORTFOLIO_EXPERT_PROMPT as INVESTMENT_EXPERT_PROMPT } from "../prompts/investmentexpert.js";
import { STOCK_EXPERT_PROMPT } from "../prompts/stockexpert.js";
import { RETIREMENT_TAX_EXPERT_PROMPT } from "../prompts/retierment_tax_expert.js";


import env from "../config/env.js";

// Map of expert types to their corresponding prompts
const EXPERT_PROMPTS = {
  'research': RESEARCH_ASSISTANT_PROMPT,
  'real-estate': REAL_ESTATE_EXPERT_PROMPT,
  'crypto': CRYPTO_EXPERT_PROMPT,
  'investment': INVESTMENT_EXPERT_PROMPT,
  'stock': STOCK_EXPERT_PROMPT,
  'retirement-tax': RETIREMENT_TAX_EXPERT_PROMPT,
  'default': RESEARCH_ASSISTANT_PROMPT,
};

const GEMINI_API_KEYS = [
  env.GEMINI_API_KEY,
  env.GEMINI_API_KEY2 
].filter(Boolean);

export const MODEL_ID = "gemini-2.5-flash";
export const GENERATE_CONTENT_API = "generateContent";
export const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Configuration constants
const CONFIG = {
  MAX_HISTORY_LENGTH: 10,
  MAX_OUTPUT_TOKENS: 8192, 
  MAX_USERS: 100,
  RETRY_DELAY: 1000, //1ms
  REQUEST_TIMEOUT: 60000,
  TITLE_FETCH_TIMEOUT: 5000, // 5 seconds for title fetching
  MAX_TITLE_LENGTH: 100, // Maximum title length
};

// Retryable HTTP status codes
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// Cache for page titles to avoid repeated requests
const titleCache = new Map();

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

/**
 * Fetch page title from URL
 * @param {string} url - The URL to fetch title from
 * @returns {Promise<string>} - The page title or fallback
 */
async function fetchPageTitle(url) {
  // Check cache first
  if (titleCache.has(url)) {
    return titleCache.get(url);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TITLE_FETCH_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract title using regex (simple but effective for most cases)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';
    
    // Clean up title
    if (title) {
      title = title
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/[\r\n\t]/g, ' ') // Replace newlines and tabs with spaces
        .trim();
      
      // Truncate if too long
      if (title.length > CONFIG.MAX_TITLE_LENGTH) {
        title = title.substring(0, CONFIG.MAX_TITLE_LENGTH - 3) + '...';
      }
    }

    // Fallback to domain name if no title found
    if (!title) {
      try {
        const urlObj = new URL(url);
        title = urlObj.hostname.replace(/^www\./, '');
      } catch (e) {
        title = 'Untitled';
      }
    }

    // Cache the result
    titleCache.set(url, title);
    
    return title;
  } catch (error) {
    console.warn(`Failed to fetch title for ${url}:`, error.message);
    
    // Fallback to domain name
    try {
      const urlObj = new URL(url);
      const fallback = urlObj.hostname.replace(/^www\./, '');
      titleCache.set(url, fallback);
      return fallback;
    } catch (e) {
      const fallback = 'Link';
      titleCache.set(url, fallback);
      return fallback;
    }
  }
}

/**
 * Process sources to include titles
 * @param {Set<string>} sources - Set of URLs
 * @returns {Promise<Array>} - Array of source objects with titles
 */
async function processSourcesWithTitles(sources) {
  if (!sources || sources.size === 0) return [];

  const sourceArray = Array.from(sources);
  const processedSources = [];

  // Process sources concurrently but limit to avoid overwhelming servers
  const BATCH_SIZE = 3;
  for (let i = 0; i < sourceArray.length; i += BATCH_SIZE) {
    const batch = sourceArray.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (url) => {
      const title = await fetchPageTitle(url);
      return { url, title };
    });

    try {
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processedSources.push(result.value);
        } else {
          // Fallback if promise rejected
          const url = batch[index];
          try {
            const urlObj = new URL(url);
            processedSources.push({ 
              url, 
              title: urlObj.hostname.replace(/^www\./, '') 
            });
          } catch (e) {
            processedSources.push({ url, title: 'Link' });
          }
        }
      });
    } catch (error) {
      console.warn('Error processing source batch:', error);
      // Add remaining URLs with fallback titles
      batch.forEach(url => {
        try {
          const urlObj = new URL(url);
          processedSources.push({ 
            url, 
            title: urlObj.hostname.replace(/^www\./, '') 
          });
        } catch (e) {
          processedSources.push({ url, title: 'Link' });
        }
      });
    }
  }

  return processedSources;
}

// Enhanced response processor that handles both streaming and non-streaming responses
async function processGeminiResponse(response) {
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

    // If we have content, extract URLs (markdown links and plain URLs) into sources
    if (result.content && result.content.length > 0) {
      try {
        const text = result.content;
        // Extract markdown links: [title](url)
        const mdLinkRe = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g;
        let m;
        while ((m = mdLinkRe.exec(text)) !== null) {
          if (m[1]) result.sources.add(m[1]);
        }
        // Extract plain URLs
        const urlRe = /(https?:\/\/[^\s)]+)(?![^\(]*\))/g;
        let u;
        while ((u = urlRe.exec(text)) !== null) {
          if (u[1]) result.sources.add(u[1]);
        }
      } catch (e) {
        console.warn('URL extraction from content failed:', e?.message || e);
      }

      // Light cleanup while preserving markdown links so users can click them
      const originalLength = result.content.length;
      result.content = result.content
        .replace(/\*\*\*.*?\*\*\*/g, '') // Remove triple-asterisk bold artifacts if any
        .replace(/\n{3,}/g, '\n\n')       // Remove excessive newlines
        .trim();
      console.log(`Content cleaned (links preserved): ${originalLength} -> ${result.content.length} chars`);
    }

    // Process sources with titles
    const processedSources = await processSourcesWithTitles(result.sources);

    console.log('Final processing result:', { 
      contentLength: result.content?.length || 0, 
      sourcesCount: processedSources.length,
      hasValidContent,
      lastFinishReason
    });

    return {
      content: result.content,
      sources: processedSources
    };

  } catch (error) {
    console.error('Error processing Gemini response:', error);
    return {
      content: `Error processing response: ${error.message}`,
      sources: []
    };
  }
}

export function buildRequestBody(messages, systemPrompt = null, includeSearch = true) {
  const body = {
    contents: messages,
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

  // Add system instruction if provided
  if (systemPrompt) {
    // Ensure system instruction is given highest priority
    body.systemInstruction = {
      role: 'system',
      parts: [{ 
        text: systemPrompt + "\n\nRemember: Follow all instructions exactly as given, including response formatting requirements."
      }]
    };
    
    // Also add as the first message to reinforce the instruction
    if (body.contents && body.contents.length > 0) {
      body.contents = [
        {
          role: 'user',
          parts: [{ text: 'IMPORTANT: Follow all instructions in the system prompt exactly, including any required response formatting.' }]
        },
        ...body.contents
      ];
    }
  }

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

// Minimal upload helpers to extract text from supported files and images for inlineData
// Try to parse PDF buffers using pdf-parse if available
async function parsePdfBuffer(buf) {
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod?.default || mod;
    const result = await pdfParse(buf);
    return result?.text || '';
  } catch (e) {
    console.warn('pdf-parse not available or failed to parse PDF:', e?.message || e);
    return '';
  }
}

// Try to parse DOCX using mammoth if available
async function parseDocxBuffer(buf) {
  try {
    const mod = await import('mammoth');
    const mammoth = mod?.default || mod;
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return result?.value || '';
  } catch (e) {
    console.warn('mammoth not available or failed to parse DOCX:', e?.message || e);
    return '';
  }
}

// Try to parse spreadsheets (xls/xlsx) using xlsx if available
async function parseSpreadsheetBuffer(buf) {
  try {
    const mod = await import('xlsx');
    const XLSX = mod?.default || mod;
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetNames = wb.SheetNames || [];
    let out = '';
    for (const name of sheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const csv = XLSX.utils.sheet_to_csv(ws);
      if (csv && csv.trim()) {
        out += `--- Sheet: ${name} ---\n${csv}\n`;
      }
    }
    return out.trim();
  } catch (e) {
    console.warn('xlsx not available or failed to parse spreadsheet:', e?.message || e);
    return '';
  }
}

export async function extractTextFromUploads(files = []) {
  if (!Array.isArray(files) || files.length === 0) return '';
  const parts = [];
  const MAX_TOTAL_CHARS = 50000; // safety cap to avoid overly long prompts
  let total = 0;
  for (const f of files) {
    try {
      const name = f.originalname || 'file';
      const mime = f.mimetype || '';
      const buf = f.buffer;
      if (!buf || !Buffer.isBuffer(buf)) continue;

      let text = '';
      if (mime === 'application/pdf') {
        text = await parsePdfBuffer(buf);
      } else if (mime.startsWith('text/')) {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'text/markdown') {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'text/html') {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'application/json') {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'application/rtf') {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // .docx
        text = await parseDocxBuffer(buf);
      } else if (mime === 'application/msword') { // .doc legacy
        console.warn('Legacy .doc files are not supported for text extraction. Consider converting to .docx');
        text = '';
      } else if (mime === 'text/csv') {
        text = Buffer.from(buf).toString('utf8');
      } else if (mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') { // .xls/.xlsx
        text = await parseSpreadsheetBuffer(buf);
      } else if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || mime === 'application/vnd.ms-powerpoint') { // .pptx/.ppt
        console.warn('PowerPoint files are accepted but text extraction is not implemented.');
        text = '';
      } else {
        // Not implementing heavy parsers here; gracefully skip unsupported
        // Fallback by basic extension check for .pdf
        const lower = (name || '').toLowerCase();
        if (!text && lower.endsWith('.pdf')) {
          text = await parsePdfBuffer(buf);
        } else if (lower.endsWith('.docx')) {
          text = await parseDocxBuffer(buf);
        } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          text = await parseSpreadsheetBuffer(buf);
        } else {
          text = '';
        }
      }

      if (text) {
        // Truncate incrementally to the cap
        const remaining = Math.max(0, MAX_TOTAL_CHARS - total);
        const snippet = text.length > remaining ? text.slice(0, remaining) : text;
        if (snippet.length > 0) {
          parts.push(`--- Uploaded: ${name} ---\n\n${snippet}\n\n`);
          total += snippet.length;
        }
        if (total >= MAX_TOTAL_CHARS) {
          console.warn('Total extracted text truncated to MAX_TOTAL_CHARS');
          break;
        }
      }
    } catch (e) {
      // ignore single file errors
    }
  }
  return parts.join('');
}

export async function extractImagesFromUploads(files = []) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const images = [];
  for (const f of files) {
    try {
      const mime = f?.mimetype || '';
      if (!mime.startsWith('image/')) continue;
      const name = f.originalname || 'image';
      const buf = f.buffer;
      if (!buf || !Buffer.isBuffer(buf)) continue;
      const data = Buffer.from(buf).toString('base64');
      images.push({ name, mimeType: mime, data });
    } catch (_) {
      /* ignore single file errors */
    }
  }
  return images;
}

/**
 * Generate content using Gemini API
 * @param {string} prompt - The user's input prompt
 * @param {string} [userId='default'] - Unique identifier for the user's chat session
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.expert='research'] - The expert type to use
 * @param {string} [options.systemPrompt] - Custom system prompt (overrides expert prompt)
 * @param {boolean} [options.includeSearch=true] - Whether to include web search
 * @param {Array} [options.uploads] - Array of uploaded files
 * @returns {Promise<Object>} The generated content response
 */
export async function generateContent(
  prompt, 
  userId = 'default',
  options = {}
) {
  console.log('generateContent called with:', { prompt, userId, options });

  
  const startTime = Date.now();
  
  try {
    // Select the appropriate system prompt based on expert type
    const expertType = (options.expert || 'research').toLowerCase();
    const customSystemPrompt = options.systemPrompt;
    const selectedSystemPrompt = customSystemPrompt || EXPERT_PROMPTS[expertType] || EXPERT_PROMPTS.default;
    
    console.log('=== Expert Selection ===');
    console.log('Requested expert type:', expertType);
    console.log('Available expert types:', Object.keys(EXPERT_PROMPTS));
    console.log('Using custom system prompt:', customSystemPrompt ? 'Yes' : 'No');
    
    if (customSystemPrompt) {
      console.log('Using provided custom system prompt');
    } else if (EXPERT_PROMPTS[expertType]) {
      console.log(`Using expert prompt for: ${expertType}`);
      console.log('Prompt starts with:', EXPERT_PROMPTS[expertType].substring(0, 100) + '...');
    } else {
      console.warn(`Unknown expert type: ${expertType}. Using default research assistant prompt.`);
      console.log('Default prompt starts with:', EXPERT_PROMPTS.default.substring(0, 100) + '...');
    }

    // Reset history on demand (e.g., when new files are uploaded) to avoid stale context bleed
    if (options.resetHistory) {
      console.log(`Resetting chat history for userId=${userId} due to resetHistory option`);
      chatHistory.clear(userId);
    }

    // Get user history and prepare messages
    const userHistory = chatHistory.get(userId);

    // Incorporate uploaded text and images if provided
    const uploadedText = await extractTextFromUploads(options.uploads);
    const uploadedImages = await extractImagesFromUploads(options.uploads);
    if (options.uploads && options.uploads.length) {
      console.log('Uploads provided to generateContent:', {
        total: options.uploads.length,
        textChars: uploadedText ? uploadedText.length : 0,
        imagesCount: uploadedImages.length
      });
    }

    let composedPrompt = prompt || '';
    if (uploadedText) {
      composedPrompt += `\n\n--- Uploaded Files Text ---\n${uploadedText}`;
    }

    const parts = [{ text: composedPrompt }];
    // Each uploaded image should be an object: { name?, mimeType, data(base64) }
    for (const img of uploadedImages) {
      if (img && img.data && img.mimeType) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }
    if (uploadedImages.length) {
      console.log(`Attached ${uploadedImages.length} image(s) to the user message as inlineData.`);
    }

    const userMessage = {
      role: 'user',
      parts
    };

    let messages = [...userHistory, userMessage];
    
    // Ensure we don't exceed max history length and only include valid roles
    const validMessages = messages.filter(m => m.role === 'user' || m.role === 'model');
    messages = validMessages.slice(-(CONFIG.MAX_HISTORY_LENGTH * 2));

    const requestBody = buildRequestBody(messages, selectedSystemPrompt, options.includeSearch !== false);
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
        const result = await processGeminiResponse(data);
        
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
          
          // Add user message
          updatedHistory.push(userMessage);
          
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

// Utility function to clear title cache (useful for testing or memory management)
export function clearTitleCache() {
  titleCache.clear();
}

// Utility function to get cache stats
export function getTitleCacheStats() {
  return {
    size: titleCache.size,
    entries: Array.from(titleCache.entries())
  };
}