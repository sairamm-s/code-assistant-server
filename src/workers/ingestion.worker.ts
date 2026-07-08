import fs from 'fs/promises';
import { Job, Worker } from 'bullmq';
import redis from '../lib/redis';
import { INGESTION_QUEUE_NAME } from '../queues/ingestion.queue';
import { IngestJobPayload } from '../interfaces/repository.interface';
import { getRepositoryWorkingDir } from '../lib/repo-storage';
import { cloneRepository, extractZip, removeWorkingDir, walkFiles } from '../services/ingestion.service';
import { updateRepositoryStatus } from '../services/repository.service';
import { buildEmbeddedChunks } from '../services/pipeline.service';
import { saveChunks } from '../services/code-chunk.service';
import { INGESTION_WORKER_CONCURRENCY } from '../config/queue.config';

const processIngestJob = async (job: Job<IngestJobPayload>): Promise<void> => {
  const { repositoryId } = job.data;
  const workingDir = getRepositoryWorkingDir(repositoryId);

  try {
    await updateRepositoryStatus(repositoryId, 'cloning');

    if (job.data.source === 'github') {
      await cloneRepository(job.data.url, workingDir);
    } else {
      await extractZip(job.data.zipPath, workingDir);
      await fs.rm(job.data.zipPath, { force: true });
    }

    const files = await walkFiles(workingDir);

    // TODO(repository-overview-generation): the Repository Overview feature
    // (docs/PLAN.md Section 10, item 6) plugs in here — check for an
    // existing CLAUDE.md/README.md among `files`, or generate one via
    // server/src/prompts/repository-overview.prompt.ts — before chunking.
    // Not built yet; this feature only covers chunking/embedding.

    await updateRepositoryStatus(repositoryId, 'chunking');
    await updateRepositoryStatus(repositoryId, 'embedding');
    const embeddedChunks = await buildEmbeddedChunks(workingDir, files);
    await saveChunks(repositoryId, embeddedChunks);

    await updateRepositoryStatus(repositoryId, 'ready', { fileCount: files.length });
    await removeWorkingDir(workingDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    console.error('Ingestion job failed', { repositoryId, error: message });
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
  console.error('Ingestion worker job failed', { jobId: job?.id, error: err.message });
});
