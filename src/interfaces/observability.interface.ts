export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatRequestLogEntry {
  repositoryId: string;
  query: string;
  chunkCount: number;
  chunks: { filePath: string; startLine: number; endLine: number; similarity: number }[];
  refused: boolean;
  latencyMs: {
    retrievalMs: number;
    generationMs: number;
    totalMs: number;
  };
  tokens: TokenUsage | null;
}
