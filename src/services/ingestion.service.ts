import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import AdmZip from 'adm-zip';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', '__pycache__']);
const MAX_FILE_SIZE_BYTES = 500 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.pdf', '.zip', '.woff', '.woff2', '.ttf', '.mp4', '.mp3',
]);

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

      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const stats = await fs.stat(fullPath);
      if (stats.size > MAX_FILE_SIZE_BYTES) continue;

      results.push(path.relative(rootDir, fullPath));
    }
  };

  await walk(rootDir);
  return results;
};

export const removeWorkingDir = (dir: string): Promise<void> =>
  fs.rm(dir, { recursive: true, force: true });
