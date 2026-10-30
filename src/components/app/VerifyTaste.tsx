"use client";

import { useRef, useState } from "react";
import { call, errorMessage } from "@/lib/app-client";
import { TasteCard, type Candidate } from "@/components/app/Taste";
import type { VerifyVerdict } from "@/server/taste-verify";

type SlotChoice = { name: string; entity_id: string; kind: string };
type SlotEntity = { name: string; entity_id: string; kind: string };
type Slot =
  | { anchor: string; outcome: "resolved"; resolved: SlotEntity; searchTotal: number }
  | { anchor: string; outcome: "choices"; candidates: SlotChoice[]; searchTotal: number }
  | { anchor: string; outcome: "failed"; error: { code: string; message: string } };

type VerifyItemView = {
  proposed: string;
  verdict: VerifyVerdict;
  matchedEntityId: string | null;
  matchedName: string | null;
  reason: string;
  rank: number | null;
  evidence: {
    tags: string[] | null;
    affinity: number | null;
    matchedAnchorIds: string[] | null;
    address: string | null;
    description: string | null;
  } | null;
};

type VerifyResult = {
  anchors: string[];
  resolved: SlotEntity[];
  proposed: string[];
  city: string;
  candidates: Candidate[];
  verification: VerifyItemView[];
  coverage: { total: number; observed: number; review: number; notObserved: number };
  evidence: { anchorIds: string[]; candidateIds: string[]; city: string };
  limitations: string[];
  execution: { insightsRequests: number; returned: number; take: number };
};

const FRIENDLY: Record<string, string> = {
  qloo_no_match: "Qloo has no match for that anchor.",
  qloo_not_configured: "Verification is not configured on this server.",
  rate_limited: "Too many verifications. Slow down and retry.",
  rate_limit_unavailable: "Verification is temporarily unavailable. Try again shortly.",
  qloo_rate_limited: "Qloo is rate-limiting verification.",
  qloo_unauthorized: "This server's Qloo credentials were rejected.",
  qloo_unavailable: "Qloo is unreachable right now.",
  stale_selection: "A selection went stale. Resolve again and pick from the fresh lists.",
};

function friendly(code: string, fallback: string) {
  return FRIENDLY[code] ?? fallback;
}

function verdictLabel(v: VerifyVerdict) {
  return v === "OBSERVED" ? "OBSERVED" : v === "REVIEW" ? "REVIEW" : "NOT OBSERVED";
}

/** Evidence-gated verification: resolve 1–3 anchors, confirm each entity,
 * then verify up to 5 AI-proposed venues against ONE combined Insights run. */
export function VerifyTaste() {
  const [anchorInputs, setAnchorInputs] = useState<string[]>(["Nobu Restaurant", "Ryuichi Sakamoto"]);
  const [city, setCity] = useState("Lagos");
  const [proposedText, setProposedText] = useState("ILE EROS LAGOS\nNOK by Alara\nTalindo Steak House");
  const [busy, setBusy] = useState<"idle" | "resolving" | "verifying">("idle");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picks, setPicks] = useState<(SlotEntity | null)[]>([]);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [approval, setApproval] = useState<{ token: string; expiresAt: number } | null>(null);
  const [minting, setMinting] = useState(false);
  const [trace, setTrace] = useState<{ by: "you" | "server"; text: string; run: number }[]>([]);
  const runRef = useRef(0);
  const [runId, setRunId] = useState(0);

  function log(by: "you" | "server", text: string) {
    const run = runRef.current;
    setTrace((t) => [...t, { by, text, run }]);
  }

  async function mintApproval() {
    if (!result || minting) return;
    setMinting(true);
    setError(null);
    const r = await call("/api/tasteapproval", {
      method: "POST",
      body: JSON.stringify({
        anchors: result.anchors,
        entityIds: result.resolved.map((e) => e.entity_id),
        city: result.city,
        proposed: result.proposed,
        ops: ["verify", "investigate"],
      }),
    });
    setMinting(false);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: friendly(code, errorMessage(r)) });
      return;
    }
    const body = r.body as unknown as { approval: string; expiresAt: number };
    setApproval({ token: body.approval, expiresAt: body.expiresAt });
    log("you", "Minted short-lived MCP approval for these exact inputs (10 min, bearer for identical inputs, not one-time)");
  }

  function invalidate() {
    runRef.current += 1;
    setRunId(runRef.current);
    setApproval(null);
    setBusy("idle");
    setSlots(null);
    setPicks([]);
    setResult(null);
    setError(null);
  }

  function setAnchor(i: number, v: string) {
    setAnchorInputs((prev) => prev.map((x, j) => (j === i ? v : x)));
    invalidate();
  }

  function addAnchor() {
    if (anchorInputs.length >= 3) return;
    setAnchorInputs((prev) => [...prev, ""]);
    invalidate();
  }

  function removeAnchor(i: number) {
    if (anchorInputs.length <= 1) return;
    setAnchorInputs((prev) => prev.filter((_, j) => j !== i));
    invalidate();
  }

  function parsedProposed(): string[] {
    return proposedText.split("\n").map((s) => s.trim()).filter((s) => s.length > 0).slice(0, 5);
  }

  async function resolveAnchors() {
    if (busy !== "idle") return;
    const anchors = anchorInputs.map((s) => s.trim()).filter((s) => s.length > 0);
    if (anchors.length < 1 || !city.trim()) return;
    const run = runRef.current;
    setBusy("resolving");
    setError(null);
    setSlots(null);
    setPicks([]);
    setResult(null);
    log("you", `Approved resolving ${anchors.length} anchor${anchors.length === 1 ? "" : "s"} through Qloo Search`);
    const r = await call("/api/tasteverify", {
      method: "POST",
      body: JSON.stringify({ step: "resolve", anchors, city: city.trim() }),
    });
    if (run !== runRef.current) return;
    setBusy("idle");
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: friendly(code, errorMessage(r)) });
      return;
    }
    log("server", "Qloo Search executed — confirm one entity per anchor to continue");
    const body = r.body as unknown as { anchors: Slot[] };
    setSlots(body.anchors);
    setPicks(body.anchors.map(() => null));
  }

  function confirmPick(i: number, entity: SlotEntity) {
    setPicks((prev) => prev.map((p, j) => (j === i ? entity : p)));
    setResult(null);
    setError(null);
    setTrace((t) => [...t, { by: "you" as const, text: `Confirmed ${entity.name} [${entity.entity_id}] for anchor ${i + 1}`, run: runRef.current }]);
  }

  const allConfirmed =
    slots !== null && slots.length > 0 && picks.length === slots.length && picks.every((p) => p !== null);

  async function verify() {
    if (!slots || !allConfirmed || busy !== "idle") return;
    const entities = picks as SlotEntity[];
    const anchors = slots.map((s) => s.anchor);
    const proposed = parsedProposed();
    if (proposed.length < 1) {
      setError({ code: "invalid_input", message: "Add 1 to 5 proposed venues, one per line." });
      return;
    }
    const run = runRef.current;
    setBusy("verifying");
    setError(null);
    setResult(null);
    log("you", `Approved verification of ${proposed.length} proposed venue${proposed.length === 1 ? "" : "s"} in ${city.trim()}`);
    const r = await call("/api/tasteverify", {
      method: "POST",
      body: JSON.stringify({
        step: "verify",
        anchors,
        entityIds: entities.map((e) => e.entity_id),
        city: city.trim(),
        proposed,
      }),
    });
    if (run !== runRef.current) return;
    setBusy("idle");
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: friendly(code, errorMessage(r)) });
      return;
    }
    log("server", "Verification executed — one combined Qloo Insights request, deterministic comparison");
    setResult(r.body as unknown as VerifyResult);
  }

  const proposedCount = parsedProposed().length;

  return (
    <div className="mem-inner" aria-live="polite">
      <div className="mem-head">
        <p className="mem-eyebrow">TasteProof Verify · C1</p>
        <h1 className="mem-title">Verify AI-proposed venues against Qloo evidence</h1>
        <p className="mem-lead">
          Resolve 1–3 cultural anchors, confirm each entity, then check up to 5 proposed venues against one combined Qloo
          Insights request. OBSERVED means an exact match in this result set. NOT OBSERVED never means nonexistent or bad.
        </p>
      </div>

      <section aria-label="Anchors, city and shortlist">
        {anchorInputs.map((v, i) => (
          <div key={i} className="mem-search-form" style={{ marginBottom: 8 }}>
            <label className="mem-meta" htmlFor={`verify-anchor-${i}`}>
              Cultural anchor {i + 1}
            </label>
            <input
              id={`verify-anchor-${i}`}
              className="mem-input"
              value={v}
              onChange={(e) => setAnchor(i, e.target.value)}
              placeholder="Nobu Restaurant"
              maxLength={80}
              autoComplete="off"
            />
            {anchorInputs.length > 1 && (
              <button type="button" className="mem-seg" onClick={() => removeAnchor(i)} aria-label={`Remove anchor ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}
        {anchorInputs.length < 3 && (
          <button type="button" className="mem-seg" onClick={addAnchor}>
            Add anchor ({anchorInputs.length}/3)
          </button>
        )}
        <div className="mem-search-form" style={{ marginTop: 12 }}>
          <label className="mem-meta" htmlFor="verify-city">
            Destination city
          </label>
          <input
            id="verify-city"
            className="mem-input"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              invalidate();
            }}
            placeholder="Lagos"
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="mem-meta" htmlFor="verify-proposed">
            AI-proposed shortlist (1–5 venues, one per line)
          </label>
          <textarea
            id="verify-proposed"
            className="mem-textarea"
            value={proposedText}
            onChange={(e) => {
              setProposedText(e.target.value);
              setResult(null);
              setError(null);
            }}
            rows={5}
            maxLength={700}
            placeholder={"ILE EROS LAGOS\nNOK by Alara\nTalindo Steak House"}
          />
          <p className="mem-meta">{proposedCount}/5 venues · exact shortlist shown back before verification</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="mem-seg" onClick={resolveAnchors} disabled={busy !== "idle"}>
            {busy === "resolving" ? "Resolving…" : "Approve resolving via Qloo Search"}
          </button>
          <button type="button" className="mem-seg" onClick={invalidate} disabled={busy !== "idle"}>
            Start over
          </button>
        </div>
      </section>

      {error && (
        <div className="mem-error" role="alert" style={{ marginTop: 12 }}>
          <p>{error.message}</p>
          <button type="button" className="mem-seg" onClick={() => setError(null)}>
            Dismiss and retry
          </button>
        </div>
      )}

      {slots && (
        <section aria-label="Confirm anchor entities" style={{ marginTop: 16 }}>
          <h2 className="mem-h2">Confirm each anchor entity</h2>
          {slots.map((s, i) => (
            <div key={i} className="mem-card" style={{ marginTop: 8 }}>
              <p className="mem-meta">
                Anchor {i + 1}: “{s.anchor}”
              </p>
              {s.outcome === "failed" && <p className="mem-error">{s.error.message}</p>}
              {s.outcome === "resolved" && (
                <button type="button" className="mem-seg" onClick={() => confirmPick(i, s.resolved)} aria-pressed={picks[i]?.entity_id === s.resolved.entity_id}>
                  {picks[i]?.entity_id === s.resolved.entity_id ? "✓ " : ""}Confirm {s.resolved.name} [{s.resolved.entity_id}]
                </button>
              )}
              {s.outcome === "choices" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {s.candidates.map((c) => (
                    <button key={c.entity_id} type="button" className="mem-seg" onClick={() => confirmPick(i, c)} aria-pressed={picks[i]?.entity_id === c.entity_id}>
                      {picks[i]?.entity_id === c.entity_id ? "✓ " : ""}{c.name} [{c.entity_id}]
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {allConfirmed && (
            <div className="mem-card" style={{ marginTop: 12 }}>
              <p className="mem-meta">Confirmed anchors, city and shortlist</p>
              <p className="mem-fact">
                {(picks as SlotEntity[]).map((p) => p.name).join(" + ")} · {city.trim()} · {proposedCount} proposed
              </p>
              <p className="mem-meta">{parsedProposed().join(" · ")}</p>
              <button type="button" className="mem-seg" onClick={verify} disabled={busy !== "idle"} style={{ marginTop: 8 }}>
                {busy === "verifying" ? "Verifying…" : "Approve verification — run one combined Insights check"}
              </button>
            </div>
          )}
        </section>
      )}

      {result && (
        <section aria-label="Verification report" style={{ marginTop: 16 }}>
          <h2 className="mem-h2">Verification report</h2>
          <p className="mem-meta">
            {result.coverage.observed} observed · {result.coverage.review} review · {result.coverage.notObserved} not observed ·{" "}
            {result.coverage.total} total · one Insights request returned {result.execution.returned} venues
          </p>
          {result.verification.map((v) => (
            <div key={v.proposed} className="mem-card" style={{ marginTop: 8 }}>
              <p className="mem-meta">
                <span className="mem-badge">{verdictLabel(v.verdict)}</span> {v.proposed}
              </p>
              <p className="mem-fact">{v.reason}</p>
              {v.matchedName && (
                <p className="mem-meta">
                  Matched: {v.matchedName} [{v.matchedEntityId}] {v.rank !== null ? `· rank #${v.rank + 1}` : ""}
                </p>
              )}
              {v.evidence?.address && <p className="mem-meta">Address: {v.evidence.address}</p>}
              {v.evidence?.tags && (
                <p className="taste-tags">
                  {v.evidence.tags.slice(0, 6).map((t) => (
                    <span key={t} className="mem-badge">
                      {t}
                    </span>
                  ))}
                </p>
              )}
              {typeof v.evidence?.affinity === "number" && (
                <p className="mem-meta">Qloo affinity {v.evidence.affinity.toFixed(2)} — ranking signal only.</p>
              )}
            </div>
          ))}

          <h3 className="mem-h3" style={{ marginTop: 16 }}>Qloo evidence ({result.candidates.length})</h3>
          {result.candidates.map((c) => (
            <TasteCard key={c.entity_id} c={c} />
          ))}

          <div className="mem-card" style={{ marginTop: 12 }}>
            <p className="mem-meta">Evidence limitations</p>
            <ul>
              {result.limitations.map((l) => (
                <li key={l} className="mem-meta">{l}</li>
              ))}
            </ul>
            <p className="mem-meta" style={{ marginTop: 8 }}>
              Receipt: {result.anchors.join(" + ")} [{result.evidence.anchorIds.join(", ")}] · {result.evidence.city} · proposed{" "}
              {result.proposed.join(" | ")} · candidates [{result.evidence.candidateIds.join(", ")}] · single Insights ×{result.execution.insightsRequests}
            </p>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="mem-seg" onClick={mintApproval} disabled={minting}>
                {minting ? "Minting approval…" : approval ? "Re-mint MCP approval" : "Mint MCP approval for these inputs"}
              </button>
              {approval && (
                <p className="mem-meta" style={{ marginTop: 8, wordBreak: "break-all" }}>
                  MCP approval (10 min, input-bound, bearer for identical inputs, not one-time):{" "}
                  <code>{approval.token.slice(0, 48)}…{approval.token.slice(-12)}</code>
                </p>
              )}
            </div>
          </div>

          {trace.length > 0 && (
            <div className="mem-card" style={{ marginTop: 12 }}>
              <p className="mem-meta">Steps</p>
              <ol>
                {trace.filter((t) => t.run === runId).map((t, i) => (
                  <li key={i} className="mem-meta">{t.by === "you" ? "You approved" : "Server observed"}: {t.text}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
