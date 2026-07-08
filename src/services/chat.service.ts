import { ChatMessage, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { ChatCitation } from '../interfaces/chat.interface';

export const saveMessage = (
  repositoryId: string,
  role: 'user' | 'assistant',
  content: string,
  citations: ChatCitation[] | null = null,
): Promise<ChatMessage> =>
  prisma.chatMessage.create({
    data: {
      repositoryId,
      role,
      content,
      citations: citations === null ? Prisma.JsonNull : (citations as unknown as Prisma.InputJsonValue),
    },
  });

const DEFAULT_HISTORY_LIMIT = 100;

// Fetches the most recent `limit` messages, oldest-first for display —
// bounded per node.md skill rule (no unbounded fetches).
export const getMessagesByRepositoryId = async (
  repositoryId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<ChatMessage[]> => {
  const messages = await prisma.chatMessage.findMany({
    where: { repositoryId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return messages.reverse();
};
