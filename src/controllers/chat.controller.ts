import { Request, Response } from 'express';
import { STATUS } from '../helpers/response.helper';
import { SendMessageBody } from '../interfaces/chat.interface';
import { ChatRequestLogEntry } from '../interfaces/observability.interface';
import { getRepositoryById } from '../services/repository.service';
import { saveMessage, getMessagesByRepositoryId } from '../services/chat.service';
import { buildRetrievalContext, buildChatPrompt } from '../services/prompt.service';
import { generateText } from '../services/generation.service';
import { extractCitations } from '../services/citation.service';
import { shouldRefuseForInsufficientContext, buildRefusalResponse } from '../services/guardrails.service';
import logger from '../lib/logger';

const logChatRequest = (entry: ChatRequestLogEntry): void => {
  logger.info('chat_request', entry);
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const repositoryId = String(req.params.repositoryId);
  const requestStart = Date.now();

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

    // Saved immediately, before retrieval/generation — a failed downstream
    // call (e.g. a rate-limited or quota-exhausted LLM) must not silently
    // drop the user's question from history.
    await saveMessage(repositoryId, 'user', message);

    const retrievalStart = Date.now();
    const context = await buildRetrievalContext(repositoryId, message);
    const retrievalMs = Date.now() - retrievalStart;

    const chunkLogs = context.chunks.map((chunk) => ({
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      similarity: chunk.similarity,
    }));

    if (shouldRefuseForInsufficientContext(context)) {
      const refusal = buildRefusalResponse();
      await saveMessage(repositoryId, 'assistant', refusal.answer, refusal.citations);

      logChatRequest({
        repositoryId,
        query: message,
        chunkCount: context.chunks.length,
        chunks: chunkLogs,
        refused: true,
        latencyMs: { retrievalMs, generationMs: 0, totalMs: Date.now() - requestStart },
        tokens: null,
      });

      res.json({ status: STATUS.success, data: refusal });
      return;
    }

    const prompt = buildChatPrompt(message, context);
    const generationStart = Date.now();
    const { text: answer, usage } = await generateText(prompt);
    const generationMs = Date.now() - generationStart;

    const citations = extractCitations(answer, context.chunks);

    await saveMessage(repositoryId, 'assistant', answer, citations);

    logChatRequest({
      repositoryId,
      query: message,
      chunkCount: context.chunks.length,
      chunks: chunkLogs,
      refused: false,
      latencyMs: { retrievalMs, generationMs, totalMs: Date.now() - requestStart },
      tokens: usage,
    });

    res.json({ status: STATUS.success, data: { answer, citations } });
  } catch (err) {
    logger.error('Failed to generate chat response', { repositoryId, error: err instanceof Error ? err.message : err });

    // The user's message was already saved above (or before this point failed,
    // in which case there's nothing to reconcile) — leave a visible trace in
    // history too, so a failed turn doesn't just vanish from the transcript.
    await saveMessage(
      repositoryId,
      'assistant',
      "Something went wrong generating a response. This is usually a transient issue (e.g. an API rate limit) — try asking again in a moment.",
    ).catch(() => undefined);

    res.status(500).json({ status: STATUS.failed, message: 'Failed to generate a response' });
  }
};

export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  const repositoryId = String(req.params.repositoryId);

  try {
    const messages = await getMessagesByRepositoryId(repositoryId);
    res.json({ status: STATUS.success, data: { messages } });
  } catch (err) {
    logger.error('Failed to fetch chat history', { repositoryId, error: err instanceof Error ? err.message : err });
    res.status(500).json({ status: STATUS.failed, message: 'Failed to fetch chat history' });
  }
};
