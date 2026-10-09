import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { correctMemory } from "@/server/corrections";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";


const patchSchema = z.object({
  text: z.string().trim().min(12, "correction text too short").max(500, "correction text too long"),
  memoryKey: z.string().max(80).optional(),
  category: z.enum(["hotel", "travel", "dining"]).optional(),
});

/**
 * Correct a stored memory. Append-only: writes a new confirmed Walrus blob,
 * then marks the old blob superseded. Never edits the old blob in place.
 * Ownership spans the session user's canonical + merged identities only.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  if (auth.session.consentAt === null) {
    return err(403, "consent_required", "Enable memory consent before correcting memories");
  }
  const rl = await checkRateLimit(`correct:${auth.session.userId}`, 6, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

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
    const result = await correctMemory({ canonicalUserId: auth.session.userId, oldBlobId, ...parsed.data });
    if (!result.ok) return err(result.status, result.code, result.message);
    return ok({
      oldBlobId: result.oldBlobId,
      newBlobId: result.newBlobId,
      status: "active",
      previousState: "superseded",
      jobId: result.jobId,
    });
  } catch {
    return err(500, "internal", "Correction failed. Try again.");
  }
}
