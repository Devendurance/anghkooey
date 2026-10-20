# Google OAuth Verification: Public Website Compliance

Baseline: `e0a998c` (main, includes the Google site verification tag). Scope: public website copy and pages only. No auth, scope, credential, database, migration, Gmail sending or AWS changes.

## Implemented changes

- Homepage: new "Google and Gmail" section (`#google-data`) directly after "Privacy and control" in `src/components/landing/Sections.tsx`. It states the nine required behaviors, the Google API Services User Data Policy / Limited Use sentence, and links to /privacy and /terms. Hero and animation untouched.
- Brand: `applicationName` and `openGraph.siteName` set to "Anghkooey" in `src/app/layout.tsx`. The visible wordmark, the document title and the footer name were already present.
- `/terms`: new public page, `src/app/terms/page.tsx`, with the required NCII statement verbatim. It makes no moderation, jurisdiction, company or contact claims.
- Footer: "Terms of Service" link added under Resources after "Privacy Policy", using the existing link styling. A "Google and Gmail" anchor was added under Product.
- `/privacy`: names the `openid`, `email` and `gmail.send` scopes, adds a Google API Services User Data Policy / Limited Use section, links to /terms, and the title now uses `|` instead of an em dash.
- Test: `tests/legal-pages.test.ts`.

## URLs to submit to Google

- Home page: `https://<production domain>/`
- Privacy policy: `https://<production domain>/privacy`
- Terms of service: `https://<production domain>/terms`

The production domain is not recorded in the repo. Use the verified domain from Search Console.

## Verification actually run (local production build, `next start`)

- `npx vitest run tests/legal-pages.test.ts`: 4 passed.
- `npm run typecheck`: passed. `eslint` on changed files: clean. `npm run build`: passed, `/terms` prerendered static.
- HTTP: `/`, `/privacy`, `/terms` each returned 200 with 0 redirects. Titles: "Anghkooey | A personal AI concierge that remembers", "Privacy Policy | Anghkooey", "Terms of Service | Anghkooey". Google site verification meta tag and `og:site_name` present in the home HTML.
- Browser (Edge via Playwright, reduced motion) at 360, 390, 768, 1280, 1440: all three pages rendered an h1, zero horizontal overflow, the new section visible with 6 items, footer Terms link navigated to /terms, zero console errors, page errors or failed requests. Screenshots of the new section at 390 and 1440 were inspected.
- Not run: production (deployed) HTTP checks, desktop keyboard tab-order audit, a Google-side crawl. Run the HTTP checks against the live URL after deploy.

## Google Cloud Console steps still required

1. OAuth consent screen: app name "Anghkooey", app home page, privacy policy and terms URLs as above, and an authorized domain matching the verified domain.
2. Support email and developer contact email (owner must provide).
3. Scopes listed must match the code: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`. `gmail.send` is a sensitive scope.
4. Scope justification text and a demo video showing the OAuth consent flow, the email preview, the explicit approval, and Gmail disconnect in Settings.
5. Confirm the OAuth redirect URI matches the production callback.
6. Submit for verification. Google's deadline for this project: October 23, 2026.

## Search Console and domain-ownership risks

- The OAuth authorized domain must be verified in Search Console by an account that is an owner or editor of the Cloud project. The `google-site-verification` meta tag in the layout only proves the property for whoever owns that token.
- The homepage must be served on the same domain as the privacy and terms links, with no redirect to another domain. The Vercel `*.vercel.app` URL will not satisfy verification, use the custom domain.
- If the tag is removed or the domain changes, ownership lapses.

## Missing owner-provided legal information

The Terms intentionally omit these. Add them if the owner wants them in the Terms:

- Legal entity or operator name, and registration details.
- Governing law and jurisdiction, and dispute process.
- Support or legal contact email (Google also requires a developer contact email in the consent screen).
- Confirm the Limited Use commitments in the Privacy Policy: no advertising use, no sale of Google data. They match the current code, which has no ads or data sale. Add a human-access statement if the owner wants one.
- Retention period for Gmail draft and batch records, beyond "until cancelled or expired".
- Whether the Terms effective date (October 20, 2026) should differ.
