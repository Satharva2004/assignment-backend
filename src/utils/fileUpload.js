import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createUploadsDir = () => {
  // In production, use the system's temp directory
  // In development, use a local uploads directory
  const baseDir = process.env.NODE_ENV === 'production' 
    ? os.tmpdir() 
    : path.join(__dirname, '../../uploads');
  
  const uploadsDir = path.join(baseDir, 'eduvance-uploads');
  
  try {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      console.log('Created uploads directory at:', uploadsDir);
    }
    
    // Verify directory is writable
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    
    return uploadsDir;
  } catch (error) {
    console.error('Error setting up uploads directory:', error.message);
    console.warn('Falling back to system temp directory');
    return os.tmpdir();
  }
};

export const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
      } else {
        console.log('File deleted successfully:', filePath);
      }
    });
  }
};

export const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

export const isAudioFile = (filename) => {
  const ext = getFileExtension(filename);
  return ['.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.webm'].includes(ext);
};
