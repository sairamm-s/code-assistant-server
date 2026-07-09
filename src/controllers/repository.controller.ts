import fs from 'fs/promises';
import { Request, Response } from 'express';
import { Repository } from '@prisma/client';
import { STATUS } from '../helpers/response.helper';
import { IngestGithubBody, RepositorySummary } from '../interfaces/repository.interface';
import { ingestionQueue } from '../queues/ingestion.queue';
import { getUploadZipPath } from '../lib/upload-storage';
import {
  createGithubRepository,
  createUploadRepository,
  getRepositoryById,
  listRepositories,
  setRepositoryJobId,
} from '../services/repository.service';
import logger from '../lib/logger';

const toRepositorySummary = (repository: Repository): RepositorySummary => ({
  id: repository.id,
  name: repository.name,
  source: repository.source,
  status: repository.status as RepositorySummary['status'],
  fileCount: repository.fileCount,
  errorMessage: repository.errorMessage,
});

export const ingestRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body as IngestGithubBody;

    const repository = await createGithubRepository(url);
    const job = await ingestionQueue.add('ingest-repository', {
      repositoryId: repository.id,
      source: 'github',
      url,
    });
    await setRepositoryJobId(repository.id, job.id as string);

    res.status(201).json({ status: STATUS.success, data: { repositoryId: repository.id } });
  } catch (err) {
    logger.error('Failed to enqueue ingestion', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ status: STATUS.failed, message: 'Failed to start ingestion' });
  }
};

export const ingestUploadedRepository = async (req: Request, res: Response): Promise<void> => {
  const uploadedFile = req.file;

  if (!uploadedFile) {
    res.status(400).json({ status: STATUS.failed, message: 'A .zip file is required' });
    return;
  }

  try {
    const repository = await createUploadRepository(uploadedFile.originalname);
    const zipPath = getUploadZipPath(repository.id);
    await fs.rename(uploadedFile.path, zipPath);

    const job = await ingestionQueue.add('ingest-repository', {
      repositoryId: repository.id,
      source: 'upload',
      zipPath,
    });
    await setRepositoryJobId(repository.id, job.id as string);

    res.status(201).json({ status: STATUS.success, data: { repositoryId: repository.id } });
  } catch (err) {
    logger.error('Failed to enqueue upload ingestion', { error: err instanceof Error ? err.message : err });
    await fs.rm(uploadedFile.path, { force: true });
    res.status(500).json({ status: STATUS.failed, message: 'Failed to start ingestion' });
  }
};

export const getRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const repositoryId = String(req.params.id);
    const repository = await getRepositoryById(repositoryId);
    if (!repository) {
      res.status(404).json({ status: STATUS.failed, message: 'Repository not found' });
      return;
    }

    res.json({ status: STATUS.success, data: toRepositorySummary(repository) });
  } catch (err) {
    logger.error('Failed to fetch repository', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ status: STATUS.failed, message: 'Failed to fetch repository' });
  }
};

export const getRepositories = async (req: Request, res: Response): Promise<void> => {
  try {
    const repositories = await listRepositories();
    res.json({ status: STATUS.success, data: { repositories: repositories.map(toRepositorySummary) } });
  } catch (err) {
    logger.error('Failed to list repositories', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ status: STATUS.failed, message: 'Failed to list repositories' });
  }
};
