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
  | "invalid_input";

export type QlooFailure = { status: QlooFailureStatus; http: number; message: string };

export type QlooEntity = { name: string; entity_id: string; kind: string };

export type QlooCandidate = {
  name: string;
  entity_id: string;
  kind: string;
  place: string | null;
  explanation: string | null;
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
      failure: { status: "not_configured", http: 503, message: "Qloo dining lookup is not configured on this server." },
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
      failure: { status: "unavailable", http: 503, message: "Qloo is unreachable right now. Try again shortly." },
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      failure: { status: "unauthorized", http: 502, message: "Qloo rejected this server's credentials." },
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      failure: { status: "rate_limited", http: 503, message: "Qloo is rate-limiting taste lookups. Slow down and retry." },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: `Qloo returned an unexpected response (${res.status}).` },
    };
  }
  try {
    return { ok: true, json: (await res.json()) as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: "Qloo returned an unreadable response." },
    };
  }
}

/** Resolve a caller-supplied named anchor (place, artist, film) to a real Qloo entity. */
export async function searchAnchor(
  query: string
): Promise<{ ok: true; entity: QlooEntity; total: number } | { ok: false; failure: QlooFailure }> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) {
    return {
      ok: false,
      failure: { status: "invalid_input", http: 400, message: "Give a named place, artist or film (2 to 80 characters)." },
    };
  }
  const r = await qlooGet(`/search?query=${encodeURIComponent(q)}`);
  if (!r.ok) return r;
  const results = Array.isArray(r.json.results) ? r.json.results : [];
  const first = results[0] as { name?: unknown; entity_id?: unknown; subtype?: unknown; type?: unknown } | undefined;
  if (!first || typeof first.entity_id !== "string" || typeof first.name !== "string") {
    return {
      ok: false,
      failure: { status: "no_match", http: 404, message: `Qloo has no match for "${q}". Try a specific named place.` },
    };
  }
  return {
    ok: true,
    entity: {
      name: first.name,
      entity_id: first.entity_id,
      kind: String(first.subtype || first.type || "entity"),
    },
    total: results.length,
  };
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

/** Real place candidates for a resolved Qloo entity. City narrows location only when supplied. */
export async function placeInsights(
  entityId: string,
  opts?: { city?: string; take?: number }
): Promise<{ ok: true; candidates: QlooCandidate[] } | { ok: false; failure: QlooFailure }> {
  const take = Math.min(Math.max(opts?.take ?? 3, 1), 5);
  const city = opts?.city?.trim() || "";
  if (city.length > 80) {
    return {
      ok: false,
      failure: { status: "invalid_input", http: 400, message: "City names stay under 80 characters." },
    };
  }
  let path =
    `/v2/insights?filter.type=urn:entity:place` +
    `&signal.interests.entities=${encodeURIComponent(entityId)}` +
    `&take=${take}`;
  if (city) path += `&filter.location.query=${encodeURIComponent(city)}`;
  const r = await qlooGet(path);
  if (!r.ok) return r;
  const results = r.json.results as { entities?: unknown } | undefined;
  const list = results && Array.isArray(results.entities) ? results.entities : null;
  if (!list) {
    return {
      ok: false,
      failure: { status: "unavailable", http: 503, message: "Qloo returned an unexpected insights shape." },
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
    });
  }
  return { ok: true, candidates };
}
