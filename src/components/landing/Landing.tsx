"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight } from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { ButtonLink } from "@/components/brand/ButtonLink";
import { FoldedA } from "@/components/brand/FoldedA";
import { SiteNav } from "@/components/brand/SiteNav";
import { Wordmark } from "@/components/brand/Wordmark";
import { BRAND_ASSETS, INTRO_SEEN_KEY, START_TALKING } from "@/lib/site";
import { APERTURE_OPEN, Aperture, drawAperture } from "./Aperture";
import { Orb } from "./Orb";
import { Ornaments } from "./Ornaments";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Keep in sync with the stacked media query in landing.css.
const STACKED = "(max-width: 639px), (max-width: 1023px) and (orientation: portrait)";
const SPLIT = "(min-width: 1024px), (min-width: 640px) and (orientation: landscape)";
const MOTION_OK = "(prefers-reduced-motion: no-preference)";

const maskStyle: CSSProperties = {
  WebkitMaskImage: `url(${BRAND_ASSETS.foldedA.src})`,
  maskImage: `url(${BRAND_ASSETS.foldedA.src})`,
};

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<ScrollTrigger | null>(null);

  useGSAP(
    () => {
      const html = document.documentElement;
      html.dataset.introJs = "1";
      const q = gsap.utils.selector(root);
      const one = <T extends Element = HTMLElement>(sel: string) => q(sel)[0] as unknown as T;
      const full = html.dataset.motion === "full";

      // Nav gains a backdrop once page content can pass beneath it.
      const nav = one("[data-nav-backdrop]");
      ScrollTrigger.create({
        trigger: one("[data-hero]"),
        start: full ? "bottom bottom" : "top+=8 top",
        onToggle: (self) => (self.isActive ? nav.setAttribute("data-solid", "") : nav.removeAttribute("data-solid")),
        // Past maxScroll so the backdrop stays on at the very bottom of the page.
        end: () => ScrollTrigger.maxScroll(window) + 100,
      });
      if (!full) return;

      // ---------- Intro: darkness -> recognition -> revelation ----------
      const finishIntro = () => {
        html.dataset.intro = "done";
        try {
          localStorage.setItem(INTRO_SEEN_KEY, "1");
        } catch {}
        removeSkip();
      };
      let removeSkip = () => {};

      if (html.dataset.intro === "play") {
        const ap = one<SVGSVGElement>("[data-intro-ap]");
        const lens = { a: 0, b: 0 };
        const drawLens = () => drawAperture(ap, lens.a, lens.b);
        const tl = gsap.timeline({ onComplete: finishIntro });
        tl.fromTo(one("[data-intro-base]"), { opacity: 0, scale: 0.97 }, { opacity: 0.22, scale: 1, duration: 0.9, ease: "power2.out" }, 0.2)
          .fromTo(one("[data-intro-light]"), { backgroundPosition: "130% 0%" }, { backgroundPosition: "-30% 0%", duration: 1.25, ease: "power2.inOut" }, 0.3)
          .fromTo(one("[data-intro-full]"), { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.out" }, 1.1)
          .fromTo(one("[data-intro-glow]"), { opacity: 0, scale: 0.92 }, { opacity: 0.45, scale: 1, duration: 0.7, ease: "power2.out" }, 1.1)
          .fromTo(one("[data-intro-reflect]"), { opacity: 0 }, { opacity: 0.12, duration: 0.8 }, 1.15)
          // One restrained pulse.
          .to(one("[data-intro-glow]"), { opacity: 0.8, duration: 0.14, ease: "sine.out" }, 1.82)
          .to(one("[data-intro-glow]"), { opacity: 0.15, duration: 0.2, ease: "sine.in" }, 1.96)
          .to(one("[data-intro-mark]"), { scale: 1.025, duration: 0.14, ease: "sine.out", yoyo: true, repeat: 1 }, 1.82)
          // The mark recedes into a glowing seam, then the almond opens onto the orb.
          .to(one("[data-intro-mark]"), { opacity: 0, scale: 0.86, duration: 0.4, ease: "power2.in" }, 2.1)
          .to(q("[data-intro-ap] [data-ap-edge]"), { opacity: 1, duration: 0.12 }, 2.22)
          .to(lens, { a: 18, b: 0.0001, duration: 0.22, ease: "power2.out", onUpdate: drawLens }, 2.22)
          .to(lens, { a: APERTURE_OPEN.a, b: APERTURE_OPEN.b, duration: 0.78, ease: "power3.inOut", onUpdate: drawLens }, 2.44)
          .to(q("[data-intro-ap] [data-ap-edge]"), { opacity: 0, duration: 0.3 }, 2.85)
          .from(one("[data-orb-intro]"), { scale: 1.1, opacity: 0.4, duration: 1.2, ease: "expo.out" }, 2.4)
          .from(one("[data-wm-intro]"), { opacity: 0, duration: 0.9, ease: "power2.out" }, 2.75)
          .from(one("[data-wm-img]"), { y: 14, duration: 1, ease: "expo.out" }, 2.75)
          .from(one("[data-nav]"), { opacity: 0, duration: 0.6, ease: "power2.out" }, 2.9)
          .from(one("[data-hint]"), { opacity: 0, duration: 0.6 }, 3.0);

        const skip = () => tl.progress(1);
        const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
        events.forEach((e) => window.addEventListener(e, skip, { passive: true }));
        removeSkip = () => events.forEach((e) => window.removeEventListener(e, skip));
      } else {
        // Repeat visit: minimal recognition, no gate.
        gsap.from(one("[data-wm-intro]"), { opacity: 0, duration: 0.8, ease: "power2.out" });
        gsap.from(one("[data-wm-img]"), { y: 10, duration: 0.9, ease: "expo.out" });
        finishIntro();
      }

      // ---------- Scroll: understanding -> continuity ----------
      ScrollTrigger.config({ ignoreMobileResize: true });
      const mm = gsap.matchMedia();
      mm.add({ split: SPLIT, stacked: STACKED, motion: MOTION_OK }, (ctx) => {
        const { split, motion } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        const stage = one("[data-stage]");
        const orb = one("[data-orb]");
        const copy = one("[data-copy]");
        const wmBox = one("[data-wm-intro]");
        const wm = one("[data-wm]");
        const slot = one("[data-dock-slot]");
        const lids = one<SVGSVGElement>("[data-lids]");
        const reveals = q("[data-reveal]");

        const dock = () => {
          const r = slot.getBoundingClientRect();
          const o = wmBox.getBoundingClientRect();
          return { x: r.left - o.left, y: r.top - o.top, s: r.width / o.width };
        };
        const splitEnd = () => {
          const d = orb.offsetWidth;
          const vw = stage.clientWidth;
          const right = copy.offsetLeft + copy.offsetWidth;
          const room = vw - right;
          const end = Math.min(d * 0.88, room * 1.15, stage.clientHeight * 0.9);
          return { s: end / d, x: right + room * 0.46 - vw / 2 };
        };
        const stackedEnd = () => {
          const d = orb.offsetWidth;
          const top = 76;
          const room = copy.offsetTop - 20 - top;
          // Short screens: the scene gives way entirely so the copy stays clear.
          const fits = room >= 120;
          const end = fits ? Math.min(d * 0.72, room) : d * 0.4;
          return { s: end / d, y: (fits ? top + room / 2 : top) - stage.clientHeight / 2, o: fits ? 1 : 0 };
        };

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: one("[data-hero]"),
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        scrollRef.current = tl.scrollTrigger ?? null;

        gsap.set(wm, { transformOrigin: "0 0" });
        tl.to(one("[data-hint]"), { autoAlpha: 0, duration: 0.06 }, 0)
          .to(wm, { y: () => -0.02 * window.innerHeight, duration: 0.1 }, 0)
          .to(wm, { x: () => dock().x, y: () => dock().y, scale: () => dock().s, duration: 0.22, ease: "power2.inOut" }, 0.1)
          .to(one("[data-wm-haze]"), { opacity: 0, duration: 0.2 }, 0.1)
          .to(q("[data-midlabel]"), { autoAlpha: 0, duration: 0.1 }, 0.08)
          .fromTo(one("[data-nav-mark]"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.08, ease: "back.out(2)" }, 0.28)
          .set(one("[data-nav-mark]"), { clearProps: "transform" }, 0.37);

        if (split) {
          const lid = { a: APERTURE_OPEN.a, b: APERTURE_OPEN.b };
          const drawLid = () => drawAperture(lids, lid.a, lid.b);
          drawLid();
          const edges = q("[data-lids] [data-ap-edge]");
          tl.to(orb, { scale: 1.03, duration: 0.1 }, 0)
            // Close: the scene dims as the lids meet on a glowing seam.
            .to(lid, { a: 112, b: 44, duration: 0.1, onUpdate: drawLid }, 0)
            .to(lid, { a: 64, b: 0.0001, duration: 0.2, ease: "power2.in", onUpdate: drawLid }, 0.1)
            .to(orb, { scale: 0.96, duration: 0.18, ease: "power1.in" }, 0.1)
            .to(one("[data-dim]"), { opacity: 0.6, duration: 0.18 }, 0.1)
            .to(edges, { opacity: 1, duration: 0.04 }, 0.25)
            // Reframe behind closed lids, then open onto the remembered scene.
            .to(orb, { x: () => splitEnd().x, scale: () => splitEnd().s, duration: 0.14, ease: "power2.inOut" }, 0.27)
            .to(one("[data-dim]"), { opacity: 0, duration: 0.18 }, 0.32)
            .to(lid, { a: APERTURE_OPEN.a, b: APERTURE_OPEN.b, duration: 0.26, ease: "power2.out", onUpdate: drawLid }, 0.32)
            .to(edges, { opacity: 0, duration: 0.08 }, 0.44)
            .to(one("[data-ornaments]"), { opacity: 0.55, duration: 0.2 }, 0.3)
            .fromTo(q(".lp-linked"), { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.42)
            .fromTo(one("[data-scrim]"), { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0.38)
            .fromTo(reveals, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.1, stagger: 0.025, ease: "power2.out" }, 0.42)
            .set(copy, { pointerEvents: "auto" }, 0.5)
            .to(orb, { y: () => -0.08 * window.innerHeight, duration: 0.2 }, 0.8);
        } else {
          tl.to(orb, { y: () => stackedEnd().y, scale: () => stackedEnd().s, opacity: () => stackedEnd().o, duration: 0.3, ease: "power2.inOut" }, 0.06)
            .fromTo(one("[data-scrim]"), { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0.28)
            .fromTo(reveals, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.1, stagger: 0.03, ease: "power2.out" }, 0.32)
            .set(copy, { pointerEvents: "auto" }, 0.42)
            .set({}, {}, 1);
        }

        return () => {
          scrollRef.current = null;
        };
      });

      return () => {
        removeSkip();
        mm.revert();
      };
    },
    { scope: root },
  );

  // Keyboard users tabbing into hidden hero copy are brought to the revealed state.
  const onCopyFocus = () => {
    const st = scrollRef.current;
    if (!st || st.progress >= 0.6) return;
    window.scrollTo({ top: st.start + (st.end - st.start) * 0.66 });
  };

  return (
    <div ref={root} data-landing className="lp-root">
      <SiteNav />

      <div className="lp-intro" data-intro-layer>
        <Aperture className="lp-intro-aperture" fill="#02040A" initial="closed" data-intro-ap />
        <div className="lp-intro-mark" data-intro-mark aria-hidden>
          <div className="lp-intro-glow" data-intro-glow style={maskStyle} />
          <div data-intro-base className="lp-intro-img">
            <FoldedA className="h-auto w-full" eager />
          </div>
          <div data-intro-light className="lp-intro-light" style={maskStyle} />
          <div data-intro-full className="lp-intro-img">
            <FoldedA className="h-auto w-full" />
          </div>
          <div data-intro-reflect className="lp-intro-reflect">
            <FoldedA className="h-auto w-full" />
          </div>
        </div>
        <button type="button" className={`t-label lp-skip`}>
          Skip intro
        </button>
      </div>

      <div className="lp-fly-wordmark" data-wm-intro aria-hidden>
        <div data-wm className="lp-wm">
          <div className="lp-wm-haze" data-wm-haze />
          <div data-wm-img>
            <Wordmark eager />
          </div>
        </div>
      </div>

      <main id="top">
        <section data-hero className="lp-hero" aria-labelledby="hero-title">
          <div data-stage className="lp-stage">
            <Ornaments />

            <div className="lp-copy-layer">
              <div data-copy className="lp-copy" onFocusCapture={onCopyFocus}>
                <p data-reveal className="t-label">
                  A personal AI concierge
                </p>
                <h1 id="hero-title" data-reveal className="t-h1 mt-4">
                  You shouldn&rsquo;t have to explain yourself twice.
                </h1>
                <p data-reveal className="t-lead mt-5 max-w-[34rem]">
                  Anghkooey remembers the preferences, constraints, and experiences that shape your choices, so the
                  next hotel, meal, or trip conversation starts with what matters to you.
                </p>
                <div data-reveal className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <ButtonLink href={START_TALKING.href} external={START_TALKING.external} srHint={START_TALKING.hint}>
                    {START_TALKING.label}
                    <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.5} />
                  </ButtonLink>
                  <span className="t-caption" aria-hidden>
                    {START_TALKING.hint}
                  </span>
                </div>
                <p data-reveal className="t-caption mt-6 max-w-[30rem]">
                  You choose what to share. You can review and correct what is remembered.
                </p>
              </div>
            </div>

            <div data-scrim className="lp-scrim" aria-hidden />

            <div data-orb className="lp-orb-wrap" aria-hidden>
              <div data-orb-intro className="lp-orb-intro">
                <Orb />
              </div>
              <div data-dim className="lp-dim" />
              <span data-midlabel className={`t-label lp-mid-label lp-mid-label-l`}>
                Memory
                <br />
                Concierge
              </span>
              <span data-midlabel className={`t-label lp-mid-label lp-mid-label-r`}>
                Hotels · Dining
                <br />
                Travel
              </span>
            </div>

            <Aperture className="lp-lids" fill="#02040A" initial="open" data-lids />

            <div data-hint className="lp-hint" aria-hidden>
              <span className="t-label">Scroll to remember</span>
              <span className="lp-hint-line" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
