import { Request, Response } from 'express';
import { STATUS } from '../helpers/response.helper';
import { SendMessageBody, ChatCitation } from '../interfaces/chat.interface';
import { getRepositoryById } from '../services/repository.service';
import { saveMessage, getMessagesByRepositoryId } from '../services/chat.service';
import { buildRetrievalContext, buildChatPrompt } from '../services/prompt.service';
import { generateText } from '../services/generation.service';

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const repositoryId = String(req.params.repositoryId);

  try {
    const repository = await getRepositoryById(repositoryId);
    if (!repository) {
      res.status(404).json({ status: STATUS.failed, message: 'Repository not found' });
      return;
    }
    if (repository.status !== 'ready') {
      res.status(409).json({ status: STATUS.failed, message: `Repository is not ready for chat (status: ${repository.status})` });
      return;
    }

    const { message } = req.body as SendMessageBody;

    const context = await buildRetrievalContext(repositoryId, message);
    const prompt = buildChatPrompt(message, context);
    const answer = await generateText(prompt);

    const citations: ChatCitation[] = context.chunks.map((chunk) => ({
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      snippet: chunk.content,
    }));

    await saveMessage(repositoryId, 'user', message);
    await saveMessage(repositoryId, 'assistant', answer, citations);

    res.json({ status: STATUS.success, data: { answer, citations } });
  } catch (err) {
    console.error('Failed to generate chat response', err);
    res.status(500).json({ status: STATUS.failed, message: 'Failed to generate a response' });
  }
};

export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  const repositoryId = String(req.params.repositoryId);

  try {
    const messages = await getMessagesByRepositoryId(repositoryId);
    res.json({ status: STATUS.success, data: { messages } });
  } catch (err) {
    console.error('Failed to fetch chat history', err);
    res.status(500).json({ status: STATUS.failed, message: 'Failed to fetch chat history' });
  }
};
