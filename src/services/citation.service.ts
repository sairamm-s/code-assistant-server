import { RetrievedChunk } from '../interfaces/retrieval.interface';
import { ChatCitation } from '../interfaces/chat.interface';

const FALLBACK_CITATION_COUNT = 3;

// Matches the citation format the prompt instructs the model to use:
// `file.ts:12-20` or `file.ts:12`. Captures path, start line, and optional end line.
const CITATION_PATTERN = /([\w./-]+\.\w+):(\d+)(?:-(\d+))?/g;

const toCitation = (chunk: RetrievedChunk): ChatCitation => ({
  filePath: chunk.filePath,
  startLine: chunk.startLine,
  endLine: chunk.endLine,
  snippet: chunk.content,
});

const citationKey = (citation: ChatCitation): string => `${citation.filePath}:${citation.startLine}-${citation.endLine}`;

// Resolves a parsed `path:start-end` marker to the retrieved chunk it most
// likely refers to — same file, and the marker's range overlaps (or is
// closest to) the chunk's actual range. The model may not reproduce the
// chunk's exact line numbers verbatim, so this is a best-match, not an
// exact-match lookup.
const resolveChunkForMarker = (
  filePath: string,
  startLine: number,
  endLine: number,
  chunks: RetrievedChunk[],
): RetrievedChunk | null => {
  const candidates = chunks.filter((chunk) => chunk.filePath === filePath);
  if (candidates.length === 0) return null;

  const overlapping = candidates.find((chunk) => chunk.startLine <= endLine && chunk.endLine >= startLine);
  if (overlapping) return overlapping;

  return candidates.reduce((closest, chunk) => {
    const chunkDistance = Math.min(Math.abs(chunk.startLine - startLine), Math.abs(chunk.endLine - endLine));
    const closestDistance = Math.min(Math.abs(closest.startLine - startLine), Math.abs(closest.endLine - endLine));
    return chunkDistance < closestDistance ? chunk : closest;
  });
};

export const extractCitations = (answerText: string, chunks: RetrievedChunk[]): ChatCitation[] => {
  const citations: ChatCitation[] = [];
  const seenKeys = new Set<string>();

  for (const match of answerText.matchAll(CITATION_PATTERN)) {
    const [, filePath, startLineRaw, endLineRaw] = match;
    const startLine = Number(startLineRaw);
    const endLine = endLineRaw ? Number(endLineRaw) : startLine;

    const chunk = resolveChunkForMarker(filePath, startLine, endLine, chunks);
    if (!chunk) continue;

    const citation = toCitation(chunk);
    const key = citationKey(citation);
    if (seenKeys.has(key)) continue;

    seenKeys.add(key);
    citations.push(citation);
  }

  if (citations.length > 0) return citations;

  // Model didn't follow the citation format — fall back to the
  // highest-similarity chunks rather than returning no citations at all.
  return chunks.slice(0, FALLBACK_CITATION_COUNT).map(toCitation);
};
