import { ChatContext } from '../interfaces/retrieval.interface';
import { ChatCitation } from '../interfaces/chat.interface';
import { MIN_SIMILARITY_THRESHOLD } from '../config/guardrails.config';

// A repository overview (CLAUDE.md/README, or a generated one) is enough to
// answer plenty of questions on its own — e.g. when chunking/embedding was
// skipped (ENABLE_CHUNKING_EMBEDDING=false) or a question just doesn't match
// any indexed chunk well. Only refuse when there's neither a usable overview
// nor sufficiently-relevant retrieved chunks.
export const shouldRefuseForInsufficientContext = (context: ChatContext): boolean => {
  if (context.overview) return false;
  if (context.chunks.length === 0) return true;

  const bestSimilarity = Math.max(...context.chunks.map((chunk) => chunk.similarity));
  return bestSimilarity < MIN_SIMILARITY_THRESHOLD;
};

export const buildRefusalResponse = (): { answer: string; citations: ChatCitation[] } => ({
  answer:
    "I don't have enough relevant context from this codebase to answer that confidently. Try rephrasing your question, or ask about something more specific to the ingested repository.",
  citations: [],
});
