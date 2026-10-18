import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GmailError,
  buildAuthorizeUrl,
  decryptForUser,
  encryptForUser,
  exchangeCode,
  fetchGoogleMailbox,
  gmailEnv,
  pkceChallenge,
} from "../src/server/gmail";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GMAIL_TOKEN_KEY: process.env.GMAIL_TOKEN_KEY,
    WEB_BASE_URL: process.env.WEB_BASE_URL,
  };
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_TOKEN_KEY = TEST_KEY;
  process.env.WEB_BASE_URL = "https://example.com";
  vi.clearAllMocks();
  return () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
});

describe("gmail crypto envelope (no DB, no network)", () => {
  it("round-trips a refresh token", () => {
    const enc = encryptForUser("ya29.refresh-token-value", "user-1", "refresh");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("ya29.refresh-token-value");
    expect(decryptForUser(enc, "user-1", "refresh")).toBe("ya29.refresh-token-value");
  });

  it("rejects tampered ciphertext, wrong owner, wrong purpose, and wrong key", () => {
    const enc = encryptForUser("secret-value", "user-1", "refresh");
    const tampered = `${enc.slice(0, -2)}AB`;
    expect(() => decryptForUser(tampered, "user-1", "refresh")).toThrow();
    expect(() => decryptForUser(enc, "user-2", "refresh")).toThrow();
    expect(() => decryptForUser(enc, "user-1", "access")).toThrow();
    process.env.GMAIL_TOKEN_KEY = OTHER_KEY;
    expect(() => decryptForUser(enc, "user-1", "refresh")).toThrow();
  });

  it("fails closed without a valid token key", () => {
    delete process.env.GMAIL_TOKEN_KEY;
    expect(() => encryptForUser("x", "u", "refresh")).toThrow();
    process.env.GMAIL_TOKEN_KEY = "short";
    expect(() => encryptForUser("x", "u", "refresh")).toThrow();
  });

  it("matches the RFC 7636 PKCE test vector shape", () => {
    // Verified against openssl: SHA-256 of the RFC appendix-B verifier.
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
});

describe("gmail authorize URL (no DB, no network)", () => {
  it("requests only identity plus gmail.send, offline, S256, and no secret", () => {
    const url = buildAuthorizeUrl({ clientId: "test-client-id", state: "s", challenge: "c" });
    expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("test-client-id");
    expect(q.get("redirect_uri")).toBe("https://example.com/api/gmail/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(q.get("scope")).toContain("openid");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("state")).toBe("s");
    expect(url).not.toContain("test-client-secret");
  });

  it("reports not_configured when credentials are absent", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(gmailEnv().configured).toBe(false);
  });
});

describe("gmail token exchange and mailbox (stubbed fetch, no DB)", () => {
  const okToken = (over: Record<string, unknown> = {}) =>
    (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_in: 3599,
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
        ...over,
      }),
    })) as unknown as (url: string, init?: RequestInit) => Promise<Response>;

  it("returns tokens on success and null refresh when Google omits it", async () => {
    const full = await exchangeCode({ code: "c", verifier: "v", fetchFn: okToken() });
    expect(full.refreshToken).toBe("1//refresh");
    const missing = await exchangeCode({ code: "c", verifier: "v", fetchFn: okToken({ refresh_token: undefined }) });
    expect(missing.refreshToken).toBeNull();
  });

  it("maps provider errors without leaking the client secret", async () => {
    const bad = await exchangeCode({
      code: "c",
      verifier: "v",
      fetchFn: (async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant", error_description: "Bad request" }),
      })) as unknown as (url: string, init?: RequestInit) => Promise<Response>,
    }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GmailError);
    expect((bad as GmailError).code).toBe("exchange_failed");
    expect(String((bad as Error).message)).not.toContain("test-client-secret");
  });

  it("maps rate limits and network failures distinctly", async () => {
    const limited = await exchangeCode({
      code: "c",
      verifier: "v",
      fetchFn: (async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error_description: "Rate limit exceeded, slow down" }),
      })) as unknown as (url: string, init?: RequestInit) => Promise<Response>,
    }).catch((e: unknown) => e);
    expect((limited as GmailError).code).toBe("rate_limited");
    const down = await exchangeCode({
      code: "c",
      verifier: "v",
      fetchFn: async () => {
        throw new Error("socket hang up");
      },
    }).catch((e: unknown) => e);
    expect((down as GmailError).code).toBe("provider_unavailable");
  });

  it("accepts only verified mailboxes", async () => {
    const good = await fetchGoogleMailbox(
      "ya29.access",
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ email: "owner@gmail.com", email_verified: true }),
      })) as unknown as (url: string, init?: RequestInit) => Promise<Response>
    );
    expect(good).toBe("owner@gmail.com");
    const unverified = await fetchGoogleMailbox(
      "ya29.access",
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ email: "owner@gmail.com", email_verified: false }),
      })) as unknown as (url: string, init?: RequestInit) => Promise<Response>
    ).catch((e: unknown) => e);
    expect((unverified as GmailError).code).toBe("mailbox_unverified");
  });
});

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

dbSuite("gmail connection authorization boundaries (real Neon, throwaway identities)", () => {
  it("issues, consumes once, and rejects cross-user and expired states", async () => {
    const { createUser } = await import("../src/server/session");
    const { consumeOAuthState, issueOAuthState } = await import("../src/server/gmail");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const alice = await createUser();
    const bob = await createUser();
    try {
      const first = await issueOAuthState(alice);
      expect(first.state).toMatch(/^[0-9a-f]{64}$/);
      const used = await consumeOAuthState(first.state, alice);
      expect(used.userId).toBe(alice);
      expect(used.verifier.length).toBeGreaterThan(20);
      await expect(consumeOAuthState(first.state, alice)).rejects.toMatchObject({ code: "invalid_state" });

      const foreign = await issueOAuthState(alice);
      await expect(consumeOAuthState(foreign.state, bob)).rejects.toMatchObject({ code: "invalid_state" });

      const stale = await issueOAuthState(alice);
      await sql`update gmail_oauth_states set expires_at = now() - interval '1 minute' where user_id = ${alice}`;
      await expect(consumeOAuthState(stale.state, alice)).rejects.toMatchObject({ code: "invalid_state" });
    } finally {
      await sql`delete from users where id in (${alice}, ${bob})`;
    }
  }, 60000);

  it("stores only ciphertext and disconnects cleanly", async () => {
    const { createUser } = await import("../src/server/session");
    const { disconnectGmail, getGmailOwnerCredentials, getGmailStatus, saveGmailConnection } =
      await import("../src/server/gmail");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    const stranger = await createUser();
    const refresh = "1//refresh-token-abc123";
    try {
      await saveGmailConnection({
        canonicalUserId: user,
        email: "owner@gmail.com",
        refreshToken: refresh,
        accessToken: "ya29.access",
        accessExpiresIn: 3600,
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
      });
      const rows = await sql`select enc_refresh_token, enc_access_token from gmail_connections where user_id = ${user}`;
      expect(String(rows[0].enc_refresh_token)).not.toContain(refresh);
      expect(String(rows[0].enc_access_token)).not.toContain("ya29.access");
      const status = await getGmailStatus(user);
      expect(status).toMatchObject({ connected: true, email: "owner@gmail.com" });
      expect(await getGmailStatus(stranger)).toMatchObject({ connected: false });
      expect(await getGmailOwnerCredentials(stranger)).toBeNull();
      expect(await getGmailOwnerCredentials(user)).toMatchObject({ email: "owner@gmail.com", refreshToken: refresh });
      expect(await disconnectGmail(user)).toMatchObject({ disconnected: true });
      expect(await getGmailStatus(user)).toMatchObject({ connected: false });
      expect(await disconnectGmail(user)).toMatchObject({ disconnected: false });
    } finally {
      await sql`delete from users where id in (${user}, ${stranger})`;
    }
  }, 60000);
});
