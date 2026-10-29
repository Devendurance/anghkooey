import { clientIp, err, ok } from "@/server/api";
import { placeInsights, resolveAnchor } from "@/server/qloo";
import { checkRateLimitStrict, rateLimitedResponse } from "@/server/rate-limit";

const MULTI_MAX_ANCHORS = 3;
const MULTI_MAX_BODY = 4096;
const MULTI_RATE_LIMIT = 20;
const MULTI_RATE_WINDOW_MS = 60_000;

type MultiPerAnchor =
  | { anchor: string; outcome: "resolved"; resolved: { name: string; entity_id: string; kind: string }; searchTotal: number }
  | { anchor: string; outcome: "choices"; candidates: { name: string; entity_id: string; kind: string }[]; searchTotal: number }
  | { anchor: string; outcome: "failed"; error: { code: string; message: string } };

/** One fail-closed allowance check per upstream Qloo call a multi-anchor
 * operation is about to make. Returns an error response when the store
 * cannot verify or the quota is spent — before any further Qloo traffic. */
async function takeAllowance(ip: string) {
  const rl = await checkRateLimitStrict(`tasteproof:${ip}`, MULTI_RATE_LIMIT, MULTI_RATE_WINDOW_MS);
  if (!rl.ok) return err(503, "rate_limit_unavailable", "Taste lookup is temporarily unavailable. Try again shortly.");
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
  return null;
}

function cleanAnchor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

function cleanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[0-9A-Za-z-]{8,64}$/.test(t) && /[0-9]/.test(t) ? t : null;
}

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

/**
 * POST /api/tasteproof — multi-anchor combined discovery, stateless.
 *
 * Step 1 (resolve): { anchors:[1..3 names], city? } with no entityIds —
 *   resolves each anchor independently via live Qloo Search. Returns
 *   `stage:"multi_resolve"` with a per-anchor outcome. No Insights call.
 * Step 2 (confirm): { anchors, entityIds:[..], city? } — re-resolves every
 *   anchor and runs ONE combined Insights ONLY when each ID belongs to its
 *   anchor's fresh resolution. Anything else is a 409 naming the anchor.
 *   Lengths must match positionally: entityIds[i] confirms anchors[i].
 *
 * IDs are untrusted input: format-gated here AND revalidated against fresh
 * Search candidates before Insights, so the browser can never pipe arbitrary
 * IDs to Insights. Only anchor/city strings reach Search, only confirmed
 * IDs reach Insights. No session, no memory access, no writes.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MULTI_MAX_BODY) {
      return err(413, "invalid_input", "That request is too large. Keep anchors and city short.");
    }
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return err(400, "invalid_input", "Send a JSON body with 1 to 3 cultural anchors.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const rawAnchors = Array.isArray(b.anchors) ? b.anchors : null;
  const rawIds = b.entityIds === undefined || b.entityIds === null ? null : b.entityIds;
  const rawCity = b.city === undefined || b.city === null ? "" : b.city;
  if (!rawAnchors || rawAnchors.length < 1 || rawAnchors.length > MULTI_MAX_ANCHORS) {
    return err(400, "invalid_input", "Send 1 to 3 cultural anchors.");
  }
  const anchors: string[] = [];
  for (const a of rawAnchors) {
    const clean = cleanAnchor(a);
    if (!clean) return err(400, "invalid_input", "Each anchor names a place, artist or film (2 to 80 characters).");
    if (anchors.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      return err(400, "invalid_input", "Anchors must be distinct. Remove the duplicate and resolve again.");
    }
    anchors.push(clean);
  }
  if (typeof rawCity !== "string" || rawCity.trim().length > 80) {
    return err(400, "invalid_input", "City names stay under 80 characters.");
  }
  const city = rawCity.trim();
  const ip = clientIp(req);

  // Resolve step: per-anchor outcomes, no Insights.
  if (rawIds === null) {
    const per: MultiPerAnchor[] = [];
    for (const anchor of anchors) {
      const over = await takeAllowance(ip);
      if (over) return over;
      const r = await resolveAnchor(anchor);
      if (r.status === "failed") {
        per.push({ anchor, outcome: "failed", error: { code: `qloo_${r.failure.status}`, message: r.failure.message } });
      } else if (r.status === "ambiguous") {
        per.push({
          anchor,
          outcome: "choices",
          candidates: r.candidates.map((c) => ({ name: c.name, entity_id: c.entity_id, kind: c.kind })),
          searchTotal: r.total,
        });
      } else {
        per.push({ anchor, outcome: "resolved", resolved: r.entity, searchTotal: r.total });
      }
    }
    return ok({ stage: "multi_resolve" as const, city: city || null, anchors: per });
  }

  // Confirm step: positional pairing, revalidated against fresh resolution.
  if (!Array.isArray(rawIds) || rawIds.length !== anchors.length) {
    return err(
      400,
      "invalid_input",
      "Confirm every anchor: send one entity ID per anchor, in the same order."
    );
  }
  const ids: string[] = [];
  for (const v of rawIds) {
    const clean = cleanId(v);
    if (!clean) {
      return err(400, "stale_selection", "One selection is not a valid Qloo entity. Resolve again and pick from the fresh lists.");
    }
    if (ids.includes(clean)) {
      return err(400, "invalid_input", "Each anchor needs its own entity. Two anchors share one selection.");
    }
    ids.push(clean);
  }
  const resolved: { name: string; entity_id: string; kind: string }[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const over = await takeAllowance(ip);
    if (over) return over;
    const r = await resolveAnchor(anchors[i]);
    if (r.status === "failed") {
      return err(409, "stale_selection", `“${anchors[i]}” no longer resolves. Resolve again before the combined lookup.`);
    }
    const pool = r.status === "ambiguous" ? r.candidates : [r.entity];
    const hit = pool.find((c) => c.entity_id === ids[i]);
    if (!hit) {
      return err(
        409,
        "stale_selection",
        `The selection for “${anchors[i]}” is not among its current candidates. Resolve again and pick from the fresh list.`
      );
    }
    resolved.push({ name: hit.name, entity_id: hit.entity_id, kind: hit.kind });
  }
  const over = await takeAllowance(ip);
  if (over) return over;
  const ins = await placeInsights(
    resolved.map((r) => r.entity_id),
    { city: city || undefined, take: 3 }
  );
  if (!ins.ok) return err(ins.failure.http, `qloo_${ins.failure.status}`, ins.failure.message);
  return ok({
    stage: "multi_candidates" as const,
    city: city || null,
    anchors,
    resolved,
    candidates: ins.candidates,
    evidence: {
      anchorIds: resolved.map((r) => r.entity_id),
      candidateIds: ins.candidates.map((c) => c.entity_id),
      city: city || null,
    },
  });
}
