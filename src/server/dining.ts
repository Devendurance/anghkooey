import { placeInsights, resolveAnchor, type QlooCandidate } from "./qloo";
import { buildDiningMessages } from "./prompts";
import type { MemoryHit, RecallStatus } from "./prompts";
import { checkRateLimitStrict } from "./rate-limit";

// Bounded agentic dining integration: explicit request -> approval ->
// live Qloo -> grounded answer. Only anchor/city strings ever reach Qloo;
// raw Walrus memories, reasons, and identifiers never leave this server.

export type DiningParams = { anchor: string | null; city: string | null };

export type DiningTurn =
  | { kind: "none" }
  | { kind: "propose"; anchor: string; city: string }
  | { kind: "clarify"; missing: "anchor" | "city" | "both" }
  | { kind: "choose"; anchor: string; city: string; choices: DiningChoice[] }
  | { kind: "approved"; anchor: string; city: string; confirmedEntityId?: string };

export type DiningChoice = { name: string; entity_id: string; kind: string };

export type DiningEvidence = {
  anchor: string;
  city: string;
  entityId: string;
  candidateIds: string[];
};

export type DiningLookup =
  | {
      ok: true;
      resolved: { name: string; entity_id: string; kind: string };
      candidates: QlooCandidate[];
    }
  | { ok: false; code: "rate_limited" | "rate_limit_unavailable" | "no_match" | "unavailable"; message: string }
  | { ok: false; code: "ambiguous"; message: string; choices: DiningChoice[] };

const DINING_RE =
  /\b(dining|dinner|lunch|restaurant|restaurants|food|cuisine|eat|eatery|places?\s+to\s+eat)\b/i;
const REQUEST_RE =
  /\b(find|recommend|recommendation|suggest|suggestion|looking for|want|show me|give me|any|best|where)\b/i;
const LIKE_RE = /\b(like|similar\s+to)\b/i;

const QUOTED_ANCHOR_RES = [/\blike\s+"([^"]{2,60})"/i, /\bsimilar\s+to\s+"([^"]{2,60})"/i];
// Corrections of a pending proposal: "make it Terra", "change to Nobu".
const REFINEMENT_ANCHOR_RES = [
  /\bmake\s+it\s+([A-Z][A-Za-z'&.,-]*(?:\s+[A-Z][A-Za-z'&.,-]*){0,2})/,
  /\bchange\s+(?:it\s+)?to\s+([A-Z][A-Za-z'&.,-]*(?:\s+[A-Z][A-Za-z'&.,-]*){0,2})/i,
];
const NAMED_ANCHOR_RES = [
  /\blike\s+([A-Z][A-Za-z'&.,-]*(?:\s+[A-Z][A-Za-z'&.,-]*){0,2})/,
  /\bsimilar\s+to\s+([A-Z][A-Za-z'&.,-]*(?:\s+[A-Z][A-Za-z'&.,-]*){0,2})/,
];
const CITY_RE = /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;

const BANNED_FIRST = new Set([
  "Next",
  "This",
  "Last",
  "Help",
  "Tell",
  "Find",
  "Show",
  "Give",
  "Recommend",
  "Suggest",
  "What",
  "Where",
]);

function cleanToken(s: string): string | null {
  const v = s.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[A-Z][A-Za-z'&.,-]*(?:\s+[A-Z][A-Za-z'&.,-]*){0,2}$/.test(v)) return null;
  if (BANNED_FIRST.has(v.split(" ")[0])) return null;
  return v;
}

function anchorIn(text: string): string | null {
  for (const re of QUOTED_ANCHOR_RES) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/\s+/g, " ").slice(0, 60);
  }
  for (const re of REFINEMENT_ANCHOR_RES) {
    const m = text.match(re);
    if (m?.[1]) {
      const cleaned = cleanToken(m[1]);
      if (cleaned) return cleaned;
    }
  }
  for (const re of NAMED_ANCHOR_RES) {
    const m = text.match(re);
    if (m?.[1]) {
      const cleaned = cleanToken(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function cityIn(text: string): string | null {
  // Last mention wins within one message; callers scan last message first.
  let found: string | null = null;
  for (const m of text.matchAll(CITY_RE)) {
    if (m?.[1]) {
      const cleaned = cleanToken(m[1]);
      if (cleaned) found = cleaned;
    }
  }
  return found;
}

/** Best-effort dining facts from recent user texts. Later messages override earlier ones. */
export function extractDiningParams(texts: string[]): DiningParams {
  let anchor: string | null = null;
  let city: string | null = null;
  for (let i = texts.length - 1; i >= 0; i--) {
    if (!anchor) anchor = anchorIn(texts[i]);
    if (!city) city = cityIn(texts[i]);
    if (anchor && city) break;
  }
  return { anchor, city };
}

/** True for an explicit dining-discovery ask. Bare names or trip talk do not qualify. */
export function detectDiningIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!DINING_RE.test(t)) return false;
  return REQUEST_RE.test(t) || LIKE_RE.test(t);
}

/** Reject: questions, conditions, contradictions, negatives, deferrals. Checked first. */
const AFFIRMATIVE_REJECT_RE =
  /[?]|\b(but|however|although|though|except|maybe|later|unless|not|never|no|after|when|while|until|what|where|why|how|who|which)\b|n't|only if/i;

/** Accept: after rejection, the whole message must be a clear approval and nothing else. */
const AFFIRMATIVE_FULL_RES = [
  /^(yes|yeah|yep|yup|sure|ok|okay|approved)(\s+(please|thanks|thank you))?$/,
  /^(go ahead|proceed|sounds good|look it up)(\s+please)?$/,
  /^(please\s+)?(do|run)\s+(it|the lookup)$/,
  /^please do$/,
  /^(yes|yeah|yep|yup|sure|ok|okay),?\s+(go ahead|do it|look it up|please|please do)$/,
  /^let's do it$/,
  /^lets do it$/,
];

export function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!\s]+$/, "");
  if (!t || AFFIRMATIVE_REJECT_RE.test(t)) return false;
  return AFFIRMATIVE_FULL_RES.some((re) => re.test(t));
}

const DENIAL_RE =
  /^\s*(no|nope|nah|cancel|stop|never mind|don't|dont|not now|not really)\b/i;

/** A question that is not about dining (wh-word / question mark). */
const UNRELATED_Q_RE =
  /\?|^\s*(what|where|when|why|how|who|which|is|are|was|were|can|could|do|does|did|will|would|tell me about)\b/i;

export function isDenial(text: string): boolean {
  return DENIAL_RE.test(text.trim());
}

// Stable machine-readable proposal marker. The template below must keep
// this exact shape: Qloo dining lookup — anchor “X” in “Y”.
const PROPOSAL_RE = /Qloo dining lookup \u2014 anchor \u201c(.+?)\u201d in \u201c(.+?)\u201d\./;

export function latestDiningProposal(
  history: { role: "user" | "assistant"; text: string }[]
): DiningParams & { anchor: string; city: string } | null {
  // Only the latest assistant message counts: an older proposal superseded
  // by any later assistant message is no longer actionable.
  const assistants = history.filter((h) => h.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (!last) return null;
  const m = last.text.match(PROPOSAL_RE);
  if (!m?.[1] || !m?.[2]) return null;
  return { anchor: m[1], city: m[2] };
}

/** Pure turn planner: no I/O, no network.
 * Approval requires ALL of: a pending proposal in the latest assistant
 * message, explicit affirmative intent in the current message, and no new
 * anchor/city contradicting the proposal. Anything else proposes, clarifies,
 * or leaves the dining path — Qloo is never reached without approval. */
export function planDiningTurn(
  text: string,
  history: { role: "user" | "assistant"; text: string }[]
): DiningTurn {
  const userTexts = [...history.filter((h) => h.role === "user").map((h) => h.text), text];
  const params = extractDiningParams(userTexts);
  const current = extractDiningParams([text]);
  const proposal = latestDiningProposal(history);
  const intent = detectDiningIntent(text);
  const yes = isAffirmative(text);

  // A pending choice list outranks proposals: only an exact name/number
  // selects an entity. Anything else refines, re-lists, or leaves the path.
  const pending = pendingDiningChoices(history);
  if (pending) {
    const sel = selectDiningChoice(text, pending);
    if (sel) {
      return { kind: "approved", anchor: sel.anchor, city: sel.city, confirmedEntityId: sel.entityId };
    }
    // Unrelated questions never re-trigger, even if they name the city.
    if (!intent && UNRELATED_Q_RE.test(text)) {
      return { kind: "none" as const };
    }
    const pendingCurrent = extractDiningParams([text]);
    // A bare yes re-lists the choices; it never approves on its own.
    if (yes && pendingCurrent.anchor === null && pendingCurrent.city === null) {
      return { kind: "choose", anchor: pending.anchor, city: pending.city, choices: pending.choices };
    }
    // New anchor/city text starts a fresh proposal needing fresh approval.
    if (pendingCurrent.anchor !== null || pendingCurrent.city !== null) {
      return {
        kind: "propose" as const,
        anchor: pendingCurrent.anchor ?? pending.anchor,
        city: pendingCurrent.city ?? pending.city,
      };
    }
    return { kind: "none" as const };
  }

  // A pending entity confirmation outranks proposals but not choices:
  // only an explicit yes (or restating the entity) with no contradictions
  // authorizes Insights for THIS entity. Denial, unrelated questions, and
  // changed anchors/cities invalidate the pending confirmation; a fresh
  // dining request falls through to a new proposal below.
  const pendingConfirm = pendingDiningConfirm(history);
  if (pendingConfirm) {
    const confirmCurrent = extractDiningParams([text]);
    const saidEntity =
      text.trim().toLowerCase() === pendingConfirm.entity.name.toLowerCase();
    const restated =
      confirmCurrent.anchor !== null &&
      confirmCurrent.anchor.toLowerCase() === pendingConfirm.entity.name.toLowerCase();
    const contradicts =
      (confirmCurrent.anchor !== null &&
        confirmCurrent.anchor.toLowerCase() !== pendingConfirm.anchor.toLowerCase() &&
        confirmCurrent.anchor.toLowerCase() !== pendingConfirm.entity.name.toLowerCase()) ||
      (confirmCurrent.city !== null && confirmCurrent.city !== pendingConfirm.city);
    if ((yes || saidEntity || restated) && !contradicts && !isDenial(text)) {
      return {
        kind: "approved",
        anchor: pendingConfirm.anchor,
        city: pendingConfirm.city,
        confirmedEntityId: pendingConfirm.entity.entity_id,
      };
    }
    if (isDenial(text) || (!intent && UNRELATED_Q_RE.test(text))) {
      return { kind: "none" as const };
    }
    // A different anchor/city starts over with a fresh proposal.
    if (confirmCurrent.anchor !== null || confirmCurrent.city !== null) {
      return {
        kind: "propose" as const,
        anchor: confirmCurrent.anchor ?? pendingConfirm.anchor,
        city: confirmCurrent.city ?? pendingConfirm.city,
      };
    }
    return { kind: "none" as const };
  }

  if (proposal) {
    const contradicts =
      (current.anchor !== null && current.anchor !== proposal.anchor) ||
      (current.city !== null && current.city !== proposal.city);
    // Pending proposal + explicit yes + nothing contradicted: approved.
    if (yes && !contradicts) {
      return { kind: "approved", anchor: proposal.anchor, city: proposal.city };
    }
    // An unrelated question never re-triggers, even if it names the city.
    if (!intent && UNRELATED_Q_RE.test(text)) {
      return { kind: "none" as const };
    }
    // A corrected anchor/city always starts a NEW proposal needing fresh approval.
    if (current.anchor !== null || current.city !== null) {
      return {
        kind: "propose" as const,
        anchor: current.anchor ?? proposal.anchor,
        city: current.city ?? proposal.city,
      };
    }
    // Explicit denial or an unrelated question: leave the dining path.
    if (isDenial(text) || !intent) {
      return { kind: "none" as const };
    }
    // Intent without fresh approval: re-propose when complete, else clarify.
    if (params.anchor && params.city) {
      return { kind: "propose" as const, anchor: params.anchor, city: params.city };
    }
    return {
      kind: "clarify" as const,
      missing: (!params.anchor && !params.city ? "both" : !params.anchor ? "anchor" : "city") as
        | "both"
        | "anchor"
        | "city",
    };
  }

  if (params.anchor && params.city && intent) {
    return { kind: "propose", anchor: params.anchor, city: params.city };
  }
  if (intent) {
    return {
      kind: "clarify",
      missing: !params.anchor && !params.city ? "both" : !params.anchor ? "anchor" : "city",
    };
  }
  return { kind: "none" };
}

export function buildDiningProposal(anchor: string, city: string): string {
  return [
    `I can ask Qloo\u2019s cultural-intelligence for dining ideas anchored on \u201c${anchor}\u201d in \u201c${city}\u201d.`,
    ``,
    `Qloo dining lookup \u2014 anchor \u201c${anchor}\u201d in \u201c${city}\u201d.`,
    ``,
    `Reply yes and I\u2019ll run a live Qloo Search + Insights lookup, then ground my recommendation in the actual venues it returns. Only the anchor and city leave this chat \u2014 your saved memories stay private. Nothing is booked, and availability is never verified.`,
  ].join("\n");
}

export function buildDiningClarify(missing: "anchor" | "city" | "both", params: DiningParams): string {
  if (missing === "city" && params.anchor) {
    return `Got the anchor \u201c${params.anchor}\u201d. Which city should I search in? I need a destination before I can ask Qloo.`;
  }
  if (missing === "anchor" && params.city) {
    return `Got the destination \u201c${params.city}\u201d. Which named place (a restaurant, chef, or spot you like) should anchor the Qloo lookup? A specific name works best \u2014 I won\u2019t guess one for you.`;
  }
  return `I\u2019d love to find you something \u2014 which named place should I anchor on (for example a restaurant you like), and which city should I search in? I need both before I can ask Qloo, and I\u2019ll confirm with you first.`;
}

const CHOICES_MARKER = "Qloo candidates for";

/** Ask the user to pick one Qloo entity. IDs ride along in [select:...] tags
 * so the reply maps back to the exact entity without a second search. */
export function buildDiningChoices(anchor: string, city: string, choices: DiningChoice[]): string {
  return [
    `Qloo found several matches for \u201c${anchor}\u201d — reply with the exact name (or number). Only the entity you pick runs Insights.`,
    `${CHOICES_MARKER} \u201c${anchor}\u201d in \u201c${city}\u201d:`,
    ...choices.map((c, i) => `${i + 1}. ${c.name} (${c.kind}) [select:${c.entity_id}]`),
  ].join("\n");
}

const CHOICE_LINE_RE = /^(\d+)\.\s+(.+?)\s+\(([^)]+)\)\s+\[select:([0-9A-Za-z-]+)\]\s*$/;

/** The latest assistant choices block, if the latest assistant message is one. */
export function pendingDiningChoices(
  history: { role: "user" | "assistant"; text: string }[]
): { anchor: string; city: string; choices: DiningChoice[] } | null {
  const assistants = history.filter((h) => h.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (!last || !last.text.includes(CHOICES_MARKER)) return null;
  const lines = last.text.split("\n");
  const marker = lines.findIndex((l) => l.includes(CHOICES_MARKER));
  const choices: DiningChoice[] = [];
  for (const line of lines.slice(marker + 1)) {
    const m = line.trim().match(CHOICE_LINE_RE);
    if (m?.[2] && m?.[4]) choices.push({ name: m[2], entity_id: m[4], kind: m[3] ?? "entity" });
  }
  if (choices.length === 0) return null;
  const hm = last.text.match(/Qloo candidates for \u201c(.+?)\u201d in \u201c(.+?)\u201d/);
  return { anchor: hm?.[1] ?? "", city: hm?.[2] ?? "", choices };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, first: 1, second: 2, third: 3, fourth: 4,
};

/** Match the current message to one pending choice by exact name
 * (case-insensitive, optional leading yes/ok), or number/word. Anything
 * else is not a selection. */
export function selectDiningChoice(
  text: string,
  pending: { anchor: string; city: string; choices: DiningChoice[] }
): { anchor: string; city: string; entityId: string } | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  const t = raw.replace(/^(yes|yeah|yep|yup|sure|ok|okay|please)\b[,.\s]+/, "");
  if (!t) return null;
  const digit = t.match(/^(\d+)\.?$/);
  if (digit) {
    const c = pending.choices[parseInt(digit[1], 10) - 1];
    return c ? { anchor: c.name, city: pending.city, entityId: c.entity_id } : null;
  }
  const word = NUMBER_WORDS[t.replace(/[^a-z]/g, "")];
  if (word) {
    const c = pending.choices[word - 1];
    return c ? { anchor: c.name, city: pending.city, entityId: c.entity_id } : null;
  }
  const c = pending.choices.find((c) => c.name.toLowerCase() === t);
  return c ? { anchor: c.name, city: pending.city, entityId: c.entity_id } : null;
}

/** Strict-gated entity confirmation message. The exact resolved name, type
 * and ID are shown; Insights runs only after the user confirms THIS entity. */
export function buildDiningConfirm(
  anchor: string,
  city: string,
  entity: { name: string; entity_id: string; kind: string }
): string {
  return [
    `Qloo resolved \u201c${anchor}\u201d to ${entity.name} (${entity.kind}) [confirm:${entity.entity_id}].`,
    `Qloo dining confirmation for \u201c${anchor}\u201d in \u201c${city}\u201d.`,
    `Reply yes to fetch dining candidates for this exact entity, or name a different anchor to start over. No Insights lookup has run yet.`,
  ].join("\n");
}

const CONFIRM_MARKER = "Qloo dining confirmation for";
const CONFIRM_LINE_RE = /^Qloo resolved \u201c(.+?)\u201d to (.+?) \(([^)]+)\) \[confirm:([0-9A-Za-z-]+)\]\.\s*$/;

/** The pending entity confirmation, if the latest assistant message is one. */
export function pendingDiningConfirm(
  history: { role: "user" | "assistant"; text: string }[]
): { anchor: string; city: string; entity: { name: string; entity_id: string; kind: string } } | null {
  const assistants = history.filter((h) => h.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (!last || !last.text.includes(CONFIRM_MARKER)) return null;
  const firstLine = last.text.split("\n").map((l) => l.trim()).find((l) => l.startsWith("Qloo resolved")) ?? "";
  const m = firstLine.match(CONFIRM_LINE_RE);
  if (!m?.[2] || !m?.[4]) return null;
  const hm = last.text.match(/Qloo dining confirmation for \u201c(.+?)\u201d in \u201c(.+?)\u201d/);
  return {
    anchor: hm?.[1] ?? "",
    city: hm?.[2] ?? "",
    entity: { name: m[2], entity_id: m[4], kind: m[3] || "entity" },
  };
}
/** Strict-gated Search step. Resolves the anchor but never runs Insights:
 * callers must confirm the returned entity first. */
export async function resolveDiningEntity(opts: {
  userId: string;
  anchor: string;
  city: string;
}): Promise<
  | { ok: true; entity: { name: string; entity_id: string; kind: string } }
  | { ok: false; code: "ambiguous"; choices: DiningChoice[] }
  | { ok: false; code: "rate_limited" | "rate_limit_unavailable" | "no_match" | "unavailable"; message: string }
> {
  const rl = await checkRateLimitStrict(`qloo:dining:${opts.userId}`, 10, 60_000);
  if (!rl.ok) {
    return {
      ok: false,
      code: "rate_limit_unavailable",
      message: "I couldn\u2019t verify my dining-lookup allowance right now, so I didn\u2019t query Qloo. Please try again shortly.",
    };
  }
  if (!rl.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many dining lookups in the last minute \u2014 slow down and try again shortly.",
    };
  }
  const s = await resolveAnchor(opts.anchor);
  if (s.status === "failed") {
    const f = s.failure;
    return {
      ok: false,
      code: f.status === "no_match" ? "no_match" : "unavailable",
      message:
        f.status === "no_match"
          ? `Qloo has no match for \u201c${opts.anchor}\u201d. Try a specific named place, artist, or film.`
          : f.message,
    };
  }
  if (s.status === "ambiguous") {
    return {
      ok: false,
      code: "ambiguous",
      choices: s.candidates.map((c) => ({ name: c.name, entity_id: c.entity_id, kind: c.kind })),
    };
  }
  return { ok: true, entity: s.entity };
}

/** Strict-gated Insights step. Runs ONLY for a server-established entity ID
 * (fresh resolution or user-confirmed choice from one) — never a bare or
 * caller-invented ID. Each call re-verifies the rate-limit allowance. */
export async function fetchDiningCandidates(opts: {
  userId: string;
  anchor: string;
  city: string;
  entityId: string;
}): Promise<DiningLookup> {
  if (!/^[0-9A-Za-z-]{8,64}$/.test(opts.entityId.trim()) || !/[0-9]/.test(opts.entityId)) {
    return {
      ok: false,
      code: "unavailable",
      message: "That confirmed selection looks invalid. Resolve again and pick from the fresh candidates.",
    };
  }
  const rl = await checkRateLimitStrict(`qloo:dining:${opts.userId}`, 10, 60_000);
  if (!rl.ok) {
    return {
      ok: false,
      code: "rate_limit_unavailable",
      message: "I couldn\u2019t verify my dining-lookup allowance right now, so I didn\u2019t query Qloo. Please try again shortly.",
    };
  }
  if (!rl.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many dining lookups in the last minute \u2014 slow down and try again shortly.",
    };
  }
  const ins = await placeInsights(opts.entityId.trim(), { city: opts.city, take: 3 });
  if (!ins.ok) {
    return { ok: false, code: "unavailable", message: ins.failure.message };
  }
  return {
    ok: true,
    resolved: { name: opts.anchor, entity_id: opts.entityId.trim(), kind: "entity" },
    candidates: ins.candidates,
  };
}

/** Execute an approved turn: live lookup, then a composer grounded in Qloo
 * evidence. Pure inputs (history passed explicitly); only the lookup and
 * composer touch the outside world. Evidence is set whenever Qloo ran. */
export async function executeDiningTurn(
  turn: Extract<DiningTurn, { kind: "approved" }>,
  ctx: {
    userId: string;
    userText: string;
    memories: MemoryHit[];
    history: { role: "user" | "assistant"; text: string }[];
    recallStatus: RecallStatus;
    compose: (
      messages: { role: "system" | "user" | "assistant"; content: string }[]
    ) => Promise<string>;
  }
): Promise<{ message: string; evidence: DiningEvidence | null }> {
  // Confirmed entity: fetch candidates straight away (allowance re-verified).
  if (turn.confirmedEntityId) {
    const lookup = await fetchDiningCandidates({
      userId: ctx.userId,
      anchor: turn.anchor,
      city: turn.city,
      entityId: turn.confirmedEntityId,
    });
    if (!lookup.ok) return { message: lookup.message, evidence: null };
    return composeGrounded(turn, ctx, lookup.resolved, lookup.candidates);
  }
  // Approval alone only resolves: the exact entity must still be confirmed
  // before Insights is allowed to run.
  const resolved = await resolveDiningEntity({ userId: ctx.userId, anchor: turn.anchor, city: turn.city });
  if (!resolved.ok) {
    if (resolved.code === "ambiguous") {
      return { message: buildDiningChoices(turn.anchor, turn.city, resolved.choices), evidence: null };
    }
    return { message: resolved.message, evidence: null };
  }
  return {
    message: buildDiningConfirm(turn.anchor, turn.city, resolved.entity),
    evidence: null,
  };
}

async function composeGrounded(
  turn: Extract<DiningTurn, { kind: "approved" }>,
  ctx: {
    userId: string;
    userText: string;
    memories: MemoryHit[];
    history: { role: "user" | "assistant"; text: string }[];
    recallStatus: RecallStatus;
    compose: (
      messages: { role: "system" | "user" | "assistant"; content: string }[]
    ) => Promise<string>;
  },
  resolved: { name: string; entity_id: string; kind: string },
  candidates: QlooCandidate[]
): Promise<{ message: string; evidence: DiningEvidence | null }> {
  const evidence: DiningEvidence = {
    anchor: turn.anchor,
    city: turn.city,
    entityId: resolved.entity_id,
    candidateIds: candidates.map((c) => c.entity_id),
  };
  try {
    const message = await ctx.compose(
      buildDiningMessages({
        userText: ctx.userText,
        memories: ctx.memories,
        history: ctx.history,
        recallStatus: ctx.recallStatus,
        anchor: turn.anchor,
        city: turn.city,
        resolved,
        candidates,
      })
    );
    return { message, evidence };
  } catch {
    const names = candidates.map((c) => c.name).join(", ") || "no venues";
    return {
      message: `Qloo returned venues for \u201c${turn.anchor}\u201d in \u201c${turn.city}\u201d (${names}), but my recommendation composer is unavailable. Try again shortly \u2014 I won\u2019t guess beyond these names.`,
      evidence,
    };
  }
}
