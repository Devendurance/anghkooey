import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Anghkooey",
  description: "How Anghkooey handles identities, memories, channel linking, and connected Gmail accounts.",
};

const updated = "October 21, 2026";

/** Public privacy policy. Describes actual current behavior only. */
export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      eyebrow="Privacy Policy"
      title="How Anghkooey handles your information"
      updated={updated}
      lead="This page describes what Anghkooey does today. It does not promise features that do not exist yet."
    >

        <section className="lg-section">
          <h2 className="lg-h2">Anonymous browser identities</h2>
          <p className="lg-p">
            There are no accounts, passwords, or email logins. Each browser holds an anonymous identity through a
            session cookie. Anyone with that cookie can use that identity, and there is no way to recover it if the
            session ends, expires, or its cookies are cleared.
          </p>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Telegram and iMessage linking</h2>
          <p className="lg-p">
            You can link a Telegram or iMessage chat to your web identity by creating a single-use code in your
            browser session and sending it from your own chat. If that chat already has its own saved memories,
            nothing merges until you explicitly confirm it in the chat. Linked chats share one identity, so memories
            saved in one channel can be recalled in another. Group chats are excluded from personal memory.
          </p>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Memories on Walrus</h2>
          <p className="lg-p">
            Preferences you share while memory is on are written as blobs on Walrus Mainnet through the standard
            relayer, which handles encryption. Anghkooey operates the Walrus account and keeps your memories in a
            namespace reserved for you. You do not hold the keys, and encryption does not happen in your browser.
          </p>
          <p className="lg-p">
            Correcting a memory saves a new blob and marks the old one replaced so it is not used again. Walrus
            blobs are not edited or permanently deleted. They remain for their storage period. Turning memory off
            stops new saves but does not erase what is already stored.
          </p>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Records kept in the database</h2>
          <p className="lg-p">
            A database holds session records, memory metadata such as blob references, channel-linking state, and
            short conversation history used for follow-up context. Message content is never written to logs alongside
            identifiers, and secrets are never logged.
          </p>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Connected Gmail accounts</h2>
          <p className="lg-p">
            Connecting Gmail is optional and separate from memory consent. Turning memory on does not connect Gmail,
            and connecting Gmail does not change your memory setting.
          </p>
          <p className="lg-p">
            Google is asked only to confirm your email address (the openid and email scopes) and for permission to
            send mail you approve (the gmail.send scope). Anghkooey does not request inbox access and does not read your mail. OAuth tokens are
            encrypted on the server and are never placed in browser storage, sent to the chat model, or logged.
          </p>
          <p className="lg-p">
            A mailbox is bound to the identity that connected it. A different chat sender cannot use your Gmail
            connection. Connecting Gmail does not send anything by itself: every email needs an explicit
            single-use approval from the same chat. Disconnecting in Settings deletes the stored connection
            and asks Google to revoke access.
          </p>
          <p className="lg-p">
            Approved hotel inquiries are prepared in chat, shown back to you in full, and sent only after you
            reply with the single-use approval code. Each approval works once, expires quickly, and covers one
            exact email. The stored record is the Gmail message identifier returned by Google, which confirms
            receipt by Gmail, not delivery to the recipient inbox. Draft contents are encrypted at rest.
          </p>
          <p className="lg-p">
            Multi-hotel batches work the same way: each inquiry is previewed in full, one approval code covers
            the exact batch snapshot, and every recipient keeps its own send receipt.
          </p>
          <p className="lg-p">
            Approval codes expire 30 minutes after they are issued, and cancelling a draft or batch makes its code
            unusable. Expiry and cancellation only stop an email from being sent. They do not delete anything.
            Draft and batch records stay in the database with their status (pending, sent, cancelled, expired or
            failed). That includes the encrypted recipient, subject and body, the hotel name, the hotel contact
            address and its source page, your sender Gmail address, the dates and destination, and the Gmail
            message identifier for sent emails. Anghkooey does not currently delete these records automatically,
            and disconnecting Gmail does not remove them. There is no self-service way to delete them today. They
            are used only to preview, approve, send and show receipts for your emails, not for any other purpose.
            A retention period and a deletion option have not been decided yet.
          </p>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Google API Services User Data Policy</h2>
          <p className="lg-p">
            Anghkooey&rsquo;s use and transfer of information received from Google APIs to any other app will adhere
            to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <ul className="lg-list">
            <li>Your Google email address is used to show which mailbox is connected. The gmail.send permission is used only to send emails you approve.</li>
            <li>Google user data is not used for advertising and is not sold.</li>
            <li>Anghkooey does not read your Gmail inbox, so no inbox content is collected.</li>
          </ul>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Third parties that process data</h2>
          <ul className="lg-list">
            <li>DeepSeek receives conversation text and recalled memories to produce answers.</li>
            <li>Walrus and its relayer store and return memory blobs.</li>
            <li>Google handles Gmail authorization and, once connected, token operations. Google sees only what its
              own authorization pages and APIs receive.</li>
            <li>Telegram and Photon carry chat messages for linked channels.</li>
          </ul>
        </section>

        <section className="lg-section">
          <h2 className="lg-h2">Deletion and retention limits</h2>
          <ul className="lg-list">
            <li>Walrus blobs cannot be permanently deleted today. Corrections replace rather than erase.</li>
            <li>Ending a browser session signs that browser out. It does not erase Walrus memories.</li>
            <li>Disconnecting Gmail removes the stored mailbox connection locally and requests revocation at Google. It does not delete past email drafts, batches or send receipts.</li>
            <li>Email draft, batch and receipt records are kept with no automatic deletion today.</li>
          </ul>
        </section>

        <section className="lg-section">
          <p className="lg-p">
            See the <Link href="/terms">Terms of Service</Link>, or manage Gmail and memory in{" "}
            <Link href="/settings">Settings</Link>.
          </p>
        </section>
    </LegalPage>
  );
}
