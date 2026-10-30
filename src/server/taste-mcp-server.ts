// McpServer factory for TasteProof Verify (Option C / C2).
// Shared by the Streamable HTTP route and real-client protocol tests.
// Tools reuse C1's verification engine; no duplicated business logic.

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { mcpInvestigateGap, mcpVerifyShortlist } from "./taste-mcp";
import { VERIFY_LIMITATIONS } from "./taste-verify";

const AnchorSchema = z.string().trim().min(2).max(80);
const CitySchema = z.string().trim().min(2).max(80);
const IdSchema = z.string().trim().regex(/^[0-9A-Za-z-]{8,64}$/).refine((s) => /[0-9]/.test(s), "Must contain a digit");
const ProposedSchema = z.string().trim().min(2).max(120);
const ApprovalSchema = z.string().trim().min(16).max(8192);

const VerifyInput = z.object({
  approval: ApprovalSchema.describe("Server-minted approval artifact from POST /api/tasteapproval for these exact inputs"),
  anchors: z.array(AnchorSchema).min(1).max(3),
  entityIds: z.array(IdSchema).min(1).max(3),
  city: CitySchema,
  proposed: z.array(ProposedSchema).min(1).max(5),
});

const InvestigateInput = VerifyInput.extend({
  target: z.string().trim().min(2).max(120).describe("One approved proposed venue currently REVIEW or NOT_OBSERVED"),
});

export function buildTasteMcpServer(ip: string): McpServer {
  const server = new McpServer({ name: "anghkooey-tasteproof", version: "0.2.0" });

  server.registerTool(
    "tasteproof_capabilities",
    {
      title: "TasteProof capabilities",
      description: "Supported verification, verdict semantics, input limits, privacy and limitations. No Qloo calls.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        verification: z.string(),
        verdicts: z.object({ OBSERVED: z.string(), REVIEW: z.string(), NOT_OBSERVED: z.string() }),
        limits: z.object({ anchors: z.string(), venues: z.string(), bodyBytes: z.number(), approvalTtlMs: z.number(), investigateFollowups: z.string() }),
        privacy: z.string(),
        limitations: z.array(z.string()),
        approval: z.string(),
      }),
    },
    async () => {
      const output = {
        verification: "Resolve 1-3 cultural anchors via Qloo Search, confirm each entity, run ONE combined Qloo Insights, deterministically compare up to 5 proposed venues.",
        verdicts: {
          OBSERVED: "Exact normalized name match to exactly one entity returned by this specific Qloo query.",
          REVIEW: "Near-name match, ambiguous identity, or thin evidence. Never silently treated as observed.",
          NOT_OBSERVED: "Absent from this bounded returned result set. NOT proof the venue is nonexistent, closed, unsuitable or bad.",
        },
        limits: {
          anchors: "1 to 3 distinct anchors, 2-80 chars each",
          venues: "1 to 5 distinct proposed venues, 2-120 chars each",
          bodyBytes: 4096,
          approvalTtlMs: 600_000,
          investigateFollowups: "At most 1 additional Qloo Search per investigate_gap call, only for REVIEW/NOT_OBSERVED targets; original verdicts preserved",
        },
        privacy: "Only anchor/city strings reach Qloo Search and only confirmed entity IDs reach Insights. No Walrus memories, sessions, private identifiers or conversation history are sent. Approval secret never leaves the server and never appears in logs.",
        limitations: [...VERIFY_LIMITATIONS],
        approval: "All Qloo-backed tools require a server-minted HMAC approval from POST /api/tasteapproval for the exact anchors, IDs, city, shortlist and operation (10 min expiry, bearer for identical inputs until expiry, not one-time, tampering rejected, revalidated before provider calls).",
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
    }
  );

  server.registerTool(
    "tasteproof_verify_shortlist",
    {
      title: "Verify proposed venues",
      description: "Approval-gated C1 verification: revalidates anchors, runs ONE combined Insights, returns typed verdicts with evidence, coverage and execution trace.",
      inputSchema: VerifyInput,
      outputSchema: z.object({
        coverage: z.object({ total: z.number(), observed: z.number(), review: z.number(), notObserved: z.number() }),
        items: z.array(z.object({ proposed: z.string(), verdict: z.string(), matchedName: z.string().nullable(), matchedEntityId: z.string().nullable(), reason: z.string(), rank: z.number().nullable() })),
        candidateIds: z.array(z.string()),
        anchorIds: z.array(z.string()),
        city: z.string(),
        limitations: z.array(z.string()),
        execution: z.object({ insightsRequests: z.number(), providerCalls: z.number(), trace: z.array(z.object({ call: z.string(), status: z.string() })) }),
      }),
    },
    async (args) => {
      const r = await mcpVerifyShortlist(args, ip);
      if (!r.ok) {
        return { content: [{ type: "text" as const, text: `${r.code}: ${r.message}` }], isError: true };
      }
      const output = {
        coverage: r.report.coverage,
        items: r.report.items.map((i) => ({
          proposed: i.proposed,
          verdict: i.verdict,
          matchedName: i.matchedName,
          matchedEntityId: i.matchedEntityId,
          reason: i.reason,
          rank: i.rank,
        })),
        candidateIds: r.report.candidates.map((c) => c.entity_id),
        anchorIds: r.report.query.entityIds,
        city: r.report.query.city,
        limitations: r.report.limitations,
        execution: { insightsRequests: 1, providerCalls: r.providerCalls, trace: r.trace },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
    }
  );

  server.registerTool(
    "tasteproof_investigate_gap",
    {
      title: "Investigate an uncertain venue",
      description: "Bounded follow-up for REVIEW/NOT_OBSERVED targets only: recomputes verification, then at most ONE Qloo Search for the target. Original verdicts preserved; extra identity evidence reported separately.",
      inputSchema: InvestigateInput,
      outputSchema: z.object({
        eligible: z.boolean(),
        target: z.string(),
        targetVerdict: z.string().nullable(),
        additional: z.array(z.object({ name: z.string(), entity_id: z.string(), kind: z.string() })),
        note: z.string(),
        execution: z.object({ providerCalls: z.number(), trace: z.array(z.object({ call: z.string(), status: z.string() })) }),
      }),
    },
    async (args) => {
      const r = await mcpInvestigateGap(args, ip);
      if (!r.ok) {
        return { content: [{ type: "text" as const, text: `${r.code}: ${r.message}` }], isError: true };
      }
      const output = {
        eligible: r.eligible,
        target: r.target,
        targetVerdict: r.targetVerdict,
        additional: r.additional,
        note: r.note,
        execution: { providerCalls: r.providerCalls, trace: r.trace },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
    }
  );

  return server;
}
