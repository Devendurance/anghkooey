"use client";

import { useState } from "react";
import { call, errorMessage, shortBlob } from "@/lib/app-client";

type Candidate = {
  name: string;
  entity_id: string;
  kind: string;
  place: string | null;
  explanation: string | null;
};

type Result = {
  anchor: string;
  city: string | null;
  resolved: { name: string; entity_id: string; kind: string };
  searchTotal: number;
  candidates: Candidate[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "done"; result: Result };

const FRIENDLY: Record<string, string> = {
  qloo_no_match: "Qloo has no match for that anchor.",
  qloo_not_configured: "Taste lookup is not configured on this server.",
  rate_limited: "Too many lookups. Slow down and retry.",
  qloo_rate_limited: "Qloo is rate-limiting taste lookups.",
  qloo_unauthorized: "This server's Qloo credentials were rejected.",
  qloo_unavailable: "Qloo is unreachable right now.",
};

export function Taste() {
  const [anchor, setAnchor] = useState("Nobu Restaurant");
  const [city, setCity] = useState("Lagos");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function lookup() {
    setPhase({ kind: "loading" });
    const params = new URLSearchParams({ anchor: anchor.trim() });
    if (city.trim()) params.set("city", city.trim());
    const r = await call(`/api/tasteproof?${params.toString()}`);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setPhase({ kind: "error", code, message: errorMessage(r) });
      return;
    }
    const b = r.body as unknown as Result;
    setPhase({ kind: "done", result: b });
  }

  return (
    <div className="mem-inner">
      <p className="mem-eyebrow">TasteProof · Slice 1</p>
      <h1 className="mem-h">One anchor, real cultural signal</h1>
      <p className="mem-lead">
        Supply one named cultural anchor. Anghkooey resolves it through live Qloo Search and
        returns genuine Qloo dining candidates with inspectable evidence.
      </p>
      <p className="mem-note">
        Manually supplied anchor · not from saved memory. Lookup sends only the anchor name
        and city to Qloo. Nothing from your memories leaves this browser session.
      </p>

      <form
        className="mem-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <label className="mem-label" htmlFor="taste-anchor">
          Cultural anchor
          <input
            id="taste-anchor"
            className="mem-input"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            placeholder="Nobu Restaurant"
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <label className="mem-label" htmlFor="taste-city">
          City (optional)
          <input
            id="taste-city"
            className="mem-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Lagos"
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <button type="submit" className="app-btn app-btn-primary" disabled={phase.kind === "loading"}>
          {phase.kind === "loading" ? "Asking Qloo…" : "Find dining candidates"}
        </button>
      </form>

      {phase.kind === "loading" && (
        <p className="mem-note" role="status">
          Resolving the anchor, then asking Qloo Insights…
        </p>
      )}

      {phase.kind === "error" && (
        <div className="mem-error" role="alert">
          <p className="mem-empty-title">{FRIENDLY[phase.code] ?? "Something went wrong."}</p>
          <p className="mem-meta">
            {phase.message} ({phase.code})
          </p>
        </div>
      )}

      {phase.kind === "done" && phase.result.candidates.length === 0 && (
        <div className="mem-empty">
          <p className="mem-empty-title">Qloo returned no candidates</p>
          <p className="mem-meta">
            Anchor “{phase.result.anchor}” resolved to {phase.result.resolved.name}, but Insights
            came back empty for this city. Try another city or anchor.
          </p>
        </div>
      )}

      {phase.kind === "done" && phase.result.candidates.length > 0 && (
        <>
          <div className="mem-note" aria-label="Evidence path">
            Evidence: “{phase.result.anchor}” → {phase.result.resolved.name} (
            {shortBlob(phase.result.resolved.entity_id)}) → {phase.result.candidates.length}{" "}
            Qloo {phase.result.candidates.length === 1 ? "candidate" : "candidates"}
            {phase.result.city ? ` · ${phase.result.city}` : ""}
          </div>
          <div className="mem-grid">
            {phase.result.candidates.map((c) => (
              <article key={c.entity_id} className="mem-card">
                <div className="mem-card-top">
                  <h2 className="mem-h">{c.name}</h2>
                  <p className="mem-meta">
                    {c.kind}
                    {c.place ? ` · ${c.place}` : ""} · {shortBlob(c.entity_id)}
                  </p>
                </div>
                <p className="mem-fact">
                  {c.explanation ?? "Qloo explanation: Not available."}
                </p>
                <p className="mem-meta">Returned by Qloo Insights. Availability, prices and bookings are not verified.</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
