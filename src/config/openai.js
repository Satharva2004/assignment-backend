import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate OpenAI API key
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not set');
  console.error('Please add OPENAI_API_KEY to your .env file');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

/**
 * Transcribes audio using OpenAI's Whisper API
 * @param {ReadableStream} audioStream - Audio stream to transcribe
 * @param {string} [model='whisper-1'] - Model to use for transcription
 * @returns {Promise<Object>} - Transcription result
 */
export const transcribeAudio = async (audioStream, model = 'whisper-1') => {
  try {
    console.log('Sending audio to OpenAI Whisper API...');
    
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: model,
      response_format: 'json',
    });

    console.log('Received response from OpenAI Whisper API');
    
    if (!response || !response.text) {
      console.error('Invalid response from OpenAI API:', response);
      throw new Error('No transcription text in response');
    }

    return {
      success: true,
      text: response.text,
    };
  } catch (error) {
    console.error('OpenAI API Error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      time: new Date().toISOString()
    });
    
    let errorMessage = 'Failed to transcribe audio';
    
    if (error.status === 401) {
      errorMessage = 'Invalid OpenAI API key';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded for OpenAI API';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Could not connect to OpenAI API - network error';
    } else if (error.response) {
      errorMessage = `OpenAI API error: ${error.response.status} - ${error.response.statusText}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export default openai;
