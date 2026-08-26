/*
IMPORTANT NOTICE: DO NOT REMOVE
./src/api/chat-service.ts
If the user wants to use AI to generate text, answer questions, or analyze images you can use the functions defined in this file to communicate with the OpenAI API.
*/
import { AIMessage, AIRequestOptions, AIResponse } from "../types/ai";
import { fetchWithAuthRefresh } from "./auth-fetch";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

const chatViaBackend = async (
  provider: "openai",
  messages: AIMessage[],
  options?: AIRequestOptions
): Promise<AIResponse> => {
  const res = await fetchWithAuthRefresh(`${BACKEND_URL}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      model: options?.model,
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    }),
  });

  if (!res.ok) throw new Error(await res.text());

  const data = await res.json() as AIResponse;
  return data;
};

export const getOpenAITextResponse = async (messages: AIMessage[], options?: AIRequestOptions): Promise<AIResponse> => {
  return chatViaBackend("openai", messages, options);
};

export const getOpenAIChatResponse = async (prompt: string): Promise<AIResponse> => {
  return getOpenAITextResponse([{ role: "user", content: prompt }]);
};
