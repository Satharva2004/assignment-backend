import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../../uploads');
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory at:', uploadsDir);
  }
  
  return uploadsDir;
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
