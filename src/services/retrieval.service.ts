import prisma from '../lib/prisma';
import { RetrievedChunk } from '../interfaces/retrieval.interface';

interface CodeChunkRow {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;
}

// pgvector's <=> operator is cosine distance (0 = identical, 2 = opposite).
// similarity = 1 - distance gives a 0..1-ish score matching what the UI/prompt expects.
export const retrieveRelevantChunks = async (
  repositoryId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<RetrievedChunk[]> => {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = await prisma.$queryRaw<CodeChunkRow[]>`
    SELECT
      id,
      "filePath",
      "startLine",
      "endLine",
      content,
      language,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM code_chunks
    WHERE "repositoryId" = ${repositoryId}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;

  return rows;
};
