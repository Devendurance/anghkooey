import { clientIp, err, ok } from "@/server/api";
import { placeInsights, searchAnchor } from "@/server/qloo";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";

/**
 * GET /api/tasteproof?anchor=Nobu%20Restaurant&city=Lagos
 * Stateless TasteProof Slice 1: resolve one caller-supplied cultural anchor
 * through live Qloo Search, then return real Qloo place candidates.
 * Sends only the anchor/city strings to Qloo. No session, no memory access.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const anchor = (url.searchParams.get("anchor") ?? "").trim();
  const city = (url.searchParams.get("city") ?? "").trim();

  try {
    const rl = await checkRateLimit(`tasteproof:${clientIp(req)}`, 20, 60_000);
    if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
  } catch {
    // Fail open when the rate-limit store is unavailable (e.g. no DATABASE_URL).
  }

  const s = await searchAnchor(anchor);
  if (!s.ok) return err(s.failure.http, `qloo_${s.failure.status}`, s.failure.message);

  const ins = await placeInsights(s.entity.entity_id, { city: city || undefined, take: 3 });
  if (!ins.ok) return err(ins.failure.http, `qloo_${ins.failure.status}`, ins.failure.message);

  return ok({
    anchor,
    city: city || null,
    resolved: s.entity,
    searchTotal: s.total,
    candidates: ins.candidates,
    evidence: {
      anchor,
      entityId: s.entity.entity_id,
      entityKind: s.entity.kind,
      candidateIds: ins.candidates.map((c) => c.entity_id),
      city: city || null,
    },
  });
}
