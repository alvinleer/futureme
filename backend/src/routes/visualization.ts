/**
 * Visualization Engine — Future Self AI Image Generator
 *
 * Philosophy: 3-layer master prompt approach.
 *   Layer 1 [IDENTITY LOCK]           — preserves face, clothing, background exactly
 *   Layer 2 [PHYSIOLOGICAL TRANSFORM] — realistic body change grounded in calorie math
 *   Layer 3 [PHOTOREALISTIC CAMERA]   — shot on real camera, no AI aesthetics
 *
 * Parameters: strength 0.60–0.70, guidance_scale 4–6, steps 25–35.
 * Step 2: face-swap always applied to guarantee identity preservation.
 */

import { Hono } from "hono";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb, newId, cacheTtl } from "../db";
import { encrypt } from "../encryption";
import { requireAuth } from "../middleware/auth";
import { spendGuard, recordAiUsage, flatCost } from "../middleware/spendGuard";

type AppEnv = { Variables: { userId: string } };

const visualizationRouter = new Hono<AppEnv>();

// This router burns two paid image APIs per call and returns a photo of the
// user's body. It was previously wide open and keyed on a client-supplied
// deviceId — both an unmetered spend channel and a way to read someone else's
// photo by guessing an id.
visualizationRouter.use("*", requireAuth);
visualizationRouter.use("*", spendGuard());

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  beforeImageBase64: string;
  mimeType?: string;
  gender?: "male" | "female" | "other";
  age?: number;
  complianceRate: number;
  weeksToGoal: number;
  totalWeeks?: number;
  workoutType?: string;
  goalType?: "fat_loss" | "muscle_gain" | "maintenance";
  avgDailyCalorieBalance?: number; // negative = deficit, positive = surplus (kcal/day)
  currentWeightLbs?: number;
  forceRegenerate?: boolean;
}

interface VisualizationRow {
  id: string;
  image_url: string;
  progress_score: number;
  denoising_strength: number;
  compliance_rate: number;
  weeks_to_goal: number;
  created_at: string;
  expires_at: string;
}

// ─── Physiology calculator ────────────────────────────────────────────────────

/**
 * Compute what would physically happen to this person's body if they maintain
 * the same average daily calorie balance they've logged for the past 14 days,
 * all the way to their goal date.
 *
 * Returns structured fields that feed into the 3-layer master prompt.
 */
function computePhysiologicalChange(
  avgDailyBalance: number,   // kcal/day vs goal (negative = deficit)
  weeksToGoal: number,
  goalType: string,
  workoutType: string,
  currentWeightLbs: number
): {
  fatChangeLbs: number;
  muscleGainLbs: number;
  projectedChangeLabel: string;
  fluxStrength: number;
} {
  const totalDays = Math.max(1, weeksToGoal * 7);
  const totalKcalBalance = avgDailyBalance * totalDays;

  // Fat change — 1 lb adipose ≈ 3500 kcal
  const rawFatChangeLbs = totalKcalBalance / 3500;

  // Physiological cap: max ~1 lb/week loss, max ~0.5 lb/week gain
  const maxFatLoss = weeksToGoal * 1.0;
  const maxFatGain  = weeksToGoal * 0.5;
  const fatChangeLbs = Math.max(-maxFatLoss, Math.min(maxFatGain, rawFatChangeLbs));

  // Muscle gain — only when surplus + muscle_gain goal
  // ~0.35 lb/week realistic mid-estimate
  const inSurplus = avgDailyBalance > 50;
  const rawMuscleGain = goalType === "muscle_gain" && inSurplus
    ? Math.min(weeksToGoal * 0.35, (avgDailyBalance / 250) * weeksToGoal * 0.35)
    : 0;
  const muscleGainLbs = Math.round(rawMuscleGain * 10) / 10;

  void workoutType; // used in prompt builder
  void currentWeightLbs;

  // Flux strength scales with magnitude of change
  // Small change → 0.60, large change → 0.70
  const absFatLbs = Math.abs(fatChangeLbs);
  let fluxStrength: number;
  if (absFatLbs < 3 && muscleGainLbs < 2) {
    fluxStrength = 0.60;
  } else if (absFatLbs < 8 && muscleGainLbs < 5) {
    fluxStrength = 0.65;
  } else {
    fluxStrength = 0.70;
  }

  const projectedChangeLabel =
    goalType === "muscle_gain"
      ? `~${muscleGainLbs.toFixed(1)} lbs muscle gain + ${fatChangeLbs > 0 ? "+" : ""}${fatChangeLbs.toFixed(1)} lbs fat projected`
      : `~${(-fatChangeLbs).toFixed(1)} lbs fat loss projected over ${weeksToGoal} weeks`;

  return { fatChangeLbs, muscleGainLbs, projectedChangeLabel, fluxStrength };
}

// ─── Workout frequency estimator ─────────────────────────────────────────────

function estimateWorkoutFrequency(workoutType: string, complianceRate: number): string {
  const base =
    workoutType === "none" ? 0
    : workoutType === "cardio" ? 3
    : workoutType === "strength" ? 4
    : 4; // mixed
  // Scale by compliance (e.g. 80% compliance → ~80% of sessions)
  const actual = Math.round(base * (Math.min(100, complianceRate) / 100));
  if (actual === 0) return "no structured training";
  if (actual === 1) return "1 training session per week";
  return `${actual} ${workoutType === "cardio" ? "cardio" : workoutType === "strength" ? "strength" : "training"} sessions per week`;
}

// ─── Fal.ai helpers ───────────────────────────────────────────────────────────

/** Fetch wrapper with a 45-second abort timeout for external AI calls. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiImageGeneration(params: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  geminiKey: string;
}): Promise<string> {
  const { imageBase64, mimeType, prompt, geminiKey } = params;

  console.log("[VisualizationEngine] Calling Gemini Flash image generation...");

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-preview-image-generation" });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: {
      // @ts-expect-error — responseModalities is supported at runtime but not yet typed in the SDK
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini did not return an image. Please try again with a different photo.");
  }

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}

/**
 * Face swap: pastes the original face back onto the transformed body.
 * base_image_url = transformed body (face gets REPLACED here)
 * swap_image_url = original user photo  (face gets COPIED from here)
 */
async function callFalFaceSwap(params: {
  originalImageBase64: string;
  mimeType: string;
  transformedImageUrl: string;
  falKey: string;
}): Promise<string> {
  const { originalImageBase64, mimeType, transformedImageUrl, falKey } = params;
  const originalDataUrl = `data:${mimeType};base64,${originalImageBase64}`;

  const response = await fetchWithTimeout("https://fal.run/fal-ai/face-swap", {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base_image_url: transformedImageUrl,
      swap_image_url: originalDataUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[VisualizationEngine] Face swap error:", errorText);
    throw new Error(`Face swap failed: ${response.status}`);
  }

  const data = await response.json() as { image?: { url: string } };
  const url = data.image?.url;
  if (!url) throw new Error("No image returned from face swap");
  return url;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * 3-layer master prompt:
 *   [IDENTITY LOCK]           — do not change the face/clothes/background
 *   [PHYSIOLOGICAL TRANSFORM] — specific body change grounded in real calorie math
 *   [PHOTOREALISTIC CAMERA]   — looks like a real photo, never AI art
 */
function buildMasterPrompt(params: {
  gender: string;
  age: number;
  weeksToGoal: number;
  fatChangeLbs: number;
  muscleGainLbs: number;
  goalType: string;
  avgDailyCalorieBalance: number;
  workoutFrequency: string;
}): string {
  const { gender, age, weeksToGoal, fatChangeLbs, muscleGainLbs, goalType, avgDailyCalorieBalance, workoutFrequency } = params;
  const genderLabel = gender === "female" ? "woman" : gender === "male" ? "man" : "person";
  const ageLabel = age ? `${age}-year-old` : "adult";

  // [PERSONAL USE CONTEXT] — helps safety filters understand this is a legitimate fitness motivation use case
  const personalUseContext =
    `This is a photo of me, and I will use the edited photo as motivation for myself. ` +
    `This is a personal fitness progress photo for a health and wellness app. ` +
    `The purpose is self-improvement motivation, not for any commercial or public use. `;

  // [IDENTITY LOCK]
  const identityLock =
    `Photograph of this exact ${ageLabel} ${genderLabel}. ` +
    `IDENTITY LOCK — do not change anything about this person's face: same face shape, same eyes, same nose, same mouth, same skin tone, same complexion, same pores, same imperfections, same hair color, same hair length, same hairstyle. ` +
    `CLOTHING LOCK — identical outfit: same shirt, same pants, same shoes, same accessories, same fit, same colors, same fabric texture and wrinkles. ` +
    `BACKGROUND LOCK — same exact environment: same room or location, same lighting, same shadows, same objects, same camera angle. `;

  // [PHYSIOLOGICAL TRANSFORMATION]
  let transformDescription: string;
  if (goalType === "fat_loss" || fatChangeLbs < -0.5) {
    const lostLbs = Math.max(0, -fatChangeLbs);
    const lostKg = (lostLbs * 0.453).toFixed(1);
    const deficitPerDay = Math.abs(avgDailyCalorieBalance);
    if (lostLbs < 2) {
      transformDescription =
        `After ${weeksToGoal} weeks at a ${deficitPerDay} kcal/day deficit with ${workoutFrequency}, ` +
        `this person would show almost no visible change — preserve body composition nearly identically. ` +
        `At most: the very faintest reduction in abdominal bloating. Same body, same silhouette.`;
    } else if (lostLbs < 6) {
      transformDescription =
        `After ${weeksToGoal} weeks at a ${deficitPerDay} kcal/day deficit with ${workoutFrequency}, ` +
        `this person has lost approximately ${lostLbs.toFixed(1)} lbs (${lostKg} kg) of body fat. ` +
        `Show subtle but real changes: the waistline is slightly trimmer, the abdomen marginally softer than before, the jawline fractionally leaner. ` +
        `This is not dramatic — it should look like the same person photographed 2 months later.`;
    } else if (lostLbs < 12) {
      transformDescription =
        `After ${weeksToGoal} weeks at a ${deficitPerDay} kcal/day deficit with ${workoutFrequency}, ` +
        `this person has lost approximately ${lostLbs.toFixed(1)} lbs (${lostKg} kg) of fat. ` +
        `Show genuine progress: the midsection is noticeably slimmer, the abdomen flatter, some muscle definition now visible through clothing. ` +
        `The jawline and neck are clearly leaner. Realistic and natural — not a fitness magazine shoot.`;
    } else {
      transformDescription =
        `After ${weeksToGoal} weeks at a ${deficitPerDay} kcal/day deficit with ${workoutFrequency}, ` +
        `this person has lost approximately ${lostLbs.toFixed(1)} lbs (${lostKg} kg) of fat. ` +
        `Show substantial but realistic progress: the waist is meaningfully narrower, the torso leaner, muscle definition clearly visible. ` +
        `The face is noticeably leaner. Still looks like a real person — not a professional athlete.`;
    }
  } else if (goalType === "muscle_gain" && muscleGainLbs > 0.5) {
    const surplusPerDay = Math.abs(avgDailyCalorieBalance);
    transformDescription =
      `After ${weeksToGoal} weeks at a ${surplusPerDay} kcal/day surplus with ${workoutFrequency}, ` +
      `this person has gained approximately ${muscleGainLbs.toFixed(1)} lbs of lean muscle. ` +
      `Show realistic muscle development: shoulders slightly broader, arms marginally fuller, posture more upright. ` +
      `Natural — not a bodybuilder transformation. Same body type, just a bit more developed.`;
  } else {
    transformDescription =
      `After ${weeksToGoal} weeks of maintenance-level eating with ${workoutFrequency}, ` +
      `this person's body composition is essentially unchanged. Same weight, same silhouette, same everything. ` +
      `Perhaps marginally better posture from consistent activity.`;
  }

  const physiologicalTransform =
    `[PHYSIOLOGICAL TRANSFORMATION] ${transformDescription} ` +
    `REALISM CONSTRAINT: preserve all skin imperfections, asymmetries, stretch marks, body hair, and natural irregularities from the source photo. ` +
    `This transformation must be proportional and believable — not exaggerated or fantastical. `;

  // [PHOTOREALISTIC CAMERA SPEC]
  const cameraSpec =
    `[PHOTOREALISTIC CAMERA] Shot on Canon 5D Mark IV, 50mm or 85mm lens, f/2.8, natural ambient lighting. ` +
    `Photojournalism quality — no studio lighting, no retouching, no beauty filters, no AI aesthetics. ` +
    `Authentic film grain, real depth of field, genuine shadows. ` +
    `The result must be completely indistinguishable from an unedited photograph. ` +
    `If someone looked at this image, they should genuinely question whether it was AI-generated at all.`;

  return personalUseContext + identityLock + physiologicalTransform + cameraSpec;
}

const NEGATIVE_PROMPT = [
  // Identity changes
  "different person", "changed face", "new face", "altered face", "different identity",
  "different hair", "changed hair", "new hairstyle", "hair color change",
  // Clothing changes
  "different clothing", "new outfit", "changed shirt", "new shirt",
  "athletic wear", "gym clothes", "sportswear", "different pants",
  // Background changes
  "different background", "new background", "changed environment", "studio background",
  // Unrealistic skin/quality
  "perfect skin", "airbrushed", "smooth skin", "poreless", "waxy", "plastic skin",
  "beauty filter", "skin retouching", "flawless complexion",
  // Art styles
  "cartoon", "3d render", "anime", "illustration", "painting", "digital art",
  "concept art", "fantasy", "CGI", "render",
  // Unrealistic body
  "bodybuilder", "extremely muscular", "exaggerated muscles", "unrealistic muscles",
  "dramatic transformation", "before and after", "fitness model",
  // Technical issues
  "blurry", "distorted", "deformed", "extra limbs", "missing limbs", "bad anatomy",
  "text", "watermark", "logo", "signature",
  // Unwanted content
  "nsfw", "nudity",
].join(", ");

// ─── Routes ───────────────────────────────────────────────────────────────────

visualizationRouter.post("/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>();
  const userId = c.get("userId");

  if (!body.beforeImageBase64) {
    return c.json({ error: "beforeImageBase64 is required" }, 400);
  }
  if (typeof body.complianceRate !== "number") {
    return c.json({ error: "complianceRate is required" }, 400);
  }
  if (typeof body.weeksToGoal !== "number") {
    return c.json({ error: "weeksToGoal is required" }, 400);
  }

  const mimeType   = body.mimeType ?? "image/jpeg";
  const gender     = body.gender ?? "other";
  const age        = body.age ?? 30;
  const totalWeeks = body.totalWeeks ?? 12;
  const goalType   = body.goalType ?? "fat_loss";
  const workoutType = body.workoutType ?? "mixed";
  const avgDailyCalorieBalance = body.avgDailyCalorieBalance ?? 0;
  const currentWeightLbs = body.currentWeightLbs ?? 160;
  const forceRegenerate = body.forceRegenerate ?? false;

  const db = getDb();

  if (!forceRegenerate) {
    const cached = db.query(
      `SELECT * FROM weekly_visualizations
       WHERE user_id = ?
         AND expires_at > datetime('now')
       ORDER BY created_at DESC
       LIMIT 1`
    ).get(userId) as VisualizationRow | null;

    if (cached) {
      return c.json({
        success: true,
        cached: true,
        imageUrl: cached.image_url,
        denoisingStrength: cached.denoising_strength,
        complianceRate: cached.compliance_rate,
        progressScore: cached.progress_score,
        generatedAt: cached.created_at,
        message: "Loaded from cache",
      });
    }
  }

  // Compute realistic physiological change from actual data
  const physio = computePhysiologicalChange(
    avgDailyCalorieBalance,
    body.weeksToGoal,
    goalType,
    workoutType,
    currentWeightLbs
  );

  console.log(`[VisualizationEngine] ${physio.projectedChangeLabel}`);
  console.log(`[VisualizationEngine] AvgDailyBalance: ${avgDailyCalorieBalance} kcal/day`);

  const workoutFrequency = estimateWorkoutFrequency(workoutType, body.complianceRate);

  const prompt = buildMasterPrompt({
    gender,
    age,
    weeksToGoal: body.weeksToGoal,
    fatChangeLbs: physio.fatChangeLbs,
    muscleGainLbs: physio.muscleGainLbs,
    goalType,
    avgDailyCalorieBalance,
    workoutFrequency,
  });

  const progressScore = Math.min(
    100,
    ((totalWeeks - body.weeksToGoal) / totalWeeks) * body.complianceRate
  );

  // EXPO_PUBLIC_* names are client-bundle variables and are never set on the
  // server; they are kept only so an old deployment does not break mid-rollout.
  const geminiKey =
    process.env.GEMINI_API_KEY ??
    process.env.EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY ??
    process.env.EXPO_PUBLIC_GEMINI;
  if (!geminiKey) {
    return c.json({ success: false, error: "Image generation is not configured on this server." }, 503);
  }

  const falKey = process.env.FAL_AI_KEY;

  let imageUrl: string;
  try {
    // Step 1: Gemini Flash body recomposition
    const transformedUrl = await callGeminiImageGeneration({
      imageBase64: body.beforeImageBase64,
      mimeType,
      prompt,
      geminiKey,
    });
    recordAiUsage({
      userId,
      endpoint: "visualization/generate",
      model: "gemini-2.0-flash-preview-image-generation",
      costUsd: flatCost("gemini/generate-image"),
    });

    // Step 2: Face swap — always apply to guarantee the original face is preserved
    try {
      if (!falKey) throw new Error("FAL_AI_KEY not configured");
      imageUrl = await callFalFaceSwap({
        originalImageBase64: body.beforeImageBase64,
        mimeType,
        transformedImageUrl: transformedUrl,
        falKey,
      });
      recordAiUsage({
        userId,
        endpoint: "visualization/faceswap",
        model: "fal-ai/face-swap",
        costUsd: flatCost("visualization/faceswap"),
      });
      console.log("[VisualizationEngine] Face swap applied successfully");
    } catch (swapErr) {
      console.warn("[VisualizationEngine] Face swap failed, using Gemini result:", swapErr);
      imageUrl = transformedUrl;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    return c.json({ success: false, error: message }, 500);
  }

  const id = newId();
  const expiresAt = cacheTtl(7 * 24);

  // Encrypt the prompt before storing — it contains personal health data
  const encryptedPrompt = encrypt(prompt);

  db.run(
    `INSERT INTO weekly_visualizations
       (id, user_id, device_id, image_url, progress_score, denoising_strength,
        compliance_rate, weeks_to_goal, prompt_used, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // device_id is legacy and NOT NULL; user_id is the real key now.
    [id, userId, userId, imageUrl, progressScore, physio.fluxStrength,
     body.complianceRate, body.weeksToGoal, encryptedPrompt, expiresAt]
  );

  return c.json({
    success: true,
    cached: false,
    imageUrl,
    denoisingStrength: physio.fluxStrength,
    projectedChange: physio.projectedChangeLabel,
    complianceRate: body.complianceRate,
    progressScore,
    generatedAt: new Date().toISOString(),
    message: "Visualization generated successfully",
  });
});

visualizationRouter.get("/latest", (c) => {
  const db = getDb();

  const row = db.query(
    `SELECT image_url, progress_score, denoising_strength, compliance_rate,
            weeks_to_goal, created_at, expires_at
     FROM weekly_visualizations
     WHERE user_id = ?
       AND expires_at > datetime('now')
     ORDER BY created_at DESC
     LIMIT 1`
  ).get(c.get("userId")) as VisualizationRow | null;

  if (!row) return c.json({ found: false });

  return c.json({
    found: true,
    imageUrl: row.image_url,
    progressScore: row.progress_score,
    denoisingStrength: row.denoising_strength,
    complianceRate: row.compliance_rate,
    weeksToGoal: row.weeks_to_goal,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
});

visualizationRouter.delete("/cache", (c) => {
  const db = getDb();
  db.run(
    `UPDATE weekly_visualizations SET expires_at = datetime('now') WHERE user_id = ?`,
    [c.get("userId")]
  );
  return c.json({ success: true });
});

export { visualizationRouter };
