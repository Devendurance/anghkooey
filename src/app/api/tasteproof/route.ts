import { clientIp, err, ok } from "@/server/api";
import { placeInsights, resolveAnchor } from "@/server/qloo";
import { checkRateLimitStrict, rateLimitedResponse } from "@/server/rate-limit";

/**
 * GET /api/tasteproof — two-step trustworthy resolution, stateless.
 *
 * Step 1 (resolve): ?anchor=&city= — live Qloo Search only. Returns either
 *   a single lexically strong entity (`stage:"resolved"`) or candidate
 *   choices (`stage:"choices"`), or an honest error. No Insights call.
 * Step 2 (confirm): ?anchor=&city=&entityId= — re-resolves the anchor and
 *   runs Insights ONLY when the ID belongs to the fresh resolution.
 *   Anything else is a 409 stale_selection: resolve again.
 *
 * Sends only the anchor/city strings to Qloo Search, and only a confirmed
 * entity ID to Insights. No session, no memory access.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const anchor = (url.searchParams.get("anchor") ?? "").trim();
  const city = (url.searchParams.get("city") ?? "").trim();
  const entityId = (url.searchParams.get("entityId") ?? "").trim();

  // Fail CLOSED: never call Qloo unless the rate-limit store verifies allowance.
  const rl = await checkRateLimitStrict(`tasteproof:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return err(503, "rate_limit_unavailable", "Taste lookup is temporarily unavailable. Try again shortly.");
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const r = await resolveAnchor(anchor);
  if (r.status === "failed") {
    return err(r.failure.http, `qloo_${r.failure.status}`, r.failure.message);
  }
  // Confirmation must name an entity from THIS resolution — never a bare ID.
  // For an ambiguous anchor that means one of the listed choices.
  let confirmed: { name: string; entity_id: string; kind: string } | null = null;
  if (r.status === "ambiguous") {
    const chosen = entityId ? r.candidates.find((c) => c.entity_id === entityId) : undefined;
    if (entityId && !chosen) {
      return err(
        409,
        "stale_selection",
        "That selection is not among the current candidates. Resolve again and pick from the fresh list."
      );
    }
    if (!chosen) {
      return ok({
        stage: "choices" as const,
        anchor,
        city: city || null,
        candidates: r.candidates.map((c) => ({ name: c.name, entity_id: c.entity_id, kind: c.kind })),
        searchTotal: r.total,
      });
    }
    confirmed = { name: chosen.name, entity_id: chosen.entity_id, kind: chosen.kind };
  } else {
    // Single strong match. Insights still waits for explicit confirmation.
    if (!entityId) {
      return ok({
        stage: "resolved" as const,
        anchor,
        city: city || null,
        resolved: r.entity,
        searchTotal: r.total,
      });
    }
    if (!r.entity || r.entity.entity_id !== entityId) {
      return err(
        409,
        "stale_selection",
        "That selection no longer matches the anchor. Resolve again and pick from the fresh candidates."
      );
    }
    confirmed = r.entity;
  }

  const ins = await placeInsights(confirmed.entity_id, { city: city || undefined, take: 3 });
  if (!ins.ok) return err(ins.failure.http, `qloo_${ins.failure.status}`, ins.failure.message);

  return ok({
    stage: "candidates" as const,
    anchor,
    city: city || null,
    resolved: confirmed,
    searchTotal: r.total,
    candidates: ins.candidates,
    evidence: {
      anchor,
      entityId: confirmed.entity_id,
      entityKind: confirmed.kind,
      candidateIds: ins.candidates.map((c) => c.entity_id),
      city: city || null,
    },
  });
}
