import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupAllOptions, LookupOneOptions } from "node:dns";
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
  contactMethod: string | null;
  contactKind: string | null;
  contactPhone: string | null;
  contactFormUrl: string | null;
  contactMessagingUrl: string | null;
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
      observed_at, contact_email, contact_source_url, contact_status, contact_method, contact_kind,
      contact_phone, contact_form_url, contact_messaging_url, contact_verified_at, contact_note
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
      contactMethod: (r.contact_method as string | null) ?? null,
      contactKind: (r.contact_kind as string | null) ?? null,
      contactPhone: (r.contact_phone as string | null) ?? null,
      contactFormUrl: (r.contact_form_url as string | null) ?? null,
      contactMessagingUrl: (r.contact_messaging_url as string | null) ?? null,
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

export type ContactMethod = "email" | "form" | "phone" | "messaging";
export type ContactTier = "property" | "central";
export type ContactStatus = "verified" | "contact_not_found" | "incomplete";

export type DiscoveryResult = {
  status: ContactStatus;
  /** Reservations-suitable email. Generic inboxes stay unconfirmed, never verified. */
  email: string | null;
  phone: string | null;
  formUrl: string | null;
  messagingUrl: string | null;
  method: ContactMethod | null;
  /** property = hotel's own site, central = hotel-group site. Null unless verified. */
  tier: ContactTier | null;
  sourceUrl: string | null;
  note: string;
  /** True when retrying the same CONTACT later could succeed. */
  retryable: boolean;
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
  // Only verified contacts persist addresses. Unconfirmed findings stay
  // in the in-conversation reply, never in the stored record.
  const verified = args.result.status === "verified";
  await sql`
    update hotel_shortlist_items
    set contact_email = ${verified ? args.result.email : null},
      contact_source_url = ${args.result.sourceUrl},
      contact_status = ${verified ? "verified" : args.result.status === "incomplete" ? "unverified" : "contact_not_found"},
      contact_method = ${verified ? args.result.method : null},
      contact_kind = ${verified ? args.result.tier : null},
      contact_phone = ${verified ? args.result.phone : null},
      contact_form_url = ${verified ? args.result.formUrl : null},
      contact_messaging_url = ${verified ? args.result.messagingUrl : null},
      contact_verified_at = ${verified ? sql`now()` : null},
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

export function shortDomain(raw: string): string {
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

/** Concise contact results. Distinguishes reachable channels from honest misses. Never invents contacts. */
export function formatContactResults(
  s: ShortlistView,
  results: { position: number; name: string; result: DiscoveryResult }[]
): string {
  const lines = [`Hotel contacts for ${s.destination}:`];
  for (const r of results) {
    const d = r.result;
    const via = d.sourceUrl ? ` (via ${shortDomain(d.sourceUrl)})` : "";
    if (d.status === "verified" && d.method === "email" && d.email) {
      const scope = d.tier === "central" ? "Central reservations" : "Reservations";
      lines.push(`${r.position}. ${r.name} — ${scope} email verified: ${d.email}${via}.`);
    } else if (d.status === "verified" && d.method === "form" && d.formUrl) {
      // Show the full validated URL so it is tappable in iMessage. The URL
      // was extracted from the hotel's own page and re-checked same-host;
      // it is never guessed and never submitted to automatically.
      lines.push(`${r.position}. ${r.name} — Official contact form: ${d.formUrl} (not an email address; nothing was sent).`);
    } else if (d.status === "verified" && d.method === "phone" && d.phone) {
      lines.push(`${r.position}. ${r.name} — Hotel phone number verified: ${d.phone}${via}.`);
    } else if (d.status === "verified" && d.method === "messaging" && d.messagingUrl) {
      lines.push(`${r.position}. ${r.name} — Official messaging link found${via}.`);
    } else if (d.status === "incomplete" && d.retryable) {
      lines.push(`${r.position}. ${r.name} — ${d.note} Try CONTACT ${r.position} again.`);
    } else if (d.status === "incomplete") {
      lines.push(`${r.position}. ${r.name} — no verified contact yet (${d.note})`);
    } else {
      lines.push(`${r.position}. ${r.name} — ${d.note}`);
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

function parseIPv4(s: string): number[] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  if (n.some((x) => x > 255)) return null;
  return n;
}

/** Expands any textual IPv6 form (compressed, zone id, embedded IPv4) to 8 hextets. */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  let tail: number[] = [];
  const v4m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4m) {
    const v4 = parseIPv4(v4m[2]);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = v4m[1];
  }
  if (!/^[0-9a-f:]*$/.test(s)) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter((g) => g !== "") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter((g) => g !== "") : [];
  for (const g of [...left, ...right]) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
  }
  const missing = 8 - tail.length - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  // "::" must actually compress at least one group.
  if (halves.length === 2 && missing <= 0) return null;
  const groups = [
    ...left.map((g) => parseInt(g, 16)),
    ...new Array(Math.max(0, missing)).fill(0),
    ...right.map((g) => parseInt(g, 16)),
    ...tail,
  ];
  if (groups.length !== 8 || groups.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff)) return null;
  return groups;
}

function isPublicIPv4Bytes(n: number[]): boolean {
  const [a, b, c] = n;
  if (a === 10 || a === 127 || a === 0) return false; // RFC1918, loopback, "this host"
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF 192.0.0.0/24, TEST-NET-1
  if (a === 192 && b === 31 && c === 196) return false; // AS112
  if (a === 192 && b === 52 && c === 193) return false; // AMT
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast (deprecated)
  if (a === 192 && b === 175 && c === 48) return false; // direct delegation
  if (a === 198 && b >= 18 && b <= 19) return false; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast + reserved
  return true;
}

function isPublicIPv6Groups(g: number[]): boolean {
  const [h0, h1] = g;
  if (g.every((x) => x === 0)) return false; // ::/128 unspecified
  if (h0 === 0 && h1 === 0) {
    // First 32 bits zero: only ::ffff:0:0/96 forms reach here; route the
    // embedded IPv4 through the IPv4 checks.
    if (g[2] === 0xffff) {
      return isPublicIPv4Bytes([(g[3] >> 8) & 255, g[3] & 255, (g[4] >> 8) & 255, g[4] & 255]);
    }
    return false;
  }
  if ((h0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((h0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local
  if ((h0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return false; // documentation 2001:db8::/32
  if (h0 === 0x2001 && h1 === 0x0000) return false; // TEREDO 2001::/32
  if (h0 === 0x2001 && (h1 & 0xfff0) === 0x0010) return false; // ORCHIDv2 2001:10::/28
  if (h0 === 0x2002) return false; // 6to4 2002::/16 transition
  if (h0 === 0x0064 && h1 === 0xff9b) return false; // NAT64 64:ff9b::/96
  if (h0 === 0x0100) return false; // discard 100::/64
  return (h0 & 0xe000) === 0x2000; // global unicast 2000::/3 only
}

export function isPublicIp(ip: string): boolean {
  const v4 = parseIPv4(ip.trim());
  if (v4) return isPublicIPv4Bytes(v4);
  // IPv6 (zone id stripped by the expander). Anything unparseable fails closed.
  const v6 = expandIPv6(ip.trim());
  if (!v6) return false;
  return isPublicIPv6Groups(v6);
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
 * DNS lookup pinned to one previously validated public IP (DNS-rebinding
 * safe). Honors the lookup `all` contract: modern Node resolves with
 * `{ all: true }` under autoSelectFamily, which requires an array of
 * address records, not a bare string (a bare string fails with
 * ERR_INVALID_IP_ADDRESS). TLS verification and Host stay on the real
 * hostname via `servername`.
 */
export function pinnedLookup(ip: string, family: 4 | 6) {
  return (
    _hostname: string,
    options: LookupOneOptions | LookupAllOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family: number) => void
  ): void => {
    if (options && (options as LookupAllOptions).all === true) {
      callback(null, [{ address: ip, family }], family);
    } else {
      callback(null, ip, family);
    }
  };
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
    const requestOptions: Parameters<typeof httpsRequest>[1] & { autoSelectFamily?: boolean } = {
      method: "GET",
      headers: args.headers,
      // Dial exactly the validated IP. autoSelectFamily is off because a
      // single pinned address must not be re-resolved or raced.
      lookup: pinnedLookup(args.ip, family),
      autoSelectFamily: false,
      timeout: args.timeoutMs,
      servername: u.hostname,
    };
    const req = httpsRequest(
      args.url,
      requestOptions,
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
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout")));
    req.on("error", (e: unknown) => reject(new SafeFetchError(classifyTransportError(e))));
    req.end();
  });
}

/**
 * Sanitized network failure classes. TLS and connection problems are
 * distinguished so contact diagnostics never collapse into a generic
 * fetch error. Never includes hostnames, URLs, or response bodies.
 */
export function classifyTransportError(e: unknown): "timeout" | "connection_failed" | "tls_failed" | "fetch_failed" | "transport_config" {
  if (e instanceof SafeFetchError) {
    if (e.code === "timeout" || e.code === "connection_failed" || e.code === "tls_failed" || e.code === "transport_config") return e.code;
    return "fetch_failed";
  }
  const code = (e as NodeJS.ErrnoException | null)?.code ?? "";
  const text = `${code} ${(e as Error)?.message ?? ""}`;
  if (/^ERR_INVALID_|ERR_DNS_SET_SERVERS_FAILED|ERR_SOCKET_BAD_PORT|ERR_OUT_OF_RANGE/.test(code)) return "transport_config";
  if (/^ERR_TLS|^CERT_|UNABLE_TO_VERIFY|certificate|handshake|\bSSL\b/i.test(text)) return "tls_failed";
  if (
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "EHOSTDOWN", "ENETUNREACH", "EPIPE", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"].includes(
      code
    )
  ) {
    return "connection_failed";
  }
  if (/timed?\s*out|timeout|abort/i.test(text)) return "timeout";
  return "fetch_failed";
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
    if (u.username || u.password) throw new SafeFetchError("bad_credentials");
    // Hotel pages live on 443. Non-standard ports are not expected and
    // keep ambiguous endpoints out of scope.
    if (u.port !== "" && u.port !== "443") throw new SafeFetchError("bad_port");
    if (isBlockedHostname(u.hostname)) throw new SafeFetchError("blocked_host");
    let addrs: string[];
    try {
      addrs = await lookupFn(u.hostname);
    } catch {
      throw new SafeFetchError("dns_failed");
    }
    // Resolve and validate on every hop, then pin the connection to a
    // validated address, failing over across validated public addresses
    // only on connection-level errors. HTTP responses are authoritative
    // from the first host that answers.
    const publicAddrs = addrs.filter(isPublicIp);
    if (publicAddrs.length === 0) throw new SafeFetchError("private_ip");
    let res: PinnedTransportResult | null = null;
    let lastErr: unknown = null;
    for (const ip of publicAddrs.slice(0, 3)) {
      try {
        res = await transport({
          url,
          ip,
          timeoutMs: opts.timeoutMs ?? FETCH_TIMEOUT_MS,
          headers: { "user-agent": "AnghkooeyContactBot/1.0", accept: "text/html" },
        });
        break;
      } catch (e) {
        const se = e instanceof SafeFetchError ? e : new SafeFetchError("fetch_failed");
        if (se.code === "fetch_failed" || se.code === "timeout" || se.code === "connection_failed" || se.code === "tls_failed") {
          lastErr = se;
          continue;
        }
        throw se;
      }
    }
    if (!res) throw lastErr instanceof Error ? lastErr : new SafeFetchError("fetch_failed");
    if (res.body.byteLength > maxBytes) throw new SafeFetchError("too_large");
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      if (!loc || hop === maxRedirects) throw new SafeFetchError(hop === maxRedirects ? "too_many_redirects" : "bad_redirect");
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SafeFetchError("blocked_page");
    if (res.status === 429) throw new SafeFetchError("rate_limited");
    if (res.status >= 500) throw new SafeFetchError("provider_error");
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

/** Local parts that read like a reservations desk rather than a generic inbox. */
const RESERVATION_LOCALS = new Set([
  "stay",
  "stays",
  "reservation",
  "reservations",
  "reserve",
  "booking",
  "bookings",
  "book",
  "rooms",
  "concierge",
  "frontdesk",
  "front-desk",
  "reception",
  "welcome",
]);

/** Local parts that must never count as a booking contact. */
const NON_BOOKING_LOCALS = new Set([
  "noreply",
  "donotreply",
  "no-reply",
  "do-not-reply",
  "unsubscribe",
  "list-unsubscribe",
  "privacy",
  "dpo",
  "accessibility",
  "a11y",
  "support",
  "help",
  "helpdesk",
  "careers",
  "jobs",
  "press",
  "media",
  "billing",
  "invoices",
  "invoice",
  "abuse",
  "postmaster",
  "webmaster",
  "newsletter",
  "marketing",
]);

export function classifyEmailRole(local: string): "reservations" | "general" | "nonbooking" {
  const l = local.toLowerCase();
  if (NON_BOOKING_LOCALS.has(l)) return "nonbooking";
  if (RESERVATION_LOCALS.has(l)) return "reservations";
  return "general";
}

/** Hotel-group domains whose reservations pages may serve many properties. */
const HOTEL_GROUP_DOMAINS = [
  "marriott.com",
  "hilton.com",
  "hyatt.com",
  "ihg.com",
  "holidayinn.com",
  "accor.com",
  "choicehotels.com",
  "wyndhamhotels.com",
  "bestwestern.com",
  "radissonhotels.com",
  "melia.com",
  "nh-hotels.com",
  "kempinski.com",
  "fourseasons.com",
  "ritzcarlton.com",
  "shangri-la.com",
  "mandarinoriental.com",
  "peninsula.com",
  "rosewoodhotels.com",
  "aman.com",
  "oetkercollection.com",
  "dorchestercollection.com",
  "rotana.com",
  "jumeirah.com",
  "millenniumhotels.com",
  "langhamhotels.com",
];

export function isHotelGroupDomain(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return HOTEL_GROUP_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Phone numbers from tel: links first, then plain-text international-style numbers. */
export function extractPhones(html: string): string[] {
  const text = decodeEntities(html);
  const found: string[] = [];
  const push = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return;
    if (/^0+$/.test(digits)) return;
    const norm = raw.trim().startsWith("+") ? `+${digits}` : digits;
    if (!found.includes(norm)) found.push(norm);
  };
  for (const m of text.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) push(m[1].split("?")[0]);
  for (const m of text.matchAll(/(\+\d[\d\s().-]{5,}\d)/g)) push(m[1]);
  return found.slice(0, 3);
}

/** Same-host contact/reservation forms only. Never follows off-site actions. */
export function extractContactForms(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form\s*>/gi)) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const innerText = m[1].replace(/<[^>]*>/g, " ");
    const action =
      /action\s*=\s*"([^"]*)"/i.exec(openTag)?.[1] ?? /action\s*=\s*'([^']*)'/i.exec(openTag)?.[1] ?? "";
    if (/mailto:/i.test(action)) continue;
    const label = `${action} ${innerText}`;
    if (!/(contact|reserv|book direct|book now|enquir|availability|request)/i.test(label)) continue;
    let u: URL;
    try {
      u = new URL(action || baseUrl, base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    const href = u.toString();
    if (!out.includes(href)) out.push(href);
    if (out.length >= 2) break;
  }
  return out;
}

const MESSAGING_HOSTS = ["wa.me", "api.whatsapp.com", "m.me", "t.me"];

/** Official messaging links (WhatsApp, Messenger, Telegram) where published. */
export function extractMessagingLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of decodeEntities(html).matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]);
    } catch {
      continue;
    }
    if (u.protocol !== "https:") continue;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!MESSAGING_HOSTS.includes(host)) continue;
    if ((host === "wa.me" || host === "api.whatsapp.com") && !/^\/\d{7,15}/.test(u.pathname)) continue;
    const href = u.toString();
    if (!out.includes(href)) out.push(href);
    if (out.length >= 2) break;
  }
  return out;
}

/** Friendly, jargon-free reason for a failed page read. Raw codes stay in diagnostics. */
export function friendlyFetchNote(code: string): string {
  switch (code) {
    case "timeout":
      return "The website timed out.";
    case "connection_failed":
      return "The website could not be reached.";
    case "tls_failed":
      return "The website's secure connection could not be verified.";
    case "blocked_page":
      return "The site blocks automated checks.";
    case "rate_limited":
      return "The site rate-limited the check.";
    case "provider_error":
      return "The website returned a server error.";
    case "dns_failed":
      return "The website address could not be resolved.";
    case "transport_config":
      return "The check could not run because of a local network setup problem.";
    default:
      return "The website couldn't be checked.";
  }
}

export function isRetryableFetchCode(code: string): boolean {
  return ["timeout", "connection_failed", "rate_limited", "provider_error", "fetch_failed", "dns_failed"].includes(code);
}

/**
 * Bounded discovery for one hotel: source page, then at most one same-host
 * contact page. Reads email, phone, contact forms, and messaging links.
 * A reservations address on a page naming the hotel verifies an email
 * contact; forms, phones, and messaging links verify their own channel.
 * Generic inboxes stay unconfirmed, support/privacy addresses are excluded,
 * and nothing is ever guessed from a domain name.
 */
export async function discoverHotelContact(
  hotel: { name: string; sourceUrl: string },
  opts: SafeFetchOpts & { maxFetches?: number } = {}
): Promise<DiscoveryResult> {
  const maxFetches = opts.maxFetches ?? MAX_FETCHES_PER_HOTEL;
  const miss = (
    note: string,
    extra: Partial<DiscoveryResult> = {}
  ): DiscoveryResult => ({
    status: "contact_not_found",
    email: null,
    phone: null,
    formUrl: null,
    messagingUrl: null,
    method: null,
    tier: null,
    sourceUrl: null,
    note,
    retryable: false,
    ...extra,
  });
  const unconfirmed = (
    note: string,
    extra: Partial<DiscoveryResult> = {}
  ): DiscoveryResult => ({
    status: "incomplete",
    email: null,
    phone: null,
    formUrl: null,
    messagingUrl: null,
    method: null,
    tier: null,
    sourceUrl: null,
    note,
    retryable: false,
    ...extra,
  });
  if (isBookingPlatformUrl(hotel.sourceUrl)) {
    return miss("Source is a booking platform or directory, not the hotel's own site.");
  }
  const hostOf = (u: string): string => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return "";
    }
  };
  const shortHost = (u: string): string => {
    const h = hostOf(u);
    try {
      const url = new URL(u);
      const path = url.pathname.length > 1 ? url.pathname.slice(0, 40) : "";
      return `${h.replace(/^www\./, "")}${path}`;
    } catch {
      return h.replace(/^www\./, "");
    }
  };
  const tierOf = (u: string): ContactTier => (isHotelGroupDomain(hostOf(u)) ? "central" : "property");
  const reservationsOn = (html: string, finalUrl: string) => {
    for (const addr of extractEmails(html)) {
      if (classifyEmailRole(addr.split("@")[0]) !== "reservations") continue;
      if (!pageMentionsHotel(html, hotel.name)) continue;
      const tier = tierOf(finalUrl);
      return {
        status: "verified" as const,
        email: addr,
        phone: null as string | null,
        formUrl: null as string | null,
        messagingUrl: null as string | null,
        method: "email" as const,
        tier,
        sourceUrl: finalUrl,
        note:
          tier === "central"
            ? `Central reservations address published by the hotel group (${shortHost(finalUrl)}).`
            : `Reservations address published on the hotel's own site page that names the property (${shortHost(finalUrl)}).`,
        retryable: false,
      };
    }
    return null;
  };
  let used = 0;
  let page: { html: string; finalUrl: string } | null = null;
  try {
    used += 1;
    page = await fetchHtmlSafe(hotel.sourceUrl, opts);
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.code : "fetch_failed";
    return {
      ...unconfirmed(friendlyFetchNote(code)),
      retryable: isRetryableFetchCode(code),
    };
  }
  if (isBookingPlatformUrl(page.finalUrl)) {
    return miss("Page redirects to a booking platform or directory, not the hotel's own site.");
  }
  const direct = reservationsOn(page.html, page.finalUrl);
  if (direct) return direct;
  if (used < maxFetches) {
    const contactLink = findContactLink(page.html, page.finalUrl);
    if (contactLink) {
      try {
        used += 1;
        const contact = await fetchHtmlSafe(contactLink, opts);
        if (isBookingPlatformUrl(contact.finalUrl)) {
          return miss("Page redirects to a booking platform or directory, not the hotel's own site.");
        }
        page = contact;
        const viaContact = reservationsOn(page.html, page.finalUrl);
        if (viaContact) return viaContact;
      } catch {
        // Keep the original page for the honest miss below.
      }
    }
  }
  type EmailHit = { addr: string; role: "reservations" | "general"; nameMatch: boolean };
  const emailHits: EmailHit[] = [];
  let sawNonBookingOnly = false;
  for (const addr of extractEmails(page.html)) {
    const role = classifyEmailRole(addr.split("@")[0]);
    if (role === "nonbooking") {
      sawNonBookingOnly = true;
      continue;
    }
    emailHits.push({ addr, role, nameMatch: pageMentionsHotel(page.html, hotel.name) });
  }
  const forms = extractContactForms(page.html, page.finalUrl);
  const phones = extractPhones(page.html);
  const messaging = extractMessagingLinks(page.html);
  const alternates: string[] = [];
  if (forms.length > 0) alternates.push("online contact form");
  if (phones.length > 0) alternates.push("phone");
  if (messaging.length > 0) alternates.push("messaging link");
  const also = alternates.length > 1 ? ` Also found: ${alternates.slice(1).join(", ")}.` : "";
  const tier = tierOf(page.finalUrl);
  const tierWord = tier === "central" ? "hotel-group" : "hotel's own";
  if (forms.length > 0) {
    return {
      status: "verified",
      email: null,
      phone: phones[0] ?? null,
      formUrl: forms[0],
      messagingUrl: messaging[0] ?? null,
      method: "form",
      tier,
      sourceUrl: forms[0],
      note: `Official contact form found on the ${tierWord} site (${shortHost(forms[0])}).${also}`,
      retryable: false,
    };
  }
  if (phones.length > 0) {
    return {
      status: "verified",
      email: null,
      phone: phones[0],
      formUrl: null,
      messagingUrl: messaging[0] ?? null,
      method: "phone",
      tier,
      sourceUrl: page.finalUrl,
      note: `Hotel phone number verified on the ${tierWord} site (${shortHost(page.finalUrl)}). This is not an email address and cannot receive inquiries.${also ? ` Also found: ${alternates.filter((a) => a !== "phone").join(", ")}.` : ""}`,
      retryable: false,
    };
  }
  if (messaging.length > 0) {
    return {
      status: "verified",
      email: null,
      phone: null,
      formUrl: null,
      messagingUrl: messaging[0],
      method: "messaging",
      tier,
      sourceUrl: page.finalUrl,
      note: `Official messaging link found on the ${tierWord} site (${shortHost(page.finalUrl)}). This is not an email address.${also ? ` Also found: ${alternates.filter((a) => a !== "messaging link").join(", ")}.` : ""}`,
      retryable: false,
    };
  }
  const generic = emailHits.find((h) => h.role === "general" && h.nameMatch);
  if (generic) {
    return {
      status: "incomplete",
      email: generic.addr,
      phone: null,
      formUrl: null,
      messagingUrl: null,
      method: "email",
      tier: null,
      sourceUrl: page.finalUrl,
      note: `Found ${generic.addr} but it is a general inbox, not confirmed for reservations.`,
      retryable: false,
    };
  }
  const unmatched = emailHits.find((h) => h.role === "reservations");
  if (unmatched) {
    return {
      status: "incomplete",
      email: unmatched.addr,
      phone: null,
      formUrl: null,
      messagingUrl: null,
      method: "email",
      tier: null,
      sourceUrl: page.finalUrl,
      note: "Found an address but could not confirm it belongs to this hotel.",
      retryable: false,
    };
  }
  if (sawNonBookingOnly && emailHits.length === 0) {
    return miss("Only support or privacy addresses are published; no reservations contact found.");
  }
  return miss("No public reservations contact found on the hotel page.");
}

export type HotelUrlCheck = { name: string; ok: boolean; code: string; latencyMs: number };

export type HotelUrlDiagnosis = {
  host: string;
  verdict:
    | "reachable"
    | "dns_failed"
    | "connection_failed"
    | "tls_failed"
    | "timeout"
    | "blocked"
    | "rate_limited"
    | "provider_error"
    | "not_html"
    | "too_large"
    | "aggregator"
    | "transport_config"
    | "bad_url";
  checks: HotelUrlCheck[];
  signals: { hasEmail: boolean; hasForm: boolean; hasPhone: boolean; hasMessaging: boolean };
};

/**
 * Read-only diagnostic for one public hotel URL. Reports staged check
 * outcomes and content signals only: no page text, addresses, or IPs.
 * Same SSRF/TLS guardrails as discovery, capped at one small fetch.
 */
export async function diagnoseHotelUrl(
  rawUrl: string,
  opts: SafeFetchOpts & { maxBytes?: number } = {}
): Promise<HotelUrlDiagnosis> {
  const checks: HotelUrlCheck[] = [];
  const fail = (
    verdict: HotelUrlDiagnosis["verdict"],
    host: string,
    signals: HotelUrlDiagnosis["signals"]
  ): HotelUrlDiagnosis => ({ host, verdict, checks, signals: { ...signals } });
  const none = { hasEmail: false, hasForm: false, hasPhone: false, hasMessaging: false };
  const started = Date.now();
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    checks.push({ name: "parse", ok: false, code: "bad_url", latencyMs: Date.now() - started });
    return fail("bad_url", "", none);
  }
  if (u.protocol !== "https:" || isBlockedHostname(u.hostname)) {
    checks.push({ name: "parse", ok: false, code: "blocked", latencyMs: Date.now() - started });
    return fail("blocked", u.hostname, none);
  }
  checks.push({ name: "parse", ok: true, code: "ok", latencyMs: Date.now() - started });
  const host = u.hostname.toLowerCase();
  if (isBookingPlatformUrl(rawUrl)) {
    checks.push({ name: "source", ok: true, code: "aggregator", latencyMs: 0 });
    return fail("aggregator", host, none);
  }
  checks.push({ name: "source", ok: true, code: "direct", latencyMs: 0 });
  const dnsStart = Date.now();
  let addrs: string[];
  try {
    addrs = await (opts.lookupFn ?? defaultLookup)(host);
  } catch {
    checks.push({ name: "dns", ok: false, code: "dns_failed", latencyMs: Date.now() - dnsStart });
    return fail("dns_failed", host, none);
  }
  const publicAddrs = addrs.filter(isPublicIp);
  checks.push({
    name: "dns",
    ok: publicAddrs.length > 0,
    code: publicAddrs.length > 0 ? "ok" : "private_ip",
    latencyMs: Date.now() - dnsStart,
  });
  if (publicAddrs.length === 0) return fail("dns_failed", host, none);
  const fetchStart = Date.now();
  let page: { html: string; finalUrl: string };
  try {
    page = await fetchHtmlSafe(rawUrl, { ...opts, maxBytes: Math.min(opts.maxBytes ?? MAX_BYTES, 262144) });
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.code : "fetch_failed";
    const verdict =
      code === "timeout"
        ? ("timeout" as const)
        : code === "connection_failed" || code === "fetch_failed" || code === "dns_failed"
          ? ("connection_failed" as const)
          : code === "tls_failed"
            ? ("tls_failed" as const)
            : code === "blocked_page"
              ? ("blocked" as const)
              : code === "rate_limited"
                ? ("rate_limited" as const)
                : code === "provider_error"
                  ? ("provider_error" as const)
                  : code === "not_html"
                    ? ("not_html" as const)
                    : code === "too_large"
                      ? ("too_large" as const)
                      : code === "transport_config"
                        ? ("transport_config" as const)
                        : code === "bad_credentials" || code === "bad_port"
                          ? ("blocked" as const)
                          : ("connection_failed" as const);
    checks.push({ name: "fetch", ok: false, code, latencyMs: Date.now() - fetchStart });
    return fail(verdict, host, none);
  }
  checks.push({ name: "fetch", ok: true, code: "ok", latencyMs: Date.now() - fetchStart });
  const signals = {
    hasEmail: extractEmails(page.html).length > 0,
    hasForm: extractContactForms(page.html, page.finalUrl).length > 0,
    hasPhone: extractPhones(page.html).length > 0,
    hasMessaging: extractMessagingLinks(page.html).length > 0,
  };
  checks.push({ name: "signals", ok: true, code: "ok", latencyMs: 0 });
  return fail("reachable", host, signals);
}
