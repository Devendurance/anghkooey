"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowUpRight,
  BedDouble,
  Eye,
  Globe,
  History,
  MessageCircle,
  MessageSquareQuote,
  PencilLine,
  Plane,
  Send,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { ButtonLink } from "@/components/brand/ButtonLink";
import { FoldedA } from "@/components/brand/FoldedA";
import { START_TALKING, TELEGRAM_BOT_URL } from "@/lib/site";
import "./sections.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS: { n: string; icon: LucideIcon; title: string; body: string }[] = [
  {
    n: "01",
    icon: MessageSquareQuote,
    title: "Tell it what matters",
    body: "Share a preference, a constraint, or a past experience in your own words.",
  },
  {
    n: "02",
    icon: Eye,
    title: "See what it heard",
    body: "Anghkooey tells you when a memory is saved, and says so when a save doesn’t go through.",
  },
  {
    n: "03",
    icon: History,
    title: "Ask again later",
    body: "Return with a new hotel, meal, or travel decision and start from your real preferences.",
  },
  {
    n: "04",
    icon: PencilLine,
    title: "Change it when you change",
    body: "Correct or update a remembered detail. The newer one guides what comes next.",
  },
];

type Domain = {
  key: string;
  caption: string;
  label: string;
  body: string;
  icon: LucideIcon;
  tint: string;
  tilt: string;
};

const DOMAINS: Domain[] = [
  {
    key: "hotels",
    caption: "Where you stay",
    label: "Hotels",
    body: "Room preferences, quiet surroundings, lighting, and how past stays actually went.",
    icon: BedDouble,
    tint: "#26204A",
    tilt: "-3deg",
  },
  {
    key: "travel",
    caption: "On the way",
    label: "Travel",
    body: "Travel habits, budgets, and the trips that taught you something. Your last good decision can make the next one easier.",
    icon: Plane,
    tint: "#1D3526",
    tilt: "2deg",
  },
  {
    key: "dining",
    caption: "At the table",
    label: "Dining",
    body: "What you like, what you avoid, and what has changed. Share a menu and compare it against your current preferences, with no medical assumptions.",
    icon: UtensilsCrossed,
    tint: "#43231A",
    tilt: "-2deg",
  },
];

type Channel = {
  name: string;
  icon: LucideIcon;
  status: string;
  live: boolean;
  body: string;
  link?: { label: string; href: string };
};

const CHANNELS: Channel[] = [
  {
    name: "Telegram",
    icon: Send,
    status: "Available now",
    live: true,
    body: "Message @useanghkooey_bot. Say YES to turn memory on, and send /memory to see what it holds for you.",
    link: { label: "Open Telegram", href: TELEGRAM_BOT_URL },
  },
  {
    name: "iMessage",
    icon: MessageCircle,
    status: "In testing",
    live: false,
    body: "The same memory works over iMessage today in testing. Public access is coming, so there’s no number to share yet.",
  },
  {
    name: "Web",
    icon: Globe,
    status: "Coming soon",
    live: false,
    body: "Your web account is where linked channels meet. Web chat, memory review, and settings arrive with the web app.",
  },
];

const CONTROLS: { title: string; body: string }[] = [
  {
    title: "Off until you say yes",
    body: "Nothing goes into lasting memory until you give consent. Before that, Anghkooey still answers, it just doesn’t keep anything.",
  },
  {
    title: "Review what was kept",
    body: "Ask for your memories any time. On Telegram, /memory lists what Anghkooey holds for you. A web review page is on the way.",
  },
  {
    title: "Corrections take over",
    body: "Tell Anghkooey what changed. The newer memory guides future answers, and the old one is marked as replaced.",
  },
  {
    title: "Turning memory off",
    body: "Switch memory off and future saves stop. Anghkooey keeps helping without writing anything new.",
  },
  {
    title: "What ending a session does",
    body: "Memories are stored on Walrus. Ending a session signs it out but doesn’t erase what was already written, which follows Walrus storage expiry.",
  },
];

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`lp-cell ${className}`}>
      <i aria-hidden className="lp-cross lp-cross-tl" />
      <i aria-hidden className="lp-cross lp-cross-br" />
      {children}
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="lp-icon-tile">
      <Icon className="size-6" strokeWidth={1.5} />
    </span>
  );
}

function SectionHeader({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children: ReactNode }) {
  return (
    <header data-sr className="mx-auto mb-16 flex max-w-[44rem] flex-col items-center gap-4 text-center">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 id={id} className="t-h2">
        {title}
      </h2>
      <div className="t-lead">{children}</div>
    </header>
  );
}

function Lens({ variant }: { variant: string }) {
  return (
    <div aria-hidden data-lens className={`lp-lens lp-lens-${variant}`}>
      <span className="lp-lens-scene" />
    </div>
  );
}

export function Sections() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (document.documentElement.dataset.motion !== "full") return;
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Light entrances only. Content stays visible once shown, so reverse scroll never hides it.
        const items = q("[data-sr]");
        gsap.set(items, { opacity: 0, y: 24 });
        const show = (els: Element[]) =>
          gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, overwrite: true });
        ScrollTrigger.batch(items, { start: "top 88%", onEnter: show, onEnterBack: show, onLeave: show });

        q("[data-lens]").forEach((el) =>
          gsap.fromTo(
            el,
            { yPercent: 6 },
            { yPercent: -6, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 } },
          ),
        );

        const spokes = q("[data-spokes]")[0];
        if (spokes)
          gsap.fromTo(
            q("[data-spokes-clip]"),
            { attr: { height: 0 } },
            { attr: { height: 80 }, ease: "none", scrollTrigger: { trigger: spokes, start: "top 90%", end: "top 55%", scrub: 0.6 } },
          );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="lp-sections">
      {/* 1. The memory story */}
      <section id="story" aria-labelledby="story-title" className="lp-section lp-story">
        <div className="lp-container">
          <SectionHeader eyebrow="The memory story" title="Every new assistant makes you start from zero." id="story-title">
            <p>
              You explain that you sleep badly near busy roads. You explain that extreme spice isn&rsquo;t for you. You
              explain that a quiet room matters more than being near the centre. Then the next conversation forgets.
            </p>
          </SectionHeader>

          <p data-sr className="lp-pull">Your preferences should travel with you.</p>

          <div className="lp-answer">
            <div data-sr>
              <h3 className="t-h3">Tell Anghkooey once. Pick up where you left off.</h3>
              <p className="t-lead mt-5">
                Anghkooey keeps the relevant context you choose to share and brings it back when it can improve the next
                answer. It remembers the preference, the reason behind it when you give one, and the fact that your
                preferences can change.
              </p>
            </div>
            <figure data-sr className="lp-quote">
              <blockquote>&ldquo;Quiet matters more than centrality because road noise ruined my sleep.&rdquo;</blockquote>
              <figcaption className="t-caption mt-4">
                A reason helps Anghkooey apply a preference instead of treating it as a vague label.
              </figcaption>
            </figure>
          </div>

          <ol className="lp-spot lp-spot-4" aria-label="How it works">
            {STEPS.map((s) => (
              <li key={s.n} data-sr>
                <Cell>
                  <div className="flex items-start justify-between">
                    <IconTile icon={s.icon} />
                    <span className="lp-num" aria-hidden>
                      {s.n}
                    </span>
                  </div>
                  <h4 className="lp-cell-title mt-6">{s.title}</h4>
                  <p className="lp-cell-body mt-2">{s.body}</p>
                </Cell>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 2. Everyday experiences */}
      <section id="experiences" aria-labelledby="exp-title" className="lp-section">
        <div className="lp-container">
          <header data-sr className="lp-split-head">
            <h2 id="exp-title" className="t-h2 max-w-[36rem]">
              Remember the detail that changes the answer.
            </h2>
            <div className="max-w-[380px]">
              <p className="t-lead">
                Hotels, travel, and dining are three uses of one personal memory. What you share in one conversation can
                shape the next decision, whichever kind it is.
              </p>
              <p className="lp-stat mt-4">One memory · three kinds of decisions</p>
            </div>
          </header>

          <div className="lp-bento">
            <article data-sr className="lp-tile lp-tile-wide" style={{ "--tint": "#0F3552", "--tilt": "-2deg" } as CSSProperties}>
              <div className="lp-tile-label">
                <span className="lp-tile-caption">Illustrative example</span>
                <span className="lp-tile-pill">One detail</span>
              </div>
              <div className="lp-example">
                <h3 className="t-h3">The difference is one remembered detail.</h3>
                <dl className="lp-compare">
                  <div>
                    <dt className="lp-compare-k">Without memory</dt>
                    <dd className="lp-compare-v lp-compare-before">&ldquo;Here are five popular hotels in Lagos.&rdquo;</dd>
                  </div>
                  <div>
                    <dt className="lp-compare-k">With Anghkooey</dt>
                    <dd className="lp-compare-v">
                      &ldquo;You said quiet matters more than being central because road noise disrupted your sleep.
                      Based on the descriptions you shared, this option looks closer, but I can&rsquo;t verify its
                      actual noise level or tonight&rsquo;s availability.&rdquo;
                    </dd>
                  </div>
                </dl>
                <p className="lp-stat">Personal doesn&rsquo;t mean overconfident.</p>
              </div>
            </article>

            <article data-sr className="lp-tile" style={{ "--tint": "#1A1F27", "--tilt": "3deg" } as CSSProperties}>
              <div className="lp-tile-label">
                <span className="lp-tile-caption">Honest limits</span>
                <span className="lp-tile-pill">No guessing</span>
              </div>
              <p className="lp-tile-body">
                Anghkooey doesn&rsquo;t pretend to know live prices, availability, or details it can&rsquo;t verify. It
                helps you think through options, and it isn&rsquo;t a booking service.
              </p>
              <ul className="lp-tags mt-auto" aria-label="What Anghkooey does not claim">
                <li>No live prices</li>
                <li>No availability claims</li>
                <li>No bookings</li>
              </ul>
            </article>

            {DOMAINS.map((d) => (
              <article
                key={d.key}
                data-sr
                className="lp-tile lp-tile-art"
                style={{ "--tint": d.tint, "--tilt": d.tilt } as CSSProperties}
              >
                <div className="lp-tile-label">
                  <span className="lp-tile-caption">{d.caption}</span>
                  <h3 className="lp-tile-pill">{d.label}</h3>
                </div>
                <p className="lp-tile-body">{d.body}</p>
                <Lens variant={d.key} />
                <span className="lp-tile-icon" aria-hidden>
                  <d.icon className="size-5" strokeWidth={1.5} />
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Continuity */}
      <section id="channels" aria-labelledby="channels-title" className="lp-section">
        <div className="lp-container">
          <SectionHeader
            eyebrow="Continuity"
            title="The next conversation can begin where the last one left off."
            id="channels-title"
          >
            <p>
              Talk to Anghkooey where you already message. Channels share one memory only after you link them with a
              one-time code and confirm in the chat. A name or phone number alone is never treated as proof.
            </p>
          </SectionHeader>

          <div data-sr className="lp-core" aria-hidden>
            <span className="lp-core-halo" />
            <span className="lp-core-ring lp-core-ring-dash" />
            <span className="lp-core-ring lp-core-ring-in" />
            <span className="lp-core-mark">
              <FoldedA className="h-auto w-full" />
            </span>
          </div>
          <p className="t-label mt-5 text-center">One memory</p>

          <svg data-spokes className="lp-spokes" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden>
            <clipPath id="lp-spokes-clip">
              <rect data-spokes-clip width="600" height="80" />
            </clipPath>
            <g clipPath="url(#lp-spokes-clip)">
              {[100, 300, 500].map((x) => (
                <path key={x} d={`M300 0 C300 44 ${x} 36 ${x} 80`} />
              ))}
            </g>
          </svg>

          <ul className="lp-spot lp-spot-3" aria-label="Channels">
            {CHANNELS.map((c) => (
              <li key={c.name} data-sr>
                <Cell className="flex flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <IconTile icon={c.icon} />
                    <span className={c.live ? "lp-status lp-status-live" : "lp-status"}>{c.status}</span>
                  </div>
                  <h3 className="lp-cell-title mt-6">{c.name}</h3>
                  <p className="lp-cell-body mt-2">{c.body}</p>
                  {c.link ? (
                    <a href={c.link.href} target="_blank" rel="noopener noreferrer" className="lp-text-link mt-auto">
                      {c.link.label}
                      <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.5} />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : null}
                </Cell>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Privacy and control */}
      <section id="control" aria-labelledby="control-title" className="lp-section">
        <div className="lp-container">
          <header data-sr className="lp-split-head">
            <div className="flex max-w-[36rem] flex-col items-start gap-4">
              <p className="lp-eyebrow">Privacy and control</p>
              <h2 id="control-title" className="t-h2">
                Memory should feel useful, not mysterious.
              </h2>
            </div>
            <p className="t-lead max-w-[380px]">
              Anghkooey shows what it remembered and lets you correct it. If a memory didn&rsquo;t save, it says so. If
              current facts can&rsquo;t be verified, it doesn&rsquo;t make them up.
            </p>
          </header>

          <ol className="lp-controls">
            {CONTROLS.map((c, i) => (
              <li key={c.title} data-sr className="lp-control">
                <span className="lp-num" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="lp-cell-title">{c.title}</h3>
                <p className="lp-cell-body">{c.body}</p>
              </li>
            ))}
          </ol>

          <div data-sr className="mt-16 flex flex-wrap items-center gap-x-5 gap-y-3">
            <ButtonLink href={START_TALKING.href} external={START_TALKING.external} srHint={START_TALKING.hint}>
              {START_TALKING.label}
              <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.5} />
            </ButtonLink>
            <span className="t-caption" aria-hidden>
              {START_TALKING.hint}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
