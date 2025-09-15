// app.js
import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import geminiRouter from "./routers/geminiRouter.js";

// Get the current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the src directory
const envPath = join(__dirname, '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Debug: Log environment variables
console.log('Environment variables loaded:', {
  PORT: process.env.PORT,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '*** (exists)' : 'Not found!'
});

const app = express();

app.use(express.json());

// Routes
app.use("/api/gemini", geminiRouter);

// Health check
app.get("/", (req, res) => {
  res.send("✅ Gemini API service is running");
});

export default app;
