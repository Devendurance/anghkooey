import { ArrowUp, ArrowUpRight, Send } from "lucide-react";
import Link from "next/link";
import { COPYRIGHT_YEAR, REPO_URL, TELEGRAM_BOT_URL } from "@/lib/site";
import { FoldedA } from "./FoldedA";
import { Wordmark } from "./Wordmark";
import "./footer.css";

const PRODUCT = [
  { label: "How it works", href: "#story" },
  { label: "Everyday uses", href: "#experiences" },
  { label: "Channels", href: "#channels" },
  { label: "Privacy and control", href: "#control" },
];

const linkCls = "inline-flex min-h-11 items-center gap-1.5 text-[15px] text-footer-link transition-colors duration-200 hover:text-white";

/** Site footer [B]: graphite ground with grain and a low aurora that continues the CTA ribbon. */
export function SiteFooter() {
  return (
    <footer data-site-footer className="lp-footer">
      <div aria-hidden className="lp-footer-aurora" />
      <div className="lp-footer-inner">
        <div className="lp-footer-top">
          <div className="max-w-[40ch]">
            <Link href="/" aria-label="Anghkooey home" className="-m-2 inline-flex items-center gap-2.5 rounded-lg p-2">
              <span className="block w-6">
                <FoldedA className="h-auto w-full" />
              </span>
              <span className="block h-5 w-[164px]">
                <Wordmark />
              </span>
            </Link>
            <p className="mt-5 text-[15px] leading-6 text-footer-muted">
              A personal AI concierge that remembers how you like things. Anghkooey keeps the preferences and experiences
              that shape your choices, then brings the relevant context back when you need help again.
            </p>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Anghkooey on Telegram (opens in a new tab)"
              className="lp-social mt-6"
            >
              <Send aria-hidden className="size-4" strokeWidth={1.5} />
            </a>
          </div>

          <nav aria-label="Footer" className="lp-footer-cols">
            <div>
              <h2 className="lp-footer-h">Product</h2>
              <ul className="mt-3">
                {PRODUCT.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className={linkCls}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="lp-footer-h">Channels</h2>
              <ul className="mt-3">
                <li>
                  <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    Telegram
                    <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
                <li className="lp-footer-static">
                  iMessage <span className="lp-footer-tag">In testing</span>
                </li>
                <li>
                  <Link href="/chat" className={linkCls}>
                    Web chat
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="lp-footer-h">Resources</h2>
              <ul className="mt-3">
                <li>
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    Source on GitHub
                    <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="lp-footer-bottom">
          <p>&copy; {COPYRIGHT_YEAR} Anghkooey. All rights reserved.</p>
          <p className="text-footer-muted">Memory stays off until you say yes. Memories are stored on Walrus.</p>
          <a href="#top" className="inline-flex min-h-11 items-center gap-1.5 text-footer-link hover:text-white">
            Back to top
            <ArrowUp aria-hidden className="size-3.5" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </footer>
  );
}
