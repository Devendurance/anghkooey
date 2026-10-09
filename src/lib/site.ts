export const TELEGRAM_BOT_URL = "https://t.me/useanghkooey_bot";

// Start Talking opens web chat. Telegram stays linked as the alternative channel.
export const START_TALKING = {
  label: "Start Talking",
  href: "/chat",
  external: false,
  hint: "Chat in your browser, no sign-up",
} as const;

// Web app routes. Add an entry only when its page exists, so the nav never shows a dead link.
export const APP_NAV = [
  { key: "chat", label: "Chat", href: "/chat" },
  { key: "memories", label: "Memories", href: "/memories" },
] as const;

export const CONVERSATION_KEY_PREFIX = "ak:conv:";

// `wide` links only fit the centred desktop pill from lg up; the mobile menu shows all.
export const NAV_LINKS = [
  { label: "Overview", href: "#top", external: false, wide: false },
  { label: "How it works", href: "#story", external: false, wide: true },
  { label: "Privacy", href: "#control", external: false, wide: true },
  { label: "Telegram", href: TELEGRAM_BOT_URL, external: true, wide: false },
] as const;

export const BRAND_ASSETS = {
  foldedA: { src: "/brand/anghkooey/web/folded-a.webp", width: 1122, height: 967 },
  wordmark: { src: "/brand/anghkooey/web/wordmark.webp", width: 2093, height: 255 },
  // CTA band art slot. Swap for a transparent WebP/PNG render at any size; screen blending also handles black grounds.
  ribbon: { src: "/brand/anghkooey/web/cta-ribbon.webp", width: 1024, height: 576 },
} as const;

export const REPO_URL = "https://github.com/Devendurance/anghkooey";

export const COPYRIGHT_YEAR = 2026;

export const INTRO_SEEN_KEY = "ak:intro-seen";
