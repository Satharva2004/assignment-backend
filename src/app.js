// app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import geminiRouter from "./routers/geminiRouter.js";
import userRouter from "./routers/userRouter.js";

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

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000', // Development
  'https://deepsearch-assignment.vercel.app', // Production
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/gemini", geminiRouter);
app.use("/api/users", userRouter);

// Health check
app.get("/", (req, res) => {
  res.send("✅ API service is running");
});

export default app;
