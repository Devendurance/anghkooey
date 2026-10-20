import { describe, expect, it, vi } from "vitest";
import { createServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { SafeFetchError } from "../src/server/hotel-contacts";
import type { DiscoveryResult } from "../src/server/hotel-contacts";
import {
  classifyEmailRole,
  classifyTransportError,
  diagnoseHotelUrl,
  discoverHotelContact,
  extractContactForms,
  extractEmails,
  extractMessagingLinks,
  extractPhones,
  fetchHtmlSafe,
  findContactLink,
  formatContactResults,
  formatShortlistMessage,
  isBlockedHostname,
  isBookingPlatformUrl,
  isHotelGroupDomain,
  isHotelsCommand,
  isPublicIp,
  isRetryableFetchCode,
  isSameTrip,
  isShortlistUsable,
  isValidContactEmail,
  pageMentionsHotel,
  parseContactCommand,
  pinnedLookup,
} from "../src/server/hotel-contacts";

const PUBLIC_IP = "93.184.216.34";
const lookupOk = async () => [PUBLIC_IP];
const enc = (s: string) => new TextEncoder().encode(s);
type StubPage = { status?: number; headers?: Record<string, string>; body?: string };
const transportFor = (pages: Record<string, StubPage>, calls: string[] = []) => {
  const t = async (args: { url: string; ip: string }) => {
    calls.push(`${args.url} via ${args.ip}`);
    const p = pages[args.url];
    if (!p) throw new Error(`unexpected url ${args.url}`);
    return {
      status: p.status ?? 200,
      headers: { "content-type": "text/html", ...(p.headers ?? {}) },
      body: enc(p.body ?? ""),
    };
  };
  return { transport: t as never, calls };
};

describe("transport failure classification (no DB, no network)", () => {
  it("distinguishes timeout, connection, TLS, and generic failures", () => {
    expect(classifyTransportError(Object.assign(new Error("socket hang up"), { code: "ECONNREFUSED" }))).toBe("connection_failed");
    expect(classifyTransportError(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }))).toBe("connection_failed");
    expect(classifyTransportError(Object.assign(new Error("certificate has expired"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }))).toBe("tls_failed");
    expect(classifyTransportError(Object.assign(new Error("write EPROTO"), { code: "ERR_TLS_CERT_ALTNAME_INVALID" }))).toBe("tls_failed");
    expect(classifyTransportError(Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" }))).toBe("connection_failed");
    expect(classifyTransportError(new Error("operation timed out"))).toBe("timeout");
    expect(classifyTransportError(new Error("socket hang up"))).toBe("fetch_failed");
    expect(classifyTransportError(new Error("whatever"))).toBe("fetch_failed");
  });

  it("fails over to the next validated public address on connection failure", async () => {
    const tried: string[] = [];
    const transport = (async (args: { url: string; ip: string }) => {
      tried.push(args.ip);
      if (args.ip === "93.184.216.34") throw new Error("socket hang up");
      return { status: 200, headers: { "content-type": "text/html" }, body: enc("<html><body>ok</body></html>") };
    }) as never;
    const r = await fetchHtmlSafe("https://riverside-hotel.com/", {
      transport,
      lookupFn: async () => ["93.184.216.34", "8.8.8.8"],
    });
    expect(r.html).toContain("ok");
    expect(tried).toEqual(["93.184.216.34", "8.8.8.8"]);
  });

  it("skips non-public addresses and reports when none are usable", async () => {
    const { transport, calls } = transportFor({ "https://riverside-hotel.com/": { body: "<html><body>ok</body></html>" } });
    const r = await fetchHtmlSafe("https://riverside-hotel.com/", {
      transport,
      lookupFn: async () => ["10.0.0.9", PUBLIC_IP],
    });
    expect(r.html).toContain("ok");
    expect(calls).toEqual([`https://riverside-hotel.com/ via ${PUBLIC_IP}`]);
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com/", {
        transport,
        lookupFn: async () => ["10.0.0.9", "192.168.1.4"],
      })
    ).rejects.toMatchObject({ code: "private_ip" });
    expect(calls).toHaveLength(1);
  });

  it("maps blocked, limited, and failed origins to distinct codes", async () => {
    const pages: Record<string, StubPage> = {
      "https://w.example.com/deny": { status: 403, body: "x" },
      "https://w.example.com/rate": { status: 429, body: "x" },
      "https://w.example.com/down": { status: 503, body: "x" },
    };
    for (const [url, code] of [
      ["https://w.example.com/deny", "blocked_page"],
      ["https://w.example.com/rate", "rate_limited"],
      ["https://w.example.com/down", "provider_error"],
    ] as const) {
      await expect(fetchHtmlSafe(url, { transport: transportFor(pages).transport, lookupFn: lookupOk })).rejects.toMatchObject({ code });
    }
    const d = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://w.example.com/rate" },
      { transport: transportFor(pages).transport, lookupFn: lookupOk }
    );
    expect(d).toMatchObject({ status: "incomplete", email: null, retryable: true });
    expect(d.note).toMatch(/rate-limited|rate limited/i);
  });
});

describe("pinned lookup contract (no DB, real local socket, no mocks)", () => {
  it("answers the lookup `all` shape with an address record array", async () => {
    const cbAll = await new Promise<unknown>((resolve) => {
      pinnedLookup("93.184.216.34", 4)("example.com", { all: true, verbatim: true } as never, ((...a: unknown[]) => resolve(a)) as never);
    });
    expect(cbAll).toEqual([null, [{ address: "93.184.216.34", family: 4 }], 4]);
    const cbOne = await new Promise<unknown>((resolve) => {
      pinnedLookup("93.184.216.34", 4)("example.com", {} as never, ((...a: unknown[]) => resolve(a)) as never);
    });
    expect(cbOne).toEqual([null, "93.184.216.34", 4]);
  });

  it("connects through the real Node resolver path with default options", async () => {
    const server = createServer((_req, res) => {
      res.end("pinned-ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const body = await new Promise<string>((resolve, reject) => {
        // Default options: autoSelectFamily on, exactly like production.
        // The pre-fix single-string callback fails here with ERR_INVALID_IP_ADDRESS.
        const req = get(`http://localhost:${port}/`, { lookup: pinnedLookup("127.0.0.1", 4) }, (res) => {
          let text = "";
          res.on("data", (c: Uint8Array) => (text += Buffer.from(c).toString()));
          res.on("end", () => resolve(`${res.statusCode}:${text}`));
        });
        req.on("error", reject);
        req.setTimeout(8000, () => reject(new Error("local test timed out")));
      });
      expect(body).toBe("200:pinned-ok");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15000);

  it("classifies local runtime misconfiguration apart from network failures", () => {
    const badIp = Object.assign(new Error("Invalid IP address: undefined"), { code: "ERR_INVALID_IP_ADDRESS" });
    expect(classifyTransportError(badIp)).toBe("transport_config");
    const badOpt = Object.assign(new Error("bad option"), { code: "ERR_INVALID_OPT_VALUE" });
    expect(classifyTransportError(badOpt)).toBe("transport_config");
    expect(isRetryableFetchCode("transport_config")).toBe(false);
  });
});

describe("contact email roles and group domains (no DB, no network)", () => {
  it("classifies reservations, general, and non-booking addresses", () => {
    for (const l of ["stay", "reservations", "booking", "book", "concierge", "frontdesk", "reception", "welcome", "rooms"]) {
      expect(classifyEmailRole(l)).toBe("reservations");
    }
    expect(classifyEmailRole("info")).toBe("general");
    expect(classifyEmailRole("contact")).toBe("general");
    expect(classifyEmailRole("hello")).toBe("general");
    expect(classifyEmailRole("john.smith")).toBe("general");
    for (const l of ["privacy", "support", "help", "accessibility", "jobs", "press", "noreply", "abuse", "dpo", "newsletter"]) {
      expect(classifyEmailRole(l)).toBe("nonbooking");
    }
  });

  it("recognizes hotel-group domains without guessing affiliation", () => {
    expect(isHotelGroupDomain("www.marriott.com")).toBe(true);
    expect(isHotelGroupDomain("marriott.com")).toBe(true);
    expect(isHotelGroupDomain("book.ihg.com")).toBe(true);
    expect(isHotelGroupDomain("riverside-hotel.com")).toBe(false);
    expect(isHotelGroupDomain("marriott.com.evil.com")).toBe(false);
    expect(isHotelGroupDomain("")).toBe(false);
  });
});

describe("multi-channel extraction (no DB, no network)", () => {
  it("extracts phone numbers from tel links and text", () => {
    const html = `<a href="tel:+1-800-555-0100">Call</a> <p>Or +44 20 7946 0000 after hours.</p>`;
    const phones = extractPhones(html);
    expect(phones).toContain("+18005550100");
    expect(phones).toContain("+442079460000");
    expect(extractPhones("<p>Call 555 for help.</p>")).toEqual([]);
  });

  it("finds same-host contact forms and ignores off-site or newsletter forms", () => {
    const html = `<form action="/contact" method="post"><label>Email</label><input type="email" name="e"><textarea name="m"></textarea><button>Send enquiry</button></form>
      <form action="https://external.example.com/x"><input type="email"></form>
      <form action="/newsletter"><input type="email"><button>Subscribe</button></form>`;
    const forms = extractContactForms(html, "https://riverside-hotel.com/rooms");
    expect(forms).toEqual(["https://riverside-hotel.com/contact"]);
  });

  it("finds official messaging links and ignores other hosts", () => {
    const html = `<a href="https://wa.me/15550100">WhatsApp</a> <a href="https://evil.example.com/wa">x</a> <a href="https://t.me/riversidehotel">Telegram</a>`;
    expect(extractMessagingLinks(html)).toEqual(["https://wa.me/15550100", "https://t.me/riversidehotel"]);
  });
});

describe("hotel selection commands (no DB, no network)", () => {
  it("parses CONTACT selections strictly", () => {
    expect(parseContactCommand("CONTACT 1")).toEqual([1]);
    expect(parseContactCommand("contact 1,2")).toEqual([1, 2]);
    expect(parseContactCommand("CONTACT 3, 1, 2")).toEqual([1, 2, 3]);
    expect(parseContactCommand("CONTACT")).toBeNull();
    expect(parseContactCommand("CONTACT 0")).toBeNull();
    expect(parseContactCommand("CONTACT 4")).toBeNull();
    expect(parseContactCommand("CONTACT abc")).toBeNull();
    expect(parseContactCommand("CONTACT 1,1")).toBeNull();
    expect(parseContactCommand("CONTACT 1,2,3,1")).toBeNull();
    expect(parseContactCommand("please contact 1")).toBeNull();
  });

  it("matches HOTELS exactly", () => {
    expect(isHotelsCommand("HOTELS")).toBe(true);
    expect(isHotelsCommand("  hotels  ")).toBe(true);
    expect(isHotelsCommand("hotels please")).toBe(false);
    expect(isHotelsCommand("CONTACT 1")).toBe(false);
  });
});

describe("booking platform detection (no DB, no network)", () => {
  it("flags aggregators and directory links, never real hotel domains", () => {
    for (const u of [
      "https://www.booking.com/hotel/gb/example.html",
      "https://www.expedia.com/London-Hotels-Example.h123.t456",
      "https://www.hotels.com/ho12345/",
      "https://www.tripadvisor.com/Hotel_Review-g123",
      "https://www.agoda.com/en-gb/example/hotel/london-gb.html",
      "https://www.google.com/travel/hotels/entity/abc",
      "https://maps.google.com/travel/hotels",
    ]) {
      expect(isBookingPlatformUrl(u)).toBe(true);
    }
    for (const u of ["https://www.marriott.com/hotels/example", "https://riverside.example-hotel.com/contact", "https://hyatt.com/example"]) {
      expect(isBookingPlatformUrl(u)).toBe(false);
    }
    expect(isBookingPlatformUrl("not a url")).toBe(false);
  });
});

describe("contact email validation (no DB, no network)", () => {
  it("accepts real addresses and rejects junk", () => {
    expect(isValidContactEmail("stay@riverside-hotel.com")).toBe(true);
    for (const bad of [
      "",
      "no-at-sign",
      "a@b",
      "x@y.z",
      "a..b@hotel.com",
      "stay@hotel",
      "noreply@hotel.com",
      "unsubscribe@hotel.com",
      "stay@example.com",
      `${"a".repeat(250)}@hotel.com`,
      "stay @hotel.com",
    ]) {
      expect(isValidContactEmail(bad)).toBe(false);
    }
  });
});

describe("email extraction and hotel mention (no DB, no network)", () => {
  it("reads mailto links, entities, and plaintext while skipping junk", () => {
    const html = `<a href="mailto:stay&#64;riverside-hotel.com">mail</a>
      <a href="mailto:noreply@hotel.com?subject=x">no</a>
      <p>or write hello@example.com or front@riverside-hotel.com, front@riverside-hotel.com</p>`;
    expect(extractEmails(html)).toEqual(["stay@riverside-hotel.com", "front@riverside-hotel.com"]);
  });

  it("matches hotel names by full or token overlap", () => {
    const page = "<html><body><h1>Riverside Hotel London</h1><p>Welcome to Riverside Hotel.</p></body></html>";
    expect(pageMentionsHotel(page, "Riverside Hotel")).toBe(true);
    expect(pageMentionsHotel("<p>Generic city guide with no names.</p>", "Riverside Hotel")).toBe(false);
    expect(pageMentionsHotel(page, "Grand Palace Suites")).toBe(false);
  });

  it("finds only same-host contact links", () => {
    const html = `<a href="/contact-us">Contact us</a> <a href="https://external.com/contact">Contact</a>`;
    expect(findContactLink(html, "https://riverside-hotel.com/rooms")).toBe("https://riverside-hotel.com/contact-us");
    expect(findContactLink(`<a href="/menu">Menu</a>`, "https://riverside-hotel.com/")).toBeNull();
  });
});

describe("SSRF guards (no DB, stubbed network)", () => {
  it("rejects credentials and non-standard ports before any network use", async () => {
    const neverCalled = async () => {
      throw new Error("transport must not be called");
    };
    await expect(
      fetchHtmlSafe("https://user:pass@riverside-hotel.com/", {
        transport: neverCalled as never,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "bad_credentials" });
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com:8443/rooms", {
        transport: neverCalled as never,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "bad_port" });
    // Decimal, octal, and hex IPv4 forms normalize to loopback and are blocked.
    for (const host of ["2130706433", "0x7f.0.0.1", "0177.0.0.1"]) {
      expect(isBlockedHostname(new URL(`https://${host}/`).hostname)).toBe(true);
    }
  });

  it("classifies public and private addresses", () => {
    for (const bad of [
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      "224.0.0.1",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.2.1",
      "198.51.100.7",
      "203.0.113.9",
      "192.0.0.1",
      "198.18.0.1",
      "192.88.99.1",
      "::1",
      "::",
      "fc00::1",
      "fd00::1",
      "fe80::1",
      "fea0::1",
      "febf::1",
      "ff02::1",
      "2001:db8::1",
      "2001::1",
      "2001:10::1",
      "2002:c000:201::",
      "::ffff:10.0.0.1",
      "::ffff:0.0.0.0",
      "999.1.1.1",
    ]) {
      expect(isPublicIp(bad)).toBe(false);
    }
    for (const good of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
      expect(isPublicIp(good)).toBe(true);
    }
  });

  it("blocks hostile hostnames", () => {
    for (const h of ["localhost", "x.localhost", "db.local", "svc.internal", "x.invalid", "10.0.0.1", "169.254.169.254", ""]) {
      expect(isBlockedHostname(h)).toBe(true);
    }
    expect(isBlockedHostname("riverside-hotel.com")).toBe(false);
  });

  it("fetches a plain page and rejects http, private, and non-html targets", async () => {
    const ok = await fetchHtmlSafe("https://riverside-hotel.com/", {
      transport: transportFor({ "https://riverside-hotel.com/": { body: "<html><body>hi</body></html>" } }).transport,
      lookupFn: lookupOk,
    });
    expect(ok.finalUrl).toBe("https://riverside-hotel.com/");
    expect(ok.html).toContain("hi");

    await expect(
      fetchHtmlSafe("http://riverside-hotel.com/", {
        transport: transportFor({}).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "not_https" });
    await expect(
      fetchHtmlSafe("https://internal.local/", {
        transport: transportFor({}).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "blocked_host" });
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com/", {
        transport: transportFor({}).transport,
        lookupFn: async () => ["10.0.0.5"],
      })
    ).rejects.toMatchObject({ code: "private_ip" });
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com/", {
        transport: transportFor({ "https://riverside-hotel.com/": { body: "{}", headers: { "content-type": "application/json" } } }).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "not_html" });
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com/", {
        transport: transportFor({ "https://riverside-hotel.com/": { status: 404, body: "nope" } }).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "bad_status" });
    await expect(
      fetchHtmlSafe("https://riverside-hotel.com/big", {
        transport: transportFor({ "https://riverside-hotel.com/big": { body: "x".repeat(200) } }).transport,
        lookupFn: lookupOk,
        maxBytes: 100,
      })
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("dials the validated IP, never the hostname", async () => {
    const { transport, calls } = transportFor({ "https://pinned.example.com/": { body: "<html><body>ok</body></html>" } });
    const ok = await fetchHtmlSafe("https://pinned.example.com/", {
      transport,
      lookupFn: async () => ["93.184.216.34"],
    });
    expect(ok.html).toContain("ok");
    expect(calls).toEqual(["https://pinned.example.com/ via 93.184.216.34"]);
  });

  it("validates every redirect hop and caps the chain", async () => {
    const chain = ["https://a.example.com/1", "https://a.example.com/2", "https://a.example.com/3"];
    const pages: Record<string, { status?: number; headers?: Record<string, string>; body?: string }> = {};
    chain.forEach((u, i) => {
      pages[u] = i < chain.length - 1 ? { status: 302, headers: { location: chain[i + 1] }, body: "" } : { body: "<html><body>final</body></html>" };
    });
    const ok = await fetchHtmlSafe(chain[0], { transport: transportFor(pages).transport, lookupFn: lookupOk });
    expect(ok.finalUrl).toBe(chain[chain.length - 1]);

    await expect(
      fetchHtmlSafe("https://a.example.com/", {
        transport: transportFor({ "https://a.example.com/": { status: 302, headers: { location: "http://a.example.com/weak" }, body: "" } }).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "not_https" });
    await expect(
      fetchHtmlSafe("https://a.example.com/", {
        transport: transportFor({ "https://a.example.com/": { status: 302, headers: { location: "https://evil.internal/x" }, body: "" } }).transport,
        lookupFn: lookupOk,
      })
    ).rejects.toMatchObject({ code: "blocked_host" });
    await expect(
      fetchHtmlSafe("https://a.example.com/", {
        transport: transportFor({ "https://a.example.com/": { status: 302, headers: { location: "https://evil.example.com/x" }, body: "" } }).transport,
        lookupFn: async (h: string) => (h === "evil.example.com" ? ["10.0.0.9"] : [PUBLIC_IP]),
      })
    ).rejects.toMatchObject({ code: "private_ip" });
    await expect(
      fetchHtmlSafe("https://a.example.com/loop", {
        transport: transportFor({ "https://a.example.com/loop": { status: 302, headers: { location: "https://a.example.com/loop" }, body: "" } }).transport,
        lookupFn: lookupOk,
        maxRedirects: 2,
      })
    ).rejects.toMatchObject({ code: "too_many_redirects" });
  });
});

describe("contact discovery honesty (stubbed pages)", () => {
  it("never fetches booking platforms and reports them honestly", async () => {
    const { transport, calls } = transportFor({});
    const seen = vi.fn(transport);
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://www.booking.com/hotel/gb/example.html" },
      { transport: seen as never, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "contact_not_found", email: null });
    expect(seen).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("verifies an address on the hotel's own page", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": { body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:stay@riverside-hotel.com">Reservations</a></body></html>' },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "verified", email: "stay@riverside-hotel.com" });
    expect(r.sourceUrl).toBe("https://riverside-hotel.com/rooms");
  });

  it("marks found-but-unconfirmed addresses incomplete instead of verified", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": { body: '<html><body><h1>Riverside Hotel</h1><p>Partner links</p><a href="mailto:info@other-travel.com">x</a></body></html>' },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r.status).toBe("incomplete");
    expect(r.email).toBe("info@other-travel.com");
  });

  it("reports a clean miss and follows one same-host contact link", async () => {
    const miss = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      {
        transport: transportFor({ "https://riverside-hotel.com/rooms": { body: "<html><body><h1>Rooms</h1></body></html>" } }).transport,
        lookupFn: lookupOk,
      }
    );
    expect(miss).toMatchObject({ status: "contact_not_found", email: null });

    const pages = {
      "https://riverside-hotel.com/rooms": { body: '<html><body><h1>Riverside Hotel rooms</h1><a href="/contact">Contact us</a></body></html>' },
      "https://riverside-hotel.com/contact": { body: '<html><body><h1>Riverside Hotel contact</h1><a href="mailto:stay@riverside-hotel.com">x</a></body></html>' },
    };
    const { transport, calls } = transportFor(pages);
    const found = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(found).toMatchObject({ status: "verified", email: "stay@riverside-hotel.com" });
    expect(calls).toHaveLength(2);
  });

  it("treats redirects to booking platforms as not the hotel's own site", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": { status: 302, headers: { location: "https://www.booking.com/hotel/gb/x.html" }, body: "" },
      "https://www.booking.com/hotel/gb/x.html": { body: "<html><body><h1>Riverside Hotel</h1><a href=\"mailto:stay@booking.com\">x</a></body></html>" },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "contact_not_found", email: null });
    expect(r.note).toMatch(/booking platform/);
  });

  it("treats unreadable pages as incomplete, never verified", async () => {
    const transport = (async () => {
      throw new Error("socket hang up");
    }) as never;
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "incomplete", email: null });
  });

  it("fails over to the next validated IP without leaking addresses", async () => {
    const tried: string[] = [];
    const transport = (async (args: { url: string; ip: string }) => {
      tried.push(args.ip);
      if (args.ip === "93.184.216.34") {
        const err = new Error("socket hang up") as Error & { code?: string };
        err.code = "ECONNREFUSED";
        throw err;
      }
      return { status: 200, headers: { "content-type": "text/html" }, body: enc("<html><body><h1>Riverside Hotel</h1><a href=\"mailto:stay@riverside-hotel.com\">x</a></body></html>") };
    }) as never;
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: async () => ["93.184.216.34", "8.8.8.8"] }
    );
    expect(r).toMatchObject({ status: "verified", email: "stay@riverside-hotel.com" });
    expect(tried).toEqual(["93.184.216.34", "8.8.8.8"]);
  });

  it("maps blocked, rate-limited, and provider errors distinctly", async () => {
    for (const [status, code] of [
      [403, "blocked_page"],
      [429, "rate_limited"],
      [500, "provider_error"],
    ] as const) {
      const { transport } = transportFor({
        "https://riverside-hotel.com/rooms": { status, body: "no" },
      });
      await expect(
        fetchHtmlSafe("https://riverside-hotel.com/rooms", { transport, lookupFn: lookupOk })
      ).rejects.toMatchObject({ code });
    }
  });

  it("verifies central reservations addresses on group domains", async () => {
    const { transport } = transportFor({
      "https://www.marriott.com/hotels/riverside": {
        body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:reservations@marriott.com">Book</a></body></html>',
      },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://www.marriott.com/hotels/riverside" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "verified", method: "email", tier: "central" });
    expect(r.note).toMatch(/[Cc]entral/);
  });

  it("treats generic inboxes as unconfirmed, never verified", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": {
        body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:info@riverside-hotel.com">Contact</a></body></html>',
      },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r.status).toBe("incomplete");
    expect(r.method).toBe("email");
    expect(r.retryable).toBe(false);
  });

  it("excludes support and privacy addresses from booking contacts", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": {
        body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:privacy@riverside-hotel.com">Privacy</a> <a href="mailto:support@riverside-hotel.com">Support</a></body></html>',
      },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "contact_not_found", email: null });
    expect(r.note).toMatch(/support or privacy/i);
  });

  it("excludes support and privacy addresses from booking contacts", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": {
        body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:privacy@riverside-hotel.com">Privacy</a> <a href="mailto:support@riverside-hotel.com">Support</a></body></html>',
      },
    });
    const r = await discoverHotelContact(
      { name: "Riverside Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r).toMatchObject({ status: "contact_not_found", email: null });
    expect(r.note).toMatch(/support or privacy/i);
  });

  it("verifies official forms, phones, and messaging links as their own channel", async () => {
    const pages = {
      "https://riverside-hotel.com/rooms": {
        body: '<html><body><h1>Riverside Hotel</h1><form action="/contact" method="post"><input type="email" name="e"><textarea name="m"></textarea><button>Send enquiry</button></form><a href="tel:+1-800-555-0100">Call</a> <a href="https://wa.me/15550100">WhatsApp</a></body></html>',
      },
    };
    const { transport } = transportFor(pages);
    const r = await discoverHotelContact(
      { name: "No Mention Hotel", sourceUrl: "https://riverside-hotel.com/rooms" },
      { transport, lookupFn: lookupOk }
    );
    expect(r.status).toBe("verified");
    expect(r.method).toBe("form");
    expect(r.formUrl).toBe("https://riverside-hotel.com/contact");
  });
});

describe("hotel URL diagnostics (no DB, stubbed network)", () => {
  it("reports staged checks without content, addresses, or URLs", async () => {
    const { transport } = transportFor({
      "https://riverside-hotel.com/rooms": {
        body: '<html><body><h1>Riverside Hotel</h1><a href="mailto:stay@riverside-hotel.com">x</a><form action="/contact"><input type="email"></form><a href="tel:+18005550100">x</a></body></html>',
      },
    });
    const d = await diagnoseHotelUrl("https://riverside-hotel.com/rooms", { transport, lookupFn: lookupOk });
    expect(d.verdict).toBe("reachable");
    expect(d.host).toBe("riverside-hotel.com");
    expect(d.checks.map((c) => c.name)).toEqual(["parse", "source", "dns", "fetch", "signals"]);
    expect(d.checks.every((c) => typeof c.latencyMs === "number")).toBe(true);
    expect(d.signals).toMatchObject({ hasEmail: true, hasForm: true, hasPhone: true, hasMessaging: false });
    expect(JSON.stringify(d)).not.toMatch(/stay@|93\.184|01234/);
  });

  it("classifies unreachable, blocked, and rate-limited destinations", async () => {
    const down = await diagnoseHotelUrl("https://riverside-hotel.com/rooms", {
      transport: (async () => {
        throw new Error("socket hang up");
      }) as never,
      lookupFn: lookupOk,
    });
    expect(down.verdict).toBe("connection_failed");
    const blocked = await diagnoseHotelUrl("https://riverside-hotel.com/rooms", {
      transport: transportFor({ "https://riverside-hotel.com/rooms": { status: 403, body: "no" } }).transport,
      lookupFn: lookupOk,
    });
    expect(blocked.verdict).toBe("blocked");
    const limited = await diagnoseHotelUrl("https://riverside-hotel.com/rooms", {
      transport: transportFor({ "https://riverside-hotel.com/rooms": { status: 429, body: "no" } }).transport,
      lookupFn: lookupOk,
    });
    expect(limited.verdict).toBe("rate_limited");
    const bad = await diagnoseHotelUrl("not a url at all", { lookupFn: lookupOk });
    expect(bad.verdict).toBe("bad_url");
    const agg = await diagnoseHotelUrl("https://www.booking.com/hotel/gb/x.html", { lookupFn: lookupOk });
    expect(agg.verdict).toBe("aggregator");
  });

  it("surfaces local runtime misconfiguration distinctly from network failures", async () => {
    const broken = await diagnoseHotelUrl("https://riverside-hotel.com/rooms", {
      transport: (async () => {
        throw new SafeFetchError("transport_config");
      }) as never,
      lookupFn: lookupOk,
    });
    expect(broken.verdict).toBe("transport_config");
    expect(broken.checks.find((c) => c.name === "fetch")?.code).toBe("transport_config");
  });
});

describe("shortlist presentation (no DB, no network)", () => {
  const view = {
    id: "s1",
    destination: "London",
    checkIn: "2026-11-12",
    checkOut: "2026-11-17",
    status: "active" as const,
    createdAt: "2026-10-18T00:00:00.000Z",
    items: [
      {
        position: 1,
        name: "Riverside Hotel",
        address: null,
        source: "serpapi_google_hotels",
        sourceUrl: "https://riverside-hotel.com/rooms",
        rateAmount: 180,
        rateCurrency: "USD",
        observedAt: "2026-10-18T00:00:00.000Z",
        contactEmail: null,
        contactSourceUrl: null,
        contactStatus: "unverified",
        contactMethod: null,
        contactKind: null,
        contactPhone: null,
        contactFormUrl: null,
        contactMessagingUrl: null,
        contactVerifiedAt: null,
        contactNote: null,
      },
    ],
  };

  it("lists candidates with domains and honest currency, never full URLs or invented fields", () => {
    const msg = formatShortlistMessage(view);
    expect(msg).toContain("1. Riverside Hotel");
    expect(msg).toContain("180 USD");
    expect(msg).not.toContain("$180");
    expect(msg).toContain("riverside-hotel.com");
    expect(msg).not.toContain("https://");
    expect(msg).toMatch(/observed and indicative/);
    const noCurrency = formatShortlistMessage({
      ...view,
      items: [{ ...view.items[0], rateAmount: 200, rateCurrency: null }],
    });
    expect(noCurrency).toContain("200 observed nightly (currency unknown)");
    const eur = formatShortlistMessage({
      ...view,
      items: [{ ...view.items[0], rateAmount: 150, rateCurrency: "EUR" }],
    });
    expect(eur).toContain("150 EUR");
    expect(eur).not.toContain("$");
  });

  it("shows only verified addresses and honest misses", () => {
    const full: DiscoveryResult = {
      status: "verified",
      email: "stay@riverside-hotel.com",
      phone: null,
      formUrl: null,
      messagingUrl: null,
      method: "email",
      tier: "property",
      sourceUrl: "https://riverside-hotel.com/contact",
      note: "ok",
      retryable: false,
    };
    const missing: DiscoveryResult = {
      status: "contact_not_found",
      email: null,
      phone: null,
      formUrl: null,
      messagingUrl: null,
      method: null,
      tier: null,
      sourceUrl: null,
      note: "No public reservations contact found on the hotel page.",
      retryable: false,
    };
    const msg = formatContactResults(view, [
      { position: 1, name: "Riverside Hotel", result: full },
      { position: 2, name: "Garden Inn", result: missing },
    ]);
    expect(msg).toContain("stay@riverside-hotel.com");
    expect(msg).toContain("Reservations email verified");
    expect(msg).toContain("No public reservations contact found");
    expect(msg).not.toContain("guaranteed");
    expect(msg).toContain("EMAIL drafts to the test inbox only");
    expect(msg).not.toMatch(/draft an inquiry once you have a verified contact/);
    const formMsg = formatContactResults(view, [
      {
        position: 1,
        name: "Riverside Hotel",
        result: { ...full, method: "form", formUrl: "https://riverside-hotel.com/contact", email: null },
      },
    ]);
    expect(formMsg).toContain("Official contact form: https://riverside-hotel.com/contact");
    expect(formMsg).toContain("not an email address");
    expect(formMsg).not.toContain("stay@riverside-hotel.com");
    const phoneMsg = formatContactResults(view, [
      {
        position: 1,
        name: "Riverside Hotel",
        result: { ...full, method: "phone", phone: "+1 800 555 0100", email: null },
      },
    ]);
    expect(phoneMsg).toContain("Hotel phone number verified: +1 800 555 0100");
    const retryMsg = formatContactResults(view, [
      {
        position: 1,
        name: "Riverside Hotel",
        result: { ...missing, status: "incomplete", note: "The website timed out.", retryable: true },
      },
    ]);
    expect(retryMsg).toContain("The website timed out. Try CONTACT 1 again.");
    expect(retryMsg).not.toMatch(/couldn't be checked \(/);
    // The generic fallback note must also render exactly once, never doubled.
    const genericRetry = formatContactResults(view, [
      {
        position: 2,
        name: "Garden Inn",
        result: { ...missing, status: "incomplete", note: "The website couldn't be checked.", retryable: true },
      },
    ]);
    expect(genericRetry).toContain("The website couldn't be checked. Try CONTACT 2 again.");
    expect(genericRetry.match(/couldn't be checked/g) ?? []).toHaveLength(1);
  });

  it("gates selections on active status and future dates", () => {
    expect(isShortlistUsable({ status: "active", checkIn: "2026-11-12" }, "2026-10-18")).toBe(true);
    expect(isShortlistUsable({ status: "stale", checkIn: "2026-11-12" }, "2026-10-18")).toBe(false);
    expect(isShortlistUsable({ status: "active", checkIn: "2026-10-01" }, "2026-10-18")).toBe(false);
  });

  it("detects changed trips for pre-search invalidation", () => {
    const base = { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-17" };
    expect(isSameTrip(base, { ...base })).toBe(true);
    expect(isSameTrip(base, { ...base, destination: "london " })).toBe(true);
    expect(isSameTrip(base, { ...base, checkOut: "2026-11-18" })).toBe(false);
    expect(isSameTrip(base, { ...base, destination: "Paris" })).toBe(false);
  });
});

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

dbSuite("hotel shortlist persistence (real Neon, throwaway identities, no Gmail sends)", () => {
  const setup = async () => {
    const { createUser } = await import("../src/server/session");
    const mod = await import("../src/server/hotel-contacts");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    return { user, mod, sql };
  };
  const cleanup = async (sql: ReturnType<typeof import("../src/server/db").getSql>, ...userIds: string[]) => {
    for (const id of userIds) {
      await sql`delete from users where id = ${id}`;
    }
  };
  const candidates = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Hotel ${i + 1}`,
      destination: "London",
      address: `${i + 1} Road, London`,
      source: "serpapi_google_hotels" as const,
      sourceUrl: `https://hotel${i + 1}-stay.com/rooms`,
      observedAt: "2026-10-18T00:00:00.000Z",
      observedNightlyRate: { amount: 100 + i * 10, currency: "USD" },
    }));

  it("stores structured candidates in stable order and caps at three", async () => {
    const { user, mod, sql } = await setup();
    try {
      await mod.saveShortlist({ canonicalUserId: user, destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-17", candidates: candidates(4) });
      const view = await mod.getActiveShortlist(user);
      expect(view?.destination).toBe("London");
      expect(view?.items).toHaveLength(3);
      expect(view?.items.map((i) => i.position)).toEqual([1, 2, 3]);
      expect(view?.items[0]).toMatchObject({ name: "Hotel 1", sourceUrl: "https://hotel1-stay.com/rooms", rateAmount: 100 });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("supersedes the previous list and isolates identities", async () => {
    const { createUser } = await import("../src/server/session");
    const { user, mod, sql } = await setup();
    const stranger = await createUser();
    try {
      await mod.saveShortlist({ canonicalUserId: user, destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-16", candidates: candidates(2) });
      await mod.saveShortlist({ canonicalUserId: user, destination: "Paris", checkIn: "2026-12-01", checkOut: "2026-12-03", candidates: candidates(1) });
      const view = await mod.getActiveShortlist(user);
      expect(view?.destination).toBe("Paris");
      expect(view?.items).toHaveLength(1);
      expect(await mod.getActiveShortlist(stranger)).toBeNull();
      expect(
        await mod.saveContactResult({
          canonicalUserId: stranger,
          shortlistId: view!.id,
          position: 1,
          result: { status: "verified", email: "x@y.com", sourceUrl: null, note: "x", phone: null, formUrl: null, messagingUrl: null, method: "email", tier: null, retryable: false },
        })
      ).toBe(false);
    } finally {
      await cleanup(sql, user, stranger);
    }
  }, 60000);

  it("persists verified contact evidence and flags stale lists", async () => {
    const { user, mod, sql } = await setup();
    try {
      await mod.saveShortlist({ canonicalUserId: user, destination: "London", checkIn: "2020-01-01", checkOut: "2020-01-03", candidates: candidates(2) });
      const view = await mod.getActiveShortlist(user);
      expect(view).not.toBeNull();
      expect(mod.isShortlistUsable(view!, "2026-10-18")).toBe(false);
      expect(
        await mod.saveContactResult({
          canonicalUserId: user,
          shortlistId: view!.id,
          position: 1,
          result: { status: "verified", email: "stay@hotel1-stay.com", sourceUrl: "https://hotel1-stay.com/contact", note: "ok", phone: null, formUrl: null, messagingUrl: null, method: "email", tier: "property", retryable: false },
        })
      ).toBe(true);
      const again = await mod.getActiveShortlist(user);
      expect(again?.items[0]).toMatchObject({ contactEmail: "stay@hotel1-stay.com", contactStatus: "verified" });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("invalidates the old shortlist when the trip changes, keeps it for the same trip", async () => {
    const { user, mod, sql } = await setup();
    try {
      await mod.saveShortlist({ canonicalUserId: user, destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-16", candidates: candidates(2) });
      await mod.invalidateStaleShortlist(user, { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-16" });
      expect(await mod.getActiveShortlist(user)).not.toBeNull();
      await mod.invalidateStaleShortlist(user, { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-17" });
      expect(await mod.getActiveShortlist(user)).toBeNull();
      await mod.saveShortlist({ canonicalUserId: user, destination: "Paris", checkIn: "2026-12-01", checkOut: "2026-12-03", candidates: candidates(1) });
      await mod.invalidateStaleShortlist(user, { destination: "paris ", checkIn: "2026-12-01", checkOut: "2026-12-03" });
      expect((await mod.getActiveShortlist(user))?.destination).toBe("Paris");
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("persists contact method, kind, phone, and form details", async () => {
    const { user, mod, sql } = await setup();
    try {
      await mod.saveShortlist({ canonicalUserId: user, destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-16", candidates: candidates(2) });
      const view = await mod.getActiveShortlist(user);
      expect(view).not.toBeNull();
      expect(
        await mod.saveContactResult({
          canonicalUserId: user,
          shortlistId: view!.id,
          position: 2,
          result: {
            status: "verified",
            email: null,
            phone: "+442079460000",
            formUrl: "https://hotel2-stay.com/contact",
            messagingUrl: null,
            method: "form",
            tier: "property",
            sourceUrl: "https://hotel2-stay.com/contact",
            note: "Official contact form found.",
            retryable: false,
          },
        })
      ).toBe(true);
      const again = await mod.getActiveShortlist(user);
      expect(again?.items[1]).toMatchObject({
        contactStatus: "verified",
        contactEmail: null,
        contactMethod: "form",
        contactKind: "property",
        contactPhone: "+442079460000",
        contactFormUrl: "https://hotel2-stay.com/contact",
      });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);
});
