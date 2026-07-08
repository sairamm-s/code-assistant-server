export type RepositoryOverviewScope = 'root' | 'client' | 'server';
export type RepositoryOverviewSource = 'existing' | 'generated';

export interface RepositoryOverviewResult {
  scope: RepositoryOverviewScope;
  source: RepositoryOverviewSource;
  content: string;
}
