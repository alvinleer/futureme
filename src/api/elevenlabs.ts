/*
IMPORTANT NOTICE: DO NOT REMOVE
This is the ElevenLabs API client for text-to-speech.

Popular voice IDs:
- Rachel (21m00Tcm4TlvDq8ikWAM) - Calm, professional female voice
- Antoni (ErXwobaYiN019PkySvjV) - Warm, articulate male voice
- Elli (MF3mGyEYCl7XYWbV9V6O) - Energetic female voice
- Josh (TxGEqnHWrfWFTfGW9XjX) - Deep, authoritative male voice
- Arnold (VR6AewLTigWG4xSOukaG) - Crisp male voice
- Adam (pNInz6obpgDQGcFmaJgB) - Deep, resonant male voice
- Sam (yoZ06aMxZJJ28mfd3POQ) - Warm male voice
*/

import { useAuthStore } from "../state/authStore";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

const authHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const textToSpeech = async (
  text: string,
  voiceId: string = "21m00Tcm4TlvDq8ikWAM"
): Promise<string> => {
  const response = await fetch(`${BACKEND_URL}/api/ai/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const data = await response.json() as { audioBase64: string };
  return data.audioBase64;
};

export const getAvailableVoices = async (): Promise<
  Array<{ voice_id: string; name: string; description?: string }>
> => {
  const response = await fetch(`${BACKEND_URL}/api/ai/voices`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const data = await response.json() as { voices: Array<{ voice_id: string; name: string; description?: string }> };
  return data.voices || [];
};
