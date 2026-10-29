"use client";

import { useState } from "react";
import { call, errorMessage, factText, shortBlob } from "@/lib/app-client";
import {
  anchorLooksNamed,
  buildTasteEvidence,
  guidanceFor,
  suggestAnchors,
  type MemoryPick,
} from "@/lib/taste-evidence";

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

type MemMatch = { blobId: string; text?: string; fact?: string; state?: string };

type MemPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "no-consent" }
  | { kind: "error"; message: string }
  | { kind: "matches"; matches: MemMatch[] };

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
  const [memQuery, setMemQuery] = useState("restaurant food dining");
  const [memPhase, setMemPhase] = useState<MemPhase>({ kind: "idle" });
  const [pick, setPick] = useState<MemoryPick | null>(null);

  const guidance = guidanceFor(anchor);
  const named = anchorLooksNamed(anchor);

  async function lookup() {
    const a = anchor.trim();
    if (!a) return;
    setPhase({ kind: "loading" });
    const params = new URLSearchParams({ anchor: a });
    if (city.trim()) params.set("city", city.trim());
    const r = await call(`/api/tasteproof?${params.toString()}`);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setPhase({ kind: "error", code, message: errorMessage(r) });
      return;
    }
    setPhase({ kind: "done", result: r.body as unknown as Result });
  }

  async function findMemories() {
    if (memQuery.trim().length < 2) return;
    setMemPhase({ kind: "loading" });
    const s = await call("/api/session", { method: "POST" });
    if (!s.ok) {
      setMemPhase({ kind: "failed" });
      return;
    }
    if (s.body.consent !== true) {
      setMemPhase({ kind: "no-consent" });
      return;
    }
    const r = await call("/api/memories/search", {
      method: "POST",
      body: JSON.stringify({ query: memQuery.trim() }),
    });
    if (!r.ok) {
      setMemPhase({
        kind: "error",
        message: r.status === 429 ? "Too many searches. Wait a minute, then try again." : errorMessage(r),
      });
      return;
    }
    setMemPhase({ kind: "matches", matches: (r.body.matches as MemMatch[]) ?? [] });
  }

  function attachMemory(m: MemMatch) {
    const stored = m.text ?? m.fact ?? "";
    const { domain, fact } = factText(stored);
    setPick({ fact: fact || stored, domain, blobId: m.blobId });
  }

  const evidence =
    phase.kind === "done" ? buildTasteEvidence(pick, phase.result) : null;

  return (
    <div className="mem-inner">
      <p className="mem-eyebrow">TasteProof · Slice 2</p>
      <h1 className="mem-h">One anchor, real cultural signal</h1>
      <p className="mem-lead">
        Supply one named cultural anchor, or pull one from your saved memories. Anghkooey
        resolves it through live Qloo Search and returns genuine Qloo dining candidates with
        inspectable evidence.
      </p>

      <section aria-labelledby="taste-memory-title" className="mem-card">
        <h2 id="taste-memory-title" className="mem-h">
          From my saved memories (optional)
        </h2>
        {pick ? (
          <div>
            <p className="mem-fact">“{pick.fact}”</p>
            <p className="mem-meta">
              Saved memory · {shortBlob(pick.blobId)}
              {pick.domain ? ` · ${pick.domain}` : ""}
            </p>
            {suggestAnchors(pick.fact).length > 0 && (
              <p className="mem-meta">
                Suggestions from its own words:{" "}
                {suggestAnchors(pick.fact).map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    className="app-btn app-btn-quiet"
                    onClick={() => setAnchor(sug)}
                  >
                    {sug}
                  </button>
                ))}
              </p>
            )}
            <button type="button" className="app-btn app-btn-glass" onClick={() => setPick(null)}>
              Use a manual anchor instead
            </button>
          </div>
        ) : memPhase.kind === "idle" ? (
          <div>
            <p className="mem-meta">
              Search your consented Walrus memories for a dining preference, then pick one to
              attach as evidence. Nothing is sent to Qloo until you approve a lookup below.
            </p>
            <div className="mem-filters">
              <label className="mem-label" htmlFor="taste-mem-q">
                Search my memories
                <input
                  id="taste-mem-q"
                  className="mem-input"
                  value={memQuery}
                  onChange={(e) => setMemQuery(e.target.value)}
                  placeholder="e.g. sushi, Italian, rooftop"
                  maxLength={200}
                  autoComplete="off"
                />
              </label>
              <button type="button" className="app-btn app-btn-glass" onClick={() => void findMemories()}>
                Search memories
              </button>
            </div>
          </div>
        ) : memPhase.kind === "loading" ? (
          <p className="mem-note" role="status">
            Recalling your memories…
          </p>
        ) : memPhase.kind === "failed" ? (
          <div className="mem-error" role="alert">
            <p className="mem-empty-title">Couldn&rsquo;t reach your session.</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => void findMemories()}>
              Try again
            </button>
          </div>
        ) : memPhase.kind === "no-consent" ? (
          <p className="mem-note">
            Memory is off for this browser session. Turn it on in{" "}
            <a className="chat-link" href="/settings">
              Settings
            </a>{" "}
            to use saved memories here. The manual anchor below keeps working.
          </p>
        ) : memPhase.kind === "error" ? (
          <div className="mem-error" role="alert">
            <p>{memPhase.message}</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => setMemPhase({ kind: "idle" })}>
              Back
            </button>
          </div>
        ) : memPhase.matches.length === 0 ? (
          <div>
            <p className="mem-meta">
              No close matches in your saved memories. Try different words, or use the manual
              anchor below.
            </p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => setMemPhase({ kind: "idle" })}>
              Search again
            </button>
          </div>
        ) : (
          <div>
            <ul className="mem-grid">
              {memPhase.matches.map((m) => (
                <li key={m.blobId} className="mem-card">
                  <p className="mem-fact">“{(m.text ?? m.fact ?? "").slice(0, 160)}”</p>
                  <p className="mem-meta">{shortBlob(m.blobId)}</p>
                  <button type="button" className="app-btn app-btn-quiet" onClick={() => attachMemory(m)}>
                    Use for TasteProof
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="app-btn app-btn-glass" onClick={() => setMemPhase({ kind: "idle" })}>
              Search again
            </button>
          </div>
        )}
      </section>

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
        <button
          type="submit"
          className="app-btn app-btn-primary"
          disabled={phase.kind === "loading" || anchor.trim().length < 2}
          title={
            pick
              ? `Approve Qloo lookup for “${anchor.trim()}”${city.trim() ? ` in ${city.trim()}` : ""}`
              : undefined
          }
        >
          {phase.kind === "loading" ? "Asking Qloo…" : "Find dining candidates"}
        </button>
      </form>

      <p className="mem-note">
        {pick ? (
          <>
            Approval: this sends exactly “{anchor.trim() || "…"}”
            {city.trim() ? ` plus “${city.trim()}”` : ""} to Qloo, an external cultural
            intelligence provider. It does not send your memory text, reasons, identifiers,
            or anything else.
          </>
        ) : (
          <>
            Lookup sends only the anchor name and city to Qloo. Nothing from your memories
            leaves this browser session.
          </>
        )}{" "}
        {guidance && named === false && <span>{guidance}</span>}
      </p>

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

      {phase.kind === "done" && phase.result.candidates.length > 0 && evidence && (
        <>
          <section aria-label="TasteProof evidence" className="mem-card">
            <h2 className="mem-h">Why this?</h2>
            {evidence.personal.fromMemory ? (
              <div>
                <p className="mem-eyebrow">Personal memory</p>
                <p className="mem-fact">“{evidence.personal.fact}”</p>
                <p className="mem-meta">
                  From your saved memory · {shortBlob(evidence.personal.blobId)}
                  {evidence.personal.domain ? ` · ${evidence.personal.domain}` : ""}
                </p>
              </div>
            ) : (
              <p className="mem-meta">{evidence.personal.note}</p>
            )}
            <p className="mem-eyebrow">Qloo evidence</p>
            <p className="mem-meta">
              “{phase.result.anchor}” → {phase.result.resolved.name} (
              {shortBlob(evidence.qloo.entityId)}) → {phase.result.candidates.length}{" "}
              {phase.result.candidates.length === 1 ? "candidate" : "candidates"}
              {phase.result.city ? ` · ${phase.result.city}` : ""}
            </p>
            <p className="mem-eyebrow">Not verified</p>
            <p className="mem-meta">{evidence.notVerified.join(" · ")}</p>
          </section>
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
