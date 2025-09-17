// helpers/gemini.js
import fetch from "node-fetch";
import { RESEARCH_ASSISTANT_PROMPT } from "../prompts/researchAssistantPrompt.js";
import env from "../config/env.js";

const GEMINI_API_KEY = env.GEMINI_API_KEY;

const MODEL_ID = "gemini-2.5-flash";
const GENERATE_CONTENT_API = "streamGenerateContent";

function processGeminiResponse(response) {
  try {
    const result = {
      content: '',
      sources: new Set()
    };

    response.forEach(chunk => {
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
        result.content += chunk.candidates[0].content.parts[0].text;
      }
      
      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        chunk.candidates[0].groundingMetadata.groundingChunks.forEach(chunk => {
          if (chunk.web?.uri) {
            result.sources.add(chunk.web.uri);
          }
        });
      }
    });

    result.content = result.content
      .replace(/\*\*\*.*?\*\*\*/g, '') // Remove markdown bold
      .replace(/\[.*?\]\(.*?\)/g, '')  // Remove markdown links
      .replace(/\n{3,}/g, '\n\n')       // Remove extra newlines
      .trim();

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

export async function generateContent(prompt) {
  if (!GEMINI_API_KEY) {
    return {
      content: 'Error: Gemini API is not configured. Please set the GEMINI_API_KEY in your .env file.',
      sources: [],
      timestamp: new Date().toISOString()
    };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { 
            text: `${RESEARCH_ASSISTANT_PROMPT}\n\nUser Query: ${prompt}` 
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
      responseMimeType: "text/plain"
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
    ],
    tools: [
      { googleSearch: {}  },
    ],
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    // Process the response to extract clean content
    const processed = processGeminiResponse(Array.isArray(data) ? data : [data]);
    
    // Return a clean, structured response
    return {
      content: processed.content,
      sources: processed.sources,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error generating content:", error);
    return {
      content: `Error: ${error.message}`,
      sources: [],
      timestamp: new Date().toISOString()
    };
  }
}