import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Verify required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully');
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`- GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '***set***' : '❌ not set'}`);
console.log(`- SUPABASE_URL: ${process.env.SUPABASE_URL ? '***set***' : '❌ not set'}`);

export default process.env;
