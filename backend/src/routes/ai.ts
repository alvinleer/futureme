import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { spendGuard, recordAiUsage, estimateCost, flatCost } from "../middleware/spendGuard";

type AppEnv = { Variables: { userId: string } };

const aiRouter = new Hono<AppEnv>();
aiRouter.use("*", requireAuth);
// Every route below proxies a metered upstream API, so the ceiling applies to
// all of them — including the ones that only read (e.g. /voices), which cost
// nothing but would otherwise be a free channel for hammering the proxy.
aiRouter.use("*", spendGuard());

// ─── Chat completions (OpenAI) ───────────────────────────────────────────────

const chatSchema = z.object({
  provider: z.enum(["openai"]),
  model: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })).min(1),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(32768).optional(),
});

aiRouter.post("/chat", zValidator("json", chatSchema), async (c) => {
  const { model, messages, temperature, maxTokens } = c.req.valid("json");

  const apiKey = process.env.OPENAI_API_KEY;
  const defaultModel = "gpt-4o";

  if (!apiKey) return c.json({ error: "openai API key not configured" }, 503);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || defaultModel,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2048,
    }),
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
  const usedModel = model || defaultModel;
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  recordAiUsage({
    userId: c.get("userId"),
    endpoint: "chat",
    model: usedModel,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(usedModel, inputTokens, outputTokens),
  });

  return c.json({
    content: data.choices[0]?.message?.content || "",
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: data.usage?.total_tokens || 0,
    },
  });
});

// ─── Image generation (OpenAI gpt-image-1) ───────────────────────────────────

const imageGenSchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.enum(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]).optional(),
  quality: z.enum(["low", "medium", "high", "hd"]).optional(),
});

aiRouter.post("/image/generate", zValidator("json", imageGenSchema), async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OpenAI API key not configured" }, 503);

  const body = c.req.valid("json");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: body.prompt,
      n: 1,
      size: body.size || "1024x1024",
      quality: body.quality || "medium",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes("content_policy") || err.includes("safety")) {
      return c.json({ error: "content_policy" }, 400);
    }
    return c.json({ error: err }, res.status as 400);
  }

  const data = await res.json() as { data: Array<{ b64_json?: string; url?: string }> };
  const imageResult = data.data[0];
  if (!imageResult) return c.json({ error: "No image in response" }, 500);

  recordAiUsage({
    userId: c.get("userId"),
    endpoint: "image/generate",
    model: "gpt-image-1",
    costUsd: flatCost("image/generate"),
  });

  return c.json({ b64_json: imageResult.b64_json || null, url: imageResult.url || null });
});

// ─── Image analysis / vision (OpenAI gpt-4o) ─────────────────────────────────

const imageAnalyzeSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
  prompt: z.string().min(1).max(4000),
  maxTokens: z.number().int().positive().max(4096).optional(),
  model: z.string().optional(),
  detail: z.enum(["low", "high", "auto"]).optional(),
});

aiRouter.post("/image/analyze", zValidator("json", imageAnalyzeSchema), async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OpenAI API key not configured" }, 503);

  const body = c.req.valid("json");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model || "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: body.prompt },
          { type: "image_url", image_url: { url: `data:${body.mimeType};base64,${body.imageBase64}`, detail: body.detail || "low" } },
        ],
      }],
      max_tokens: body.maxTokens || 500,
    }),
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const usedModel = body.model || "gpt-4o";
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  recordAiUsage({
    userId: c.get("userId"),
    endpoint: "image/analyze",
    model: usedModel,
    inputTokens,
    outputTokens,
    // A vision call with no usage block still consumed image tokens; fall back
    // to the flat estimate so it can never be logged as free.
    costUsd: inputTokens + outputTokens > 0
      ? estimateCost(usedModel, inputTokens, outputTokens)
      : flatCost("image/analyze"),
  });

  return c.json({ content: data.choices[0]?.message?.content || "" });
});

// ─── Audio transcription (OpenAI gpt-4o-transcribe) ──────────────────────────

aiRouter.post("/audio/transcribe", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OpenAI API key not configured" }, 503);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file) return c.json({ error: "file is required" }, 400);

  const oaForm = new FormData();
  oaForm.append("file", file as Blob, "recording.m4a");
  oaForm.append("model", (formData.get("model") as string) || "gpt-4o-transcribe");
  oaForm.append("language", (formData.get("language") as string) || "en");
  oaForm.append("response_format", (formData.get("response_format") as string) || "json");
  const prompt = formData.get("prompt");
  if (prompt) oaForm.append("prompt", prompt as string);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: oaForm,
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  const data = await res.json() as { text?: string };
  const text = (data.text ?? "").trim();

  recordAiUsage({
    userId: c.get("userId"),
    endpoint: "audio/transcribe",
    model: (formData.get("model") as string) || "gpt-4o-transcribe",
    costUsd: flatCost("audio/transcribe"),
  });

  if (!text) return c.json({ error: "No speech detected." }, 400);

  return c.json({ text });
});

// ─── Text-to-speech (ElevenLabs) ─────────────────────────────────────────────

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

aiRouter.post("/tts", zValidator("json", ttsSchema), async (c) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return c.json({ error: "ElevenLabs API key not configured" }, 503);

  const body = c.req.valid("json");
  const voiceId = body.voiceId || "21m00Tcm4TlvDq8ikWAM";

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      text: body.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  recordAiUsage({
    userId: c.get("userId"),
    endpoint: "tts",
    model: "eleven_turbo_v2_5",
    // ElevenLabs meters characters, so scale the flat estimate by length.
    costUsd: flatCost("tts") * Math.max(1, body.text.length / 1500),
  });

  const audioBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return c.json({ audioBase64 });
});

// ─── Gemini image generation ──────────────────────────────────────────────────

const geminiImageSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
  prompt: z.string().min(1).max(4000),
  models: z.array(z.string()).optional(),
});

aiRouter.post("/gemini/generate-image", zValidator("json", geminiImageSchema), async (c) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return c.json({ error: "Gemini API key not configured" }, 503);

  const body = c.req.valid("json");

  const modelsToTry = body.models ?? [
    "gemini-2.0-flash-preview-image-generation",
    "gemini-3.1-flash-image-preview",
  ];

  for (const model of modelsToTry) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: body.mimeType ?? "image/jpeg", data: body.imageBase64 } },
            { text: body.prompt },
          ]}],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
        }),
      }
    );

    if (!res.ok) continue;

    // Billed on every 200, whether or not this attempt yielded an image — the
    // fallback loop must not be a way to spend money off the books.
    recordAiUsage({
      userId: c.get("userId"),
      endpoint: "gemini/generate-image",
      model,
      costUsd: flatCost("gemini/generate-image"),
    });

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> } }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData);
    if (imagePart?.inlineData) {
      return c.json({ imageBase64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType });
    }
  }

  return c.json({ error: "No image generated" }, 500);
});

// ─── List voices (ElevenLabs) ─────────────────────────────────────────────────

aiRouter.get("/voices", async (c) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return c.json({ error: "ElevenLabs API key not configured" }, 503);

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  const data = await res.json() as { voices?: unknown[] };
  return c.json({ voices: data.voices || [] });
});

export { aiRouter };
