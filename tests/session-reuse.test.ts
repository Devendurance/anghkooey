import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/session/route";
import { getSql } from "../src/server/db";
import { createWebSession, SESSION_COOKIE } from "../src/server/session";

const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const users: string[] = [];
const buckets: string[] = [];

function req(ip: string, token?: string) {
  const headers: Record<string, string> = { host: "localhost:3000", "x-forwarded-for": ip };
  if (token) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  return new Request("http://localhost:3000/api/session", { method: "POST", headers });
}

describe("POST /api/session reuse before rate limit (real Neon)", () => {
  afterAll(async () => {
    const sql = getSql();
    for (const b of buckets) await sql`delete from rate_limits where bucket_key = ${b}`.catch(() => []);
    for (const u of users) {
      await sql`delete from web_sessions where user_id = ${u}`.catch(() => []);
      await sql`delete from users where id = ${u}`.catch(() => []);
    }
  }, 60000);

  it("reuses a valid session repeatedly without consuming creation quota", async () => {
    const ip = `test-reuse-${t}`;
    buckets.push(`session:create:${ip}`);
    const created = await createWebSession();
    users.push(created.userId);
    for (let i = 0; i < 12; i++) {
      const res = await POST(req(ip, created.token));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ ok: true, reused: true, userId: created.userId });
    }
  }, 60000);

  it("rate-limits genuinely new session creation per IP", async () => {
    const ip = `test-new-${t}`;
    buckets.push(`session:create:${ip}`);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(req(ip));
      statuses.push(res.status);
      const body = await res.json();
      if (res.status === 201) {
        users.push(body.userId as string);
      }
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  }, 60000);

  it("expired sessions fall through to creation, not reuse", async () => {
    const ip = `test-exp-${t}`;
    buckets.push(`session:create:${ip}`);
    const res = await POST(req(ip, "f".repeat(64)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reused).toBe(false);
    users.push(body.userId as string);
  }, 60000);
});
