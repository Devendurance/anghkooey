import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { getSql } from "./db";
import type { HotelCandidate } from "./hotels";

export const MAX_SHORTLIST_ITEMS = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 1024 * 1024;
const MAX_FETCHES_PER_HOTEL = 3;

/* ---------- shortlist store ---------- */

export type ShortlistItemView = {
  position: number;
  name: string;
  address: string | null;
  source: string;
  sourceUrl: string;
  rateAmount: number | null;
  rateCurrency: string | null;
  observedAt: string;
  contactEmail: string | null;
  contactSourceUrl: string | null;
  contactStatus: string;
  contactVerifiedAt: string | null;
  contactNote: string | null;
};

export type ShortlistView = {
  id: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  status: "active" | "stale";
  createdAt: string;
  items: ShortlistItemView[];
};

/** Persist genuinely returned candidates as the owner's active shortlist. Older actives go stale. */
export async function saveShortlist(args: {
  canonicalUserId: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  candidates: HotelCandidate[];
}): Promise<string> {
  const sql = getSql();
  await sql`
    update hotel_shortlists set status = 'stale', updated_at = now()
    where user_id = ${args.canonicalUserId} and status = 'active'`;
  const rows = await sql`
    insert into hotel_shortlists (user_id, destination, check_in, check_out)
    values (${args.canonicalUserId}, ${args.destination.slice(0, 80)}, ${args.checkIn}, ${args.checkOut})
    returning id`;
  const id = rows[0].id as string;
  const items = args.candidates.slice(0, MAX_SHORTLIST_ITEMS);
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    await sql`
      insert into hotel_shortlist_items
        (shortlist_id, position, name, address, source, source_url, rate_amount, rate_currency, observed_at)
      values (
        ${id}, ${i + 1}, ${c.name.slice(0, 160)}, ${c.address?.slice(0, 280) ?? null},
        ${c.source}, ${c.sourceUrl.slice(0, 500)},
        ${c.observedNightlyRate?.amount ?? null}, ${c.observedNightlyRate?.currency ?? null},
        ${c.observedAt}
      )`;
  }
  return id;
}

/** Latest active shortlist for one canonical identity, items in stable position order. */
export async function getActiveShortlist(canonicalUserId: string): Promise<ShortlistView | null> {
  const sql = getSql();
  const lists = await sql`
    select id, destination, check_in, check_out, status, created_at
    from hotel_shortlists
    where user_id = ${canonicalUserId} and status = 'active'
    order by created_at desc limit 1`;
  if (lists.length === 0) return null;
  const l = lists[0];
  const items = await sql`
    select position, name, address, source, source_url, rate_amount, rate_currency,
      observed_at, contact_email, contact_source_url, contact_status, contact_verified_at, contact_note
    from hotel_shortlist_items
    where shortlist_id = ${l.id as string}
    order by position asc`;
  return {
    id: l.id as string,
    destination: l.destination as string,
    checkIn: l.check_in as string,
    checkOut: l.check_out as string,
    status: l.status as "active" | "stale",
    createdAt: (l.created_at as Date).toISOString(),
    items: items.map((r) => ({
      position: r.position as number,
      name: r.name as string,
      address: (r.address as string | null) ?? null,
      source: r.source as string,
      sourceUrl: r.source_url as string,
      rateAmount: r.rate_amount === null ? null : Number(r.rate_amount),
      rateCurrency: (r.rate_currency as string | null) ?? null,
      observedAt: (r.observed_at as Date).toISOString(),
      contactEmail: (r.contact_email as string | null) ?? null,
      contactSourceUrl: (r.contact_source_url as string | null) ?? null,
      contactStatus: r.contact_status as string,
      contactVerifiedAt: r.contact_verified_at ? (r.contact_verified_at as Date).toISOString() : null,
      contactNote: (r.contact_note as string | null) ?? null,
    })),
  };
}

/** Usable only when active and the stay is still in the future. Stale or past stays need fresh candidates. */
export function isShortlistUsable(s: Pick<ShortlistView, "status" | "checkIn">, today: string): boolean {
  return s.status === "active" && s.checkIn >= today;
}

export type TripKey = { destination: string; checkIn: string; checkOut: string };

/** Same destination (case-insensitive) and exact dates. Anything else is a changed trip. */
export function isSameTrip(a: TripKey, b: TripKey): boolean {
  return (
    a.destination.trim().toLowerCase() === b.destination.trim().toLowerCase() &&
    a.checkIn === b.checkIn &&
    a.checkOut === b.checkOut
  );
}

/**
 * Marks the active shortlist stale when the canonical trip changed.
 * Call before a new search so a failed provider never leaves old-trip
 * candidates looking current. Same trip is left untouched.
 */
export async function invalidateStaleShortlist(canonicalUserId: string, trip: TripKey): Promise<void> {
  const sql = getSql();
  await sql`
    update hotel_shortlists set status = 'stale', updated_at = now()
    where user_id = ${canonicalUserId} and status = 'active'
      and (lower(destination) != lower(${trip.destination}) or check_in != ${trip.checkIn} or check_out != ${trip.checkOut})`;
}

export type DiscoveryResult = {
  status: "verified" | "contact_not_found" | "incomplete";
  email: string | null;
  sourceUrl: string | null;
  note: string;
};

/** Ownership-checked contact write. Returns false when the row is not the caller's. */
export async function saveContactResult(args: {
  canonicalUserId: string;
  shortlistId: string;
  position: number;
  result: DiscoveryResult;
}): Promise<boolean> {
  const sql = getSql();
  const owned = await sql`
    select id from hotel_shortlists
    where id = ${args.shortlistId} and user_id = ${args.canonicalUserId} limit 1`;
  if (owned.length === 0) return false;
  const email = args.result.status === "contact_not_found" ? null : args.result.email;
  await sql`
    update hotel_shortlist_items
    set contact_email = ${email},
      contact_source_url = ${args.result.sourceUrl},
      contact_status = ${args.result.status === "verified" ? "verified" : args.result.status === "incomplete" ? "unverified" : "contact_not_found"},
      contact_verified_at = ${args.result.status === "verified" ? sql`now()` : null},
      contact_note = ${args.result.note.slice(0, 300)}
    where shortlist_id = ${args.shortlistId} and position = ${args.position}`;
  return true;
}

/* ---------- iMessage commands ---------- */

export function isHotelsCommand(text: string): boolean {
  return /^\s*hotels\s*$/i.test(text);
}

/** CONTACT 1 | CONTACT 1,2 | CONTACT 1,2,3 — distinct positions 1-3, else null. */
export function parseContactCommand(text: string): number[] | null {
  const m = /^\s*contact\s+([0-9][0-9,\s]*)\s*$/i.exec(text);
  if (!m) return null;
  const nums = m[1]
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_SHORTLIST_ITEMS);
  const distinct = [...new Set(nums)];
  if (distinct.length === 0 || distinct.length > MAX_SHORTLIST_ITEMS) return null;
  if (distinct.length !== m[1].split(",").filter((p) => p.trim() !== "").length) return null;
  return distinct.sort((a, b) => a - b);
}

function shortDomain(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "source link";
  }
}

/** Concise numbered shortlist. Shows source domains, never invents fields. */
export function formatShortlistMessage(s: ShortlistView): string {
  const lines = [`Your hotel shortlist for ${s.destination}, ${s.checkIn} to ${s.checkOut} (${s.items.length}):`];
  for (const it of s.items) {
    const rate =
      it.rateAmount !== null
        ? it.rateCurrency
          ? `${it.rateAmount} ${it.rateCurrency} observed nightly`
          : `${it.rateAmount} observed nightly (currency unknown)`
        : "no rate returned";
    lines.push(`${it.position}. ${it.name} — ${rate} (${shortDomain(it.sourceUrl)})`);
  }
  lines.push("Reply CONTACT 1 (or 1,2) to verify hotel contact details. Rates are observed and indicative.");
  return lines.join("\n");
}

/** Concise contact results. Verified addresses only; everything else is an honest miss. */
export function formatContactResults(
  s: ShortlistView,
  results: { position: number; name: string; result: DiscoveryResult }[]
): string {
  const lines = [`Hotel contacts for ${s.destination}:`];
  for (const r of results) {
    if (r.result.status === "verified" && r.result.email) {
      lines.push(`${r.position}. ${r.name} — contact verified on the hotel site: ${r.result.email} (via ${shortDomain(r.result.sourceUrl ?? "")})`);
    } else {
      lines.push(`${r.position}. ${r.name} — no verified email (${r.result.note})`);
    }
  }
  lines.push("EMAIL drafts to the test inbox only. Hotel sends are not enabled yet.");
  return lines.join("\n");
}

/* ---------- SSRF-guarded page retrieval ---------- */

export class SafeFetchError extends Error {
  code: string;
  constructor(code: string) {
    super(`unsafe or failed fetch: ${code}`);
    this.code = code;
  }
}

export function isPublicIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const n = v4.slice(1).map(Number);
    if (n.some((x) => x > 255)) return false;
    const [a, b] = n;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a >= 224) return false;
    return true;
  }
  const bare = ip.toLowerCase().split("%")[0];
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIp(mapped[1]);
  if (bare === "::1" || bare === "::") return false;
  if (/^f[cd]/i.test(bare)) return false; // fc00::/7 unique-local
  if (/^fe[89ab]/i.test(bare.replace(/:/g, "").slice(0, 4))) return false; // fe80::/10 link-local
  if (/^ff/i.test(bare)) return false; // multicast
  if (/^2001:0?db8:/i.test(bare)) return false; // documentation
  const first = parseInt(bare.split(":")[0] || "0", 16);
  if (Number.isNaN(first)) return false;
  return first >= 0x2000 && first <= 0x3fff; // global unicast only
}

export function isBlockedHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".invalid")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !isPublicIp(h);
  if (h.includes(":")) return !isPublicIp(h);
  return false;
}

export type PinnedTransportResult = { status: number; headers: Record<string, string>; body: Uint8Array };

export type PinnedTransport = (args: {
  url: string;
  ip: string;
  timeoutMs: number;
  headers: Record<string, string>;
}) => Promise<PinnedTransportResult>;

export type SafeFetchOpts = {
  transport?: PinnedTransport;
  lookupFn?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
};

async function defaultLookup(host: string): Promise<string[]> {
  const all = await dnsLookup(host, { all: true });
  return all.map((r) => r.address);
}

/**
 * Default transport: the socket connects to the validated IP (DNS-rebinding
 * safe) while TLS verification and the Host header keep the real hostname.
 */
async function defaultPinnedTransport(args: {
  url: string;
  ip: string;
  timeoutMs: number;
  headers: Record<string, string>;
}): Promise<PinnedTransportResult> {
  const u = new URL(args.url);
  const family = args.ip.includes(":") ? 6 : 4;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      args.url,
      {
        method: "GET",
        headers: args.headers,
        lookup: (_host, _opts, cb) => cb(null, args.ip, family),
        timeout: args.timeoutMs,
        servername: u.hostname,
      },
      (res) => {
        const chunks: Uint8Array[] = [];
        let total = 0;
        let settled = false;
        const fail = (e: Error) => {
          if (settled) return;
          settled = true;
          res.destroy();
          reject(e);
        };
        res.on("data", (c: Uint8Array) => {
          total += c.byteLength;
          if (total > MAX_BYTES) {
            fail(new SafeFetchError("too_large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            merged.set(c, off);
            off += c.byteLength;
          }
          const headers: Record<string, string> = {};
          const loc = res.headers.location;
          if (typeof loc === "string") headers.location = loc;
          const ct: unknown = res.headers["content-type"];
          if (typeof ct === "string") headers["content-type"] = ct;
          else if (Array.isArray(ct)) headers["content-type"] = ct.join(", ");
          resolve({ status: res.statusCode ?? 0, headers, body: merged });
        });
        res.on("error", fail);
      }
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("fetch_failed")));
    req.on("error", reject);
    req.end();
  });
}

/** HTTPS-only page fetch with DNS, redirect, size, and type guards. Never executes scripts. */
export async function fetchHtmlSafe(startUrl: string, opts: SafeFetchOpts = {}): Promise<{ html: string; finalUrl: string }> {
  const transport = opts.transport ?? defaultPinnedTransport;
  const lookupFn = opts.lookupFn ?? defaultLookup;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  let url = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new SafeFetchError("bad_url");
    }
    if (u.protocol !== "https:") throw new SafeFetchError("not_https");
    if (isBlockedHostname(u.hostname)) throw new SafeFetchError("blocked_host");
    let addrs: string[];
    try {
      addrs = await lookupFn(u.hostname);
    } catch {
      throw new SafeFetchError("dns_failed");
    }
    if (addrs.length === 0 || !addrs.every(isPublicIp)) throw new SafeFetchError("private_ip");
    // Pin the connection to a validated address. The transport must dial
    // exactly this IP while keeping TLS verification and Host tied to the
    // real hostname, so a changed DNS answer mid-request cannot reroute it.
    const ip = addrs[0];
    let res: PinnedTransportResult;
    try {
      res = await transport({
        url,
        ip,
        timeoutMs: opts.timeoutMs ?? FETCH_TIMEOUT_MS,
        headers: { "user-agent": "AnghkooeyContactBot/1.0", accept: "text/html" },
      });
    } catch (e) {
      if (e instanceof SafeFetchError) throw e;
      throw new SafeFetchError("fetch_failed");
    }
    if (res.body.byteLength > maxBytes) throw new SafeFetchError("too_large");
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      if (!loc || hop === maxRedirects) throw new SafeFetchError(hop === maxRedirects ? "too_many_redirects" : "bad_redirect");
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new SafeFetchError("bad_status");
    const contentType = res.headers["content-type"] ?? "";
    if (!contentType.includes("text/html")) throw new SafeFetchError("not_html");
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(res.body), finalUrl: url };
  }
  throw new SafeFetchError("too_many_redirects");
}

/* ---------- contact discovery ---------- */

const AGGREGATOR_HOSTS = [
  "booking.com",
  "expedia.com",
  "hotels.com",
  "tripadvisor.com",
  "agoda.com",
  "kayak.com",
  "trivago.com",
  "priceline.com",
  "orbitz.com",
  "travelocity.com",
  "hotwire.com",
  "airbnb.com",
  "vrbo.com",
  "hostelworld.com",
];

/** Booking platforms, directories, and aggregators are never treated as the hotel's own site. */
export function isBookingPlatformUrl(raw: string): boolean {
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "google.com" || host.endsWith(".google.com")) return true;
  return AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const SKIP_LOCALS = new Set(["noreply", "donotreply", "unsubscribe", "list-unsubscribe"]);

export function isValidContactEmail(v: string): boolean {
  if (!v || v.length > 254) return false;
  const at = v.lastIndexOf("@");
  if (at <= 0 || at === v.length - 1) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1).toLowerCase();
  if (local.length > 64 || local.includes("..") || /[\s<>,;]/.test(v)) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false;
  if (domain.includes("..") || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false;
  if (domain === "example.com" || domain.endsWith(".example.com") || domain === "example.org" || domain === "example.net") {
    return false;
  }
  if (SKIP_LOCALS.has(local.toLowerCase())) return false;
  return true;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

/** Mailto links first, then plaintext. Entity-decoded, validated, de-duplicated, capped. */
export function extractEmails(html: string): string[] {
  const text = decodeEntities(html);
  const found: string[] = [];
  for (const m of text.matchAll(/mailto:([^"?\s<>]+)/gi)) {
    const addr = m[1].split("?")[0].trim();
    if (addr && !found.includes(addr)) found.push(addr);
  }
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!found.includes(m[0])) found.push(m[0]);
  }
  return found.filter(isValidContactEmail).slice(0, 5);
}

const GENERIC_HOTEL_WORDS = new Set([
  "hotel",
  "hotels",
  "resort",
  "the",
  "and",
  "inn",
  "lodge",
  "suites",
  "apartments",
  "palace",
  "house",
  "manor",
  "villa",
  "grand",
  "royal",
]);

function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).toLowerCase();
}

/** True when the page text references the hotel name (full or token match). */
export function pageMentionsHotel(html: string, hotelName: string): boolean {
  const text = pageText(html);
  const normName = hotelName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normName && text.includes(normName)) return true;
  const tokens = normName.split(" ").filter((w) => w.length >= 4 && !GENERIC_HOTEL_WORDS.has(w));
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits >= Math.min(2, tokens.length);
}

/** Same-host contact-ish link, or null. Never leaves the hotel's host. */
export function findContactLink(html: string, baseUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]*>/g, " ").trim();
    if (!/(contact|reservations?|book direct|about us)/i.test(label)) continue;
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    return u.toString();
  }
  return null;
}

/**
 * Bounded discovery for one hotel: source page, then at most one same-host
 * contact page. Verified only with a real address on a page that references
 * the hotel. Never guesses addresses from domains.
 */
export async function discoverHotelContact(
  hotel: { name: string; sourceUrl: string },
  opts: SafeFetchOpts & { maxFetches?: number } = {}
): Promise<DiscoveryResult> {
  const maxFetches = opts.maxFetches ?? MAX_FETCHES_PER_HOTEL;
  if (isBookingPlatformUrl(hotel.sourceUrl)) {
    return {
      status: "contact_not_found",
      email: null,
      sourceUrl: null,
      note: "Source is a booking platform or directory, not the hotel's own site.",
    };
  }
  let used = 0;
  let page: { html: string; finalUrl: string } | null = null;
  try {
    used += 1;
    page = await fetchHtmlSafe(hotel.sourceUrl, opts);
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.code : "fetch_failed";
    return { status: "incomplete", email: null, sourceUrl: null, note: `Could not read the hotel page (${code}).` };
  }
  let emails = extractEmails(page.html);
  let evidenceUrl = page.finalUrl;
  // A redirect landing on a booking platform is not the hotel's own site.
  if (isBookingPlatformUrl(evidenceUrl)) {
    return {
      status: "contact_not_found",
      email: null,
      sourceUrl: null,
      note: "Page redirects to a booking platform or directory, not the hotel's own site.",
    };
  }
  if (emails.length === 0 && used < maxFetches) {
    const contactLink = findContactLink(page.html, page.finalUrl);
    if (contactLink) {
      try {
        used += 1;
        const contact = await fetchHtmlSafe(contactLink, opts);
        if (isBookingPlatformUrl(contact.finalUrl)) {
          return {
            status: "contact_not_found",
            email: null,
            sourceUrl: null,
            note: "Page redirects to a booking platform or directory, not the hotel's own site.",
          };
        }
        emails = extractEmails(contact.html);
        evidenceUrl = contact.finalUrl;
        page = contact;
      } catch {
        // Keep the original page for the honest miss below.
      }
    }
  }
  if (emails.length === 0) {
    return { status: "contact_not_found", email: null, sourceUrl: null, note: "No public contact email found on the hotel page." };
  }
  if (pageMentionsHotel(page.html, hotel.name)) {
    return {
      status: "verified",
      email: emails[0],
      sourceUrl: evidenceUrl,
      // Name match on the hotel's own page is evidence, not proof of official control.
      note: `Address published on the hotel's own site page that names the property (${evidenceUrl}).`,
    };
  }
  return {
    status: "incomplete",
    email: emails[0],
    sourceUrl: evidenceUrl,
    note: "Found an address but could not confirm it belongs to this hotel.",
  };
}
