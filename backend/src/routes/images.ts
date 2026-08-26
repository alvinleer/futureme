import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";

const imagesRouter = new Hono();
imagesRouter.use("*", requireAuth);

// ─── Background removal (Pixa) ───────────────────────────────────────────────

imagesRouter.post("/remove-background", async (c) => {
  // Support both PIXA_API_KEY (new) and PIXELCUT_API_KEY (legacy) env var names
  const apiKey = process.env.PIXA_API_KEY ?? process.env.PIXELCUT_API_KEY;
  if (!apiKey) return c.json({ error: "Pixa API key not configured" }, 503);

  const formData = await c.req.formData();
  const imageFile = formData.get("image_file");
  if (!imageFile) return c.json({ error: "image_file is required" }, 400);

  const pixaForm = new FormData();
  pixaForm.append("image_file", imageFile as Blob, "photo.jpg");

  const res = await fetch("https://api.developer.pixelcut.ai/v1/remove-background", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, Accept: "image/png" },
    body: pixaForm,
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);

  const imageBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return c.json({ imageBase64 });
});

export { imagesRouter };
