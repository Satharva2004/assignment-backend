// app.js
import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import geminiRouter from "./routers/geminiRouter.js";
import userRouter from "./routers/userRouter.js";

// Get the current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load environment variables from different possible locations
const envPaths = [
  join(process.cwd(), '.env'),        // Current working directory
  join(__dirname, '..', '.env'),     // Parent directory (backend/.env)
  join(__dirname, '.env')            // Current directory (backend/src/.env)
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath, override: true });
    if (result.parsed) {
      console.log('✅ Successfully loaded .env from:', envPath);
      envLoaded = true;
      break;
    } else if (result.error) {
      console.log('⚠️  Could not load .env from', envPath, ':', result.error.message);
    }
  } catch (e) {
    console.error('❌ Error loading .env from', envPath, ':', e.message);
  }
}

if (!envLoaded) {
  console.warn('⚠️  Could not load .env file from any of these locations:', envPaths);
  console.warn('The application might not work correctly without environment variables.');
}

// Log environment variable status (without sensitive values)
console.log('\nEnvironment variables status:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development (default)');
console.log('- PORT:', process.env.PORT || '5000 (default)');
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '***set***' : '❌ not set');
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? '***set***' : '❌ not set');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? '***set***' : '❌ not set');
console.log('');

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
