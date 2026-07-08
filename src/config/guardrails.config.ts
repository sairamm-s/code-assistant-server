const toFloat = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
};

// Below this cosine-similarity score, retrieved context is treated as not
// relevant enough to answer from — the request is refused before an LLM
// call is made (saves cost/latency on clearly-irrelevant questions).
export const MIN_SIMILARITY_THRESHOLD = toFloat(process.env.MIN_SIMILARITY_THRESHOLD, 0.5);
