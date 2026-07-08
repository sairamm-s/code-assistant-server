const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const RETRIEVAL_TOP_K = toInt(process.env.RETRIEVAL_TOP_K, 8);

// Bounds the assembled prompt's context section regardless of how many/large
// the retrieved chunks are — see arch.md Section 7 (context management).
export const MAX_CONTEXT_CHARS = toInt(process.env.MAX_CONTEXT_CHARS, 12000);
