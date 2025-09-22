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
  console.log('File uploaded to:', audioPath);
  
  try {
    // Verify file exists and is not empty
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found at path: ${audioPath}`);
    }
    
    const stats = fs.statSync(audioPath);
    console.log('File stats:', {
      size: stats.size,
      modified: stats.mtime,
      isFile: stats.isFile()
    });
    
    if (stats.size === 0) {
      throw new Error('Uploaded audio file is empty');
    }

    // Create read stream and handle any errors
    const audioStream = fs.createReadStream(audioPath);
    audioStream.on('error', (err) => {
      console.error('Error reading audio file:', err);
      throw new Error(`Error reading audio file: ${err.message}`);
    });

    // Transcribe the audio using OpenAI Whisper API
    const result = await transcribeAudio(audioStream);
    
    if (!result.success) {
      console.error('Transcription failed:', result.error);
      throw new Error(result.error || 'Failed to transcribe audio');
    }

    console.log('Transcription successful');
    return res.json({ 
      success: true, 
      text: result.text 
    });
  } catch (error) {
    console.error('Error in speech-to-text conversion:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      time: new Date().toISOString(),
      filePath: audioPath,
      fileExists: fs.existsSync(audioPath)
    });
    
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to process speech-to-text',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // Always clean up the uploaded file
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
        console.log('Temporary file deleted:', audioPath);
      } catch (err) {
        console.error('Error deleting temporary file:', err);
      }
    }
  }
};

export default {
  convertSpeechToText
};
