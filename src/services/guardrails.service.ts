import { RetrievedChunk } from '../interfaces/retrieval.interface';
import { ChatCitation } from '../interfaces/chat.interface';
import { MIN_SIMILARITY_THRESHOLD } from '../config/guardrails.config';

export const shouldRefuseForInsufficientContext = (chunks: RetrievedChunk[]): boolean => {
  if (chunks.length === 0) return true;

  const bestSimilarity = Math.max(...chunks.map((chunk) => chunk.similarity));
  return bestSimilarity < MIN_SIMILARITY_THRESHOLD;
};

export const buildRefusalResponse = (): { answer: string; citations: ChatCitation[] } => ({
  answer:
    "I don't have enough relevant context from this codebase to answer that confidently. Try rephrasing your question, or ask about something more specific to the ingested repository.",
  citations: [],
});
