import fs from 'fs/promises';
import path from 'path';
import { ChunkResult, EmbeddedChunk } from '../interfaces/chunk.interface';
import { chunkFile } from './chunking.service';
import { embedTexts } from './embedding.service';
import { MAX_CHUNKS_PER_REPOSITORY } from '../config/embedding.config';

// Reads and chunks every walked file, capping total chunks at
// MAX_CHUNKS_PER_REPOSITORY (see docs/PLAN.md Section 11), then embeds them
// all in one batched pass via embedTexts. Skipped-past-cap files are logged,
// not treated as a failure — ingestion still succeeds.
export const buildEmbeddedChunks = async (workingDir: string, relativeFilePaths: string[]): Promise<EmbeddedChunk[]> => {
  const chunks: ChunkResult[] = [];

  for (const relativePath of relativeFilePaths) {
    if (chunks.length >= MAX_CHUNKS_PER_REPOSITORY) {
      console.warn('Chunk cap reached, skipping remaining files', {
        cap: MAX_CHUNKS_PER_REPOSITORY,
        remainingFiles: relativeFilePaths.length - relativeFilePaths.indexOf(relativePath),
      });
      break;
    }

    const absolutePath = path.join(workingDir, relativePath);
    const content = await fs.readFile(absolutePath, 'utf-8').catch(() => null);
    if (content === null) continue;

    const fileChunks = chunkFile(relativePath, content);
    chunks.push(...fileChunks.slice(0, MAX_CHUNKS_PER_REPOSITORY - chunks.length));
  }

  if (chunks.length === 0) return [];

  const embeddings = await embedTexts(chunks.map((c) => c.content));

  return chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
};

// DEMO ONLY: identical to buildEmbeddedChunks but restricted to a single target
// file (matched by basename) — for live-coding demos where embedding/citing one
// file is enough to show the retrieval flow without burning the full ingestion
// pipeline. Swap the call in ingestion.worker.ts between this and
// buildEmbeddedChunks to switch back to the original all-files flow.
const DEMO_TARGET_FILENAME = 'auth.service.ts';
const DEMO_TARGET_FILENAMES = ['auth.service.ts', 'auth.route.ts', 'auth.controller.ts', 'token.helper.ts','auth.validation.ts'];

export const buildEmbeddedChunksForDemoFile = async (workingDir: string, relativeFilePaths: string[]): Promise<EmbeddedChunk[]> => {
  // const targetPaths = relativeFilePaths.filter((relativePath) => path.basename(relativePath) === DEMO_TARGET_FILENAME);
  const targetPaths = relativeFilePaths.filter((relativePath) => DEMO_TARGET_FILENAMES.includes(path.basename(relativePath)));

  return buildEmbeddedChunks(workingDir, targetPaths);
};
