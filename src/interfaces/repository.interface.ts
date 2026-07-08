export type RepositoryStatus = 'queued' | 'cloning' | 'chunking' | 'embedding' | 'ready' | 'failed';

export interface IngestGithubBody {
  source: 'github';
  url: string;
}

export interface IngestJobPayload {
  repositoryId: string;
  source: 'github';
  url: string;
}

export interface RepositorySummary {
  id: string;
  name: string;
  source: string;
  status: RepositoryStatus;
  fileCount: number;
  errorMessage: string | null;
}
