import { clientIp, err, ok } from "@/server/api";
import { placeInsights, resolveAnchor } from "@/server/qloo";
import { checkRateLimitStrict, rateLimitedResponse } from "@/server/rate-limit";
import { buildVerifyReport } from "@/server/taste-verify";

const MAX_ANCHORS = 3;
const MAX_PROPOSED = 5;
const MAX_BODY = 4096;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const VERIFY_TAKE = 5;

type ResolveSlot =
  | { anchor: string; outcome: "resolved"; resolved: { name: string; entity_id: string; kind: string }; searchTotal: number }
  | { anchor: string; outcome: "choices"; candidates: { name: string; entity_id: string; kind: string }[]; searchTotal: number }
  | { anchor: string; outcome: "failed"; error: { code: string; message: string } };

async function takeAllowance(ip: string) {
  const rl = await checkRateLimitStrict(`tasteverify:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) return err(503, "rate_limit_unavailable", "Verification is temporarily unavailable. Try again shortly.");
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
  return null;
}

function cleanAnchor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

function cleanCity(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

function cleanProposed(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PROPOSED) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (t.length < 2 || t.length > 120) return null;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return null;
    out.push(t);
  }
  return out;
}

function cleanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[0-9A-Za-z-]{8,64}$/.test(t) && /[0-9]/.test(t) ? t : null;
}

/**
 * POST /api/tasteverify — evidence-gated verification, stateless, no writes.
 *
 * Step 1 (resolve): { step:"resolve", anchors:[1..3], city } — live Qloo
 *   Search per anchor, no Insights. Returns per-anchor resolved|choices|failed.
 * Step 2 (verify): { step:"verify", anchors, entityIds, city, proposed:[1..5] }
 *   — re-resolves every anchor fresh, runs ONE combined Insights, then
 *   deterministically verifies the proposed shortlist against real results.
 *   Verdicts: OBSERVED (exact match), REVIEW (ambiguous/thin), NOT_OBSERVED
 *   (absent from this bounded set — never proof of nonexistence).
 *
 * Only anchor/city strings reach Search; only freshly revalidated entity IDs
 * reach Insights. No session, memory, or private identifiers to Qloo.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) {
      return err(413, "invalid_input", "That request is too large. Keep anchors, city and shortlist short.");
    }
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return err(400, "invalid_input", "Send a JSON body with step resolve or verify.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const step = b.step === "verify" ? "verify" : b.step === "resolve" ? "resolve" : null;
  if (!step) return err(400, "invalid_input", "Send step resolve or verify.");

  const rawAnchors = Array.isArray(b.anchors) ? b.anchors : null;
  if (!rawAnchors || rawAnchors.length < 1 || rawAnchors.length > MAX_ANCHORS) {
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
  const city = cleanCity(b.city);
  if (!city) return err(400, "invalid_input", "Send a destination city (2 to 80 characters).");
  const ip = clientIp(req);

  if (step === "resolve") {
    const slots: ResolveSlot[] = [];
    for (const anchor of anchors) {
      const over = await takeAllowance(ip);
      if (over) return over;
      const r = await resolveAnchor(anchor);
      if (r.status === "failed") {
        slots.push({ anchor, outcome: "failed", error: { code: `qloo_${r.failure.status}`, message: r.failure.message } });
      } else if (r.status === "ambiguous") {
        slots.push({
          anchor,
          outcome: "choices",
          candidates: r.candidates.map((c) => ({ name: c.name, entity_id: c.entity_id, kind: c.kind })),
          searchTotal: r.total,
        });
      } else {
        slots.push({ anchor, outcome: "resolved", resolved: r.entity, searchTotal: r.total });
      }
    }
    return ok({ stage: "verify_resolve" as const, city, anchors: slots });
  }

  // Verify step: positional anchor:entityId pairing + proposed shortlist.
  const rawIds = b.entityIds;
  if (!Array.isArray(rawIds) || rawIds.length !== anchors.length) {
    return err(400, "invalid_input", "Confirm every anchor: send one entity ID per anchor, in the same order.");
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
  const proposed = cleanProposed(b.proposed);
  if (!proposed) {
    return err(400, "invalid_input", "Send 1 to 5 proposed venues, each 2 to 120 characters, no duplicates.");
  }

  const resolved: { name: string; entity_id: string; kind: string }[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const over = await takeAllowance(ip);
    if (over) return over;
    const r = await resolveAnchor(anchors[i]);
    if (r.status === "failed") {
      return err(409, "stale_selection", `“${anchors[i]}” no longer resolves. Resolve again before verification.`);
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
    { city, take: VERIFY_TAKE }
  );
  if (!ins.ok) return err(ins.failure.http, `qloo_${ins.failure.status}`, ins.failure.message);

  const report = buildVerifyReport({
    anchors,
    entityIds: resolved.map((r) => r.entity_id),
    city,
    proposed,
    candidates: ins.candidates,
    take: VERIFY_TAKE,
  });

  return ok({
    stage: "verified" as const,
    city,
    anchors,
    resolved,
    proposed,
    candidates: ins.candidates,
    verification: report.items,
    coverage: report.coverage,
    evidence: {
      anchorIds: resolved.map((r) => r.entity_id),
      candidateIds: ins.candidates.map((c) => c.entity_id),
      city,
    },
    limitations: report.limitations,
    execution: report.execution,
  });
}
