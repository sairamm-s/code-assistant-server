import fs from 'fs/promises';
import path from 'path';
import { RepositoryOverviewResult, RepositoryOverviewScope } from '../interfaces/overview.interface';
import { buildRepositoryOverviewPrompt } from '../prompts/repository-overview.prompt';
import { generateText } from './generation.service';
import { MAX_KEY_FILES_FOR_OVERVIEW, MAX_KEY_FILE_CHARS } from '../config/llm.config';

const OVERVIEW_FILENAMES = ['CLAUDE.md', 'README.md'];
const OVERVIEW_SCOPES: RepositoryOverviewScope[] = ['root', 'client', 'server'];

const MANIFEST_FILENAMES = new Set([
  'package.json', 'tsconfig.json', 'requirements.txt', 'go.mod', 'cargo.toml', 'pom.xml', 'pyproject.toml',
]);
const ENTRY_FILENAMES = new Set([
  'index.ts', 'index.js', 'main.ts', 'main.py', 'main.go', 'app.ts', 'app.py', 'server.ts', 'server.js',
]);

const scopeToDir = (scope: RepositoryOverviewScope): string => (scope === 'root' ? '' : scope);

export const findExistingOverviews = async (workingDir: string, files: string[]): Promise<RepositoryOverviewResult[]> => {
  const fileSet = new Set(files.map((f) => f.replace(/\\/g, '/')));
  const results: RepositoryOverviewResult[] = [];

  for (const scope of OVERVIEW_SCOPES) {
    const dir = scopeToDir(scope);
    for (const filename of OVERVIEW_FILENAMES) {
      const relativePath = dir ? `${dir}/${filename}` : filename;
      if (!fileSet.has(relativePath)) continue;

      const content = await fs.readFile(path.join(workingDir, relativePath), 'utf-8').catch(() => null);
      if (content && content.trim()) {
        results.push({ scope, source: 'existing', content: content.trim() });
        break; // CLAUDE.md takes priority over README.md for the same scope
      }
    }
  }

  return results;
};

export const selectKeyFiles = (files: string[]): string[] => {
  const scored = files
    .filter((f) => {
      const filename = path.basename(f);
      return MANIFEST_FILENAMES.has(filename) || ENTRY_FILENAMES.has(filename);
    })
    .sort((a, b) => a.split('/').length - b.split('/').length); // shallower paths first

  return scored.slice(0, MAX_KEY_FILES_FOR_OVERVIEW);
};

const buildFileTree = (files: string[]): string => files.slice(0, 500).join('\n');

export const buildRepositoryOverview = async (
  repoName: string,
  workingDir: string,
  files: string[],
): Promise<RepositoryOverviewResult[]> => {
  // If ANY scope has an existing overview, generation is skipped entirely —
  // this does not backfill missing scopes (e.g. client/README.md exists but
  // server/ doesn't). Simpler behavior for MVP scope; a per-scope fallback
  // would be the natural next step if this proves too coarse in practice.
  const existing = await findExistingOverviews(workingDir, files);
  if (existing.length > 0) return existing;

  const keyFilePaths = selectKeyFiles(files);
  const keyFileContents = await Promise.all(
    keyFilePaths.map(async (relativePath) => {
      const content = await fs.readFile(path.join(workingDir, relativePath), 'utf-8').catch(() => '');
      return { path: relativePath, content: content.slice(0, MAX_KEY_FILE_CHARS) };
    }),
  );

  const prompt = buildRepositoryOverviewPrompt({
    repoName,
    fileTree: buildFileTree(files),
    keyFileContents,
  });

  const content = await generateText(prompt);

  return [{ scope: 'root', source: 'generated', content }];
};
