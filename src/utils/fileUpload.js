import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createUploadsDir = () => {
  // Prefer OS temp directory everywhere except explicit local development.
  // Serverless platforms (e.g., Vercel/AWS Lambda) mount code under /var/task (read-only).
  // Writing under that tree will cause ENOENT or EROFS errors. Using os.tmpdir() is safe.
  const isDev = process.env.NODE_ENV === 'development';
  const baseDir = isDev
    ? path.join(__dirname, '../../uploads')
    : os.tmpdir();
  
  const uploadsDir = path.join(baseDir, 'eduvance-uploads');
  
  try {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      console.log('[fileUpload] Created uploads directory at:', uploadsDir);
    }
    
    // Verify directory is writable
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    
    return uploadsDir;
  } catch (error) {
    console.error('[fileUpload] Error setting up uploads directory:', error.message);
    console.warn('[fileUpload] Falling back to system temp directory');
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
