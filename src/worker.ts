import 'dotenv/config';

const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'GEMINI_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

import { ingestionWorker } from './workers/ingestion.worker';

console.info('Worker process started');

process.on('SIGTERM', async () => {
  await ingestionWorker.close();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await ingestionWorker.close();
  process.exit(0);
});
