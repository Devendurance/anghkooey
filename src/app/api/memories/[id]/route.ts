import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { saveFact } from "@/server/memwal";
import { getMemoryForUser, markSuperseded, recordMemoryActive, recordMemoryJob } from "@/server/repo";


const patchSchema = z.object({
  text: z.string().min(12, "correction text too short").max(500, "correction text too long"),
  memoryKey: z.string().max(80).optional(),
  category: z.enum(["hotel", "travel", "dining"]).optional(),
});

/**
 * Correct a stored memory. Append-only: writes a new confirmed Walrus blob,
 * then marks the old blob superseded. Never edits the old blob in place.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  if (auth.session.consentAt === null) {
    return err(403, "consent_required", "Enable memory consent before correcting memories");
  }

  const { id } = await ctx.params;
  const oldBlobId = decodeURIComponent(id ?? "").slice(0, 128);
  if (!oldBlobId) return err(400, "validation_error", "Memory id is required");

  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) {
    return err(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid correction");
  }

  try {
    const existing = await getMemoryForUser(auth.session.userId, oldBlobId);
    if (!existing) return err(404, "not_found", "Memory not found");
    if (existing.state === "superseded") {
      return err(409, "already_superseded", "That memory was already corrected");
    }

    const memoryKey = parsed.data.memoryKey ?? existing.memoryKey ?? "user.correction";
    const category = parsed.data.category ?? (existing.category as "hotel" | "travel" | "dining" | null) ?? "hotel";
    const recorded = new Date().toISOString().slice(0, 10);
    const storageText = [
      "TYPE: user-stated preference fact",
      `DOMAIN: ${category}`,
      `KEY: ${memoryKey}`,
      `FACT: ${parsed.data.text}`,
      "WHY: user correction via API",
      "SCOPE: durable preference",
      `RECORDED: ${recorded}`,
      "SOURCE: stated directly by the user",
      `CORRECTS: ${oldBlobId}`,
    ].join("\n");

    let saved: { namespace: string; jobId: string; blobId: string };
    try {
      saved = await saveFact({ userId: auth.session.userId, text: storageText, timeoutMs: 90000 });
    } catch {
      await recordMemoryJob({
        userId: auth.session.userId,
        namespace: `anghkooey:v1:u:${auth.session.userId}`,
        jobId: `correction:${oldBlobId}:${Date.now()}`,
        status: "failed",
        errorCode: "walrus_write_failed",
      }).catch(() => {});
      return err(502, "upstream", "Could not confirm the correction write. Old memory left unchanged.");
    }

    await recordMemoryJob({
      userId: auth.session.userId,
      namespace: saved.namespace,
      jobId: saved.jobId,
      status: "done",
      blobId: saved.blobId,
    });
    await recordMemoryActive({
      blobId: saved.blobId,
      userId: auth.session.userId,
      memoryKey,
      category,
    });
    await markSuperseded({ oldBlobId, newBlobId: saved.blobId, userId: auth.session.userId });

    return ok({
      oldBlobId,
      newBlobId: saved.blobId,
      status: "active",
      previousState: "superseded",
      jobId: saved.jobId,
    });
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return err(404, "not_found", "Memory not found");
    return err(500, "internal", "Correction failed. Try again.");
  }
}
