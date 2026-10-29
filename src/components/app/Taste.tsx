"use client";

import { useState } from "react";
import { call, errorMessage, factText, shortBlob } from "@/lib/app-client";
import { MultiTaste } from "@/components/app/MultiTaste";
import {
  anchorLooksNamed,
  buildTasteEvidence,
  compareTasteCandidates,
  guidanceFor,
  suggestAnchors,
  type MemoryPick,
  type TasteComparison,
} from "@/lib/taste-evidence";

type Choice = { name: string; entity_id: string; kind: string };

export type Candidate = {
  name: string;
  entity_id: string;
  kind: string;
  place: string | null;
  explanation: string | null;
  imageUrl?: string | null;
  evidence?: {
    tags: string[] | null;
    affinity: number | null;
    matchedAnchorId: string | null;
    matchedAnchorIds?: string[] | null;
    address: string | null;
    description: string | null;
  } | null;
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

type Correction = {
  before: Result;
  after: Result;
  beforeAnchor: string;
  afterAnchor: string;
  comparison: TasteComparison;
};

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
  rate_limit_unavailable: "Taste lookup is temporarily unavailable. Try again shortly.",
  qloo_rate_limited: "Qloo is rate-limiting taste lookups.",
  qloo_unauthorized: "This server's Qloo credentials were rejected.",
  qloo_unavailable: "Qloo is unreachable right now.",
  qloo_ambiguous: "Qloo found several matches. Pick the intended one below.",
  stale_selection: "That selection is stale. Resolve again and pick from the fresh candidates.",
};

/** Venue card: real Qloo photo when supplied (entity-matched server-side),
 * branded no-photo state otherwise. Never substitutes an unrelated photo. */
export function TasteCard({ c }: { c: Candidate }) {
  const [imgFailed, setImgFailed] = useState(false);
  const ev = c.evidence ?? null;
  const showImg = !!c.imageUrl && !imgFailed;
  return (
    <article className="mem-card taste-card">
      {showImg ? (
        <img
          className="taste-photo"
          src={c.imageUrl as string}
          alt={`Photo of ${c.name} via Qloo`}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="taste-noimg" aria-hidden="true">
          <span>{c.name.slice(0, 1)}</span>
        </div>
      )}
      <div className="mem-card-top">
        <h2 className="mem-h">{c.name}</h2>
      </div>
      <p className="mem-meta">
        {c.kind}
        {ev?.address ? ` · ${ev.address}` : c.place ? ` · ${c.place}` : ""} · {shortBlob(c.entity_id)}
      </p>
      {ev?.description && <p className="mem-fact">{ev.description}</p>}
      {ev?.tags && (
        <p className="taste-tags">
          {ev.tags.slice(0, 6).map((t) => (
            <span key={t} className="mem-badge">
              {t}
            </span>
          ))}
        </p>
      )}
      {typeof ev?.affinity === "number" && (
        <p className="mem-meta">
          Qloo affinity {ev.affinity.toFixed(2)} — Qloo&apos;s ranking signal, not a match percentage.
        </p>
      )}
      <p className="mem-meta">
        Qloo discovery{c.imageUrl ? " · Photo: Qloo" : ""} · Availability, prices and bookings are not verified.
      </p>
    </article>
  );
}

export function Taste() {
  const [anchor, setAnchor] = useState("Nobu Restaurant");
  const [city, setCity] = useState("Lagos");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [memQuery, setMemQuery] = useState("restaurant food dining");
  const [memPhase, setMemPhase] = useState<MemPhase>({ kind: "idle" });
  const [pick, setPick] = useState<MemoryPick | null>(null);
  const [correctionInput, setCorrectionInput] = useState("");
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState<{ code: string; message: string } | null>(null);
  const [resolution, setResolution] = useState<{
    entity: { name: string; entity_id: string; kind: string };
    searchTotal: number;
  } | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [correctionRes, setCorrectionRes] = useState<{
    anchor: string;
    entity: { name: string; entity_id: string; kind: string } | null;
    choices: Choice[];
  } | null>(null);

  const guidance = guidanceFor(anchor);
  const named = anchorLooksNamed(anchor);

  async function lookup() {
    const a = anchor.trim();
    if (!a) return;
    setPhase({ kind: "loading" });
    setCorrection(null);
    setCorrectionError(null);
    setResolution(null);
    setChoices(null);
    const params = new URLSearchParams({ anchor: a });
    if (city.trim()) params.set("city", city.trim());
    const r = await call(`/api/tasteproof?${params.toString()}`);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setPhase({ kind: "error", code, message: errorMessage(r) });
      return;
    }
    const body = r.body as unknown as
      | { stage: "resolved"; resolved: { name: string; entity_id: string; kind: string }; searchTotal: number }
      | { stage: "choices"; candidates: Choice[] };
    if (body.stage === "choices") {
      setChoices(body.candidates);
      setPhase({ kind: "idle" });
      return;
    }
    setResolution({ entity: body.resolved, searchTotal: body.searchTotal });
    setPhase({ kind: "idle" });
  }

  async function confirmLookup(entityId: string) {
    const a = anchor.trim();
    if (!a) return;
    setPhase({ kind: "loading" });
    const params = new URLSearchParams({ anchor: a });
    if (city.trim()) params.set("city", city.trim());
    params.set("entityId", entityId);
    const r = await call(`/api/tasteproof?${params.toString()}`);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setResolution(null);
      setChoices(null);
      setPhase({ kind: "error", code, message: errorMessage(r) });
      return;
    }
    setResolution(null);
    setChoices(null);
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

  async function approveCorrection() {
    if (phase.kind !== "done" || correcting) return;
    const revised = correctionInput.trim();
    if (revised.length < 2) return;
    setCorrecting(true);
    setCorrectionError(null);
    setCorrectionRes(null);
    const params = new URLSearchParams({ anchor: revised });
    if (city.trim()) params.set("city", city.trim());
    const r = await call(`/api/tasteproof?${params.toString()}`);
    setCorrecting(false);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setCorrectionError({ code, message: errorMessage(r) });
      return;
    }
    const body = r.body as unknown as
      | { stage: "resolved"; resolved: { name: string; entity_id: string; kind: string } }
      | { stage: "choices"; candidates: Choice[] };
    if (body.stage === "choices") {
      setCorrectionRes({ anchor: revised, entity: null, choices: body.candidates });
      return;
    }
    setCorrectionRes({ anchor: revised, entity: body.resolved, choices: [] });
  }

  async function confirmCorrection(entityId: string) {
    if (phase.kind !== "done" || !correctionRes) return;
    setCorrecting(true);
    setCorrectionError(null);
    const params = new URLSearchParams({ anchor: correctionRes.anchor });
    if (city.trim()) params.set("city", city.trim());
    params.set("entityId", entityId);
    const r = await call(`/api/tasteproof?${params.toString()}`);
    setCorrecting(false);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setCorrectionRes(null);
      setCorrectionError({ code, message: errorMessage(r) });
      return;
    }
    const after = r.body as unknown as Result;
    const comparison = compareTasteCandidates(
      phase.result.candidates.map((c) => c.entity_id),
      after.candidates.map((c) => c.entity_id)
    );
    setCorrection({
      before: phase.result,
      after,
      beforeAnchor: phase.result.anchor,
      afterAnchor: after.anchor,
      comparison,
    });
    setAnchor(after.anchor);
    setPhase({ kind: "done", result: after });
    setCorrectionRes(null);
    setCorrectionInput("");
  }

  function undoCorrection() {
    if (!correction) return;
    setAnchor(correction.beforeAnchor);
    setPhase({ kind: "done", result: correction.before });
    setCorrection(null);
    setCorrectionError(null);
    setCorrectionInput("");
    setCorrectionRes(null);
    setResolution(null);
    setChoices(null);
  }

  const evidence =
    phase.kind === "done" ? buildTasteEvidence(pick, phase.result) : null;

  return (
    <div className="mem-inner">
      <p className="mem-eyebrow">TasteProof · Verified Qloo discovery</p>
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
            onChange={(e) => {
              setAnchor(e.target.value);
              setResolution(null);
              setChoices(null);
            }}
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
            Approval: this resolves “{anchor.trim() || "…"}”
            {city.trim() ? ` plus “${city.trim()}”` : ""} through Qloo Search, then — only on your confirmation — fetches dining candidates. It never sends your memory text, reasons, identifiers,
            or anything else.
          </>
        ) : (
          <>
            Lookup first resolves the anchor name through Qloo Search; candidates load only after you confirm. Nothing from your memories
            leaves this browser session.
          </>
        )}{" "}
        {guidance && named === false && <span>{guidance}</span>}
      </p>

      {phase.kind === "idle" && (resolution || choices) && (
        <section aria-label="TasteProof resolution" className="mem-card">
          {resolution && (
            <div>
              <p className="mem-meta">
                Qloo resolved “{anchor.trim()}” → {resolution.entity.name} (
                {shortBlob(resolution.entity.entity_id)}) · {resolution.searchTotal}{" "}
                {resolution.searchTotal === 1 ? "search hit" : "search hits"}.
              </p>
              <p className="mem-meta">
                Confirm to fetch dining candidates. No Insights lookup has run yet.
              </p>
              <button type="button" className="app-btn app-btn-primary" onClick={() => void confirmLookup(resolution.entity.entity_id)}>
                Show dining candidates
              </button>
            </div>
          )}
          {choices && (
            <div>
              <p className="mem-meta">
                Qloo found several matches for “{anchor.trim()}”. Pick the intended one — only the chosen entity runs Insights.
              </p>
              <div className="mem-filters">
                {choices.map((c) => (
                  <button key={c.entity_id} type="button" className="app-btn app-btn-glass" onClick={() => void confirmLookup(c.entity_id)}>
                    {c.name} · {c.kind}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {phase.kind === "loading" && (
        <p className="mem-note" role="status">
          Resolving the anchor…
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
              <TasteCard key={c.entity_id} c={c} />
            ))}
          </div>
          <section aria-labelledby="taste-correction-title" className="mem-card">
            <h2 id="taste-correction-title" className="mem-h">
              Correct this taste (session only)
            </h2>
            {correction ? (
              <div>
                <section aria-label="Correction comparison">
                  <p className="mem-meta">
                    Before: “{correction.beforeAnchor}” → {correction.before.resolved.name} (
                    {shortBlob(correction.before.resolved.entity_id)}) · {correction.before.candidates.length}{" "}
                    {correction.before.candidates.length === 1 ? "candidate" : "candidates"}
                  </p>
                  <p className="mem-meta">
                    After: “{correction.afterAnchor}” → {correction.after.resolved.name} (
                    {shortBlob(correction.after.resolved.entity_id)}) · {correction.after.candidates.length}{" "}
                    {correction.after.candidates.length === 1 ? "candidate" : "candidates"}
                  </p>
                  {correction.comparison.unchanged ? (
                    <p className="mem-meta">
                      No measurable change: Qloo returned the same candidates in the same order for the revised anchor.
                    </p>
                  ) : (
                    <div>
                      <p className="mem-meta">
                        Changed: {correction.comparison.added.length} added ·{" "}
                        {correction.comparison.removed.length} removed
                        {correction.comparison.reordered ? " · order changed" : " · order kept"}.
                        Comparison uses only real Qloo IDs and ordering.
                      </p>
                      {correction.comparison.added.length > 0 && (
                        <p className="mem-meta">
                          Added:{" "}
                          {correction.comparison.added
                            .map((id) => correction.after.candidates.find((c) => c.entity_id === id)?.name ?? shortBlob(id))
                            .join(" · ")}
                        </p>
                      )}
                      {correction.comparison.removed.length > 0 && (
                        <p className="mem-meta">
                          Removed:{" "}
                          {correction.comparison.removed
                            .map((id) => correction.before.candidates.find((c) => c.entity_id === id)?.name ?? shortBlob(id))
                            .join(" · ")}{" "}
                          — no longer returned for the revised anchor. Qloo gave no reason beyond the new ranking.
                        </p>
                      )}
                      {correction.after.candidates.map((c) => {
                        const ev = c.evidence;
                        const note =
                          ev?.description ??
                          (ev?.tags ? `Qloo tags: ${ev.tags.slice(0, 4).join(", ")}` : null) ??
                          "Listed by Qloo without descriptive notes.";
                        return (
                          <p key={c.entity_id} className="mem-meta">
                            Why {c.name}? {note}
                          </p>
                        );
                      })}
                    </div>
                  )}
                  <p className="mem-meta">Session only: your saved memories are unchanged.</p>
                  <button type="button" className="app-btn app-btn-glass" onClick={undoCorrection}>
                    Undo correction
                  </button>
                </section>
              </div>
            ) : (
              <div>
                <p className="mem-meta">
                  Change the named anchor and approve a fresh Qloo Search + Insights rerun. Nothing is
                  re-fetched until you approve. Session only: your saved memories are unchanged.
                </p>
                <div className="mem-filters">
                  <label className="mem-label" htmlFor="taste-correct-anchor">
                    Revised anchor
                    <input
                      id="taste-correct-anchor"
                      className="mem-input"
                      value={correctionInput}
                      onChange={(e) => {
                        setCorrectionInput(e.target.value);
                        setCorrectionRes(null);
                      }}
                      placeholder={phase.result.anchor}
                      maxLength={80}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="app-btn app-btn-primary"
                    onClick={() => void approveCorrection()}
                    disabled={correcting || correctionInput.trim().length < 2}
                    title={
                      correctionInput.trim()
                        ? `Resolve revised anchor`
                        : undefined
                    }
                  >
                    {correcting ? "Resolving…" : "Resolve revised anchor"}
                  </button>
                </div>
                {correctionRes?.entity && (
                  <div>
                    <p className="mem-meta">
                      Qloo resolved “{correctionRes.anchor}” → {correctionRes.entity.name} (
                      {shortBlob(correctionRes.entity.entity_id)}). Confirm to rerun Insights.
                    </p>
                    <button
                      type="button"
                      className="app-btn app-btn-primary"
                      onClick={() => void confirmCorrection(correctionRes.entity!.entity_id)}
                      disabled={correcting}
                    >
                      {correcting ? "Asking Qloo…" : "Show revised candidates"}
                    </button>
                  </div>
                )}
                {correctionRes && correctionRes.choices.length > 0 && (
                  <div>
                    <p className="mem-meta">
                      Qloo found several matches for “{correctionRes.anchor}”. Pick the intended one.
                    </p>
                    <div className="mem-filters">
                      {correctionRes.choices.map((c) => (
                        <button key={c.entity_id} type="button" className="app-btn app-btn-glass" onClick={() => void confirmCorrection(c.entity_id)} disabled={correcting}>
                          {c.name} · {c.kind}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {correctionInput.trim() && guidanceFor(correctionInput) && (
                  <p className="mem-note">{guidanceFor(correctionInput)}</p>
                )}
                {correcting && !correctionRes && (
                  <p className="mem-note" role="status">
                    Resolving the revised anchor…
                  </p>
                )}
                {correctionError && (
                  <div className="mem-error" role="alert">
                    <p className="mem-empty-title">{FRIENDLY[correctionError.code] ?? "Revised lookup failed."}</p>
                    <p className="mem-meta">
                      {correctionError.message} ({correctionError.code}) The earlier result above is unchanged.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
      <MultiTaste />
    </div>
  );
}
