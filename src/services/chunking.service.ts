import path from 'path';
import { ChunkResult } from '../interfaces/chunk.interface';

const FALLBACK_WINDOW_LINES = 60;
const FALLBACK_OVERLAP_LINES = 10;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.c': 'c',
};

// Rough function/class boundary heuristics across common languages. Not a
// real parser — see arch.md Section 9 for why a heuristic was chosen over
// AST-based chunking (tree-sitter) for this scope.
// Anchored to the start of the line (no leading whitespace) — boundaries are
// only detected at top level. Without this, a method definition indented
// inside a class (e.g. `  greet() {`) matches independently and fragments
// the class declaration away from its own body, which is worse than not
// chunking on structure at all.
const BOUNDARY_PATTERNS: RegExp[] = [
  /^(export\s+)?(default\s+)?(async\s+)?function\s+\w+/,
  /^(export\s+)?(default\s+)?class\s+\w+/,
  /^(export\s+)?const\s+\w+\s*=\s*(async\s*)?\(.*\)\s*=>/,
  /^def\s+\w+\s*\(/,
  /^class\s+\w+[:(]/,
  /^func\s+\w+\s*\(/,
];

const detectLanguage = (filePath: string): string | null => {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? null;
};

const findBoundaryLines = (lines: string[]): number[] => {
  const boundaries: number[] = [];
  lines.forEach((line, index) => {
    if (BOUNDARY_PATTERNS.some((pattern) => pattern.test(line))) {
      boundaries.push(index);
    }
  });
  return boundaries;
};

const chunkByBoundaries = (lines: string[], boundaries: number[]): Array<{ startLine: number; endLine: number; content: string }> => {
  const chunks: Array<{ startLine: number; endLine: number; content: string }> = [];

  for (let i = 0; i < boundaries.length; i += 1) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : lines.length - 1;
    chunks.push({
      startLine: start + 1,
      endLine: end + 1,
      content: lines.slice(start, end + 1).join('\n'),
    });
  }

  if (boundaries[0] > 0) {
    chunks.unshift({
      startLine: 1,
      endLine: boundaries[0],
      content: lines.slice(0, boundaries[0]).join('\n'),
    });
  }

  return chunks;
};

const chunkByFixedWindow = (lines: string[]): Array<{ startLine: number; endLine: number; content: string }> => {
  const chunks: Array<{ startLine: number; endLine: number; content: string }> = [];
  const step = FALLBACK_WINDOW_LINES - FALLBACK_OVERLAP_LINES;

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + FALLBACK_WINDOW_LINES, lines.length);
    chunks.push({
      startLine: start + 1,
      endLine: end,
      content: lines.slice(start, end).join('\n'),
    });
    if (end === lines.length) break;
  }

  return chunks;
};

export const chunkFile = (filePath: string, content: string): ChunkResult[] => {
  if (!content.trim()) return [];

  const lines = content.split('\n');
  const boundaries = findBoundaryLines(lines);
  const language = detectLanguage(filePath);

  const rawChunks = boundaries.length > 0 ? chunkByBoundaries(lines, boundaries) : chunkByFixedWindow(lines);

  return rawChunks
    .filter((chunk) => chunk.content.trim().length > 0)
    .map((chunk) => ({
      filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      language,
    }));
};
