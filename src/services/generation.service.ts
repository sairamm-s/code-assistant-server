import genAI from '../lib/gemini';
import { GENERATION_MODEL_NAME } from '../config/llm.config';
import { TokenUsage } from '../interfaces/observability.interface';

export interface GenerationResult {
  text: string;
  usage: TokenUsage | null;
}

export const generateText = async (prompt: string): Promise<GenerationResult> => {
  const model = genAI.getGenerativeModel({ model: GENERATION_MODEL_NAME });
  const result = await model.generateContent(prompt);
  const usageMetadata = result.response.usageMetadata;

  return {
    text: result.response.text(),
    usage: usageMetadata
      ? {
          promptTokens: usageMetadata.promptTokenCount,
          completionTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
        }
      : null,
  };
};
