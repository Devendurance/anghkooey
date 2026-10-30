import { clientIp, err, ok } from "@/server/api";
import { resolveAnchor } from "@/server/qloo";
import { checkRateLimitStrict, rateLimitedResponse } from "@/server/rate-limit";
import { createTasteApproval, getApprovalSecret, type ApprovalOp } from "@/server/taste-approval";

const MAX_ANCHORS = 3;
const MAX_PROPOSED = 5;
const MAX_BODY = 4096;

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

function cleanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[0-9A-Za-z-]{8,64}$/.test(t) && /[0-9]/.test(t) ? t : null;
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

/**
 * POST /api/tasteapproval — browser confirmation bridge for MCP.
 * Revalidates each anchor:entityId pair against fresh Qloo Search (no
 * Insights), then mints a short-lived HMAC approval bound to the exact
 * inputs + allowed ops. The MCP client presents this artifact; it cannot
 * mint its own (secret never leaves the server). No DB writes.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return err(413, "invalid_input", "That request is too large.");
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return err(400, "invalid_input", "Send a JSON body with anchors, entityIds, city and proposed.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const rawAnchors = Array.isArray(b.anchors) ? b.anchors : null;
  const rawIds = Array.isArray(b.entityIds) ? b.entityIds : null;
  if (!rawAnchors || rawAnchors.length < 1 || rawAnchors.length > MAX_ANCHORS) {
    return err(400, "invalid_input", "Send 1 to 3 cultural anchors.");
  }
  const anchors: string[] = [];
  for (const a of rawAnchors) {
    const clean = cleanAnchor(a);
    if (!clean) return err(400, "invalid_input", "Each anchor names a place, artist or film (2 to 80 characters).");
    if (anchors.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      return err(400, "invalid_input", "Anchors must be distinct.");
    }
    anchors.push(clean);
  }
  if (!rawIds || rawIds.length !== anchors.length) {
    return err(400, "invalid_input", "Send one entity ID per anchor, in the same order.");
  }
  const ids: string[] = [];
  for (const v of rawIds) {
    const clean = cleanId(v);
    if (!clean) return err(400, "stale_selection", "One selection is not a valid Qloo entity. Resolve again.");
    if (ids.includes(clean)) return err(400, "invalid_input", "Each anchor needs its own entity.");
    ids.push(clean);
  }
  const city = cleanCity(b.city);
  if (!city) return err(400, "invalid_input", "Send a destination city (2 to 80 characters).");
  const proposed = cleanProposed(b.proposed);
  if (!proposed) return err(400, "invalid_input", "Send 1 to 5 proposed venues, each 2 to 120 characters.");
  let ops: ApprovalOp[] = ["verify", "investigate"];
  if (b.ops !== undefined) {
    if (!Array.isArray(b.ops) || b.ops.length < 1 || b.ops.length > 2 || !b.ops.every((o) => o === "verify" || o === "investigate")) {
      return err(400, "invalid_input", "Ops must be a subset of verify and investigate.");
    }
    ops = [...new Set(b.ops as ApprovalOp[])];
  }

  const secret = getApprovalSecret();
  if (!secret) return err(503, "not_configured", "Approval minting is not configured on this server.");
  const ip = clientIp(req);
  for (let i = 0; i < anchors.length; i++) {
    const rl = await checkRateLimitStrict(`tasteverify:${ip}`, 20, 60_000);
    if (!rl.ok) return err(503, "rate_limit_unavailable", "Verification is temporarily unavailable. Try again shortly.");
    if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
    const r = await resolveAnchor(anchors[i]);
    if (r.status === "failed") {
      return err(409, "stale_selection", `“${anchors[i]}” no longer resolves. Resolve again before approval.`);
    }
    const pool = r.status === "ambiguous" ? r.candidates : [r.entity];
    if (!pool.some((c) => c.entity_id === ids[i])) {
      return err(409, "stale_selection", `The selection for “${anchors[i]}” is not among its current candidates.`);
    }
  }
  const { token, expiresAt } = createTasteApproval({ anchors, entityIds: ids, city, proposed, ops }, secret);
  return ok({ approval: token, expiresAt, anchors, entityIds: ids, city, proposed, ops, ttlMs: 600_000, replay: "bearer for identical inputs until expiry; not one-time" });
}
