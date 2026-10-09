import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Georama } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const georama = Georama({
  variable: "--font-georama",
  subsets: ["latin"],
  display: "swap",
});

const satoshi = localFont({
  src: "../fonts/Satoshi-Variable.woff2",
  variable: "--font-satoshi",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anghkooey | A personal AI concierge that remembers",
  description:
    "Anghkooey remembers the preferences and experiences that shape your choices, then brings the relevant context back when you need help again.",
};

export const viewport: Viewport = {
  themeColor: "#05080F",
  colorScheme: "dark",
  viewportFit: "cover",
};

// Runs before first paint so the intro and motion states never flash.
// Every homepage navigation replays the full intro; only reduced-motion skips it.
const MOTION_BOOT = `(function(){try{var d=document.documentElement;var r=window.matchMedia("(prefers-reduced-motion: reduce)").matches;d.dataset.motion=r?"reduced":"full";d.dataset.intro=r?"skip":"play"}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${georama.variable} ${satoshi.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
