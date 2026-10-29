"use client";

import { useRef, useState } from "react";
import { call, errorMessage, shortBlob } from "@/lib/app-client";
import { compareTasteCandidates } from "@/lib/taste-evidence";
import { TasteCard, type Candidate } from "@/components/app/Taste";

type SlotChoice = { name: string; entity_id: string; kind: string };
type SlotEntity = { name: string; entity_id: string; kind: string };

type Slot =
  | { anchor: string; outcome: "resolved"; resolved: SlotEntity; searchTotal: number }
  | { anchor: string; outcome: "choices"; candidates: SlotChoice[]; searchTotal: number }
  | { anchor: string; outcome: "failed"; error: { code: string; message: string } };

type MultiResult = {
  anchors: string[];
  resolved: SlotEntity[];
  candidates: Candidate[];
  anchorIds: string[];
};

const MODEL_ONLY_SUMMARY = `The model could not verify any current Lagos restaurant from training alone. It suggested directions instead: upscale Japanese/Peruvian-fusion spots in Victoria Island or Ikoyi (naming Nok by Alara and Wakame from training, both flagged unverified), minimalist chef-led rooms for the Sakamoto atmosphere, and a tip to check Instagram, Google Maps and recent reviews before booking.`;

const FRIENDLY: Record<string, string> = {  qloo_no_match: "Qloo has no match for that anchor.",
  qloo_not_configured: "Taste lookup is not configured on this server.",
  rate_limited: "Too many lookups. Slow down and retry.",
  rate_limit_unavailable: "Taste lookup is temporarily unavailable. Try again shortly.",
  qloo_rate_limited: "Qloo is rate-limiting taste lookups.",
  qloo_unauthorized: "This server's Qloo credentials were rejected.",
  qloo_unavailable: "Qloo is unreachable right now.",
  qloo_ambiguous: "Qloo found several matches. Pick the intended one below.",
  stale_selection: "A selection went stale. Resolve again and pick from the fresh lists.",
};

function friendly(code: string, fallback: string) {
  return FRIENDLY[code] ?? fallback;
}

/** Combined discovery: up to three confirmed cultural references jointly shape
 * one Qloo Insights request. Each anchor resolves and confirms independently
 * first; Insights runs once, only after every entity is explicitly approved. */
export function MultiTaste() {
  const [inputs, setInputs] = useState<string[]>(["Nobu Restaurant"]);
  const [city, setCity] = useState("Lagos");
  const [busy, setBusy] = useState<"idle" | "resolving" | "discovering">("idle");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picks, setPicks] = useState<(SlotEntity | null)[]>([]);
  const [result, setResult] = useState<MultiResult | null>(null);
  const [trace, setTrace] = useState<{ by: "you" | "server"; text: string; run: number }[]>([]);
  const [baseline, setBaseline] = useState<{ candidates: Candidate[] } | null>(null);
  const [comparing, setComparing] = useState(false);
  const runRef = useRef(0);
  const [runId, setRunId] = useState(0);

  function log(by: "you" | "server", text: string) {
    const run = runRef.current;
    setTrace((t) => [...t, { by, text, run }]);
  }

  /** Start a new lookup attempt: abandoned in-flight responses carry the old
   * generation and must not touch state, slots, approvals, results or trace. */
  function newRun() {
    runRef.current += 1;
    setRunId(runRef.current);
    return runRef.current;
  }

  function invalidate() {
    newRun();
    setBusy("idle");
    setComparing(false);
    setSlots(null);
    setPicks([]);
    setResult(null);
    setError(null);
    setBaseline(null);
  }

  function setInput(i: number, v: string) {
    setInputs((prev) => prev.map((x, j) => (j === i ? v : x)));
    invalidate();
  }

  function addInput() {
    if (inputs.length >= 3) return;
    setInputs((prev) => [...prev, ""]);
    invalidate();
  }

  function removeInput(i: number) {
    if (inputs.length <= 1) return;
    setInputs((prev) => prev.filter((_, j) => j !== i));
    invalidate();
  }

  async function resolveAnchors() {
    if (busy !== "idle") return;
    const anchors = inputs.map((s) => s.trim()).filter((s) => s.length > 0);
    if (anchors.length < 1) return;
    const run = runRef.current;
    setBusy("resolving");
    setError(null);
    setSlots(null);
    setPicks([]);
    setResult(null);
    setBaseline(null);
    log("you", `Approved resolving ${anchors.length} ${anchors.length === 1 ? "anchor" : "anchors"} through Qloo Search`);
    const r = await call("/api/tasteproof", {
      method: "POST",
      body: JSON.stringify({ anchors, city: city.trim() || undefined }),
    });
    if (run !== runRef.current) return;
    setBusy("idle");
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: errorMessage(r) });
      return;
    }
    log("server", `Qloo Search executed for ${anchors.length} ${anchors.length === 1 ? "anchor" : "anchors"} — confirm one entity per anchor to continue`);
    const body = r.body as unknown as {
      stage: "multi_resolve";
      anchors: Slot[];
    };
    setSlots(body.anchors);
    setPicks(body.anchors.map(() => null));
  }

  function confirmPick(i: number, entity: SlotEntity) {
    setPicks((prev) => prev.map((p, j) => (j === i ? entity : p)));
    setResult(null);
    setError(null);
    setBaseline(null);
    // A changed confirmation supersedes the previous combined attempt: drop
    // trace entries after the latest Search execution, keep the resolve history.
    setTrace((t) => {
      let cut = t.length;
      for (let k = t.length - 1; k >= 0; k--) {
        if (t[k].run === runRef.current && t[k].by === "server" && t[k].text.indexOf("Qloo Search executed") === 0) {
          cut = k + 1;
          break;
        }
        if (t[k].run !== runRef.current) break;
      }
      return [...t.slice(0, cut), { by: "you" as const, text: `Confirmed ${entity.name} [${entity.entity_id}] for anchor ${i + 1}`, run: runRef.current }];
    });
  }

  const allConfirmed =
    slots !== null &&
    slots.length > 0 &&
    picks.length === slots.length &&
    picks.every((p) => p !== null);

  async function discover() {
    if (!slots || !allConfirmed || busy !== "idle") return;
    const entities = picks as SlotEntity[];
    const run = runRef.current;
    setBusy("discovering");
    setError(null);
    setResult(null);
    setBaseline(null);
    log("you", `Approved one combined Qloo Insights request for ${entities.length} confirmed ${entities.length === 1 ? "entity" : "entities"}`);
    const r = await call("/api/tasteproof", {
      method: "POST",
      body: JSON.stringify({
        anchors: slots.map((s) => s.anchor),
        entityIds: entities.map((e) => e.entity_id),
        city: city.trim() || undefined,
      }),
    });
    if (run !== runRef.current) return;
    setBusy("idle");
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: errorMessage(r) });
      return;
    }
    const body = r.body as unknown as {
      stage: "multi_candidates";
      anchors: string[];
      resolved: SlotEntity[];
      candidates: Candidate[];
      evidence: { anchorIds: string[]; candidateIds: string[]; city: string | null };
    };
    setResult({
      anchors: body.anchors,
      resolved: body.resolved,
      candidates: body.candidates,
      anchorIds: body.evidence.anchorIds,
    });
    log("server", `Qloo Insights executed once for ${body.evidence.anchorIds.length} confirmed ${body.evidence.anchorIds.length === 1 ? "entity" : "entities"}`);
    log("server", `Evidence normalized from the live Qloo response: ${body.candidates.length} venues rendered`);
  }

  async function compareBaseline() {
    if (!result || comparing || busy !== "idle") return;
    const first = result.resolved[0];
    if (!first) return;
    const run = runRef.current;
    setComparing(true);
    setError(null);
    log("you", `Approved a single-anchor baseline: ${first.name} alone, same city and settings`);
    const r = await call("/api/tasteproof", {
      method: "POST",
      body: JSON.stringify({
        anchors: [result.anchors[0]],
        entityIds: [first.entity_id],
        city: city.trim() || undefined,
      }),
    });
    if (run !== runRef.current) return;
    setComparing(false);
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: errorMessage(r) });
      return;
    }
    const body = r.body as unknown as { candidates: Candidate[] };
    setBaseline({ candidates: body.candidates });
    log("server", "Qloo Insights executed for the single-anchor baseline");
  }

  function startOver() {
    setInputs(["Nobu Restaurant"]);
    setCity("Lagos");
    invalidate();
  }

  return (
    <section aria-labelledby="multi-taste-title" className="mem-card">
      <h2 id="multi-taste-title" className="mem-h">
        Combined anchors, one joint discovery
      </h2>
      <p className="mem-meta">
        Add up to three cultural references — a place, an artist, a film. Each one resolves
        and confirms on its own; then a single combined Qloo lookup finds venues shaped by
        all of them together. Nothing runs until you approve every step.
      </p>

      <fieldset className="mem-filters">
        <legend className="mem-label">Cultural anchors (1–3)</legend>
        {inputs.map((v, i) => (
          <div key={i} data-testid={`multi-slot-${i}`}>
            <label className="mem-label" htmlFor={`multi-anchor-${i}`}>
              Cultural anchor {i + 1}
              <input
                id={`multi-anchor-${i}`}
                className="mem-input"
                value={v}
                onChange={(e) => setInput(i, e.target.value)}
                placeholder={i === 0 ? "Nobu Restaurant" : i === 1 ? "Ryuichi Sakamoto" : "The Bear"}
                maxLength={80}
                autoComplete="off"
              />
            </label>
            {inputs.length > 1 && (
              <button
                type="button"
                className="app-btn app-btn-quiet"
                aria-label={`Remove anchor ${i + 1}`}
                onClick={() => removeInput(i)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div>
          <label className="mem-label" htmlFor="multi-city">
            City (optional)
            <input
              id="multi-city"
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
          </label>
        </div>
        <div>
          {inputs.length < 3 && (
            <button type="button" className="app-btn app-btn-glass" onClick={addInput}>
              Add another anchor
            </button>
          )}
          <button
            type="button"
            className="app-btn app-btn-primary"
            disabled={busy !== "idle" || inputs.every((s) => s.trim().length < 2)}
            onClick={() => void resolveAnchors()}
          >
            {busy === "resolving" ? "Resolving…" : "Resolve anchors"}
          </button>
        </div>
      </fieldset>

      {busy === "resolving" && (
        <p className="mem-note" role="status">
          Resolving each anchor through Qloo Search…
        </p>
      )}

      {error && (
        <div className="mem-error" role="alert">
          <p className="mem-empty-title">{friendly(error.code, "Combined lookup failed.")}</p>
          <p className="mem-meta">
            {error.message} ({error.code})
          </p>
        </div>
      )}

      {slots && (
        <div>
          {slots.map((s, i) => (
            <div key={`${s.anchor}-${i}`} className="mem-card" data-testid={`multi-outcome-${i}`}>
              <p className="mem-meta">
                Anchor {i + 1}: “{s.anchor}”
              </p>
              {s.outcome === "failed" && (
                <div className="mem-error" role="alert">
                  <p className="mem-empty-title">{friendly(s.error.code, "No match.")}</p>
                  <p className="mem-meta">
                    {s.error.message} ({s.error.code})
                  </p>
                </div>
              )}
              {s.outcome === "resolved" && (
                <div>
                  <p className="mem-fact">
                    Qloo resolved: {s.resolved.name} · {s.resolved.kind} · {shortBlob(s.resolved.entity_id)}
                  </p>
                  {picks[i]?.entity_id === s.resolved.entity_id ? (
                    <p className="mem-meta" role="status">
                      Confirmed for the combined lookup.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="app-btn app-btn-glass"
                      aria-label={`Confirm ${s.resolved.name} for anchor ${i + 1}`}
                      onClick={() => confirmPick(i, s.resolved)}
                    >
                      Confirm {s.resolved.name}
                    </button>
                  )}
                </div>
              )}
              {s.outcome === "choices" && (
                <div>
                  <p className="mem-meta">Qloo found several matches. Pick the intended one:</p>
                  <div>
                    {s.candidates.map((c) => (
                      <button
                        key={c.entity_id}
                        type="button"
                        className="app-btn app-btn-quiet"
                        aria-label={`Confirm ${c.name} for anchor ${i + 1}`}
                        aria-pressed={picks[i]?.entity_id === c.entity_id}
                        onClick={() => confirmPick(i, c)}
                      >
                        {c.name} · {c.kind}
                      </button>
                    ))}
                  </div>
                  {picks[i] && (
                    <p className="mem-meta" role="status">
                      Confirmed: {picks[i]?.name} · {shortBlob(picks[i]?.entity_id ?? "")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {allConfirmed && (
            <div className="mem-card" aria-label="Combined approval summary">
              <p className="mem-fact">Combined approval</p>
              <ul>
                {(picks as SlotEntity[]).map((p, i) => (
                  <li key={p.entity_id} className="mem-meta">
                    {slots[i].anchor} → {p.name} · {p.kind} · {shortBlob(p.entity_id)}
                  </li>
                ))}
              </ul>
              <p className="mem-meta">
                City: {city.trim() || "anywhere"} · One combined Qloo Insights request will run
                for all {picks.length} confirmed {picks.length === 1 ? "entity" : "entities"}.
                Changing an anchor or the city above restarts approval.
              </p>
              <button
                type="button"
                className="app-btn app-btn-primary"
                disabled={busy !== "idle"}
                onClick={() => void discover()}
              >
                {busy === "discovering" ? "Discovering…" : "Approve combined discovery"}
              </button>
            </div>
          )}
        </div>
      )}

      {busy === "discovering" && (
        <p className="mem-note" role="status">
          Running one combined Qloo lookup…
        </p>
      )}

      {result && (
        <div>
          <p className="mem-fact" role="status">
            Joint discovery: {result.anchors.join(" + ")} in {city.trim() || "anywhere"}
          </p>
          <p className="mem-meta">
            {result.candidates.length} venue{result.candidates.length === 1 ? "" : "s"} returned
            by one combined Qloo Insights request over {result.anchorIds.length} confirmed{" "}
            {result.anchorIds.length === 1 ? "entity" : "entities"} · Availability, prices and
            bookings are not verified.
          </p>
          <div className="mem-card" aria-label="Per-venue anchor evidence">
            <p className="mem-fact">Which anchors Qloo links to each venue</p>
            <ul>
              {result.candidates.map((c) => {
                const linked = c.evidence?.matchedAnchorIds;
                return (
                  <li key={c.entity_id} className="mem-meta">
                    {c.name}:{" "}
                    {linked === null || linked === undefined
                      ? "Contribution details unavailable — Qloo returned no per-anchor explainability for this venue."
                      : linked
                          .map(
                            (id) =>
                              result.resolved.find((r) => r.entity_id === id)?.name ?? shortBlob(id)
                          )
                          .join(", ")}
                  </li>
                );
              })}
            </ul>
            <p className="mem-meta">
              Only anchors Qloo itself attributes are listed. An approved anchor with no
              listing here did not measurably surface in this response. Affinity numbers are
              Qloo&apos;s per-request ranking signal, never a match percentage, and cannot be
              compared across separate requests.
            </p>
          </div>
          <ul className="mem-grid">
            {result.candidates.map((c) => (
              <li key={c.entity_id}>
                <TasteCard c={c} />
              </li>
            ))}
          </ul>
          {!baseline && (
            <div>
              <p className="mem-meta">
                See what the extra {result.anchors.length > 2 ? "anchors add" : "anchor adds"}: run
                the same lookup for “{result.anchors[0]}” alone, same city and settings, and
                compare the two real result sets.
              </p>
              <button
                type="button"
                className="app-btn app-btn-glass"
                disabled={comparing || busy !== "idle"}
                onClick={() => void compareBaseline()}
              >
                {comparing ? "Comparing…" : `Compare with ${result.anchors[0]} alone`}
              </button>
            </div>
          )}
          {baseline &&
            (() => {
              const cmp = compareTasteCandidates(
                baseline.candidates.map((c) => c.entity_id),
                result.candidates.map((c) => c.entity_id)
              );
              const nameOf = (id: string) =>
                [...baseline.candidates, ...result.candidates].find((c) => c.entity_id === id)?.name ?? shortBlob(id);
              return (
                <div className="mem-card" aria-label="Single versus combined comparison">
                  <p className="mem-fact">
                    {result.anchors[0]} alone vs all {result.anchorIds.length} anchors combined
                  </p>
                  {cmp.unchanged ? (
                    <p className="mem-meta" role="status">
                      No measurable change: identical venues in identical order.
                    </p>
                  ) : (
                    <div>
                      {cmp.added.length > 0 && (
                        <p className="mem-meta">
                          Added by the combined lookup: {cmp.added.map(nameOf).join(", ")}
                        </p>
                      )}
                      {cmp.removed.length > 0 && (
                        <p className="mem-meta">
                          Only in the single-anchor baseline: {cmp.removed.map(nameOf).join(", ")}
                        </p>
                      )}
                      {cmp.reordered && (
                        <p className="mem-meta" role="status">
                          Shared venues changed order between the two real result sets.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mem-meta">
                    Deterministic ID-and-order comparison of two live Qloo responses. No scores
                    were normalized across requests.
                  </p>
                </div>
              );
            })()}
          <div className="mem-card">
            <p className="mem-fact">What happens without Qloo (recorded experiment)</p>
            <p className="mem-meta">
              One DeepSeek model-only answer to the same kind of request, recorded
              2026-10-29 with no Qloo data — not a live recommendation and not a booking
              result. Full prompt, settings and verbatim output: docs/hackathons/
              QLOO-MODEL-ONLY-BASELINE.md.
            </p>
            <p className="mem-meta">{MODEL_ONLY_SUMMARY}</p>
            <p className="mem-meta">
              Lost without Qloo: verified venue IDs, joint photos, per-venue affinity,
              addresses, and per-anchor attribution. Gained risks: named-but-unverified
              venues and generic guidance that hedges instead of resolving.
            </p>
          </div>
          <button type="button" className="app-btn app-btn-glass" onClick={startOver}>
            Start over
          </button>
        </div>
      )}
      {trace.filter((t) => t.run === runId).length > 0 && (
        <div className="mem-card" aria-label="Execution trace">
          <p className="mem-fact">What actually ran</p>
          <ol>
            {trace
              .filter((t) => t.run === runId)
              .map((t, i) => (
              <li key={i} className="mem-meta">
                <span className="mem-badge">{t.by === "you" ? "You approved" : "Server observed"}</span>{" "}
                {t.text}
              </li>
            ))}
          </ol>
          <p className="mem-meta">
            Only completed steps from this attempt are listed. Your approvals happened in
            this browser; Qloo actions happened on the server and returned live data. This
            is a session view, not an immutable audit log.
          </p>
        </div>
      )}
    </section>
  );
}
