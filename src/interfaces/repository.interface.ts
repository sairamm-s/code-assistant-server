export type RepositoryStatus = 'queued' | 'cloning' | 'chunking' | 'embedding' | 'ready' | 'failed';

export interface IngestGithubBody {
  source: 'github';
  url: string;
}

export interface IngestGithubJobPayload {
  repositoryId: string;
  source: 'github';
  url: string;
}

export interface IngestUploadJobPayload {
  repositoryId: string;
  source: 'upload';
  zipPath: string;
}

export type IngestJobPayload = IngestGithubJobPayload | IngestUploadJobPayload;

export interface RepositorySummary {
  id: string;
  name: string;
  source: string;
  status: RepositoryStatus;
  fileCount: number;
  errorMessage: string | null;
}
