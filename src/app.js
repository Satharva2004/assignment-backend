// app.js
import express from "express";
import dotenv from "dotenv";
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
      envLoaded = true;
      break;
    }
  } catch (e) {
    console.log('Error loading .env from', envPath, ':', e.message);
  }
}

if (!envLoaded) {
  console.warn('Warning: No .env file found in any of the expected locations');
}

// Debug: Log environment variables
console.log('Environment variables:');
console.log('- PORT:', process.env.PORT || 'Not set');
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '*** (exists)' : 'Not found!');

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

const app = express();

app.use(express.json());

// Routes
app.use("/api/gemini", geminiRouter);
app.use("/api/users", userRouter);

// Health check
app.get("/", (req, res) => {
  res.send("✅ API service is running");
});

export default app;
