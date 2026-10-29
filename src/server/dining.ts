import { placeInsights, searchAnchor, type QlooCandidate } from "./qloo";
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
  | { kind: "approved"; anchor: string; city: string };

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
  | { ok: false; code: "rate_limited" | "rate_limit_unavailable" | "no_match" | "unavailable"; message: string };

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

const AFFIRMATIVE_RE =
  /^\s*(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|look it up|please do|approve|approved|yes please|lets do it|let's do it)\b/i;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE_RE.test(text.trim());
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

/** Strict-gated live lookup. Only anchor/city/entity IDs cross to Qloo. */
export async function runDiningLookup(opts: {
  userId: string;
  anchor: string;
  city: string;
}): Promise<DiningLookup> {
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
  const s = await searchAnchor(opts.anchor);
  if (!s.ok) {
    return {
      ok: false,
      code: s.failure.status === "no_match" ? "no_match" : "unavailable",
      message:
        s.failure.status === "no_match"
          ? `Qloo has no match for \u201c${opts.anchor}\u201d. Try a specific named place, artist, or film.`
          : s.failure.message,
    };
  }
  const ins = await placeInsights(s.entity.entity_id, { city: opts.city, take: 3 });
  if (!ins.ok) {
    return { ok: false, code: "unavailable", message: ins.failure.message };
  }
  return { ok: true, resolved: s.entity, candidates: ins.candidates };
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
  const lookup = await runDiningLookup({ userId: ctx.userId, anchor: turn.anchor, city: turn.city });
  if (!lookup.ok) return { message: lookup.message, evidence: null };
  const evidence: DiningEvidence = {
    anchor: turn.anchor,
    city: turn.city,
    entityId: lookup.resolved.entity_id,
    candidateIds: lookup.candidates.map((c) => c.entity_id),
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
        resolved: lookup.resolved,
        candidates: lookup.candidates,
      })
    );
    return { message, evidence };
  } catch {
    const names = lookup.candidates.map((c) => c.name).join(", ") || "no venues";
    return {
      message: `Qloo returned venues for \u201c${turn.anchor}\u201d in \u201c${turn.city}\u201d (${names}), but my recommendation composer is unavailable. Try again shortly \u2014 I won\u2019t guess beyond these names.`,
      evidence,
    };
  }
}
