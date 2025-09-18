// helpers/gemini.js
import fetch from "node-fetch";
import { RESEARCH_ASSISTANT_PROMPT } from "../prompts/researchAssistantPrompt.js";
import env from "../config/env.js";

const GEMINI_API_KEYS = [
  env.GEMINI_API_KEY,
  env.GEMINI_API_KEY2 
].filter(Boolean);

const MODEL_ID = "gemini-2.5-flash";
let currentKeyIndex = 0;
const GENERATE_CONTENT_API = "streamGenerateContent";

function processGeminiResponse(response) {
  try {
    const result = {
      content: '',
      sources: new Set()
    };

    // Handle both array and single response
    const responses = Array.isArray(response) ? response : [response];

    responses.forEach(chunk => {
      // Handle both stream and non-stream responses
      const candidate = chunk.candidates?.[0];
      if (!candidate) return;

      // Extract content
      if (candidate.content?.parts) {
        candidate.content.parts.forEach(part => {
          if (part.text) {
            result.content += part.text;
          }
        });
      }
      
      // Extract sources if available
      if (candidate.groundingMetadata?.groundingChunks) {
        candidate.groundingMetadata.groundingChunks.forEach(chunk => {
          if (chunk.web?.uri) {
            result.sources.add(chunk.web.uri);
          }
        });
      }
    });

    // Clean up the content
    if (result.content) {
      result.content = result.content
        .replace(/\*\*\*.*?\*\*\*/g, '') // Remove markdown bold
        .replace(/\[.*?\]\(.*?\)/g, '')  // Remove markdown links
        .replace(/\n{3,}/g, '\n\n')       // Remove extra newlines
        .trim();
    }

    // Convert sources Set to array
    result.sources = Array.from(result.sources);

    return result;
  } catch (error) {
    console.error('Error processing response:', error);
    return {
      content: 'Error processing response',
      sources: []
    };
  }
}

// Store chat history in memory (in a real app, consider using a proper caching solution)
const chatHistory = new Map(); // userId -> messageHistory[]
const MAX_HISTORY_LENGTH = 5; // Keep last 5 exchanges in history

export async function generateContent(prompt, userId = 'default', systemPrompt = RESEARCH_ASSISTANT_PROMPT) {
  if (!GEMINI_API_KEYS || GEMINI_API_KEYS.length === 0) {
    return {
      content: 'Error: No Gemini API keys configured. Please set at least one GEMINI_API_KEY in your .env file.',
      sources: [],
      timestamp: new Date().toISOString()
    };
  }

  // Initialize or get user's chat history
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const userHistory = chatHistory.get(userId);

  // Create the user message
  const userMessage = {
    role: 'user',
    parts: [{ text: prompt }]
  };
  
  // Prepare messages array with history
  let messages = [];
  
  // If there's no history, include the system prompt in the first user message
  if (userHistory.length === 0) {
    messages.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
    });
  } else {
    // Add history and current message
    messages = [
      ...userHistory.slice(-MAX_HISTORY_LENGTH * 2), // Multiply by 2 because we store both user and model messages
      userMessage
    ];
  }

  // Format messages for Gemini API
  const contents = messages.map(msg => ({
    role: msg.role,
    parts: msg.parts
  }));

  const body = {
    contents: contents,
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  // Always enable web search for grounding
  body.tools = [{ googleSearch: {} }];

  let lastError = null;
  let result = { content: '', sources: [] };
  
  // Try each API key until one works
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const currentKey = GEMINI_API_KEYS[currentKeyIndex];
    try {
      console.log(`Using API key index: ${currentKeyIndex}`);
      console.log('Sending request to Gemini API with body:', JSON.stringify(body, null, 2));
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${currentKey}`;
      
      console.log('Sending request to Gemini API:', {
        url: url.replace(currentKey, '***MASKED***'), // Don't log full key
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(e => ({}));
      
      if (!response.ok) {
        lastError = new Error(data?.error?.message || `HTTP error! status: ${response.status}`);
        
        // If rate limited or service unavailable, try next key
        if (response.status === 429 || response.status === 503) {
          console.warn(`API key ${currentKeyIndex} rate limited or unavailable, trying next key...`);
          currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
          continue;
        }
        
        console.error('Gemini API Error:', {
          status: response.status,
          statusText: response.statusText,
          data
        });
        throw lastError;
      }
      
      // Process the successful response
      result = processGeminiResponse(data);
      
      // Add assistant's response to history if we have content
      if (result.content && userMessage.parts[0].text.trim()) {
        userHistory.push(userMessage);
        userHistory.push({
          role: 'model',
          parts: [{ text: result.content }]
        });

        // Trim history if it exceeds max length (keep last N exchanges)
        if (userHistory.length > MAX_HISTORY_LENGTH * 2) {
          userHistory.splice(0, userHistory.length - (MAX_HISTORY_LENGTH * 2));
        }
        
        // Update chat history
        chatHistory.set(userId, userHistory);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed with error:`, error.message);
      
      // If not the last key, continue to next iteration
      if (i < GEMINI_API_KEYS.length - 1) {
        currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
        continue;
      }
    }
  }
  
  // If we get here, all keys failed
  const error = lastError || new Error('All API keys failed');
  console.error('All API keys failed:', error);
  
  return {
    content: `Error: ${error.message}`,
    sources: [],
    timestamp: new Date().toISOString()
  };
}