import genAI from '../lib/gemini';
import { GENERATION_MODEL_NAME, GENERATION_PROVIDER, GROQ_API_KEY } from '../config/llm.config';
import { TokenUsage } from '../interfaces/observability.interface';

export interface GenerationResult {
  text: string;
  usage: TokenUsage | null;
}

interface GroqChatCompletionResponse {
  choices: { message: { content: string } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const generateWithGroq = async (prompt: string): Promise<GenerationResult> => {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set — required when GENERATION_PROVIDER=groq');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GENERATION_MODEL_NAME,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as GroqChatCompletionResponse;

  return {
    text: data.choices[0].message.content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : null,
  };
};

const generateWithGemini = async (prompt: string): Promise<GenerationResult> => {
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

export const generateText = async (prompt: string): Promise<GenerationResult> =>
  GENERATION_PROVIDER === 'groq' ? generateWithGroq(prompt) : generateWithGemini(prompt);
