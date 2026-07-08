import { Queue } from 'bullmq';
import redis from '../lib/redis';
import { IngestJobPayload } from '../interfaces/repository.interface';
import { INGESTION_JOB_ATTEMPTS, INGESTION_JOB_BACKOFF_MS } from '../config/queue.config';

export const INGESTION_QUEUE_NAME = 'ingestion';

export const ingestionQueue = new Queue<IngestJobPayload>(INGESTION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: INGESTION_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: INGESTION_JOB_BACKOFF_MS },
  },
});
