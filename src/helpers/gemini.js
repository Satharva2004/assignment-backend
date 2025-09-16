// helpers/gemini.js
import fetch from "node-fetch";
import { RESEARCH_ASSISTANT_PROMPT } from "../prompts/researchAssistantPrompt.js";

// Don't check API key at module load time
// Let the function handle it when called
function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set');
    console.log('Current environment variables:', Object.keys(process.env));
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return apiKey;
}
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
  try {
    const apiKey = getApiKey(); // Get API key when function is called
    
    console.log('Sending request to Gemini API with prompt:', prompt);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${RESEARCH_ASSISTANT_PROMPT}\n\nUser: ${prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
            stopSequences: [],
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API Error:', errorData);
      throw new Error(
        `Gemini API request failed with status ${response.status}: ${JSON.stringify(errorData)}`
      );
    }

    // Get the response data
    const data = await response.json();
    let result = '';
    let sources = new Set();
    
    console.log('Gemini API Response:', JSON.stringify(data, null, 2)); // Debug log
    
    // Handle the response based on the expected structure
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      result = data.candidates[0].content.parts[0].text;
    } else if (data.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
      result = JSON.stringify(data.candidates[0].content.parts[0].functionCall, null, 2);
    } else if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      result = '[Binary data received]';
    }
    
    // Extract sources if available
    if (data.usageMetadata) {
      console.log('Token usage:', data.usageMetadata);
    }
    
    if (data.candidates?.[0]?.citationMetadata?.citationSources) {
      data.candidates[0].citationMetadata.citationSources.forEach(source => {
        if (source.uri) sources.add(source.uri);
      });
    }
    
    // Fallback to grounding metadata if no citations found
    if (sources.size === 0 && data.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      data.candidates[0].groundingMetadata.groundingChunks.forEach(chunk => {
        if (chunk.web?.uri) sources.add(chunk.web.uri);
      });
    }

    return {
      content: result,
      sources: Array.from(sources)
    };
  } catch (error) {
    console.error('Error in generateContent:', error);
    throw error;
  }
}