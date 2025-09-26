// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import geminiRouter from "./routers/geminiRouter.js";
import userRouter from "./routers/userRouter.js";
import speechRouter from "./routers/speechRouter.js";
import { createUploadsDir } from "./utils/fileUpload.js";
import uploadRouter from "./routers/uploadRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPaths = [
  join(__dirname, '..', '.env'),     
  join(__dirname, '.env'),           
  join(process.cwd(), '.env')        
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log('Successfully loaded .env from:', envPath);
    console.log('GEMINI_API_KEY is set:', !!process.env.GEMINI_API_KEY);
    envLoaded = true;
      break;
    }
  } catch (e) {
    console.log('Error loading .env from', envPath, ':', e.message);
  }
}

if (!envLoaded) {
  console.error('Failed to load .env file from any location');
}

// Log all environment variables (excluding sensitive ones)
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '***set***' : '***not set***',
  SUPABASE_URL: process.env.SUPABASE_URL ? '***set***' : '***not set***'
});

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

// Create uploads directory
createUploadsDir();

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000', // Development
  'https://assignment-backend-one-khaki.vercel.app', // Production Backend
  'https://deepsearch-assignment.vercel.app', // Production Frontend
  'https://finance-u.vercel.app', //FinanceU
  'http://localhost:8080' // Localhost
];

// Enable CORS for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if the request origin is in the allowed origins
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return res.status(200).end();
  }
  
  next();
});
app.use(express.json());

// Routes
app.use("/api/gemini", geminiRouter);
app.use("/api/users", userRouter);
app.use("/api/speech", speechRouter);
app.use("/api", uploadRouter); // exposes POST /api/upload

// Health check
app.get("/", (req, res) => {
  res.send("✅ API service is running");
});

export default app;
