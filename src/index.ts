import 'dotenv/config';
import app from './app';
import { connectDb } from './db';

const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'GEMINI_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// 5000 conflicts with macOS's AirPlay Receiver (ControlCenter) on many Macs — 5050 avoids it.
const PORT = process.env.PORT || 5050;

connectDb()
  .then(() => {
    app.listen(PORT, () => console.info(`Server on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
