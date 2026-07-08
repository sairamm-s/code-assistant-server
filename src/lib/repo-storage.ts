import path from 'path';

const REPOS_ROOT = path.resolve(process.cwd(), 'tmp', 'repos');

export const getRepositoryWorkingDir = (repositoryId: string): string =>
  path.join(REPOS_ROOT, repositoryId);
