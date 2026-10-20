import Link from "next/link";
import type { ReactNode } from "react";
import { FoldedA } from "@/components/brand/FoldedA";
import { Wordmark } from "@/components/brand/Wordmark";
import "./legal.css";

type Props = {
  current: "privacy" | "terms";
  eyebrow: string;
  title: string;
  lead: ReactNode;
  updated: string;
  children: ReactNode;
};

/** Shared public layout for /privacy and /terms. Self-contained: imports its own stylesheet (lg-* classes). */
export function LegalPage({ current, eyebrow, title, lead, updated, children }: Props) {
  const link = (href: string, label: string, key: Props["current"]) => (
    <Link href={href} aria-current={current === key ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <div className="lg-page">
      <header className="lg-top">
        <div className="lg-bar">
          <Link href="/" aria-label="Anghkooey home" className="lg-brand">
            <span className="lg-mark">
              <FoldedA className="h-auto w-full" />
            </span>
            <span className="lg-word">
              <Wordmark />
            </span>
          </Link>
          <nav aria-label="Legal" className="lg-nav">
            {link("/privacy", "Privacy", "privacy")}
            {link("/terms", "Terms", "terms")}
          </nav>
        </div>
      </header>

      <main className="lg-main">
        <article className="lg-article">
          <header className="lg-intro">
            <p className="lg-eyebrow">{eyebrow}</p>
            <h1 className="lg-title">{title}</h1>
            <p className="lg-lead">{lead}</p>
            <p className="lg-updated">Last updated {updated}</p>
          </header>
          <div className="lg-body">{children}</div>
        </article>
      </main>

      <footer className="lg-foot">
        <nav aria-label="Legal footer" className="lg-foot-in">
          {link("/privacy", "Privacy Policy", "privacy")}
          {link("/terms", "Terms of Service", "terms")}
          <Link href="/">Back to Anghkooey</Link>
        </nav>
      </footer>
    </div>
  );
}
