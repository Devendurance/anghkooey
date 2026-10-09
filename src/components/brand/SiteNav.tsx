"use client";

import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { NAV_LINKS, START_TALKING } from "@/lib/site";
import { ButtonLink } from "./ButtonLink";
import { FoldedA } from "./FoldedA";
import { Wordmark } from "./Wordmark";

/**
 * Fixed brand navigation. The wordmark slot ([data-dock-slot]) is the landing
 * hero's dock target, so its size must stay in sync with the hero flight.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div data-nav-backdrop aria-hidden />
      <header
        data-nav
        className="pointer-events-none fixed inset-x-0 top-0 z-[58] pt-[env(safe-area-inset-top)]"
      >
        <div className="relative flex h-[72px] items-center justify-between pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] sm:h-[88px] sm:px-10">
          <Link
            href="/"
            aria-label="Anghkooey home"
            className="pointer-events-auto -m-2 flex items-center gap-2.5 rounded-lg p-2"
          >
            <span data-nav-mark className="block w-[22px] sm:w-6">
              <FoldedA className="h-auto w-full" />
            </span>
            <span data-dock-slot className="block h-4 w-[131px] sm:h-5 sm:w-[164px]">
              <span data-nav-wordmark className="block">
                <Wordmark eager />
              </span>
            </span>
          </Link>

          <nav
            aria-label="Primary"
            className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 rounded-full border border-hairline bg-black px-5 py-2 md:flex"
          >
            {NAV_LINKS.map((l, i) => (
              <a
                key={l.label}
                href={l.href}
                aria-current={i === 0 ? "page" : undefined}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`t-nav ${l.wide ? "hidden lg:inline-flex" : "inline-flex"} min-h-6 items-center gap-1 rounded-full transition-colors duration-200 ${i === 0 ? "text-cream" : "text-cream-55 hover:text-cream"}`}
              >
                {l.label}
                {l.external ? <ArrowUpRight aria-hidden className="size-3" strokeWidth={1.5} /> : null}
              </a>
            ))}
          </nav>

          <div className="pointer-events-auto flex items-center gap-3">
            <span className="hidden md:block">
              <ButtonLink
                href={START_TALKING.href}
                external={START_TALKING.external}
                srHint={START_TALKING.hint}
                variant="quiet"
              >
                {START_TALKING.label}
              </ButtonLink>
            </span>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((v) => !v)}
              className="t-nav inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-black px-4 text-cream md:hidden"
            >
              {open ? <X aria-hidden className="size-4" strokeWidth={1.5} /> : <Menu aria-hidden className="size-4" strokeWidth={1.5} />}
              Menu
            </button>
          </div>

          <div
            id={menuId}
            hidden={!open}
            className="pointer-events-auto absolute right-[max(20px,env(safe-area-inset-right))] top-[64px] w-[min(280px,calc(100vw-40px))] rounded-[20px] border border-glass-border bg-night-deep/95 p-2 md:hidden"
          >
            <ul className="flex flex-col">
              {NAV_LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="t-nav flex min-h-11 items-center justify-between rounded-xl px-4 text-cream hover:bg-glass"
                  >
                    {l.label}
                    {l.external ? <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} /> : null}
                  </a>
                </li>
              ))}
            </ul>
            <ButtonLink
              href={START_TALKING.href}
              external={START_TALKING.external}
              srHint={START_TALKING.hint}
              className="mt-2 w-full"
            >
              {START_TALKING.label}
              <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
            </ButtonLink>
          </div>
        </div>
      </header>
    </>
  );
}
