"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RotateCw } from "lucide-react";
import { call, errorMessage } from "@/lib/app-client";
import { CONVERSATION_KEY_PREFIX } from "@/lib/site";

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

function forgetLocalConversations() {
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(CONVERSATION_KEY_PREFIX)) window.localStorage.removeItem(k);
    }
  } catch {
    // Storage can be unavailable (private mode). Nothing to clear then.
  }
}

export function Settings() {
  const [phase, setPhase] = useState<"loading" | "failed" | "ready" | "ended">("loading");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState<"consent" | "end" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setNotice(null);
    setError(null);
    setConfirmOn(false);
    setConfirmEnd(false);
    const s = await call("/api/session", { method: "POST" }).catch(() => null);
    const st = s?.ok ? await call("/api/settings").catch(() => null) : null;
    if (!s?.ok || !st?.ok) return setPhase("failed");
    setExpiresAt(s.body.expiresAt as string);
    setConsentAt((st.body.consentAt as string | null) ?? null);
    setPhase("ready");
  }, []);

  useEffect(() => {
    // Initial fetch syncs with the session and settings APIs on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const memoryOn = consentAt !== null;

  const setMemory = async (on: boolean) => {
    setBusy("consent");
    setError(null);
    const r = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ consent: on }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      if (r?.status === 401) return setPhase("ended");
      return setError(r ? errorMessage(r, "Memory setting wasn't changed. Try again.") : "Couldn't reach Anghkooey. Try again.");
    }
    setConsentAt((r.body.consentAt as string | null) ?? null);
    setConfirmOn(false);
    setNotice(
      on
        ? "Memory is on. Preferences you share can now be saved to Walrus Mainnet."
        : "Memory is off. Nothing new will be saved. Memories already on Walrus stay there and can still be recalled."
    );
  };

  const endSession = async () => {
    setBusy("end");
    setError(null);
    const r = await call("/api/session", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    // 401 means the session was already gone, which is the same end state.
    if (!r || (!r.ok && r.status !== 401)) {
      return setError(r ? errorMessage(r, "The session wasn't ended. Try again.") : "Couldn't reach Anghkooey. Try again.");
    }
    forgetLocalConversations();
    setConfirmEnd(false);
    setPhase("ended");
  };

  return (
    <div className="mem">
      <div className="mem-inner">
        <header className="mem-head">
          <p className="mem-eyebrow">Settings</p>
          <h1 className="mem-title">Memory and session</h1>
          <p className="mem-lead">Choose whether Anghkooey saves new memories, and manage this browser&rsquo;s session.</p>
        </header>

        {phase === "loading" ? (
          <p className="mem-status" role="status">
            Opening your settings…
          </p>
        ) : phase === "failed" ? (
          <div className="mem-status" role="alert">
            <p>Your settings couldn&rsquo;t be loaded right now.</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => void load()}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
              Try again
            </button>
          </div>
        ) : phase === "ended" ? (
          <div className="mem-empty" role="status">
            <p className="mem-empty-title">This browser session has ended.</p>
            <p className="mem-text">
              Your memories weren&rsquo;t erased. This browser no longer opens that identity, and there&rsquo;s no way to
              sign back in to it. Chats you linked on Telegram or iMessage still use the same memory. Opening chat here
              starts a new, empty identity.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="app-btn app-btn-glass">
                Home
              </Link>
              <Link href="/chat" className="app-btn app-btn-primary">
                Start a new session
                <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {notice ? (
              <p className="mem-notice" role="status">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="mem-error" role="alert">
                {error}
              </p>
            ) : null}

            <section aria-labelledby="memory-title" className="mem-search acct-link">
              <div className="acct-row">
                <div className="acct-row-text">
                  <h2 id="memory-title" className="mem-h2">
                    Memory
                  </h2>
                  <p className="mem-text" id="memory-desc">
                    {memoryOn
                      ? `On since ${dateFmt(consentAt!)}. Preferences you share can be saved to Walrus Mainnet.`
                      : "Off. Anghkooey still answers and can recall memories you already saved, but saves nothing new."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={memoryOn}
                  aria-labelledby="memory-title"
                  aria-describedby="memory-desc"
                  className="acct-switch"
                  disabled={busy !== null}
                  onClick={() => (memoryOn ? void setMemory(false) : setConfirmOn(true))}
                >
                  <span aria-hidden className="acct-switch-knob" />
                  <span className="acct-switch-label">{busy === "consent" ? "Saving…" : memoryOn ? "On" : "Off"}</span>
                </button>
              </div>

              {confirmOn && !memoryOn ? (
                <div className="mem-fix" role="group" aria-labelledby="consent-title">
                  <p id="consent-title" className="mem-h3">
                    Turn memory on?
                  </p>
                  <ul className="chat-consent-list">
                    <li>Hotel, travel and dining preferences you share can be saved as memories on Walrus Mainnet.</li>
                    <li>Later answers can use them, and each reply shows which memories it used.</li>
                    <li>Turning memory off later stops new saves. It doesn&rsquo;t erase what&rsquo;s already stored.</li>
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="app-btn app-btn-primary"
                      disabled={busy !== null}
                      onClick={() => void setMemory(true)}
                    >
                      {busy === "consent" ? "Turning on…" : "Turn memory on"}
                    </button>
                    <button type="button" className="app-btn app-btn-quiet" onClick={() => setConfirmOn(false)}>
                      Not now
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="storage-title" className="acct-section">
              <h2 id="storage-title" className="mem-h2">
                How memory is stored
              </h2>
              <ul className="chat-consent-list mem-text">
                <li>
                  Each memory is a blob on Walrus Mainnet. Anghkooey writes it through the default MemWal relayer, which
                  handles Seal encryption.
                </li>
                <li>
                  Anghkooey runs the Walrus account and keeps your memories in a namespace reserved for you. You don&rsquo;t
                  hold the keys, and encryption doesn&rsquo;t happen in your browser.
                </li>
                <li>
                  Correcting a memory saves a new blob and marks the old one replaced, so it isn&rsquo;t used again. Walrus
                  blobs aren&rsquo;t edited or deleted. They stay for their Walrus storage period.
                </li>
                <li>There&rsquo;s no permanent delete yet. Turning memory off only stops new saves.</li>
              </ul>
              <p className="mem-foot">
                <Link href="/memories">Review and correct memories</Link>
              </p>
            </section>

            <section aria-labelledby="session-title" className="mem-search acct-link">
              <h2 id="session-title" className="mem-h2">
                Browser session
              </h2>
              <dl className="mem-meta">
                <div>
                  <dt>Identity</dt>
                  <dd>Anonymous, held by this browser</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{expiresAt ? dateFmt(expiresAt) : "Unknown"}</dd>
                </div>
              </dl>
              <p className="mem-text">
                There&rsquo;s no account recovery. If this session ends, expires or its cookies are cleared, you may not be
                able to reach this web identity again. Linked chats keep working.{" "}
                <Link href="/profile" className="acct-inline">
                  Link a channel
                </Link>
              </p>
              {confirmEnd ? (
                <div className="mem-fix" role="group" aria-labelledby="end-title">
                  <p id="end-title" className="mem-h3">
                    End this session?
                  </p>
                  <p className="mem-help">
                    This signs this browser out of its identity. Your memories stay on Walrus, but there&rsquo;s no way to
                    sign back in here.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="app-btn app-btn-primary"
                      disabled={busy !== null}
                      onClick={() => void endSession()}
                    >
                      {busy === "end" ? "Ending…" : "End session"}
                    </button>
                    <button type="button" className="app-btn app-btn-quiet" onClick={() => setConfirmEnd(false)}>
                      Keep session
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button type="button" className="app-btn app-btn-glass" onClick={() => setConfirmEnd(true)}>
                    End session
                  </button>
                </div>
              )}
            </section>

            <p className="mem-foot">
              <Link href="/profile">Profile</Link> · <Link href="/chat">Back to chat</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
