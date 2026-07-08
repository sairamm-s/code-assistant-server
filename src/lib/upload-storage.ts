import path from 'path';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'tmp', 'uploads');

export const getUploadZipPath = (repositoryId: string): string =>
  path.join(UPLOADS_ROOT, `${repositoryId}.zip`);

export const getUploadsRootDir = (): string => UPLOADS_ROOT;
