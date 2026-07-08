const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Caps total chunks embedded per repository to stay within the free-tier
// embedding API rate/quota limits — see docs/PLAN.md Section 11 (Open Questions).
// Ingestion still succeeds past this cap; remaining files are simply skipped
// and logged, not treated as a failure.
export const MAX_CHUNKS_PER_REPOSITORY = toInt(process.env.MAX_CHUNKS_PER_REPOSITORY, 3000);

export const EMBEDDING_BATCH_SIZE = toInt(process.env.EMBEDDING_BATCH_SIZE, 20);

export const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL_NAME || 'text-embedding-004';
