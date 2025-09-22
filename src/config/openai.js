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
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: model,
      response_format: 'json',
    });

    return {
      success: true,
      text: response.text,
    };
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to transcribe audio',
    };
  }
};

export default openai;
