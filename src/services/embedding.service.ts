import { TaskType } from '@google/generative-ai';
import genAI from '../lib/gemini';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL_NAME, EMBEDDING_OUTPUT_DIMENSIONS } from '../config/embedding.config';

// The installed @google/generative-ai SDK's types predate outputDimensionality
// support, but the REST API accepts it — this widens the per-request type to
// include it without resorting to `any`.
interface EmbedContentRequestWithDimensions {
  content: { role: string; parts: { text: string }[] };
  taskType: TaskType;
  outputDimensionality: number;
}

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

// taskType defaults to RETRIEVAL_DOCUMENT (code chunks being indexed).
// embedQuery below passes RETRIEVAL_QUERY — Gemini's embeddings are
// asymmetric per task type, so matching this to how the vector is used
// (indexed content vs. a search query) meaningfully improves similarity
// search quality over using one embedding mode for both.
export const embedTexts = async (
  texts: string[],
  taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT,
): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });
  const batches = chunkArray(texts, EMBEDDING_BATCH_SIZE);
  const embeddings: number[][] = [];

  for (const batch of batches) {
    const requests: EmbedContentRequestWithDimensions[] = batch.map((text) => ({
      content: { role: 'user', parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONS,
    }));
    const result = await model.batchEmbedContents({ requests });
    embeddings.push(...result.embeddings.map((e) => e.values));
  }

  return embeddings;
};

export const embedQuery = async (text: string): Promise<number[]> => {
  const [embedding] = await embedTexts([text], TaskType.RETRIEVAL_QUERY);
  return embedding;
};
