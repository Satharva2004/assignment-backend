import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPaths = [
  join(__dirname, '.env'),
  join(process.cwd(), '.env')
];

console.log('Testing environment variable loading...');
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

for (const envPath of envPaths) {
  console.log('\nTrying to load:', envPath);
  try {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.log('Error loading .env:', result.error);
    } else {
      console.log('Successfully loaded .env from:', envPath);
      console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
      console.log('Environment variables:', Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('PORT') || k.includes('SUPABASE') || k.includes('JWT')));
      break;
    }
  } catch (e) {
    console.log('Exception loading .env:', e.message);
  }
}
