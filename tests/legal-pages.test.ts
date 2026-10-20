import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("public legal pages", () => {
  it("serves /, /privacy and /terms as plain pages with no auth redirects", () => {
    for (const p of ["src/app/page.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx"]) {
      expect(existsSync(p)).toBe(true);
      const src = read(p);
      expect(src).not.toMatch(/redirect\(|requireSession|cookies\(/);
    }
  });

  it("links Terms next to Privacy in the footer", () => {
    const footer = read("src/components/brand/SiteFooter.tsx");
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(footer.indexOf('href="/terms"')).toBeGreaterThan(footer.indexOf('href="/privacy"'));
  });

  it("terms include the NCII statement and avoid unsupported claims", () => {
    const terms = read("src/app/terms/page.tsx").replace(/\s+/g, " ");
    expect(terms).toContain(
      "Anghkooey does not offer features for creating or distributing AI-generated non-consensual intimate imagery. Using the service to request, facilitate, or distribute such content is prohibited.",
    );
    expect(terms).toContain('href="/privacy"');
    expect(terms).not.toMatch(/automated (content )?moderation|governing law|jurisdiction/i);
  });

  it("privacy and landing disclose the real Gmail scope and Limited Use", () => {
    const privacy = read("src/app/privacy/page.tsx").replace(/\s+/g, " ");
    const landing = read("src/components/landing/Sections.tsx").replace(/\s+/g, " ");
    expect(privacy).toContain("gmail.send");
    expect(privacy).toContain("Limited Use");
    expect(landing).toContain("gmail.send");
    expect(landing).toContain("doesn’t read your Gmail inbox");
    expect(landing).toContain("Limited Use");
    expect(landing).toContain('href="/terms"');
    expect(landing).toContain("disconnect Gmail any time in Settings");
  });
});
