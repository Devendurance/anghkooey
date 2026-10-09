export const TELEGRAM_BOT_URL = "https://t.me/useanghkooey_bot";

// Start Talking opens the live Telegram bot until the web /chat route ships.
export const START_TALKING = {
  label: "Start Talking",
  href: TELEGRAM_BOT_URL,
  external: true,
  hint: "Opens Anghkooey on Telegram",
} as const;

export const NAV_LINKS = [
  { label: "Overview", href: "#top", external: false },
  { label: "Telegram", href: TELEGRAM_BOT_URL, external: true },
] as const;

export const BRAND_ASSETS = {
  foldedA: { src: "/brand/anghkooey/web/folded-a.webp", width: 1122, height: 967 },
  wordmark: { src: "/brand/anghkooey/web/wordmark.webp", width: 2093, height: 255 },
} as const;

export const COPYRIGHT_YEAR = 2026;

export const INTRO_SEEN_KEY = "ak:intro-seen";
