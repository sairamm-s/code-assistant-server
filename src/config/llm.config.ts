const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const GENERATION_MODEL_NAME = process.env.GENERATION_MODEL_NAME || 'gemini-2.0-flash';

// Bounds the single-call repository overview prompt (see arch.md Section 8) —
// only this many files' contents are included, each truncated, so the prompt
// stays a bounded size regardless of repo size.
export const MAX_KEY_FILES_FOR_OVERVIEW = toInt(process.env.MAX_KEY_FILES_FOR_OVERVIEW, 8);
export const MAX_KEY_FILE_CHARS = toInt(process.env.MAX_KEY_FILE_CHARS, 2000);
