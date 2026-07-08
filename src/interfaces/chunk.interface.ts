export interface ChunkResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
}

export interface EmbeddedChunk extends ChunkResult {
  embedding: number[];
}
