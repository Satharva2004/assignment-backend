import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Try to load .env from different locations
const envPaths = [
  join(process.cwd(), '.env'),
  join(__dirname, '.env'),
  join(__dirname, '..', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (result.parsed) {
      console.log('✅ Successfully loaded .env from:', envPath);
      envLoaded = true;
      break;
    }
  } catch (e) {
    console.log('❌ Error loading .env from', envPath, ':', e.message);
  }
}

if (!envLoaded) {
  console.log('❌ Could not load .env from any location');
}

// Show environment variables
console.log('\nEnvironment variables:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- PORT:', process.env.PORT || 'not set');
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '***set***' : '❌ not set');
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? '***set***' : '❌ not set');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? '***set***' : '❌ not set');

// Try to require the app
console.log('\nAttempting to load app...');
try {
  const app = (await import('./src/app.js')).default;
  console.log('✅ Successfully loaded app.js');
  
  // Try to start the server
  const PORT = process.env.PORT || 5001;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server is running on http://localhost:${PORT}`);    
    console.log('\nPress Ctrl+C to stop the server');
  });
  
  // Handle server errors
  server.on('error', (error) => {
    console.error('\n❌ Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    }
    process.exit(1);
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
      console.log('Server has been stopped');
      process.exit(0);
    });
  });
  
} catch (error) {
  console.error('\n❌ Failed to load app:', error);
  process.exit(1);
}
