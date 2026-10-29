// Pure TasteProof memory-evidence helpers (no I/O, no secrets).
// The user always confirms the exact anchor string sent to Qloo; nothing here
// invents entities, reasons, scores, or consent records.

export type MemoryPick = {
  fact: string;
  domain: string | null;
  blobId: string;
};

export type QlooResult = {
  anchor: string;
  city: string | null;
  resolved: { name: string; entity_id: string; kind: string };
  candidates: Array<{
    name: string;
    entity_id: string;
    kind: string;
    place: string | null;
    explanation: string | null;
  }>;
};

export type TasteEvidence = {
  personal:
    | { fromMemory: true; fact: string; domain: string | null; blobId: string }
    | { fromMemory: false; note: string };
  qloo: { entityName: string; entityId: string; candidateIds: string[] };
  notVerified: string[];
};

export const NOT_VERIFIED = [
  "Live availability",
  "Noise levels",
  "Current prices",
  "Reservations and opening hours",
] as const;

/** Session-local before/after comparison based only on real Qloo IDs and order. No invented reasons. */
export type TasteComparison = {
  unchanged: boolean;
  added: string[];
  removed: string[];
  kept: string[];
  reordered: boolean;
  beforeOrder: string[];
  afterOrder: string[];
};

/** Compare two Insights candidate ID lists. True when same IDs in the same order. */
export function compareTasteCandidates(beforeIds: string[], afterIds: string[]): TasteComparison {
  const beforeOrder = [...beforeIds];
  const afterOrder = [...afterIds];
  const beforeSet = new Set(beforeOrder);
  const afterSet = new Set(afterOrder);
  const added = afterOrder.filter((id) => !beforeSet.has(id));
  const removed = beforeOrder.filter((id) => !afterSet.has(id));
  const kept = beforeOrder.filter((id) => afterSet.has(id));
  const keptAfterOrder = afterOrder.filter((id) => beforeSet.has(id));
  const reordered =
    kept.length > 1 && kept.some((id, i) => keptAfterOrder[i] !== id);
  const unchanged =
    beforeOrder.length === afterOrder.length &&
    beforeOrder.every((id, i) => afterOrder[i] === id);
  return { unchanged, added, removed, kept, reordered, beforeOrder, afterOrder };
}

/** True when the text contains a capitalized name-like token (min 3 letters). */
export function anchorLooksNamed(anchor: string): boolean {
  return /[A-Z][A-Za-z]{2,}/.test(anchor.trim());
}

/** Guidance shown when the anchor looks like a description rather than a name. Never blocks; Qloo answers honestly. */
export function guidanceFor(anchor: string): string | null {
  const t = anchor.trim();
  if (t.length < 2) return "Type a cultural anchor first.";
  if (!anchorLooksNamed(t)) {
    return "That looks like a description, not a name. Qloo may not match it; a specific place, artist or film works best.";
  }
  return null;
}

const STOP = new Set([
  "The", "And", "For", "With", "From", "That", "This", "When", "Because", "What",
]);

/** Clickable anchor suggestions mined from a memory's own words. The user must still confirm the exact string sent. */
export function suggestAnchors(fact: string): string[] {
  const out: string[] = [];
  const runs = fact.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
  for (const run of runs) {
    const clean = run.trim();
    if (clean.length < 3 || STOP.has(clean.split(" ")[0]) || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= 5) break;
  }
  return out;
}

/** Compose the inspectable evidence panel. Passes through only genuinely present fields. */
export function buildTasteEvidence(pick: MemoryPick | null, qloo: QlooResult): TasteEvidence {
  return {
    personal: pick
      ? { fromMemory: true, fact: pick.fact, domain: pick.domain, blobId: pick.blobId }
      : { fromMemory: false, note: "Manually supplied anchor · not from saved memory." },
    qloo: {
      entityName: qloo.resolved.name,
      entityId: qloo.resolved.entity_id,
      candidateIds: qloo.candidates.map((c) => c.entity_id),
    },
    notVerified: [...NOT_VERIFIED],
  };
}
