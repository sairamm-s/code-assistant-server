const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Caps total chunks embedded per repository to stay within the free-tier
// embedding API rate/quota limits — see docs/PLAN.md Section 11 (Open Questions).
// Ingestion still succeeds past this cap; remaining files are simply skipped
// and logged, not treated as a failure.
// 200 chunks / 40 per batch = 5 requests per ingestion — comfortably under
// Gemini's free-tier cap of 100 embed_content requests/minute, so a typical
// demo repo finishes in one clean burst instead of hitting a 429 partway through.
export const MAX_CHUNKS_PER_REPOSITORY = toInt(process.env.MAX_CHUNKS_PER_REPOSITORY, 200);

export const EMBEDDING_BATCH_SIZE = toInt(process.env.EMBEDDING_BATCH_SIZE, 40);

// text-embedding-004 was retired — gemini-embedding-001 is the current stable
// embedding model. It defaults to 3072-dim output; outputDimensionality below
// truncates it to match the fixed vector(768) column in the CodeChunk schema.
export const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL_NAME || 'gemini-embedding-001';
export const EMBEDDING_OUTPUT_DIMENSIONS = 768;

// Temporary demo/testing toggle — when false, ingestion skips chunking/embedding
// entirely and relies solely on the repository overview (CLAUDE.md/README, or a
// generated one) for chat context. Lets you verify the overview + chat pipeline
// without spending any embed_content quota. Chunking is ON by default; set
// ENABLE_CHUNKING_EMBEDDING=false locally to test overview-only.
export const ENABLE_CHUNKING_EMBEDDING = process.env.ENABLE_CHUNKING_EMBEDDING !== 'false';
