import express from 'express';
import multer from 'multer';
import path from 'path';
import * as speechController from '../controllers/speechController.js';
import { isAudioFile, createUploadsDir } from '../utils/fileUpload.js';

const router = express.Router();

// Create uploads directory
const uploadsDir = createUploadsDir();
console.log('Using uploads directory:', uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'audio-' + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept audio files only
  if (!isAudioFile(file.originalname)) {
    return cb(new Error('Only audio files are allowed! (mp3, wav, m4a, ogg, mp4, webm)'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  } 
});

// Speech-to-text endpoint
router.post('/transcribe', upload.single('audio'), speechController.convertSpeechToText);

// Error handling middleware for file uploads
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    return res.status(400).json({
      success: false,
      error: err.message
    });
  } else if (err) {
    // An unknown error occurred
    return res.status(500).json({
      success: false,
      error: err.message || 'Error processing file upload'
    });
  }
  next();
});

export default router;
