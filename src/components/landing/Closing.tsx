"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BRAND_ASSETS, START_TALKING, TELEGRAM_BOT_URL } from "@/lib/site";
import "./closing.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Closing CTA band: editorial copy left, ribbon art slot right. */
export function CtaBand() {
  const root = useRef<HTMLElement>(null);
  const [artFailed, setArtFailed] = useState(false);
  const { src, width, height } = BRAND_ASSETS.ribbon;

  useGSAP(
    () => {
      if (document.documentElement.dataset.motion !== "full") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-ribbon]",
          { yPercent: 8, rotate: -2 },
          {
            yPercent: -6,
            rotate: 0,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.8 },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="start" aria-labelledby="cta-title" className="lp-cta">
      <div aria-hidden className="lp-cta-art">
        <div data-ribbon className="lp-ribbon">
          {artFailed ? (
            <span className="lp-ribbon-fallback" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              width={width}
              height={height}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setArtFailed(true)}
            />
          )}
        </div>
      </div>

      <div className="lp-container lp-cta-inner">
        <div className="lp-cta-copy">
          <p className="lp-cta-micro">Available now on Telegram</p>
          <h2 id="cta-title" className="lp-cta-title">
            Remember what matters, when it matters.
          </h2>
          <p className="t-lead max-w-[30rem]">
            Tell Anghkooey what matters to you once. When the next hotel, meal, or trip decision comes up, it can start
            with your context instead of a blank slate.
          </p>
          <div className="flex flex-col items-start gap-4">
            <a href={START_TALKING.href} target="_blank" rel="noopener noreferrer" className="lp-viewfinder">
              <i aria-hidden className="lp-vf lp-vf-tl" />
              <i aria-hidden className="lp-vf lp-vf-tr" />
              <i aria-hidden className="lp-vf lp-vf-bl" />
              <i aria-hidden className="lp-vf lp-vf-br" />
              Tell Anghkooey one thing
              <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.5} />
              <span className="sr-only"> (opens @useanghkooey_bot on Telegram in a new tab)</span>
            </a>
            <p className="t-caption" aria-hidden>
              Opens @useanghkooey_bot on Telegram
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const HUD_SECTIONS = [
  { id: "story", label: "Story" },
  { id: "experiences", label: "Everyday" },
  { id: "channels", label: "Channels" },
  { id: "control", label: "Privacy" },
  { id: "start", label: "Start" },
] as const;

/**
 * Desktop-only edge HUD: section counter, Telegram shortcut and a dot pager.
 * Shown between the hero and the footer; hidden controls are not focusable.
 */
export function BottomHud() {
  const [active, setActive] = useState(-1);
  const [footerIn, setFooterIn] = useState(false);

  useEffect(() => {
    const els = HUD_SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const hero = document.querySelector("[data-hero]");
    const footer = document.querySelector("[data-site-footer]");
    const mid = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === hero) {
            if (e.isIntersecting) setActive(-1);
          } else if (e.isIntersecting) {
            setActive(els.indexOf(e.target as HTMLElement));
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    els.forEach((el) => mid.observe(el));
    if (hero) mid.observe(hero);
    const foot = new IntersectionObserver(([e]) => setFooterIn(e.isIntersecting), { rootMargin: "0px 0px -15% 0px" });
    if (footer) foot.observe(footer);
    return () => {
      mid.disconnect();
      foot.disconnect();
    };
  }, []);

  const show = active >= 0 && !footerIn;
  const current = HUD_SECTIONS[Math.max(active, 0)];

  return (
    <div className="lp-hud" data-show={show ? "" : undefined} aria-hidden={!show}>
      <div className="lp-hud-left">
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Anghkooey on Telegram (opens in a new tab)"
          className="lp-hud-btn"
        >
          <Send aria-hidden className="size-3.5" strokeWidth={1.5} />
        </a>
        <p className="lp-hud-count" aria-hidden>
          <span className="text-cream">{String(Math.max(active, 0) + 1).padStart(2, "0")}</span>
          <span> / {String(HUD_SECTIONS.length).padStart(2, "0")}</span>
          <span className="lp-hud-name">{current.label}</span>
        </p>
      </div>

      <nav aria-label="Sections" className="lp-pager">
        <ul>
          {HUD_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={i === active ? "true" : undefined} className="lp-pager-dot">
                <span className="sr-only">{s.label}</span>
                <span aria-hidden className="lp-pager-tip">
                  {s.label}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
