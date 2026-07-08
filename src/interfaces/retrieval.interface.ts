export interface RetrievedChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;
}

export interface ChatContext {
  overview: string | null;
  chunks: RetrievedChunk[];
}
