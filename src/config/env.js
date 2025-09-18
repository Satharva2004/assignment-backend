import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';

// Get the current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to .env file
const envPath = path.resolve(__dirname, '../../.env');

// Check if .env file exists
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found at:', envPath);
  process.exit(1);
}

// Load environment variables from .env file
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Error loading .env file:', result.error);
  process.exit(1);
}

// Verify required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]?.trim());

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file at:', envPath);
  process.exit(1);
}

// Log environment statusssss
console.log('\n📋 Environment Configuration:');
console.log('='.repeat(50));
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`- GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ not set'}`);
console.log(`- GEMINI_API_KEY2: ${process.env.GEMINI_API_KEY2 ? '✅ set' : '❌ not set'}`);
console.log(`- SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ set' : '❌ not set'}`);
console.log('='.repeat(50) + '\n');

// Export environment variables
export default process.env;
