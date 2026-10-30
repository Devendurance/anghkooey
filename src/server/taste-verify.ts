// Server-side TasteProof Verify engine (Option C / C1).
// Pure deterministic comparison only — no I/O, no secrets, no DB writes.
// Compares caller-supplied proposed venue names against real Qloo Insights
// candidates from ONE combined request. Never invents scores or details.

import type { QlooCandidate } from "./qloo";

export type VerifyVerdict = "OBSERVED" | "REVIEW" | "NOT_OBSERVED";

export type VerifyItem = {
  proposed: string;
  verdict: VerifyVerdict;
  matchedEntityId: string | null;
  matchedName: string | null;
  reason: string;
  /** Zero-based rank in the returned Qloo list, null when unmatched. */
  rank: number | null;
  evidence: {
    tags: string[] | null;
    affinity: number | null;
    matchedAnchorIds: string[] | null;
    address: string | null;
    description: string | null;
  } | null;
};

export type VerifyCoverage = {
  total: number;
  observed: number;
  review: number;
  notObserved: number;
};

export type VerifyReport = {
  query: {
    anchors: string[];
    entityIds: string[];
    city: string;
    proposed: string[];
  };
  candidates: QlooCandidate[];
  items: VerifyItem[];
  coverage: VerifyCoverage;
  limitations: string[];
  execution: {
    insightsRequests: number;
    returned: number;
    take: number;
  };
};

export const VERIFY_LIMITATIONS = [
  "NOT OBSERVED means absent from this bounded Qloo result set — not proof the venue is nonexistent, closed, unsuitable or bad.",
  "Evidence coverage is separate from recommendation quality.",
  "Qloo does not verify opening hours, availability, prices, bookings, customer preference, revenue or individual behavior.",
  "Only exact normalized name matches become OBSERVED. Near matches become REVIEW.",
] as const;

/** Conservative normalization: lowercase, strip diacritics, punctuation to spaces. */
export function normalizeVenueName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length > 2);
}

/**
 * Deterministic shortlist verification.
 * - Exact normalized match against exactly one candidate → OBSERVED.
 * - Exact match against several candidates → REVIEW (ambiguous identity).
 * - Token-subset match (every proposed token inside one candidate) → REVIEW.
 * - Otherwise → NOT_OBSERVED.
 * Never invents venue details; evidence is passed through only.
 */
export function verifyShortlist(proposed: string[], candidates: QlooCandidate[]): VerifyItem[] {
  const normCandidates = candidates.map((c, idx) => ({
    c,
    idx,
    norm: normalizeVenueName(c.name),
    tokens: new Set(significantTokens(normalizeVenueName(c.name))),
  }));
  return proposed.map((raw) => {
    const p = raw.trim();
    const normP = normalizeVenueName(p);
    const pTokens = significantTokens(normP);
    const exact = normCandidates.filter((n) => n.norm === normP);
    if (exact.length === 1) {
      const hit = exact[0];
      return {
        proposed: p,
        verdict: "OBSERVED" as const,
        matchedEntityId: hit.c.entity_id,
        matchedName: hit.c.name,
        reason: `Exact name match to Qloo result #${hit.idx + 1} (${hit.c.entity_id}).`,
        rank: hit.idx,
        evidence: {
          tags: hit.c.evidence.tags,
          affinity: hit.c.evidence.affinity,
          matchedAnchorIds: hit.c.evidence.matchedAnchorIds,
          address: hit.c.evidence.address,
          description: hit.c.evidence.description,
        },
      };
    }
    if (exact.length > 1) {
      return {
        proposed: p,
        verdict: "REVIEW" as const,
        matchedEntityId: null,
        matchedName: null,
        reason: `Multiple Qloo results share this exact name (${exact.length}). Identity is ambiguous — confirm the intended entity.`,
        rank: null,
        evidence: null,
      };
    }
    if (pTokens.length === 0) {
      return {
        proposed: p,
        verdict: "REVIEW" as const,
        matchedEntityId: null,
        matchedName: null,
        reason: "Name is too short to match unambiguously. Confirm the intended venue.",
        rank: null,
        evidence: null,
      };
    }
    const strong = normCandidates.filter((n) => pTokens.every((t) => n.tokens.has(t)));
    if (strong.length === 1) {
      const hit = strong[0];
      return {
        proposed: p,
        verdict: "REVIEW" as const,
        matchedEntityId: hit.c.entity_id,
        matchedName: hit.c.name,
        reason: `Near-name match to Qloo result #${hit.idx + 1} (“${hit.c.name}”). Wording differs, so treat as REVIEW, not proof of identity.`,
        rank: hit.idx,
        evidence: {
          tags: hit.c.evidence.tags,
          affinity: hit.c.evidence.affinity,
          matchedAnchorIds: hit.c.evidence.matchedAnchorIds,
          address: hit.c.evidence.address,
          description: hit.c.evidence.description,
        },
      };
    }
    if (strong.length > 1) {
      return {
        proposed: p,
        verdict: "REVIEW" as const,
        matchedEntityId: null,
        matchedName: null,
        reason: `Name tokens match ${strong.length} Qloo results. Identity is ambiguous — confirm the intended venue.`,
        rank: null,
        evidence: null,
      };
    }
    return {
      proposed: p,
      verdict: "NOT_OBSERVED" as const,
      matchedEntityId: null,
      matchedName: null,
      reason: `Absent from the ${candidates.length} Qloo results returned by this query. Not proof the venue is nonexistent, closed or bad.`,
      rank: null,
      evidence: null,
    };
  });
}

export function buildVerifyReport(args: {
  anchors: string[];
  entityIds: string[];
  city: string;
  proposed: string[];
  candidates: QlooCandidate[];
  take: number;
}): VerifyReport {
  const items = verifyShortlist(args.proposed, args.candidates);
  const coverage: VerifyCoverage = {
    total: items.length,
    observed: items.filter((i) => i.verdict === "OBSERVED").length,
    review: items.filter((i) => i.verdict === "REVIEW").length,
    notObserved: items.filter((i) => i.verdict === "NOT_OBSERVED").length,
  };
  return {
    query: {
      anchors: [...args.anchors],
      entityIds: [...args.entityIds],
      city: args.city,
      proposed: [...args.proposed],
    },
    candidates: args.candidates,
    items,
    coverage,
    limitations: [...VERIFY_LIMITATIONS],
    execution: {
      insightsRequests: 1,
      returned: args.candidates.length,
      take: args.take,
    },
  };
}
