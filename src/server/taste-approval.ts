// Server-only TasteProof approval artifact (Option C / C2).
// Binds a browser-confirmed verification request to an HMAC token so an MCP
// client can prove explicit human approval without minting its own.
// Replay: bearer for identical inputs until expiry (10 min). NOT one-time —
// one-time enforcement would require DB/memory writes, which are prohibited.
// No secrets in logs; secret never leaves the server.

import { createHmac, timingSafeEqual } from "node:crypto";

export const APPROVAL_TTL_MS = 10 * 60 * 1000;
export const APPROVAL_VERSION = 1;
export type ApprovalOp = "verify" | "investigate";

export type ApprovalPayload = {
  v: number;
  anchors: string[];
  entityIds: string[];
  city: string;
  proposed: string[];
  ops: ApprovalOp[];
  iat: number;
  exp: number;
};

/** Server-only secret: dedicated override or Qloo key (never sent, never logged). */
export function getApprovalSecret(): string | null {
  const dedicated = (process.env.TASTEPROOF_APPROVAL_SECRET ?? "").trim();
  if (dedicated) return dedicated;
  const qloo = (process.env.QLOO_API_KEY ?? "").trim();
  return qloo ? qloo : null;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string | null {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function createTasteApproval(
  input: { anchors: string[]; entityIds: string[]; city: string; proposed: string[]; ops: ApprovalOp[] },
  secret: string,
  now = Date.now()
): { token: string; expiresAt: number } {
  const payload: ApprovalPayload = {
    v: APPROVAL_VERSION,
    anchors: [...input.anchors],
    entityIds: [...input.entityIds],
    city: input.city,
    proposed: [...input.proposed],
    ops: [...input.ops],
    iat: now,
    exp: now + APPROVAL_TTL_MS,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `${body}.${sig}`, expiresAt: payload.exp };
}

export type ApprovalCheck =
  | { ok: true; payload: ApprovalPayload }
  | { ok: false; code: "invalid_approval" | "expired_approval" | "approval_mismatch"; message: string };

/**
 * Verify signature, expiry, version, op authorization and exact input binding.
 * Expected inputs must equal the browser-confirmed values byte-for-byte
 * (order-sensitive). Any deviation rejects — the MCP client cannot widen,
 * reorder or substitute IDs, city or shortlist.
 */
export function verifyTasteApproval(
  token: string,
  expected: { anchors: string[]; entityIds: string[]; city: string; proposed: string[]; op: ApprovalOp },
  secret: string,
  now = Date.now()
): ApprovalCheck {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, code: "invalid_approval", message: "Approval artifact is malformed. Mint one from the browser confirmation workflow." };
  }
  const [body, sig] = parts;
  const want = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "invalid_approval", message: "Approval signature is invalid. Mint one from the browser confirmation workflow; clients cannot mint approval." };
  }
  const raw = b64urlDecode(body);
  if (!raw) return { ok: false, code: "invalid_approval", message: "Approval artifact is unreadable." };
  let p: ApprovalPayload;
  try {
    p = JSON.parse(raw) as ApprovalPayload;
  } catch {
    return { ok: false, code: "invalid_approval", message: "Approval artifact is unreadable." };
  }
  if (p.v !== APPROVAL_VERSION) {
    return { ok: false, code: "invalid_approval", message: "Approval version is unsupported. Mint a fresh approval." };
  }
  if (typeof p.exp !== "number" || now > p.exp) {
    return { ok: false, code: "expired_approval", message: "Approval has expired. Confirm again in the browser to mint a fresh one (10 minute validity)." };
  }
  if (!Array.isArray(p.ops) || !p.ops.includes(expected.op)) {
    return { ok: false, code: "invalid_approval", message: `Approval does not authorize ${expected.op}. Mint one with the required operation.` };
  }
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!eq(p.anchors, expected.anchors) || !eq(p.entityIds, expected.entityIds) || p.city !== expected.city || !eq(p.proposed, expected.proposed)) {
    return { ok: false, code: "approval_mismatch", message: "Approval does not match these exact anchors, IDs, city and shortlist. Use the browser-confirmed values unchanged." };
  }
  return { ok: true, payload: p };
}
