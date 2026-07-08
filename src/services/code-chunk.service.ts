import crypto from 'crypto';
import prisma from '../lib/prisma';
import { EmbeddedChunk } from '../interfaces/chunk.interface';

// CodeChunk.embedding is a Prisma `Unsupported("vector(768)")` field, so it's
// excluded from the generated Client API entirely — writes go through raw SQL.
export const saveChunks = async (repositoryId: string, chunks: EmbeddedChunk[]): Promise<void> => {
  for (const chunk of chunks) {
    const id = crypto.randomUUID();
    const vectorLiteral = `[${chunk.embedding.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO code_chunks (id, "repositoryId", "filePath", "startLine", "endLine", content, language, embedding, "createdAt")
      VALUES (${id}, ${repositoryId}, ${chunk.filePath}, ${chunk.startLine}, ${chunk.endLine}, ${chunk.content}, ${chunk.language}, ${vectorLiteral}::vector, now())
    `;
  }
};
