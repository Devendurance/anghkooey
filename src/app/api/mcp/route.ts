import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { buildTasteMcpServer } from "@/server/taste-mcp-server";
import { clientIp } from "@/server/api";

const MAX_BODY_BYTES = 32 * 1024;

function allowedHosts(req: Request): string[] {
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
  const fwd = req.headers.get("x-forwarded-host")?.split(",")[0].trim();
  if (fwd) hosts.add(fwd.split(":")[0]);
  const host = req.headers.get("host")?.split(":")[0].trim();
  if (host && (hosts.has(host) || (!web && !vercel))) hosts.add(host);
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
  const len = req.headers.get("content-length");
  if (len && Number(len) > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Request body too large" }, id: null }, { status: 413 });
  }
  const hosts = allowedHosts(req);
  const hostRes = hostHeaderValidationResponse(req, hosts);
  if (hostRes) return hostRes;
  const originRes = originValidationResponse(req, hosts);
  if (originRes) return originRes;
  return handler.fetch(req);
}

export async function GET() {
  return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Use POST for MCP requests" }, id: null }, { status: 405, headers: { Allow: "POST" } });
}
