import fs from 'fs/promises';
import { Job, Worker } from 'bullmq';
import redis from '../lib/redis';
import { INGESTION_QUEUE_NAME } from '../queues/ingestion.queue';
import { IngestJobPayload } from '../interfaces/repository.interface';
import { getRepositoryWorkingDir } from '../lib/repo-storage';
import { cloneRepository, extractZip, removeWorkingDir, walkFiles } from '../services/ingestion.service';
import { getRepositoryById, updateRepositoryStatus } from '../services/repository.service';
import { buildEmbeddedChunks } from '../services/pipeline.service';
import { saveChunks } from '../services/code-chunk.service';
import { buildRepositoryOverview } from '../services/overview.service';
import { saveOverviews } from '../services/repository-overview.service';
import { INGESTION_WORKER_CONCURRENCY } from '../config/queue.config';
import logger from '../lib/logger';

const logStage = (repositoryId: string, stage: string, durationMs?: number): void => {
  logger.info('ingestion_stage', { repositoryId, stage, durationMs });
};

const processIngestJob = async (job: Job<IngestJobPayload>): Promise<void> => {
  const { repositoryId } = job.data;
  const workingDir = getRepositoryWorkingDir(repositoryId);
  const jobStart = Date.now();

  logStage(repositoryId, 'started');

  try {
    let stageStart = Date.now();
    await updateRepositoryStatus(repositoryId, 'cloning');

    if (job.data.source === 'github') {
      await cloneRepository(job.data.url, workingDir);
    } else {
      await extractZip(job.data.zipPath, workingDir);
      await fs.rm(job.data.zipPath, { force: true });
    }
    logStage(repositoryId, 'cloning', Date.now() - stageStart);

    const files = await walkFiles(workingDir);

    const repository = await getRepositoryById(repositoryId);
    const overviews = await buildRepositoryOverview(repository?.name ?? repositoryId, workingDir, files);
    await saveOverviews(repositoryId, overviews);

    stageStart = Date.now();
    await updateRepositoryStatus(repositoryId, 'chunking');
    await updateRepositoryStatus(repositoryId, 'embedding');
    const embeddedChunks = await buildEmbeddedChunks(workingDir, files);
    await saveChunks(repositoryId, embeddedChunks);
    logStage(repositoryId, 'chunking_embedding', Date.now() - stageStart);

    await updateRepositoryStatus(repositoryId, 'ready', { fileCount: files.length });
    await removeWorkingDir(workingDir);

    logStage(repositoryId, 'ready', Date.now() - jobStart);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    logger.error('Ingestion job failed', { repositoryId, error: message, durationMs: Date.now() - jobStart });
    await updateRepositoryStatus(repositoryId, 'failed', { errorMessage: message });
    await removeWorkingDir(workingDir);
    throw err;
  }
};

export const ingestionWorker = new Worker<IngestJobPayload>(INGESTION_QUEUE_NAME, processIngestJob, {
  connection: redis,
  concurrency: INGESTION_WORKER_CONCURRENCY,
});

ingestionWorker.on('failed', (job, err) => {
  logger.error('Ingestion worker job failed', { jobId: job?.id, error: err.message });
});
