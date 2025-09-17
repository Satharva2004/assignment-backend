// server.js
import env from './config/env.js';
import app from "./app.js";

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${env.NODE_ENV || 'development'}`);
});
