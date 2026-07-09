import prisma from '../lib/prisma';
import { Repository } from '@prisma/client';
import { RepositoryStatus } from '../interfaces/repository.interface';

const nameFromGithubUrl = (url: string): string => {
  const match = url.replace(/\/$/, '').match(/([\w.-]+)\/([\w.-]+)$/);
  return match ? `${match[1]}/${match[2]}` : url;
};

export const createGithubRepository = (url: string): Promise<Repository> =>
  prisma.repository.create({
    data: {
      source: 'github',
      sourceUrl: url,
      name: nameFromGithubUrl(url),
      status: 'queued',
    },
  });

export const createUploadRepository = (originalFileName: string): Promise<Repository> =>
  prisma.repository.create({
    data: {
      source: 'upload',
      sourceUrl: null,
      name: originalFileName.replace(/\.zip$/i, ''),
      status: 'queued',
    },
  });

export const setRepositoryJobId = (repositoryId: string, jobId: string): Promise<Repository> =>
  prisma.repository.update({
    where: { id: repositoryId },
    data: { jobId },
  });

export const updateRepositoryStatus = (
  repositoryId: string,
  status: RepositoryStatus,
  fields: { fileCount?: number; errorMessage?: string | null } = {},
): Promise<Repository> =>
  prisma.repository.update({
    where: { id: repositoryId },
    data: { status, ...fields },
  });

export const getRepositoryById = (repositoryId: string): Promise<Repository | null> =>
  prisma.repository.findUnique({ where: { id: repositoryId } });

const DEFAULT_REPOSITORY_LIST_LIMIT = 50;

export const listRepositories = (limit: number = DEFAULT_REPOSITORY_LIST_LIMIT): Promise<Repository[]> =>
  prisma.repository.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
