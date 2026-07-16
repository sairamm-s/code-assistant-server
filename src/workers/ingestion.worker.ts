import fs from 'fs/promises';
import { Job, Worker } from 'bullmq';
import redis from '../lib/redis';
import { INGESTION_QUEUE_NAME } from '../queues/ingestion.queue';
import { IngestJobPayload } from '../interfaces/repository.interface';
import { getRepositoryWorkingDir } from '../lib/repo-storage';
import { cloneRepository, extractZip, removeWorkingDir, walkFiles } from '../services/ingestion.service';
import { getRepositoryById, updateRepositoryStatus } from '../services/repository.service';
import { buildEmbeddedChunks, buildEmbeddedChunksForDemoFile } from '../services/pipeline.service';
import { saveChunks } from '../services/code-chunk.service';
import { buildRepositoryOverview } from '../services/overview.service';
import { saveOverviews } from '../services/repository-overview.service';
import { INGESTION_WORKER_CONCURRENCY } from '../config/queue.config';
import { ENABLE_CHUNKING_EMBEDDING } from '../config/embedding.config';
import logger from '../lib/logger';

const logStage = (repositoryId: string, stage: string, durationMs?: number): void => {
  logger.info('ingestion_stage', { repositoryId, stage, durationMs });
};

const MAX_USER_FACING_ERROR_CHARS = 200;

// Third-party API errors (e.g. Gemini rate-limit responses) can be huge raw
// JSON blobs — never surface those verbatim to the client (node.md skill:
// never send raw errors to the client). The full message is always logged
// server-side via logger.error regardless of what's stored here.
const toUserFacingErrorMessage = (message: string): string => {
  if (message.length <= MAX_USER_FACING_ERROR_CHARS) return message;
  return `${message.slice(0, MAX_USER_FACING_ERROR_CHARS)}... (see server logs for full details)`;
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
    if (true) {
      // DEMO: embed only auth.service.ts (see pipeline.service.ts). Comment
      // this line out and uncomment the one below to go back to full-repo embedding.
      const embeddedChunks = await buildEmbeddedChunksForDemoFile(workingDir, files);
      logger.info('embeddedChunks', { embeddedChunks });
      // const embeddedChunks = await buildEmbeddedChunks(workingDir, files);
      await saveChunks(repositoryId, embeddedChunks);
    } else {
      logger.info('Chunking/embedding skipped (ENABLE_CHUNKING_EMBEDDING=false) — chat will use the repository overview only', {
        repositoryId,
      });
    }
    logStage(repositoryId, 'chunking_embedding', Date.now() - stageStart);

    await updateRepositoryStatus(repositoryId, 'ready', { fileCount: files.length });
    // await removeWorkingDir(workingDir);

    logStage(repositoryId, 'ready', Date.now() - jobStart);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    logger.error('Ingestion job failed', { repositoryId, error: message, durationMs: Date.now() - jobStart });
    await updateRepositoryStatus(repositoryId, 'failed', { errorMessage: toUserFacingErrorMessage(message) });
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
