# CRITICAL RULES - MUST FOLLOW

- Auto-log meaningful rules to the project’s AGENTS.md.
- Auto-commit and push after every meaningful checkpoint.
- Auto-clean temporary files and build clutter.
- Keep the repository in a recoverable state.

## WRITING

- Never use em dashes. Use commas, periods, hyphens, or rewrite the sentence.
- Do not use the “It’s not X, it’s Y” correction pattern. State the correct point directly.
- Avoid choppy writing. Keep the flow natural.
- Avoid semicolons in casual replies. Use periods or normal conjunctions.
- Remove stock transitions like “however,” “furthermore,” “it’s worth noting,” and “in conclusion.”
- Use contractions in casual contexts. Say “don’t” instead of “do not.”
- Use simple words. Say “use” instead of “utilize,” “start” instead of “commence,” and “find out” instead of “ascertain.”
- Avoid mid-sentence ellipses unless you’re writing deliberate dialogue.
- Avoid parenthetical asides when the idea can fit naturally into the sentence.
- Use colons sparingly. Don’t label every paragraph or list.
- Remove chatbot filler like “Great question,” “I hope this helps,” “Let me know if,” “Here is a,” and “Let’s dive in.”
- Do not use emojis unless the user clearly wants that style. (This is specific to me, you can leave it if you like to use emojis tho)
- Do not use bold text for emphasis in normal prose.
- Challenge weak reasoning. Flag unsupported claims. Do not agree just to be polite.

## RESPONSES

- Keep responses concise and to the point unless the user asks otherwise.

## AGENT STATE

- Long-running project state lives in `agent-state/`:
  - `project-state.md` tracks what's been built, the architecture, and important decisions.
  - `memory.md` tracks durable facts, conventions, and gotchas.
  - `left-off.md` tracks the current task, what's done, what's next, and known issues.
- At the start of every session, read all three files before doing anything else.
- Update them at every meaningful checkpoint: feature finished, decision made, bug found, direction changed.
- Keep them short. Bullets, not essays. `left-off.md` must always answer: what are we doing, what's done, what's next.
- When the session gets compacted or messy, a new session resumes from these files.

## CONTEXT MANAGEMENT

- When the active agent session approaches roughly 250,000 consumed context tokens, proactively compact or summarize the working context before continuing. Do this before context degradation becomes noticeable.
- Preserve the current objective, repository truth, completed checkpoints and commit hashes, architectural and product decisions, unresolved blockers, relevant environment variable names but never secret values, important implementation invariants, tests and verification state, and the exact next action.
- Do not over-compress implementation-critical details.
- After compaction, continue from the preserved state rather than re-auditing the entire repository.

## PLANNING MODE

- Always ask clarifying questions.
- Never assume the design, tech stack, or features.
- Use deep-dive sub-agents to assist with research.
- For research work or research assist sub-agents, use SWE-2 model with a high reasoning/thinking effort if not available use muse spark-1.3 contributor with x-high reasoning effort.
- Use deep-dive sub-agents to review the different aspects of your plan before presenting it to the user.

## CHANGE / EDIT MODE

- Never implement features yourself when possible; use sub-agents.
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently.
- When using sub-agents to implement features, act as a coordinator only.
- After completing features, whether large or small, always run commands such as lint, type check, and next build to check code quality.

## DATABASE SCHEMA CHANGES

- Whenever you make changes to the database schema, ALWAYS run `db:generate` then `db:migrate`.
- NEVER run drizzle push.

## TESTING

- Use any testing tools and libraries available to the project to test your changes.
- Never assume your changes work; always test.
- If the project does not have any testing tools, scripts, MCP tools, or similar resources available for testing, ask the user whether testing should be skipped.

## UI DESIGN

- Always follow or reference the UI design system when creating or reviewing components or pages.
- Design System: @DESIGN.md

## FRONTEND GOTCHAS

- CSS Modules don't work here: the `*.css` turbopack rule in next.config.ts renames modules to plain global CSS. Use Tailwind or prefixed global classes (landing uses `lp-*` in `src/components/landing/landing.css`).
- The dev server sometimes serves a stale `globals.css`. `touch src/app/globals.css` and reload.
- Motion state lives on `<html data-motion data-intro>`, set by the boot script in `src/app/layout.tsx`. Base CSS must be the static/reduced layout. Cinematic rules opt in with `html[data-motion="full"]`.
- Start Talking points at `/chat` (`src/lib/site.ts`). Telegram stays linked as the alternative channel.
- Web app nav comes from `APP_NAV` in `src/lib/site.ts`. Add a route only when its page exists.
- Components with event handlers (e.g. `FoldedA` onError) need `"use client"` to be usable from server components like `AppShell`.
- Only one `next dev` can run per repo dir. A long-running dev server keeps a stale cached env after server hotfixes. For live API checks use `next build && next start -p <port>`. Killing the exec shell doesn't stop `next start`, so stop the PID on that port.
- `cacheComponents` is on: no `new Date()` in prerendered components (use constants). This includes `useState(() => Date.now())` in client components.
- Next keeps visited routes mounted (hidden) and re-runs their effects when shown. App pages must reset per-session UI state at the start of their load function.
- App pages scroll inside `.mem`, so it must stay `position: relative` or `sr-only` spans stretch the document.
- `POST /api/session` is rate-limited to 10/min per IP. Browser sweeps across many page loads will hit 429.
- Real-Neon tests need `}, 60000);` timeouts. `vitest.config.mts` maps `@/` so tests can import route handlers.

## VIDEO EVIDENCE

- Film source lives in `videos/anghkooey-demo`. Private captures and original recordings must stay out of commits.
- A fixed privacy mask can miss a code when the source page scrolls. Inspect the full selected range or exclude all code-value frames.
- Supplied iMessage before/after questions differ. Only quiet hotels and natural light are visibly recalled. Never imply an empty account, controlled identical-query test, or linked-Web recall success.
- Initialize `window.__timelines` before registering a HyperFrames root. Clamp caption end holds before the next phrase to avoid overlapping captions.
- Keep failed-render frames until a verified final MP4 exists. Recover captures before starting another full render.
- JPEG captures use full-range colour. Explicitly convert to limited range before FFmpeg drawbox/ASS filters, then flag limited range, or the Night caption rail turns grey.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
