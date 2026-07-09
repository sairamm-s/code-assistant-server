import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import AdmZip from 'adm-zip';

// Only dependency/build-output directories — not real source, and processing
// them would burn the free-tier embedding quota on vendored/generated code.
// Extraction itself (extractZip below) is never filtered — the zip's exact
// contents land on disk unmodified; this only affects what gets chunked/embedded.
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.next']);

export const cloneRepository = async (url: string, destinationDir: string): Promise<void> => {
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await simpleGit().clone(url, destinationDir, ['--depth', '1']);
};

export const extractZip = async (zipPath: string, destinationDir: string): Promise<void> => {
  await fs.mkdir(destinationDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destinationDir, true);
};

export const walkFiles = async (rootDir: string): Promise<string[]> => {
  const results: string[] = [];

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(currentDir, entry.name));
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      results.push(path.relative(rootDir, fullPath));
    }
  };

  await walk(rootDir);
  return results;
};

export const removeWorkingDir = (dir: string): Promise<void> =>
  fs.rm(dir, { recursive: true, force: true });
