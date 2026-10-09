import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { FoldedA } from "@/components/brand/FoldedA";
import { APP_NAV, TELEGRAM_BOT_URL } from "@/lib/site";
import "./app.css";

type Props = { active: (typeof APP_NAV)[number]["key"]; children: ReactNode };

/** Quiet app frame shared by the web app routes. Only routes that exist are linked. */
export function AppShell({ active, children }: Props) {
  return (
    <div className="app-root">
      <a href="#app-main" className="app-skip">
        Skip to content
      </a>
      <header className="app-bar">
        <Link href="/" className="app-home" aria-label="Anghkooey home">
          <FoldedA className="h-7 w-auto" eager />
          <span className="app-home-name">Anghkooey</span>
        </Link>
        <nav aria-label="App" className="app-nav">
          {APP_NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="app-nav-link"
              aria-current={item.key === active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="app-nav-link">
            Telegram
            <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} />
            <span className="sr-only"> (opens @useanghkooey_bot in a new tab)</span>
          </a>
        </nav>
      </header>
      <main id="app-main" className="app-main">
        {children}
      </main>
    </div>
  );
}
