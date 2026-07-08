import { ChatContext, RetrievedChunk } from '../interfaces/retrieval.interface';
import { embedQuery } from './embedding.service';
import { retrieveRelevantChunks } from './retrieval.service';
import { getOverviewsByRepositoryId } from './repository-overview.service';
import { RETRIEVAL_TOP_K, MAX_CONTEXT_CHARS } from '../config/retrieval.config';

export const buildRetrievalContext = async (repositoryId: string, query: string): Promise<ChatContext> => {
  const [queryEmbedding, overviews] = await Promise.all([
    embedQuery(query),
    getOverviewsByRepositoryId(repositoryId),
  ]);

  const chunks = await retrieveRelevantChunks(repositoryId, queryEmbedding, RETRIEVAL_TOP_K);

  const overview = overviews.length > 0 ? overviews.map((o) => `[${o.scope}]\n${o.content}`).join('\n\n') : null;

  return { overview, chunks };
};

// Chunks arrive ordered by similarity (best first) from retrieval.service.
// If the assembled context would exceed MAX_CONTEXT_CHARS, drop the
// lowest-similarity chunks first — see arch.md Section 7 (context management).
const fitChunksToCharBudget = (chunks: RetrievedChunk[], budgetChars: number): RetrievedChunk[] => {
  const fitted: RetrievedChunk[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const chunkChars = chunk.content.length + chunk.filePath.length + 50; // header/formatting overhead
    if (usedChars + chunkChars > budgetChars) break;
    fitted.push(chunk);
    usedChars += chunkChars;
  }

  return fitted;
};

export const buildChatPrompt = (question: string, context: ChatContext): string => {
  const fittedChunks = fitChunksToCharBudget(context.chunks, MAX_CONTEXT_CHARS);

  const overviewSection = context.overview
    ? `## Repository Overview\n${context.overview}`
    : '## Repository Overview\n(none available)';

  const chunksSection = fittedChunks.length > 0
    ? fittedChunks
        .map(
          (chunk, index) =>
            `### Chunk ${index + 1} — ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n\`\`\`${chunk.language ?? ''}\n${chunk.content}\n\`\`\``,
        )
        .join('\n\n')
    : '(no relevant code chunks were retrieved for this question)';

  return `
You are answering a question about a codebase, using only the context provided below.

${overviewSection}

## Retrieved Code Context
${chunksSection}

## Question
${question}

## Instructions
- Answer using only the repository overview and retrieved code context above — do not invent details not evidenced there.
- Every factual claim about the code must cite the file and line range it came from, in the form \`file.ts:12-20\`.
- If the retrieved context is insufficient to answer confidently, say so explicitly rather than guessing.
`.trim();
};
