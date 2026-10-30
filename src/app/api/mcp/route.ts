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

export async function POST(req: Request) {
  // Enforce the cap on actual request bytes: the declared Content-Length
  // is untrusted (may be missing or wrong), so the body is always read
  // and measured before dispatch.
  let text: string;
  try {
    text = await req.text();
  } catch {
    return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Unreadable request body" }, id: null }, { status: 400 });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Request body too large" }, id: null }, { status: 413 });
  }
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
