import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { buildTasteMcpServer } from "@/server/taste-mcp-server";
import { clientIp } from "@/server/api";

const MAX_BODY_BYTES = 32 * 1024;

/** Trusted server-configured hosts only. Request headers (including
 * x-forwarded-host) never expand the allowlist: a forged forwarded-host
 * cannot authorize a request. Configure WEB_BASE_URL / VERCEL_URL for
 * public hosts; localhost entries cover local dev and QA. */
function allowedHosts(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const web = process.env.WEB_BASE_URL?.trim();
  if (web) {
    try {
      hosts.add(new URL(web).hostname);
    } catch {
      /* ignore malformed base */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    try {
      hosts.add(new URL(`https://${vercel}`).hostname);
    } catch {
      hosts.add(vercel.split("/")[0]);
    }
  }
  return [...hosts];
}

// Stateless Streamable HTTP MCP endpoint. Fresh McpServer per request;
// the handler holds no state between requests and scales horizontally.
// Header checks run in front (SDK-supported); approval artifact + fail-closed
// rate limits run inside tools. No bearer tokens; no unrestricted proxy.
const handler = createMcpHandler(({ requestInfo }) => {
  const req = requestInfo as Request | undefined;
  const ip = req ? clientIp(req) : "unknown";
  return buildTasteMcpServer(ip);
}, { responseMode: "json" });

function tooLarge() {
  return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Request body too large" }, id: null }, { status: 413 });
}

/** Read at most maxBytes+1 streamed bytes. Never buffers an unbounded body:
 * the reader is cancelled the moment the cap is exceeded, so a huge or
 * lying Content-Length cannot force full ingestion before rejection. */
async function readBoundedBody(req: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; response: Response }> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, response: tooLarge() };
  }
  const stream = req.body;
  if (!stream) return { ok: true, text: "" };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best effort */ }
        return { ok: false, response: tooLarge() };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Unreadable request body" }, id: null }, { status: 400 }) };
  } finally {
    try { reader.releaseLock(); } catch { /* already closed */ }
  }
  return { ok: true, text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8") };
}

export async function POST(req: Request) {
  // Enforce the cap on actual streamed bytes: the declared Content-Length
  // is untrusted (may be missing or wrong), so chunks are measured during
  // the read and the stream is cancelled the moment the cap is exceeded.
  const bounded = await readBoundedBody(req, MAX_BODY_BYTES);
  if (!bounded.ok) return bounded.response;
  const text = bounded.text;
  const hosts = allowedHosts();
  const hostRes = hostHeaderValidationResponse(req, hosts);
  if (hostRes) return hostRes;
  const originRes = originValidationResponse(req, hosts);
  if (originRes) return originRes;
  // Rebuild the request for the handler: the body stream was consumed above.
  const fwd = new Request(req.url, { method: req.method, headers: req.headers, body: text });
  return handler.fetch(fwd);
}

export async function GET() {
  return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Use POST for MCP requests" }, id: null }, { status: 405, headers: { Allow: "POST" } });
}
