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
    // Transcribe the audio using OpenAI Whisper API
    const result = await transcribeAudio(fs.createReadStream(audioPath));
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to transcribe audio');
    }

    res.json({ 
      success: true, 
      text: result.text 
    });
  } catch (error) {
    console.error('Error in speech-to-text conversion:', error);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process speech-to-text' 
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
