// Server-only Qloo Taste AI adapter (hackathon endpoint).
// Never import this module from client components. It handles the API key
// and only ever transmits caller-supplied anchor/city strings, never
// memories, sessions, or private identifiers.

export type QlooFailureStatus =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "no_match"
  | "ambiguous"
  | "invalid_input";

export type QlooFailure = { status: QlooFailureStatus; http: number; message: string; upstream: number | null };

export type QlooEntity = { name: string; entity_id: string; kind: string };

/** One validated Search hit. Only entries with a real ID and name survive. */
export type QlooSearchCandidate = { name: string; entity_id: string; kind: string };

/** Outcome of trustworthy anchor resolution. Insights must only ever run
 * on an entity from a "resolved" outcome or a user-confirmed "ambiguous"
 * choice — never on an unexamined first result. */
export type ResolveResult =
  | { status: "resolved"; entity: QlooEntity; total: number }
  | { status: "ambiguous"; candidates: QlooSearchCandidate[]; total: number }
  | { status: "failed"; failure: QlooFailure };

export type QlooCandidate = {
  name: string;
  entity_id: string;
  kind: string;
  place: string | null;
  explanation: string | null;
  /** Venue photo as listed by Qloo (properties.image.url). Null unless the
   * URL is https, served from Qloo's image host, and names this venue's own
   * entity — so a photo can never attach to the wrong venue. No license is
   * conveyed upstream; UI must credit Qloo as the photo source. */
  imageUrl: string | null;
  /** Real Qloo signal, all optional and null when Qloo omits them. Never invented. */
  evidence: {
    /** Qloo venue tags (names only, deduplicated, capped). */
    tags: string[] | null;
    /** Qloo's own ranking number for this candidate. Ranking signal only, never a match probability. */
    affinity: number | null;
    /** Interest-signal entity this candidate traces to (proves the anchor link). */
    matchedAnchorId: string | null;
    /** All interest-signal entities Qloo attributes to this candidate (multi-anchor). Null when Qloo omits them. */
    matchedAnchorIds: string[] | null;
    /** Venue address string as Qloo lists it. */
    address: string | null;
    /** Qloo's own short/overall description, capped. */
    description: string | null;
  };
};

const BASE_DEFAULT = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 12_000;

function config(): { base: string; key: string } | null {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.QLOO_BASE_URL?.trim() || BASE_DEFAULT).replace(/\/+$/, "");
  return { base, key };
}

async function qlooGet(
  path: string
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; failure: QlooFailure }> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      failure: { status: "not_configured", http: 503, message: "Qloo dining lookup is not configured on this server.", upstream: null },
    };
  }
  let res: Response;
  try {
    res = await fetch(cfg.base + path, {
      headers: { "X-Api-Key": cfg.key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: "Qloo is unreachable right now. Try again shortly.", upstream: null },
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      failure: { status: "unauthorized", http: 502, message: "Qloo rejected this server's credentials.", upstream: res.status },
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      failure: { status: "rate_limited", http: 503, message: "Qloo is rate-limiting taste lookups. Slow down and retry.", upstream: res.status },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: `Qloo returned an unexpected response (${res.status}).`, upstream: res.status },
    };
  }
  try {
    return { ok: true, json: (await res.json()) as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: "Qloo returned an unreadable response.", upstream: res.status },
    };
  }
}

/** Resolve a caller-supplied named anchor (place, artist, film) to valid Qloo Search candidates. Structural validation only: entries without a real ID or name are dropped, duplicates merged. No type is invented or excluded. */
export async function searchCandidates(
  query: string
): Promise<{ ok: true; candidates: QlooSearchCandidate[]; total: number } | { ok: false; failure: QlooFailure }> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) {
    return {
      ok: false,
      failure: { status: "invalid_input", http: 400, message: "Give a named place, artist or film (2 to 80 characters).", upstream: null },
    };
  }
  const r = await qlooGet(`/search?query=${encodeURIComponent(q)}`);
  if (!r.ok) return r;
  const results = Array.isArray(r.json.results) ? r.json.results : [];
  const seen = new Set<string>();
  const candidates: QlooSearchCandidate[] = [];
  for (const raw of results) {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== "object") continue;
    if (typeof e.entity_id !== "string" || !e.entity_id || typeof e.name !== "string") continue;
    const name = e.name.trim();
    if (!name || name.length > 120 || seen.has(e.entity_id)) continue;
    seen.add(e.entity_id);
    candidates.push({ name, entity_id: e.entity_id, kind: String(e.subtype || e.type || "entity") });
  }
  return { ok: true, candidates, total: results.length };
}

const ANCHOR_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "in", "on", "at", "of", "for", "with",
  "not", "no", "de", "la", "le", "et", "und", "y",
]);

function anchorTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !ANCHOR_STOPWORDS.has(t));
}

/** Conservative lexical match: true only when every significant query token
 * appears in the candidate name. Shorter official names do NOT auto-match:
 * if several venues share the tokens, the user must pick. No scores. */
export function isStrongAnchorMatch(query: string, name: string): boolean {
  const q = new Set(anchorTokens(query));
  if (q.size === 0) return false;
  const cSet = new Set(anchorTokens(name));
  if (cSet.size === 0) return false;
  return [...q].every((t) => cSet.has(t));
}

function noMatchFailure(q: string): QlooFailure {
  return {
    status: "no_match",
    http: 404,
    message: `Qloo has no match for "${q.trim()}". Try a specific named place.`,
    upstream: 200,
  };
}

/** Trustworthy resolution: exactly one lexically strong candidate resolves;
 * several strong candidates mean ambiguity (the caller must ask the user);
 * anything else is an honest no-match. Never returns an unexamined hit. */
export async function resolveAnchor(query: string): Promise<ResolveResult> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) {
    return {
      status: "failed",
      failure: { status: "invalid_input", http: 400, message: "Give a named place, artist or film (2 to 80 characters).", upstream: null },
    };
  }
  const c = await searchCandidates(query);
  if (!c.ok) return { status: "failed", failure: c.failure };
  if (c.candidates.length === 0) return { status: "failed", failure: noMatchFailure(q) };
  const strong = c.candidates.filter((e) => isStrongAnchorMatch(q, e.name));
  if (strong.length === 1) {
    const e = strong[0];
    return { status: "resolved", entity: { name: e.name, entity_id: e.entity_id, kind: e.kind }, total: c.total };
  }
  if (strong.length > 1) {
    return { status: "ambiguous", candidates: strong.slice(0, 4), total: c.total };
  }
  return { status: "failed", failure: noMatchFailure(q) };
}

/** Legacy single-entity lookup kept for existing callers. Safe by construction:
 * only an unambiguous strong match resolves; ambiguity surfaces as an
 * explicit failure the caller must handle with candidate choices. */
export async function searchAnchor(
  query: string
): Promise<{ ok: true; entity: QlooEntity; total: number } | { ok: false; failure: QlooFailure }> {
  const r = await resolveAnchor(query);
  if (r.status === "resolved") return { ok: true, entity: r.entity, total: r.total };
  if (r.status === "ambiguous") {
    return {
      ok: false,
      failure: {
        status: "ambiguous",
        http: 409,
        message: `Qloo matches several places for "${query.trim()}": ${r.candidates.map((c) => c.name).join(", ")}. Pick one to continue.`,
        upstream: null,
      },
    };
  }
  return { ok: false, failure: r.failure };
}

function explanationOf(e: Record<string, unknown>): string | null {
  const nested = e.query as Record<string, unknown> | undefined;
  const props = e.properties as Record<string, unknown> | undefined;
  const cands = [e.explanation, nested?.explanation, props?.explanation];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 280);
  }
  return null;
}

const QLOO_IMAGE_HOST = "images.qloo.com";

function imageUrlOf(e: Record<string, unknown>, entityId: string): string | null {
  const props = e.properties as Record<string, unknown> | undefined;
  const img = props?.image;
  const url = typeof img === "string" ? img : (img as Record<string, unknown> | null)?.url;
  if (typeof url !== "string" || !url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== QLOO_IMAGE_HOST) return null;
  // The venue's own entity ID is embedded in Qloo's image path: a photo
  // from another venue can never pass this check.
  if (!parsed.pathname.includes(entityId) || url.length > 300) return null;
  return parsed.toString();
}

function tagsOf(e: Record<string, unknown>): string[] | null {
  const raw = e.tags;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const t of raw) {
    const name = (t as Record<string, unknown> | null)?.name;
    if (typeof name !== "string") continue;
    const v = name.trim();
    // Skip Qloo's age-range buckets ("25 29") and dupes; keep real descriptors.
    if (!v || out.includes(v) || /^[\d\s]+$/.test(v)) continue;
    out.push(v.slice(0, 40));
    if (out.length >= 8) break;
  }
  return out.length > 0 ? out : null;
}

function affinityOf(e: Record<string, unknown>): number | null {
  const q = e.query as Record<string, unknown> | undefined;
  const a = q?.affinity;
  return typeof a === "number" && Number.isFinite(a) ? a : null;
}

function matchedAnchorIdsOf(e: Record<string, unknown>): string[] | null {
  const q = e.query as Record<string, unknown> | undefined;
  const x = q?.explainability as Record<string, unknown> | undefined;
  const sigs = x?.["signal.interests.entities"];
  if (!Array.isArray(sigs)) return null;
  const ids: string[] = [];
  for (const s of sigs) {
    const id = (s as Record<string, unknown> | null)?.entity_id;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
    if (ids.length >= 3) break;
  }
  return ids.length > 0 ? ids : null;
}

function matchedAnchorOf(e: Record<string, unknown>): string | null {
  const q = e.query as Record<string, unknown> | undefined;
  const x = q?.explainability as Record<string, unknown> | undefined;
  const sigs = x?.["signal.interests.entities"];
  const first = Array.isArray(sigs) ? sigs[0] as Record<string, unknown> | undefined : undefined;
  return typeof first?.entity_id === "string" ? first.entity_id : null;
}

function addressOf(e: Record<string, unknown>): string | null {
  const d = (e as Record<string, unknown>).disambiguation;
  return typeof d === "string" && d.trim() ? d.trim().slice(0, 160) : null;
}

function descriptionOf(e: Record<string, unknown>): string | null {
  const props = e.properties as Record<string, unknown> | undefined;
  for (const k of ["short_description", "overall_description", "cuisine_description"]) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 220);
  }
  return null;
}

function placeOf(e: Record<string, unknown>): string | null {
  const loc = e.location as Record<string, unknown> | undefined;
  if (loc && typeof loc === "object") {
    const bits = [loc.city, loc.region, loc.country].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
    if (bits.length > 0) return bits.join(", ");
  }
  return null;
}

/** Real place candidates for confirmed Qloo entities. Accepts one entity ID
 * (existing single-anchor callers unchanged) or 2–3 IDs for one combined
 * multi-anchor Insights request: Qloo supports comma-separated entity IDs in
 * `signal.interests.entities`, and a single request keeps ranking joint.
 * Every ID is format-gated here, but callers must still revalidate IDs against
 * a fresh Search resolution first — this gate is a backstop only. */
export async function placeInsights(
  entityId: string | string[],
  opts?: { city?: string; take?: number }
): Promise<{ ok: true; candidates: QlooCandidate[] } | { ok: false; failure: QlooFailure }> {
  // Insights accepts ONLY confirmed Qloo entity IDs: they must arrive here
  // from a live resolution (or user-confirmed choices from one), never from
  // unexamined search hits or caller invention. Format is a backstop only.
  const rawIds = (Array.isArray(entityId) ? entityId : [entityId]).map((s) => String(s).trim());
  const ids: string[] = [];
  for (const id of rawIds) {
    if (!id || ids.includes(id)) continue;
    if (!/^[0-9A-Za-z-]{8,64}$/.test(id) || !/[0-9]/.test(id)) {
      return {
        ok: false,
        failure: { status: "invalid_input", http: 400, message: "A confirmed Qloo entity is required for Insights.", upstream: null },
      };
    }
    ids.push(id);
  }
  if (ids.length < 1 || ids.length > 3) {
    return {
      ok: false,
      failure: { status: "invalid_input", http: 400, message: "Insights takes 1 to 3 confirmed Qloo entities.", upstream: null },
    };
  }
  const take = Math.min(Math.max(opts?.take ?? 3, 1), 5);
  const city = opts?.city?.trim() || "";
  if (city.length > 80) {
    return {
      ok: false,
      failure: { status: "invalid_input", http: 400, message: "City names stay under 80 characters.", upstream: null },
    };
  }
  let path =
    `/v2/insights?filter.type=urn:entity:place` +
    `&signal.interests.entities=${encodeURIComponent(ids.join(","))}` +
    `&feature.explainability=true` +
    `&take=${take}`;
  if (city) path += `&filter.location.query=${encodeURIComponent(city)}`;
  const r = await qlooGet(path);
  if (!r.ok) return r;
  const results = r.json.results as { entities?: unknown } | undefined;
  const list = results && Array.isArray(results.entities) ? results.entities : null;
  if (!list) {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: "Qloo returned an unexpected insights shape.", upstream: 200 },
    };
  }
  const candidates: QlooCandidate[] = [];
  for (const raw of list.slice(0, take)) {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e.name !== "string" || typeof e.entity_id !== "string") continue;
    candidates.push({
      name: e.name,
      entity_id: e.entity_id,
      kind: String(e.subtype || e.type || "place"),
      place: placeOf(e),
      explanation: explanationOf(e),
      imageUrl: imageUrlOf(e, e.entity_id),
      evidence: {
        tags: tagsOf(e),
        affinity: affinityOf(e),
        matchedAnchorId: matchedAnchorOf(e),
        matchedAnchorIds: matchedAnchorIdsOf(e),
        address: addressOf(e),
        description: descriptionOf(e),
      },
    });
  }
  return { ok: true, candidates };
}
