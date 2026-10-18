import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Anghkooey",
  description: "How Anghkooey handles identities, memories, channel linking, and connected Gmail accounts.",
};

const updated = "October 18, 2026";

/** Public privacy policy. Describes actual current behavior only. */
export default function PrivacyPage() {
  return (
    <div className="mem">
      <div className="mem-inner">
        <header className="mem-head">
          <p className="mem-eyebrow">Privacy Policy</p>
          <h1 className="mem-title">How Anghkooey handles your information</h1>
          <p className="mem-lead">
            Last updated {updated}. This page describes what Anghkooey does today. It does not promise features that do
            not exist yet.
          </p>
        </header>

        <section className="acct-section">
          <h2 className="mem-h2">Anonymous browser identities</h2>
          <p className="mem-text">
            There are no accounts, passwords, or email logins. Each browser holds an anonymous identity through a
            session cookie. Anyone with that cookie can use that identity, and there is no way to recover it if the
            session ends, expires, or its cookies are cleared.
          </p>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Telegram and iMessage linking</h2>
          <p className="mem-text">
            You can link a Telegram or iMessage chat to your web identity by creating a single-use code in your
            browser session and sending it from your own chat. If that chat already has its own saved memories,
            nothing merges until you explicitly confirm it in the chat. Linked chats share one identity, so memories
            saved in one channel can be recalled in another. Group chats are excluded from personal memory.
          </p>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Memories on Walrus</h2>
          <p className="mem-text">
            Preferences you share while memory is on are written as blobs on Walrus Mainnet through the standard
            relayer, which handles encryption. Anghkooey operates the Walrus account and keeps your memories in a
            namespace reserved for you. You do not hold the keys, and encryption does not happen in your browser.
          </p>
          <p className="mem-text">
            Correcting a memory saves a new blob and marks the old one replaced so it is not used again. Walrus
            blobs are not edited or permanently deleted. They remain for their storage period. Turning memory off
            stops new saves but does not erase what is already stored.
          </p>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Records kept in the database</h2>
          <p className="mem-text">
            A database holds session records, memory metadata such as blob references, channel-linking state, and
            short conversation history used for follow-up context. Message content is never written to logs alongside
            identifiers, and secrets are never logged.
          </p>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Connected Gmail accounts</h2>
          <p className="mem-text">
            Connecting Gmail is optional and separate from memory consent. Turning memory on does not connect Gmail,
            and connecting Gmail does not change your memory setting.
          </p>
          <p className="mem-text">
            Google is asked only to confirm your email address and for permission to send mail you approve (the
            gmail.send scope). Anghkooey does not request inbox access and does not read your mail. OAuth tokens are
            encrypted on the server and are never placed in browser storage, sent to the chat model, or logged.
          </p>
          <p className="mem-text">
            A mailbox is bound to the identity that connected it. A different chat sender cannot use your Gmail
            connection. Connecting Gmail does not send anything by itself: every email needs an explicit
            single-use approval from the same chat. Disconnecting in Settings deletes the stored connection
            and asks Google to revoke access.
          </p>
          <p className="mem-text">
            Approved hotel inquiries are prepared in chat, shown back to you in full, and sent only after you
            reply with the single-use approval code. Each approval works once, expires quickly, and covers one
            exact email. The stored record is the Gmail message identifier returned by Google, which confirms
            receipt by Gmail, not delivery to the recipient inbox. Draft contents are encrypted at rest.
          </p>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Third parties that process data</h2>
          <ul className="chat-consent-list mem-text">
            <li>DeepSeek receives conversation text and recalled memories to produce answers.</li>
            <li>Walrus and its relayer store and return memory blobs.</li>
            <li>Google handles Gmail authorization and, once connected, token operations. Google sees only what its
              own authorization pages and APIs receive.</li>
            <li>Telegram and Photon carry chat messages for linked channels.</li>
          </ul>
        </section>

        <section className="acct-section">
          <h2 className="mem-h2">Deletion and retention limits</h2>
          <ul className="chat-consent-list mem-text">
            <li>Walrus blobs cannot be permanently deleted today. Corrections replace rather than erase.</li>
            <li>Ending a browser session signs that browser out. It does not erase Walrus memories.</li>
            <li>Disconnecting Gmail removes the stored mailbox connection locally and requests revocation at Google.</li>
          </ul>
        </section>

        <p className="mem-foot">
          <Link href="/settings">Settings</Link> · <Link href="/chat">Back to chat</Link>
        </p>
      </div>
    </div>
  );
}
