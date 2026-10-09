"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, RotateCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { call, errorMessage, factText, shortBlob, topicLabel } from "@/lib/app-client";

type Memory = {
  blobId: string;
  memoryKey: string | null;
  category: string | null;
  state: string;
  supersedesBlobId: string | null;
  createdAt: string;
};
type Match = { blobId: string; text: string; category: string | null; state: string; memoryKey: string | null; createdAt: string };
type Totals = { active: number; superseded: number };
type Phase = "loading" | "ready" | "failed";
type StateFilter = "active" | "superseded" | "all";
type CategoryFilter = "all" | "hotel" | "travel" | "dining";

const LIST_LIMIT = 100;
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hotel", label: "Hotels" },
  { key: "travel", label: "Travel" },
  { key: "dining", label: "Dining" },
];
const STATES: { key: StateFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "superseded", label: "Replaced" },
  { key: "all", label: "All" },
];
const CATEGORY_LABEL: Record<string, string> = { hotel: "Hotels", travel: "Travel", dining: "Dining" };

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function Memories() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [totals, setTotals] = useState<Totals>({ active: 0, superseded: 0 });
  const [consent, setConsent] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setPhase("loading");
    try {
      const s = await call("/api/session", { method: "POST" });
      if (!s.ok) throw new Error();
      setConsent(s.body.consent === true);
      const r = await call(`/api/memories?state=all&limit=${LIST_LIMIT}`);
      if (!r.ok) throw new Error();
      setMemories((r.body.memories as Memory[]) ?? []);
      setTotals((r.body.totals as Totals) ?? { active: 0, superseded: 0 });
      setPhase("ready");
    } catch {
      if (!quiet) setPhase("failed");
    }
  }, []);

  useEffect(() => {
    // Initial fetch syncs with the memory API on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const enableMemory = async () => {
    setConsentBusy(true);
    const r = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ consent: true }) }).catch(() => null);
    setConsentBusy(false);
    if (r?.ok) {
      setConsent(true);
      setNotice("Memory is on. You can now correct memories.");
    } else setNotice("Memory setting wasn't changed. Try again.");
  };

  const onCorrected = (oldBlobId: string, newBlobId: string) => {
    setNotice(`Correction saved to Walrus Mainnet as ${shortBlob(newBlobId)}. The old memory is now marked replaced.`);
    setTexts((t) => {
      const next = { ...t };
      delete next[oldBlobId];
      return next;
    });
    void load(true);
  };

  const visible = memories.filter(
    (m) => (stateFilter === "all" || m.state === stateFilter) && (category === "all" || m.category === category)
  );
  const total = totals.active + totals.superseded;

  return (
    <div className="mem">
      <div className="mem-inner">
        <header className="mem-head">
          <p className="mem-eyebrow">Your memory</p>
          <h1 className="mem-title">What Anghkooey remembers</h1>
          <p className="mem-lead">
            Each memory is an encrypted blob on Walrus Mainnet, in a namespace that belongs to you. This archive lists
            the confirmed records: what they&rsquo;re about, when they were saved, and their Walrus blob ID.
          </p>
        </header>

        {phase === "loading" ? (
          <p className="mem-status" role="status">
            Opening your archive…
          </p>
        ) : phase === "failed" ? (
          <div className="mem-status" role="alert">
            <p>Your memories couldn&rsquo;t be loaded right now.</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => void load()}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
              Try again
            </button>
          </div>
        ) : (
          <>
            <dl className="mem-overview">
              <div>
                <dt>Active memories</dt>
                <dd>{totals.active}</dd>
              </div>
              <div>
                <dt>Replaced by a correction</dt>
                <dd>{totals.superseded}</dd>
              </div>
              <div>
                <dt>New saves</dt>
                <dd className="mem-overview-state" data-on={consent}>
                  {consent ? "Memory on" : "Memory off"}
                </dd>
              </div>
            </dl>

            <p className="mem-note">
              Walrus can&rsquo;t read back every memory&rsquo;s text in one list, so the archive shows the details kept
              alongside each blob. To see what a memory says, search for it below.
            </p>

            {!consent ? (
              <div className="mem-banner">
                <p>Memory is off, so nothing new is saved and corrections are paused. Existing memories stay on Walrus.</p>
                <button type="button" className="app-btn app-btn-glass" disabled={consentBusy} onClick={() => void enableMemory()}>
                  {consentBusy ? "Turning on…" : "Turn memory on"}
                </button>
              </div>
            ) : null}

            {notice ? (
              <p className="mem-notice" role="status">
                {notice}
              </p>
            ) : null}

            {total === 0 ? (
              <div className="mem-empty">
                <p className="mem-empty-title">Nothing saved yet.</p>
                <p className="mem-text">
                  {consent
                    ? "Tell Anghkooey a preference in chat. When a memory is confirmed on Walrus, it appears here."
                    : "Turn memory on, then tell Anghkooey a preference in chat. Confirmed memories appear here."}
                </p>
                <Link href="/chat" className="app-btn app-btn-primary">
                  Go to chat
                  <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
                </Link>
              </div>
            ) : (
              <>
                <MatchSearch
                  consent={consent}
                  stateOf={(id) => memories.find((x) => x.blobId === id)?.state}
                  onMatches={(ms) => setTexts((t) => ({ ...t, ...Object.fromEntries(ms.map((m) => [m.blobId, m.text])) }))}
                  onCorrected={onCorrected}
                />

                <section aria-labelledby="archive-title" className="mem-archive">
                  <div className="mem-archive-head">
                    <h2 id="archive-title" className="mem-h2">
                      Archive
                    </h2>
                    <div className="mem-filters">
                      <div role="group" aria-label="Category" className="mem-seg">
                        {CATEGORIES.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            aria-pressed={category === c.key}
                            onClick={() => setCategory(c.key)}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <div role="group" aria-label="Status" className="mem-seg">
                        {STATES.map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            aria-pressed={stateFilter === s.key}
                            onClick={() => setStateFilter(s.key)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="mem-count" aria-live="polite">
                    {visible.length} {visible.length === 1 ? "record" : "records"} shown
                    {total > LIST_LIMIT ? `, from the ${LIST_LIMIT} most recent` : ""}
                  </p>
                  {visible.length === 0 ? (
                    <p className="mem-text">No records match these filters.</p>
                  ) : (
                    <ul className="mem-grid">
                      {visible.map((m) => (
                        <MemoryCard
                          key={m.blobId}
                          m={m}
                          text={texts[m.blobId]}
                          consent={consent}
                          onCorrected={onCorrected}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <p className="mem-foot">
              Correcting a memory saves a new one and marks the old one replaced, so Anghkooey stops using it. Walrus blobs
              aren&rsquo;t edited or deleted. <Link href="/chat">Back to chat</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MatchSearch({
  consent,
  stateOf,
  onMatches,
  onCorrected,
}: {
  consent: boolean;
  stateOf: (blobId: string) => string | undefined;
  onMatches: (m: Match[]) => void;
  onCorrected: (oldId: string, newId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ query: string; matches: Match[] } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call("/api/memories/search", { method: "POST", body: JSON.stringify({ query }) });
      if (!r.ok) {
        setError(r.status === 429 ? "Too many searches. Wait a minute, then try again." : errorMessage(r));
        return;
      }
      const matches = (r.body.matches as Match[]) ?? [];
      setResult({ query: String(r.body.query), matches });
      onMatches(matches);
    } catch {
      setError("Couldn't reach Walrus search. Check your connection, then try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="search-title" className="mem-search">
      <h2 id="search-title" className="mem-h2">
        Search matching memories
      </h2>
      <p className="mem-text">
        Searches your Walrus memories by meaning and shows up to 8 close matches with their saved text. It&rsquo;s a
        search, not the full list.
      </p>
      <form className="mem-search-form" onSubmit={onSubmit}>
        <label htmlFor="mem-q" className="sr-only">
          What to look for
        </label>
        <input
          id="mem-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. room noise, spicy food, flights"
          maxLength={200}
          className="mem-input"
        />
        <button type="submit" className="app-btn app-btn-primary" disabled={busy || query.trim().length < 2}>
          <Search aria-hidden className="size-4" strokeWidth={1.5} />
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error ? (
        <p className="mem-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div aria-live="polite">
          <h3 className="mem-h3">
            Matching memories for &ldquo;{result.query}&rdquo;
          </h3>
          {result.matches.length === 0 ? (
            <p className="mem-text">No close matches. Try different words.</p>
          ) : (
            <ul className="mem-grid">
              {result.matches.map((m) => (
                <MemoryCard
                  key={m.blobId}
                  m={{ ...m, state: stateOf(m.blobId) ?? m.state, supersedesBlobId: null }}
                  text={m.text}
                  consent={consent}
                  onCorrected={onCorrected}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function MemoryCard({
  m,
  text,
  consent,
  onCorrected,
}: {
  m: Memory;
  text?: string;
  consent: boolean;
  onCorrected: (oldId: string, newId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const active = m.state === "active";
  const topic = topicLabel(m.memoryKey);
  const fact = text ? factText(text).fact : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.blobId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className="mem-card" data-state={m.state}>
      <div className="mem-card-top">
        <span className="mem-cat">{m.category ? (CATEGORY_LABEL[m.category] ?? m.category) : "Uncategorised"}</span>
        <span className="mem-badge" data-state={m.state}>
          {active ? "Active" : m.state === "superseded" ? "Replaced" : m.state}
        </span>
      </div>
      <p className="mem-topic">{topic ?? "Saved preference"}</p>
      {fact ? (
        <blockquote className="mem-fact">
          <p>{fact}</p>
          <footer>Saved text, found by search</footer>
        </blockquote>
      ) : null}
      <dl className="mem-meta">
        <div>
          <dt>Saved</dt>
          <dd>
            <time dateTime={m.createdAt}>{dateFmt(m.createdAt)}</time>
          </dd>
        </div>
        {m.supersedesBlobId ? (
          <div>
            <dt>{active ? "Replaces" : "Replaced by"}</dt>
            <dd>
              <code title={m.supersedesBlobId}>{shortBlob(m.supersedesBlobId)}</code>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mem-card-actions">
        <button type="button" className="mem-blob" onClick={() => void copy()} title={m.blobId}>
          <code>{shortBlob(m.blobId)}</code>
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" strokeWidth={1.5} />}
          <span className="sr-only">{copied ? "Blob ID copied" : "Copy full Walrus blob ID"}</span>
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
        {active && !open ? (
          <button
            type="button"
            className="chat-link"
            disabled={!consent}
            title={consent ? undefined : "Turn memory on to correct memories"}
            onClick={() => setOpen(true)}
          >
            Correct
          </button>
        ) : null}
      </div>
      {active && open ? <CorrectionForm blobId={m.blobId} onDone={onCorrected} onCancel={() => setOpen(false)} /> : null}
    </li>
  );
}

function CorrectionForm({
  blobId,
  onDone,
  onCancel,
}: {
  blobId: string;
  onDone: (oldId: string, newId: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = `fix-${blobId}`;
  const valid = text.trim().length >= 12 && text.length <= 500;

  useEffect(() => ref.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const r = await call(`/api/memories/${encodeURIComponent(blobId)}`, {
        method: "PATCH",
        body: JSON.stringify({ text: text.trim() }),
      });
      if (r.ok) {
        onDone(blobId, String(r.body.newBlobId));
        return;
      }
      setError(
        r.status === 409
          ? errorMessage(r, "This memory is already being corrected.")
          : r.status === 403
            ? "Turn memory on to save corrections."
            : r.status === 429
              ? "Too many corrections. Wait a minute, then try again."
              : `${errorMessage(r)} Your old memory is unchanged.`
      );
    } catch {
      setError("Couldn't reach Anghkooey. Your old memory is unchanged. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="mem-fix" onSubmit={submit} aria-busy={saving}>
      <label htmlFor={id} className="chat-label">
        Updated preference
      </label>
      <textarea
        id={id}
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={500}
        disabled={saving}
        placeholder="Say it the way it's true now, e.g. I now prefer a low floor near the lift."
        aria-describedby={`${id}-help`}
        className="mem-textarea"
      />
      <p id={`${id}-help`} className="mem-help">
        Saving writes this as a new memory on Walrus Mainnet and marks the current one replaced. The old blob stays on
        Walrus, but Anghkooey stops using it. At least 12 characters.
      </p>
      {saving ? (
        <p className="mem-help" role="status">
          Saving to Walrus Mainnet. This can take up to a minute.
        </p>
      ) : null}
      {error ? (
        <p className="mem-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !valid}>
          {saving ? "Saving…" : "Save correction"}
        </button>
        <button type="button" className="app-btn app-btn-glass" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
