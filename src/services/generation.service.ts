import genAI from '../lib/gemini';
import { GENERATION_MODEL_NAME } from '../config/llm.config';

export const generateText = async (prompt: string): Promise<string> => {
  const model = genAI.getGenerativeModel({ model: GENERATION_MODEL_NAME });
  const result = await model.generateContent(prompt);
  return result.response.text();
};
