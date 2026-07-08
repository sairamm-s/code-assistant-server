const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const INGESTION_JOB_ATTEMPTS = toInt(process.env.INGESTION_JOB_ATTEMPTS, 3);
export const INGESTION_JOB_BACKOFF_MS = toInt(process.env.INGESTION_JOB_BACKOFF_MS, 5000);

// Bounds parallel ingestion jobs. Each job makes many downstream embedding API
// calls once the chunking/embedding feature lands, so this is the knob for
// staying under the embedding provider's free-tier rate limit — tune it there,
// not by editing worker code, once that feature exists.
export const INGESTION_WORKER_CONCURRENCY = toInt(process.env.INGESTION_WORKER_CONCURRENCY, 3);
