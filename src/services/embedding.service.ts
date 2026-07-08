import genAI from '../lib/gemini';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL_NAME } from '../config/embedding.config';

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });
  const batches = chunkArray(texts, EMBEDDING_BATCH_SIZE);
  const embeddings: number[][] = [];

  for (const batch of batches) {
    const result = await model.batchEmbedContents({
      requests: batch.map((text) => ({ content: { role: 'user', parts: [{ text }] } })),
    });
    embeddings.push(...result.embeddings.map((e) => e.values));
  }

  return embeddings;
};
