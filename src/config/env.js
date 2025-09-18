import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  const path = await import('path');
  const { fileURLToPath } = await import('node:url');
  const fs = await import('fs');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, '../../.env');
  
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error('❌ Error loading .env file:', result.error);
      process.exit(1);
    }
  } else {
    console.warn('⚠️  .env file not found, using environment variables from Vercel');
  }
}

// Verify required environment variables
const requiredEnvVars = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]?.trim());

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  if (process.env.NODE_ENV !== 'production') {
    console.error('Please check your .env file at:', path.resolve(__dirname, '../../.env'));
  } else {
    console.error('Please set these environment variables in your Vercel project settings');
  }
  process.exit(1);
}

// Log environment status
console.log('\n📋 Environment Configuration:');
console.log('='.repeat(50));
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`- GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ not set'}`);
console.log(`- GEMINI_API_KEY2: ${process.env.GEMINI_API_KEY2 ? '✅ set' : '❌ not set'}`);
console.log(`- SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ set' : '❌ not set'}`);
console.log('='.repeat(50) + '\n');

// Export environment variables
export default process.env;
