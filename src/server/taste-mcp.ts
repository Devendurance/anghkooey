// Shared MCP business logic (Option C / C2). No MCP SDK imports here —
// pure orchestration reusing C1's engine, adapter and approval bridge.
// Every provider call is fail-closed rate-limited and counted in the trace.

import { placeInsights, resolveAnchor, searchCandidates } from "./qloo";
import { buildVerifyReport, type VerifyReport } from "./taste-verify";
import { getApprovalSecret, verifyTasteApproval } from "./taste-approval";
import { checkRateLimitStrict } from "./rate-limit";

export type McpTraceStep = { call: string; status: string };

async function takeAllowance(ip: string): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const rl = await checkRateLimitStrict(`tasteverify:${ip}`, 20, 60_000);
  if (!rl.ok) return { ok: false, status: 503, code: "rate_limit_unavailable", message: "Verification is temporarily unavailable. Try again shortly." };
  if (!rl.allowed) return { ok: false, status: 429, code: "rate_limited", message: "Too many requests. Slow down and retry." };
  return { ok: true };
}

export type McpVerifyInput = {
  approval: string;
  anchors: string[];
  entityIds: string[];
  city: string;
  proposed: string[];
};

export type McpVerifyResult =
  | { ok: true; report: VerifyReport; trace: McpTraceStep[]; providerCalls: number }
  | { ok: false; status: number; code: string; message: string };

/** MCP verify_shortlist: approval-gated C1 verification with ONE combined Insights. */
export async function mcpVerifyShortlist(input: McpVerifyInput, ip: string): Promise<McpVerifyResult> {
  const secret = getApprovalSecret();
  if (!secret) return { ok: false, status: 503, code: "not_configured", message: "Verification is not configured on this server." };
  const chk = verifyTasteApproval(
    input.approval,
    { anchors: input.anchors, entityIds: input.entityIds, city: input.city, proposed: input.proposed, op: "verify" },
    secret
  );
  if (!chk.ok) return { ok: false, status: chk.code === "expired_approval" ? 401 : 403, code: chk.code, message: chk.message };

  const trace: McpTraceStep[] = [];
  const resolved: { name: string; entity_id: string; kind: string }[] = [];
  for (let i = 0; i < input.anchors.length; i++) {
    const over = await takeAllowance(ip);
    if (!over.ok) return { ok: false, status: over.status, code: over.code, message: over.message };
    const r = await resolveAnchor(input.anchors[i]);
    trace.push({ call: `search anchor ${i + 1}`, status: r.status });
    if (r.status === "failed") {
      return { ok: false, status: 409, code: "stale_selection", message: `“${input.anchors[i]}” no longer resolves. Confirm again in the browser.` };
    }
    const pool = r.status === "ambiguous" ? r.candidates : [r.entity];
    const hit = pool.find((c) => c.entity_id === input.entityIds[i]);
    if (!hit) {
      return { ok: false, status: 409, code: "stale_selection", message: `The selection for “${input.anchors[i]}” is not among its current candidates.` };
    }
    resolved.push({ name: hit.name, entity_id: hit.entity_id, kind: hit.kind });
  }
  const over = await takeAllowance(ip);
  if (!over.ok) return { ok: false, status: over.status, code: over.code, message: over.message };
  const ins = await placeInsights(resolved.map((r) => r.entity_id), { city: input.city, take: 5 });
  trace.push({ call: "insights combined", status: ins.ok ? `ok ${ins.candidates.length}` : `failed ${ins.failure.status}` });
  if (!ins.ok) return { ok: false, status: ins.failure.http, code: `qloo_${ins.failure.status}`, message: ins.failure.message };
  const report = buildVerifyReport({
    anchors: input.anchors,
    entityIds: resolved.map((r) => r.entity_id),
    city: input.city,
    proposed: input.proposed,
    candidates: ins.candidates,
    take: 5,
  });
  return { ok: true, report, trace, providerCalls: input.anchors.length + 1 };
}

export type McpInvestigateInput = McpVerifyInput & { target: string };

export type McpInvestigateResult =
  | {
      ok: true;
      eligible: boolean;
      target: string;
      targetVerdict: string | null;
      additional: Array<{ name: string; entity_id: string; kind: string }>;
      note: string;
      trace: McpTraceStep[];
      providerCalls: number;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * MCP investigate_gap: one bounded evidence-conditioned Search follow-up.
 * Revalidates anchors, recomputes verification with ONE Insights to check
 * eligibility, then runs at most ONE Search for the REVIEW/NOT_OBSERVED
 * target. Original verdicts are preserved and returned unchanged; the extra
 * identity evidence is reported separately. Max follow-up: 1 Search.
 */
export async function mcpInvestigateGap(input: McpInvestigateInput, ip: string): Promise<McpInvestigateResult> {
  const secret = getApprovalSecret();
  if (!secret) return { ok: false, status: 503, code: "not_configured", message: "Verification is not configured on this server." };
  const chk = verifyTasteApproval(
    input.approval,
    { anchors: input.anchors, entityIds: input.entityIds, city: input.city, proposed: input.proposed, op: "investigate" },
    secret
  );
  if (!chk.ok) return { ok: false, status: chk.code === "expired_approval" ? 401 : 403, code: chk.code, message: chk.message };
  const target = input.target.trim();
  if (!input.proposed.some((p) => p === target)) {
    return { ok: false, status: 400, code: "invalid_input", message: "Target must be one of the approved proposed venues, unchanged." };
  }

  const trace: McpTraceStep[] = [];
  const resolved: { name: string; entity_id: string; kind: string }[] = [];
  for (let i = 0; i < input.anchors.length; i++) {
    const over = await takeAllowance(ip);
    if (!over.ok) return { ok: false, status: over.status, code: over.code, message: over.message };
    const r = await resolveAnchor(input.anchors[i]);
    trace.push({ call: `search anchor ${i + 1}`, status: r.status });
    if (r.status === "failed") {
      return { ok: false, status: 409, code: "stale_selection", message: `“${input.anchors[i]}” no longer resolves.` };
    }
    const pool = r.status === "ambiguous" ? r.candidates : [r.entity];
    const hit = pool.find((c) => c.entity_id === input.entityIds[i]);
    if (!hit) return { ok: false, status: 409, code: "stale_selection", message: `The selection for “${input.anchors[i]}” is stale.` };
    resolved.push({ name: hit.name, entity_id: hit.entity_id, kind: hit.kind });
  }
  const over = await takeAllowance(ip);
  if (!over.ok) return { ok: false, status: over.status, code: over.code, message: over.message };
  const ins = await placeInsights(resolved.map((r) => r.entity_id), { city: input.city, take: 5 });
  trace.push({ call: "insights combined", status: ins.ok ? `ok ${ins.candidates.length}` : `failed ${ins.failure.status}` });
  if (!ins.ok) return { ok: false, status: ins.failure.http, code: `qloo_${ins.failure.status}`, message: ins.failure.message };
  const report = buildVerifyReport({
    anchors: input.anchors,
    entityIds: resolved.map((r) => r.entity_id),
    city: input.city,
    proposed: input.proposed,
    candidates: ins.candidates,
    take: 5,
  });
  const item = report.items.find((v) => v.proposed === target) ?? null;
  if (!item) return { ok: false, status: 400, code: "invalid_input", message: "Target was not part of the verified shortlist." };
  if (item.verdict === "OBSERVED") {
    return {
      ok: true,
      eligible: false,
      target,
      targetVerdict: item.verdict,
      additional: [],
      note: "Target is already OBSERVED in this verification. No follow-up search ran; original verdicts unchanged.",
      trace,
      providerCalls: input.anchors.length + 1,
    };
  }
  const over2 = await takeAllowance(ip);
  if (!over2.ok) return { ok: false, status: over2.status, code: over2.code, message: over2.message };
  const s = await searchCandidates(target);
  trace.push({ call: `search gap "${target}"`, status: s.ok ? `ok ${s.candidates.length}` : `failed ${s.failure.status}` });
  if (!s.ok) {
    return {
      ok: true,
      eligible: true,
      target,
      targetVerdict: item.verdict,
      additional: [],
      note: `Follow-up Search found no identity candidates (${s.failure.status}). Original ${item.verdict} verdict unchanged; absence here is not proof of nonexistence.`,
      trace,
      providerCalls: input.anchors.length + 2,
    };
  }
  return {
    ok: true,
    eligible: true,
    target,
    targetVerdict: item.verdict,
    additional: s.candidates.slice(0, 3).map((c) => ({ name: c.name, entity_id: c.entity_id, kind: c.kind })),
    note: "Additional identity evidence only. Original shortlist verdicts unchanged; confirm the intended entity before any use.",
    trace,
    providerCalls: input.anchors.length + 2,
  };
}
