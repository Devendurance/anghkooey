import "dotenv/config";
import { randomUUID } from "node:crypto";

const BASE = (process.env.WEB_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TAG = `slice2-${Date.now().toString(36)}`;

type Jar = { cookie: string };
function cookieFrom(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const m = set.match(/anghkooey_sid=([^;]+)/);
  return m ? `anghkooey_sid=${m[1]}` : "";
}

async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { Cookie: jar.cookie } : {}), ...(init.headers ?? {}) },
  });
  const set = cookieFrom(res);
  if (set) jar.cookie = set;
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json: json as Record<string, unknown> | null };
}

function redactAnswer(a: string): { chars: number; mentionsGround: boolean; mentionsHigh: boolean } {
  return {
    chars: a.length,
    mentionsGround: /ground.floor/i.test(a),
    mentionsHigh: /high floor/i.test(a),
  };
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  // A. genuine test session
  const jarA: Jar = { cookie: "" };
  const sA = await api(jarA, "/api/session", { method: "POST", body: "{}" });
  if (sA.status !== 201 && sA.status !== 200) throw new Error(`A session failed: ${sA.status}`);
  const userA = (sA.json as Record<string, string>).userId;
  console.log(JSON.stringify({ step: "A_session", status: sA.status, hasUser: Boolean(userA), hasCookie: Boolean(jarA.cookie) }));

  // B. explicit consent
  const consent = await api(jarA, "/api/settings", { method: "PATCH", body: JSON.stringify({ consent: true }) });
  if (consent.json?.consent !== true) throw new Error("B consent failed");
  console.log(JSON.stringify({ step: "B_consent", consent: true }));

  // C+D. real hotel preference via DeepSeek
  const pref = `I prefer ground-floor hotel rooms with garden access for my ${TAG} trip because I like stepping outside in the morning. SOURCE: stated directly by the user.`;
  const chat1 = await api(jarA, "/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: pref, idempotencyKey: `pref-${runId}` }),
  });
  if (chat1.status !== 200) throw new Error(`C chat failed: ${chat1.status} ${JSON.stringify(chat1.json)?.slice(0, 300)}`);
  const j1 = chat1.json as Record<string, unknown>;
  console.log(JSON.stringify({
    step: "CD_chat",
    saves: j1.saves, saveStatus: j1.saveStatus,
    receipts: Array.isArray(j1.memoryReceipts) ? (j1.memoryReceipts as unknown[]).length : 0,
    answerChars: typeof j1.answer === "string" ? j1.answer.length : 0,
    model: j1.model,
  }));

  // E. confirm Walrus write via metadata
  const mem1 = await api(jarA, "/api/memories", { method: "GET" });
  const list1 = (mem1.json?.memories ?? []) as { blobId: string; state: string }[];
  const active1 = list1.filter((m) => m.state === "active");
  console.log(JSON.stringify({ step: "E_memories", total: list1.length, active: active1.length, blobIds: active1.slice(0, 3).map((m) => m.blobId) }));
  if (active1.length === 0) throw new Error("E no confirmed memories; extraction may need retry with clearer preference");

  // F+G. new conversation recalls earlier preference
  const chat2 = await api(jarA, "/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Which floor level should I pick for my hotel room?", idempotencyKey: `recall-${runId}` }),
  });
  const j2 = chat2.json as Record<string, unknown>;
  const ans2 = typeof j2.answer === "string" ? j2.answer : "";
  console.log(JSON.stringify({
    step: "FG_recall",
    receipts: Array.isArray(j2.memoryReceipts) ? (j2.memoryReceipts as string[]).length : 0,
    receiptBlobs: Array.isArray(j2.memoryReceipts) ? (j2.memoryReceipts as { blobId: string }[]).slice(0, 2).map((r) => r.blobId) : [],
    answer: redactAnswer(ans2),
  }));

  // H. correct the preference (new durable write, old superseded)
  const target = active1[0];
  const corr = await api(jarA, `/api/memories/${encodeURIComponent(target.blobId)}`, {
    method: "PATCH",
    body: JSON.stringify({ text: `I now prefer high-floor hotel rooms with a view for my ${TAG} trip.`, category: "hotel" }),
  });
  if (corr.status !== 200) throw new Error(`H correction failed: ${corr.status} ${JSON.stringify(corr.json)?.slice(0, 300)}`);
  console.log(JSON.stringify({ step: "H_corrected", oldBlob: target.blobId, newBlob: (corr.json as Record<string, string>).newBlobId }));

  // I. corrected preference respected in fresh conversation
  const chat3 = await api(jarA, "/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Remind me: high floor or ground floor for my room?", idempotencyKey: `verify-${runId}` }),
  });
  const j3 = chat3.json as Record<string, unknown>;
  const ans3 = typeof j3.answer === "string" ? j3.answer : "";
  const mem3 = await api(jarA, "/api/memories?state=all", { method: "GET" });
  const list3 = (mem3.json?.memories ?? []) as { blobId: string; state: string }[];
  console.log(JSON.stringify({
    step: "I_verify",
    answer: redactAnswer(ans3),
    states: list3.slice(0, 4).map((m) => ({ blob: m.blobId.slice(0, 8), state: m.state })),
  }));

  // J. isolation: second user cannot see first user's memory
  const jarB: Jar = { cookie: "" };
  await api(jarB, "/api/session", { method: "POST", body: "{}" });
  await api(jarB, "/api/settings", { method: "PATCH", body: JSON.stringify({ consent: true }) });
  const chatB = await api(jarB, "/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Which floor level should I pick for my hotel room?", idempotencyKey: `iso-${runId}` }),
  });
  const memB = await api(jarB, "/api/memories", { method: "GET" });
  const listB = (memB.json?.memories ?? []) as { blobId: string }[];
  const leak = listB.some((m) => list3.some((a) => a.blobId === m.blobId));
  const bReceipts = (chatB.json?.memoryReceipts ?? []) as { blobId: string }[];
  const receiptLeak = bReceipts.some((r) => list3.some((a) => a.blobId === r.blobId));
  console.log(JSON.stringify({
    step: "J_isolation",
    userBMemories: listB.length, crossLeak: leak, receiptLeak,
    isolated: !leak && !receiptLeak,
  }));
  if (leak || receiptLeak) throw new Error("J isolation failed");

  console.log(JSON.stringify({ step: "smoke_api_ok", runId }));
}

main().catch((e) => {
  console.error(JSON.stringify({ step: "smoke_api_failed", message: String(e).slice(0, 500) }));
  process.exit(1);
});
