import 'dotenv/config';

const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'GEMINI_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// worker registrations mount here (workers/*.worker.ts) — added by /feature

console.info('Worker process started');

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
