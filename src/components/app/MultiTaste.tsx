"use client";

import { useState } from "react";
import { call, errorMessage, shortBlob } from "@/lib/app-client";
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

const FRIENDLY: Record<string, string> = {
  qloo_no_match: "Qloo has no match for that anchor.",
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

  function invalidate() {
    setSlots(null);
    setPicks([]);
    setResult(null);
    setError(null);
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
    const anchors = inputs.map((s) => s.trim()).filter((s) => s.length > 0);
    if (anchors.length < 1) return;
    setBusy("resolving");
    setError(null);
    setSlots(null);
    setPicks([]);
    setResult(null);
    const r = await call("/api/tasteproof", {
      method: "POST",
      body: JSON.stringify({ anchors, city: city.trim() || undefined }),
    });
    setBusy("idle");
    if (!r.ok) {
      const code = (r.body.error as { code?: string } | undefined)?.code ?? "unknown";
      setError({ code, message: errorMessage(r) });
      return;
    }
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
  }

  const allConfirmed =
    slots !== null &&
    slots.length > 0 &&
    picks.length === slots.length &&
    picks.every((p) => p !== null);

  async function discover() {
    if (!slots || !allConfirmed || busy !== "idle") return;
    const entities = picks as SlotEntity[];
    setBusy("discovering");
    setError(null);
    setResult(null);
    const r = await call("/api/tasteproof", {
      method: "POST",
      body: JSON.stringify({
        anchors: slots.map((s) => s.anchor),
        entityIds: entities.map((e) => e.entity_id),
        city: city.trim() || undefined,
      }),
    });
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
          <ul className="mem-grid">
            {result.candidates.map((c) => (
              <li key={c.entity_id}>
                <TasteCard c={c} />
              </li>
            ))}
          </ul>
          <button type="button" className="app-btn app-btn-glass" onClick={startOver}>
            Start over
          </button>
        </div>
      )}
    </section>
  );
}
