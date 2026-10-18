export type HotelSearchInput = {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  maxNightlyBudget?: number;
  currency?: string;
};

export type HotelCandidate = {
  name: string;
  destination: string;
  address?: string;
  source: "serpapi_google_hotels";
  sourceUrl: string;
  observedAt: string;
  dates?: { checkIn: string; checkOut: string };
  observedNightlyRate?: { amount: number; currency: string };
  amenities?: string[];
  uncertaintyNotes?: string[];
};

export type HotelSearchStatus =
  | "ok"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "no_results"
  | "missing_dates"
  | "invalid_input";

export type HotelSearchResult = {
  status: HotelSearchStatus;
  candidates: HotelCandidate[];
  observedAt: string;
  note?: string;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function isValidISO(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Deterministic date resolver. Returns ISO dates only when the user stated them. Never invents. Later corrections override earlier dates. */
export function resolveHotelDates(texts: string[], now = new Date()): { checkIn: string; checkOut: string } | null {
  const joined = texts.join("\n").slice(0, 4000);
  const isos = [...joined.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]).filter(isValidISO);
  if (isos.length >= 2) {
    const [a, b] = isos.slice(-2);
    if (a < b && a >= todayISO(now)) return { checkIn: a, checkOut: b };
    return null;
  }
  const monthDay = [
    ...joined.matchAll(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi
    ),
  ];
  if (monthDay.length >= 2) {
    const year = now.getUTCFullYear();
    const mk = (name: string, day: number, y: number): string | null => {
      const m = MONTHS[name.toLowerCase()];
      if (!m || day < 1 || day > 31) return null;
      const dt = new Date(Date.UTC(y, m - 1, day));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return null;
      return toISO(y, m, day);
    };
    const pair = monthDay.slice(-2);
    let a = mk(pair[0][1], parseInt(pair[0][2], 10), year);
    let b = mk(pair[1][1], parseInt(pair[1][2], 10), year);
    if (!a || !b) return null;
    if (a < todayISO(now)) {
      a = mk(pair[0][1], parseInt(pair[0][2], 10), year + 1) as string;
      b = mk(pair[1][1], parseInt(pair[1][2], 10), year + 1) as string;
    }
    if (a >= b) {
      const bYear = parseInt(b.slice(0, 4), 10) + 1;
      b = `${bYear}${b.slice(4)}`;
      if (a >= b) return null;
    }
    if (a < todayISO(now)) return null;
    return { checkIn: a, checkOut: b };
  }
  return null;
}

export function parseNightlyBudget(budget: string | null): number | undefined {
  if (!budget) return undefined;
  const m = budget.match(/\$?\s?([\d,]+)/);
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return undefined;
  return n;
}

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 500);
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Preferred documented shape first: extracted_lowest numeric, then lowest "$156" string. Legacy price shapes stay supported. Never throws. */
function extractNightlyAmount(rec: Record<string, unknown>): number {
  const rpn = rec.rate_per_night as
    | { extracted_lowest?: unknown; lowest?: unknown; price?: unknown }
    | number
    | string
    | null
    | undefined;
  if (rpn !== null && typeof rpn === "object") {
    if (typeof rpn.extracted_lowest === "number" && Number.isFinite(rpn.extracted_lowest)) return rpn.extracted_lowest;
    if (typeof rpn.extracted_lowest === "string") {
      const n = parseFloat(rpn.extracted_lowest.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n)) return n;
    }
    if (typeof rpn.lowest === "string") {
      const n = parseFloat(rpn.lowest.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n)) return n;
    }
    if (typeof rpn.price === "number" && Number.isFinite(rpn.price)) return rpn.price;
    if (typeof rpn.price === "string") {
      const n = parseFloat(rpn.price.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }
  if (typeof rpn === "number") return rpn;
  if (typeof rpn === "string") return parseFloat(rpn.replace(/[^0-9.]/g, ""));
  return NaN;
}

function sanitizeText(raw: unknown, max = 120): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/\s+/g, " ").slice(0, max);
  return v.length >= 2 ? v : null;
}

function sanitizeCurrency(raw: unknown): string {
  if (typeof raw !== "string") return "USD";
  const v = raw.trim().toUpperCase().slice(0, 3);
  return /^[A-Z]{3}$/.test(v) ? v : "USD";
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(fetchFn: FetchFn, url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchFn(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * SerpApi Google Hotels adapter. Server-side only. Never logs the key.
 * Returns honest statuses; never fabricates inventory.
 */
export async function searchHotels(
  input: HotelSearchInput,
  opts?: { fetchFn?: FetchFn; apiKey?: string }
): Promise<HotelSearchResult> {
  const observedAt = new Date().toISOString();
  const destination = input.destination.trim().slice(0, 80);
  if (!destination) {
    return { status: "invalid_input", candidates: [], observedAt, note: "Destination is required." };
  }
  const key = (opts?.apiKey ?? process.env.SERPAPI_API_KEY ?? "").trim();
  if (!key) {
    return { status: "provider_unavailable", candidates: [], observedAt };
  }
  if (!input.checkIn || !input.checkOut) {
    return { status: "missing_dates", candidates: [], observedAt };
  }
  if (!isValidISO(input.checkIn) || !isValidISO(input.checkOut)) {
    return { status: "invalid_input", candidates: [], observedAt, note: "Dates must be YYYY-MM-DD." };
  }
  if (input.checkOut <= input.checkIn || input.checkIn < todayISO()) {
    return { status: "invalid_input", candidates: [], observedAt, note: "Dates must be future with checkout after checkin." };
  }
  const adults = input.adults ?? 2;
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) {
    return { status: "invalid_input", candidates: [], observedAt, note: "Adults must be 1-8." };
  }
  const currency = sanitizeCurrency(input.currency ?? "USD");

  const params = new URLSearchParams({
    engine: "google_hotels",
    q: destination,
    check_in_date: input.checkIn,
    check_out_date: input.checkOut,
    adults: String(adults),
    currency,
    api_key: key,
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const fetchFn: FetchFn = opts?.fetchFn ?? fetch;

  let res: Response;
  try {
    res = await fetchWithTimeout(fetchFn, url, 8000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return { status: "provider_unavailable", candidates: [], observedAt, note: "Search timed out." };
    }
    return { status: "provider_unavailable", candidates: [], observedAt };
  }
  if (res.status === 429) {
    return { status: "provider_rate_limited", candidates: [], observedAt };
  }
  if (!res.ok) {
    return { status: "provider_unavailable", candidates: [], observedAt };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "provider_unavailable", candidates: [], observedAt };
  }
  // SerpApi signals failures inside JSON even on HTTP 200. Never treat
  // an error payload as inventory.
  const errPayload = (data as { error?: unknown }).error;
  const errText =
    typeof errPayload === "string"
      ? errPayload
      : errPayload !== null && typeof errPayload === "object"
        ? String((errPayload as { message?: unknown }).message ?? "")
        : "";
  if (errText.trim()) {
    if (/rate|limit|429|too many/i.test(errText)) {
      return { status: "provider_rate_limited", candidates: [], observedAt };
    }
    return { status: "provider_unavailable", candidates: [], observedAt, note: errText.slice(0, 140) };
  }
  const props = (data as { properties?: unknown }).properties;
  if (!Array.isArray(props) || props.length === 0) {
    return { status: "no_results", candidates: [], observedAt };
  }
  const candidates: HotelCandidate[] = [];
  for (const p of props.slice(0, 10)) {
    if (candidates.length >= 3) break;
    const rec = p as Record<string, unknown>;
    const name = sanitizeText(rec.name, 80);
    if (!name) continue;
    // Optional provider links only. A missing link skips that property;
    // a URL is never invented and only https is accepted.
    const link = sanitizeUrl(rec.link ?? rec.website);
    if (!link) continue;
    const address = sanitizeText(rec.address ?? rec.location, 140) ?? undefined;
    const amount = extractNightlyAmount(rec);
    let observedNightlyRate: HotelCandidate["observedNightlyRate"];
    if (Number.isFinite(amount) && amount > 0 && amount < 100000) {
      const c = sanitizeCurrency(
        (rec.rate_currency as string | undefined) ??
          (typeof rec.currency === "string" ? rec.currency : currency)
      );
      if (input.maxNightlyBudget !== undefined && amount > input.maxNightlyBudget) continue;
      observedNightlyRate = { amount: Math.round(amount * 100) / 100, currency: c };
    } else if (input.maxNightlyBudget !== undefined) {
      continue;
    }
    const amenitiesRaw = rec.amenities;
    const amenities = Array.isArray(amenitiesRaw)
      ? amenitiesRaw
          .map((a) => sanitizeText(a, 60))
          .filter((a): a is string => Boolean(a))
          .slice(0, 6)
      : undefined;
    candidates.push({
      name,
      destination,
      address,
      source: "serpapi_google_hotels",
      sourceUrl: link,
      observedAt,
      dates: { checkIn: input.checkIn, checkOut: input.checkOut },
      observedNightlyRate,
      amenities,
      uncertaintyNotes: observedNightlyRate
        ? ["Observed rate at search time, indicative only. Confirm with the property before booking."]
        : ["No nightly rate returned for these dates. Check the property link for current prices."],
    });
  }
  if (candidates.length === 0) {
    return { status: "no_results", candidates: [], observedAt };
  }
  return { status: "ok", candidates, observedAt };
}
