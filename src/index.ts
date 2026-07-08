import 'dotenv/config';
import app from './app';
import { connectDb } from './db';

const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'GEMINI_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => console.info(`Server on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
