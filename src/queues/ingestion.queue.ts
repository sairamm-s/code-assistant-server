import { Queue } from 'bullmq';
import redis from '../lib/redis';
import { IngestJobPayload } from '../interfaces/repository.interface';

export const INGESTION_QUEUE_NAME = 'ingestion';

export const ingestionQueue = new Queue<IngestJobPayload>(INGESTION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});
