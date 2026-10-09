"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Copy, RotateCw } from "lucide-react";
import { call, errorMessage } from "@/lib/app-client";
import { TELEGRAM_BOT_URL } from "@/lib/site";

type Provider = "telegram" | "imessage";
type Channel = {
  provider: Provider;
  linked: boolean;
  verified: boolean;
  verifiedAt: string | null;
  approvalExpiresAt: string | null;
};
type LinkCode = { code: string; provider: Provider; expiresAt: number };

const NAME: Record<Provider, string> = { telegram: "Telegram", imessage: "iMessage" };
const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const timeFmt = (t: string | number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Profile() {
  const [phase, setPhase] = useState<"loading" | "failed" | "ready">("loading");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [consolidated, setConsolidated] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("telegram");
  const [code, setCode] = useState<LinkCode | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const linkedRef = useRef<Set<Provider>>(new Set());

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const [s, c] = await Promise.all([call("/api/session"), call("/api/channels")]);
      if (!s.ok || !c.ok) throw new Error();
      setExpiresAt(s.body.expiresAt as string);
      setConsent(s.body.consent === true);
      const next = (c.body.channels as Channel[]) ?? [];
      setChannels(next);
      setConsolidated(Number(c.body.consolidatedAccounts) || 0);
      setCheckedAt(Date.now());
      const newly = next.filter((ch) => ch.linked && !linkedRef.current.has(ch.provider));
      if (newly.length) {
        setNotice(`${newly.map((ch) => NAME[ch.provider]).join(" and ")} is now linked. Memory is shared with this identity.`);
      }
      linkedRef.current = new Set(next.filter((ch) => ch.linked).map((ch) => ch.provider));
      // A used code is spent: once its channel is linked or awaiting MERGE YES, drop it.
      setCode((cur) =>
        cur && next.some((ch) => ch.provider === cur.provider && (ch.linked || ch.approvalExpiresAt)) ? null : cur
      );
      return true;
    } catch {
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const load = useCallback(async () => {
    // The route can be kept mounted across a session change, so start clean.
    setPhase("loading");
    setNotice(null);
    setCode(null);
    setCodeError(null);
    setCopied(false);
    const s = await call("/api/session", { method: "POST" }).catch(() => null);
    if (!s?.ok) return setPhase("failed");
    const c = await call("/api/channels").catch(() => null);
    if (!c?.ok) return setPhase("failed");
    const list = (c.body.channels as Channel[]) ?? [];
    linkedRef.current = new Set(list.filter((ch) => ch.linked).map((ch) => ch.provider));
    setExpiresAt(s.body.expiresAt as string);
    setConsent(s.body.consent === true);
    setChannels(list);
    setConsolidated(Number(c.body.consolidatedAccounts) || 0);
    setCheckedAt(Date.now());
    setPhase("ready");
  }, []);

  useEffect(() => {
    // Initial fetch syncs with the session and channel APIs on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Coming back from Telegram or iMessage re-checks the real link state.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phase === "ready") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, refresh]);

  // Countdown. The code lives only in memory and is dropped when it expires.
  useEffect(() => {
    if (!code) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= code.expiresAt) {
        setCode(null);
        setCodeError("That code expired. Generate a new one if you still want to link.");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [code]);

  const generate = async () => {
    setCodeBusy(true);
    setCodeError(null);
    setCopied(false);
    const r = await call("/api/link/start", { method: "POST", body: "{}" }).catch(() => null);
    setCodeBusy(false);
    if (!r?.ok) {
      setCodeError(
        r?.status === 429
          ? "Too many codes in a minute. Wait a moment and try again."
          : r
            ? errorMessage(r, "Couldn't create a code. Try again.")
            : "Couldn't reach Anghkooey. Try again."
      );
      return;
    }
    setNow(Date.now());
    setCode({ code: r.body.code as string, provider, expiresAt: new Date(r.body.expiresAt as string).getTime() });
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setCodeError("Couldn't copy automatically. Select the code and copy it by hand.");
    }
  };

  const startLink = (p: Provider) => {
    setProvider(p);
    if (code && code.provider !== p) setCode(null);
    panelRef.current?.scrollIntoView({ block: "start" });
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-provider="${p}"]`)?.focus();
  };

  const linkedCount = channels.filter((c) => c.linked).length;
  const pending = channels.filter((c) => c.approvalExpiresAt);
  const active = code && code.provider === provider ? code : null;

  return (
    <div className="mem">
      <div className="mem-inner">
        <header className="mem-head">
          <p className="mem-eyebrow">Profile</p>
          <h1 className="mem-title">Your Anghkooey</h1>
          <p className="mem-lead">
            This browser holds an anonymous Anghkooey identity. There&rsquo;s no email, password or wallet. Link Telegram
            or iMessage so the same memory follows you there.
          </p>
        </header>

        {phase === "loading" ? (
          <p className="mem-status" role="status">
            Opening your profile…
          </p>
        ) : phase === "failed" ? (
          <div className="mem-status" role="alert">
            <p>Your profile couldn&rsquo;t be loaded right now.</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => void load()}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
              Try again
            </button>
          </div>
        ) : (
          <>
            <dl className="mem-overview">
              <div>
                <dt>Identity</dt>
                <dd className="mem-overview-state">Anonymous browser session</dd>
              </div>
              <div>
                <dt>Session ends</dt>
                <dd className="mem-overview-state">{expiresAt ? dateFmt(expiresAt) : "Unknown"}</dd>
              </div>
              <div>
                <dt>Linked channels</dt>
                <dd>
                  {linkedCount}
                  <span className="acct-of"> of 2</span>
                </dd>
              </div>
            </dl>

            <p className="mem-note">
              There&rsquo;s no account recovery yet. Clearing cookies, ending the session or switching devices starts a new
              identity, and this one can&rsquo;t be reopened in a browser. Chats you&rsquo;ve linked keep working with the
              same memory.
            </p>

            {notice ? (
              <p className="mem-notice" role="status">
                {notice}
              </p>
            ) : null}

            {pending.map((ch) => (
              <div key={ch.provider} className="mem-banner" role="status">
                <p>
                  A {NAME[ch.provider]} chat sent your code and is waiting for you. Reply <strong>MERGE YES</strong> in
                  that chat before {timeFmt(ch.approvalExpiresAt!)} to share one memory, or <strong>MERGE NO</strong> to
                  keep it separate. Nothing changes until you reply.
                </p>
                <button type="button" className="app-btn app-btn-glass" disabled={checking} onClick={() => void refresh()}>
                  <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
                  {checking ? "Checking…" : "I replied, check now"}
                </button>
              </div>
            ))}

            <section aria-labelledby="channels-title" className="acct-section">
              <div className="mem-archive-head">
                <h2 id="channels-title" className="mem-h2">
                  Connected channels
                </h2>
                <div className="acct-check">
                  <button type="button" className="app-btn app-btn-quiet" disabled={checking} onClick={() => void refresh()}>
                    <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
                    {checking ? "Checking…" : "Check status"}
                  </button>
                  <span className="mem-help" aria-live="polite">
                    {checkedAt ? `Checked at ${timeFmt(checkedAt)}` : ""}
                  </span>
                </div>
              </div>
              <ul className="mem-grid">
                {channels.map((ch) => (
                  <ChannelCard key={ch.provider} ch={ch} onLink={() => startLink(ch.provider)} />
                ))}
              </ul>
              {consolidated > 0 ? (
                <p className="mem-help">
                  {consolidated} earlier chat {consolidated === 1 ? "account was" : "accounts were"} consolidated into this
                  identity after a MERGE YES. Their memories are recalled here too.
                </p>
              ) : null}
            </section>

            <section ref={panelRef} aria-labelledby="link-title" className="mem-search acct-link">
              <h2 id="link-title" className="mem-h2">
                Link a channel
              </h2>
              <div role="group" aria-label="Channel" className="mem-seg">
                {(["telegram", "imessage"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-provider={p}
                    aria-pressed={provider === p}
                    onClick={() => setProvider(p)}
                  >
                    {NAME[p]}
                  </button>
                ))}
              </div>

              {provider === "imessage" ? (
                <p className="mem-text">
                  There&rsquo;s no public iMessage contact yet. Use this only if you already message Anghkooey on iMessage,
                  and send the code in that same thread.
                </p>
              ) : null}

              {active ? (
                <div className="acct-code">
                  <p className="mem-h3">Your code for {NAME[active.provider]}</p>
                  <div className="acct-code-row">
                    <code className="acct-code-value" aria-label="Link code">
                      {active.code}
                    </code>
                    <button type="button" className="app-btn app-btn-glass" onClick={() => void copy()}>
                      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                      {copied ? "Copied" : "Copy code"}
                    </button>
                  </div>
                  <p className="mem-help">
                    Works once. Expires in <span className="acct-timer">{clock(active.expiresAt - now)}</span>
                    <span className="sr-only">, at {timeFmt(active.expiresAt)}</span>.
                  </p>
                  <ol className="acct-steps">
                    <li>Copy the code.</li>
                    <li>
                      {active.provider === "telegram" ? (
                        <>
                          Open{" "}
                          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">
                            @useanghkooey_bot
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>{" "}
                          and send the code as a single message, with nothing else.
                        </>
                      ) : (
                        "In your existing iMessage thread with Anghkooey, send the code as a single message, with nothing else."
                      )}
                    </li>
                    <li>
                      The chat will usually ask you to confirm. Reply MERGE YES to share one memory, or MERGE NO to keep
                      that chat separate.
                    </li>
                    <li>Come back here and press Check status. A channel shows Linked only once Anghkooey confirms it.</li>
                  </ol>
                  {active.provider === "telegram" ? (
                    <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="app-btn app-btn-primary">
                      Open Telegram
                      <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.5} />
                      <span className="sr-only"> (opens @useanghkooey_bot in a new tab)</span>
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="acct-code">
                  <p className="mem-help">
                    A code proves this browser is yours. Anghkooey links the chat that sends it, based on who actually sent
                    the message. Codes last 10 minutes and are never saved in this browser.
                  </p>
                  <div>
                    <button type="button" className="app-btn app-btn-primary" disabled={codeBusy} onClick={() => void generate()}>
                      {codeBusy ? "Creating…" : "Generate secure code"}
                    </button>
                  </div>
                </div>
              )}
              {codeError ? (
                <p className="mem-error" role="alert">
                  {codeError}
                </p>
              ) : null}
            </section>

            <section aria-labelledby="merge-title" className="acct-section">
              <h2 id="merge-title" className="mem-h2">
                If that chat already has memories
              </h2>
              <p className="mem-text">
                A Telegram or iMessage chat that has talked to Anghkooey before has its own identity. Sending your code
                there doesn&rsquo;t merge anything by itself. The chat asks you to reply MERGE YES within 15 minutes.
                After that, its earlier memories are recalled here too and new ones are shared. Nothing on Walrus is moved
                or deleted. MERGE NO, or letting the window pass, keeps the two apart.
              </p>
            </section>

            <p className="mem-foot">
              {consent ? "Memory is on." : "Memory is off, so nothing new is saved."}{" "}
              <Link href="/settings">Settings</Link> · <Link href="/memories">Memories</Link> ·{" "}
              <Link href="/chat">Back to chat</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ChannelCard({ ch, onLink }: { ch: Channel; onLink: () => void }) {
  const state = ch.linked ? "linked" : ch.approvalExpiresAt ? "waiting" : "none";
  return (
    <li className="mem-card acct-channel" data-state={state}>
      <div className="mem-card-top">
        <span className="mem-cat">{NAME[ch.provider]}</span>
        <span className="mem-badge" data-state={state === "none" ? "superseded" : "active"}>
          {state === "linked" ? "Linked" : state === "waiting" ? "Awaiting MERGE YES" : "Not linked"}
        </span>
      </div>
      <p className="mem-text">
        {state === "linked"
          ? `${ch.verified && ch.verifiedAt ? `Verified ${dateFmt(ch.verifiedAt)}. ` : ""}This chat shares memory with your browser identity.`
          : state === "waiting"
            ? "Your code arrived. Reply MERGE YES in that chat to finish linking."
            : ch.provider === "telegram"
              ? "Send a one-time code to @useanghkooey_bot to share memory with this browser."
              : "No public iMessage contact yet. Testers already chatting on iMessage can link that thread."}
      </p>
      {state === "none" ? (
        <div className="mem-card-actions">
          <button type="button" className="app-btn app-btn-glass" onClick={onLink}>
            Link {NAME[ch.provider]}
            <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      ) : null}
    </li>
  );
}
