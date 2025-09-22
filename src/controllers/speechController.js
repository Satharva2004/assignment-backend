import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { transcribeAudio } from '../config/openai.js';
import { deleteFile } from '../utils/fileUpload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Handles speech-to-text conversion
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const convertSpeechToText = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      error: 'No audio file provided' 
    });
  }

  const audioPath = req.file.path;
  
  try {
    console.log('Starting speech-to-text conversion for file:', audioPath);
    console.log('File size:', fs.statSync(audioPath).size, 'bytes');
    
    // Verify file exists and is not empty
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      throw new Error('Audio file is empty or does not exist');
    }

    // Transcribe the audio using OpenAI Whisper API
    const result = await transcribeAudio(fs.createReadStream(audioPath));
    
    if (!result.success) {
      console.error('Transcription failed:', result.error);
      throw new Error(result.error || 'Failed to transcribe audio');
    }

    console.log('Transcription successful');
    res.json({ 
      success: true, 
      text: result.text 
    });
  } catch (error) {
    console.error('Error in speech-to-text conversion:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      time: new Date().toISOString()
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process speech-to-text',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // Always clean up the uploaded file
    if (audioPath && fs.existsSync(audioPath)) {
      deleteFile(audioPath);
    }
  }
};

export default {
  convertSpeechToText
};
