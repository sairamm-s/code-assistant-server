import prisma from '../lib/prisma';
import { RepositoryOverview } from '@prisma/client';
import { RepositoryOverviewResult } from '../interfaces/overview.interface';

export const saveOverviews = async (repositoryId: string, overviews: RepositoryOverviewResult[]): Promise<void> => {
  if (overviews.length === 0) return;

  await prisma.repositoryOverview.createMany({
    data: overviews.map((overview) => ({
      repositoryId,
      scope: overview.scope,
      source: overview.source,
      content: overview.content,
    })),
  });
};

export const getOverviewsByRepositoryId = (repositoryId: string): Promise<RepositoryOverview[]> =>
  prisma.repositoryOverview.findMany({ where: { repositoryId } });
