import fs from 'fs/promises';
import { Request, Response } from 'express';
import { STATUS } from '../helpers/response.helper';
import { IngestGithubBody } from '../interfaces/repository.interface';
import { ingestionQueue } from '../queues/ingestion.queue';
import { getUploadZipPath } from '../lib/upload-storage';
import {
  createGithubRepository,
  createUploadRepository,
  getRepositoryById,
  setRepositoryJobId,
} from '../services/repository.service';

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
    console.error('Failed to enqueue ingestion', err);
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
    console.error('Failed to enqueue upload ingestion', err);
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

    res.json({
      status: STATUS.success,
      data: {
        id: repository.id,
        name: repository.name,
        source: repository.source,
        status: repository.status,
        fileCount: repository.fileCount,
        errorMessage: repository.errorMessage,
      },
    });
  } catch (err) {
    console.error('Failed to fetch repository', err);
    res.status(500).json({ status: STATUS.failed, message: 'Failed to fetch repository' });
  }
};
