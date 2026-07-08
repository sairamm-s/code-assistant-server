import prisma from './lib/prisma';

const ensureVectorIndex = async (): Promise<void> => {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx ON code_chunks USING ivfflat (embedding vector_cosine_ops)',
  );
};

export const connectDb = (): Promise<void> =>
  prisma
    .$connect()
    .then(() => ensureVectorIndex())
    .then(() => console.info('Database connected'))
    .catch((err) => {
      console.error('Database connection failed', err);
      process.exit(1);
    });
