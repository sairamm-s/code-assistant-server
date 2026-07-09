const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Generation (chat/overview) uses Groq — free tier, no billing card required,
// unlike this project's Gemini generateContent quota (see arch.md Section 6
// update / prod.md for why: Gemini generateContent reported a hard 0 free-tier
// limit on every available project/key tested, while Groq's free tier works
// without payment setup. Embeddings still use Gemini (that quota works fine).
export const GENERATION_PROVIDER = process.env.GENERATION_PROVIDER || 'groq';
export const GENERATION_MODEL_NAME = process.env.GENERATION_MODEL_NAME || 'llama-3.3-70b-versatile';
export const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Bounds the single-call repository overview prompt (see arch.md Section 8) —
// only this many files' contents are included, each truncated, so the prompt
// stays a bounded size regardless of repo size.
export const MAX_KEY_FILES_FOR_OVERVIEW = toInt(process.env.MAX_KEY_FILES_FOR_OVERVIEW, 8);
export const MAX_KEY_FILE_CHARS = toInt(process.env.MAX_KEY_FILE_CHARS, 2000);
