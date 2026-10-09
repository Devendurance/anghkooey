# Design System Inspired by Anghkooey
### ([A] Poster hero × [B] Footer × [V3] Folded-A motion inspiration × [V4] Aperture/scroll choreography × [M] Bento & spotlight grids)

**Sourcing key**
- **[A]** Image A, the glass-orb poster: hero style, background, ornaments, display type. "ANGHKOOEY" replaces the reference's title.
- **[B]** Image B, the Sōra CTA band and footer: used as it is, recolored only where noted.
- **[V3]** third attachment, ring-and-pupil reference video: movement inspiration ONLY; never use its original symbol as the Anghkooey logo. Animate the official folded-A mark instead.
- **[V4]** fourth attachment, the Swell Interactive motion compilation: reference for portal/aperture reveals, depth, scroll pacing, pinning and staging—not a page to reproduce.
- **[M]** the bento grid and feature spotlight grid from the earlier Market Desk system, rebuilt in this theme.

**Locked fonts:** one display serif, plus **Satoshi** and **Georama** as the secondary families. Inter appears nowhere in this system.

**How the videos were read:** I extracted frames and measured audio; I can't play video. Timings below come from sampled frames (about 0.2s apart for [V3]) and are estimates to tune in the browser. Both videos carry audible sound (mean about -21 dB, peaks near -8 dB and -6 dB). I did not hear it, so the sound section is a plan, not a transcription.

**Logo note (supersedes the original):** the official symbol is the supplied folded-A logo. The ring/pupil motif is retired as a brand mark. The official wordmark/logotype is Icy Periwinkle `#D8DCFF`; use a supplied wordmark asset where available, otherwise live serif fallback. The aperture is a page-transition device only.

> **2026-10-09 / Official Anghkooey identity update.** This version supersedes the ring-and-pupil mark everywhere. The official symbol is the supplied folded-A; the official wordmark is Icy Periwinkle `#D8DCFF` on Night `#05080F`. Warm Ivory `#F4EEDF` is for site typography, not the logo. The eyelid/aperture survives only as a scene-transition language. No wallet-connect UI is part of this product. Use a functional Start Talking CTA and the existing session/consent/channel-linking backend; do not invent sign-in functionality or fake app data.

## 1. Visual Theme & Atmosphere

You look at the brand through a glass eye. A near-black night frame holds one luminous orb, a round window into a quiet scene, with the brand name set huge across its upper rim. Around it sits printed-poster ornament: hairline circles, linked rings, four-point sparkles, tiny tracked labels and vertical edge text. Motion begins with the folded-A: its folds gently trace/reveal, bloom and settle in Icy Periwinkle before an optional aperture opens onto the orb. Light is the only decoration. A sun flare warms the orb's upper left, restrained electric-indigo light traces the folded-A/aperture seam, and an aurora gradient appears only in the footer.

**Key Characteristics**
- Night ground, cream type, one orb as the hero's whole image [A]
- The wordmark is huge, hairline-contrast, swash serif, glowing softly, and it travels to the top-left on scroll [A]
- Ornament is drawn with 1px cream lines only: circles, linked rings, four-point sparkles, numerals, vertical labels [A]
- Every image is seen through a circular lens, with a feathered edge and a hairline ring [A]
- A single signature aperture transition connects the folded-A intro to the hero; optional second aperture only when it improves understanding [V3][V4]
- A small black pill nav and edge HUD frame the viewport [V4]
- Aurora color (teal, indigo, peach, ember) lives only in the CTA band and footer [B]
- Hairline grid cells and glass jewel tiles carry the content, in the same warm-flare lighting [M]

## 2. Color Palette & Roles

### Ground & Text [A]
- **Night** (`#05080F`): page ground
- **Night Deep** (`#02040A`): reflection floor, seams, footer top edge
- **Night Raised** (`#0B1119`): panels
- **Cream** (`#F4EEDF`): editorial headlines, body/labels, primary button; NOT the logo or wordmark
- **Cream 70** (`rgba(244,238,223,.70)`): body and lead text
- **Cream 55** (`rgba(244,238,223,.55)`): captions and micro-labels (5.5:1 on Night)
- **Cream 35** (`rgba(244,238,223,.35)`): decoration only, never text
- **Hairline** (`rgba(244,238,223,.18)`) and **Hairline Strong** (`rgba(244,238,223,.32)`): ornaments, cell lines, borders

### Orb [A]
- **Abyss Deep** `#0E3A5E` · **Abyss** `#1F6AA0` · **Abyss Light** `#2E8CC4`: the orb's sky
- **Sun Amber** `#F6B25B` · **Sun Hot** `#FF9A3D` · **Flare Core** `#FFE9C2`: the flare and sparkles
- **Ember** `#E8602C`: one small accent (the chair-orange); one use per view

### Folded-A Identity & Aperture Glow [V3/V4]
- **Folded-A + official wordmark** Icy Periwinkle `#D8DCFF` (flat source artwork), on Night `#05080F`
- **Halo** Electric Indigo `#4F5CFF`, applied as a restrained optional digital motion layer only
- **Aperture seam / focus rings** `#D8DCFF`; no ring/pupil symbol remains in the logo system
- Cream `#F4EEDF` remains the supporting typography color; blue/amber scenes and aurora do not recolor the logo

### Aurora [B] (CTA band and footer only)
- **Teal** `#52A59C` · **Indigo** `#3F4E9A` · **Peach** `#E0916A` · **Ember Red** `#E5533D` · **Sky** `#3F7BC4`
- **Footer Ground** `#101214` · **Footer Link** `#E9E3D3` · **Footer Muted** `#9C978B` · **Footer Line** `rgba(233,227,211,.14)`

### Glass & Bento Tints [M]
- **Glass Fill** `rgba(244,238,223,.05)` · **Glass Border** `rgba(244,238,223,.14)`
- **Tile tints:** Abyss `#0F3552` · Moss `#1D3526` · Dusk `#26204A` · Ember `#43231A` · Smoke `#1A1F27`

### Gradients (the only ones)
- **Sun flare:** `radial-gradient(circle at 24% 30%, rgba(255,233,194,.95), rgba(246,178,91,.45) 18%, transparent 46%)`
- **Orb rim:** `box-shadow: 0 0 0 1px rgba(244,238,223,.30), inset 0 0 80px rgba(46,140,196,.25), 0 0 120px rgba(31,106,160,.35)`
- **Vignette:** `radial-gradient(circle at 50% 50%, transparent 60%, rgba(5,8,15,.9) 100%)`
- **Wordmark digital glow (optional):** `text-shadow: 0 0 32px rgba(79,92,255,.28)`; keep the underlying wordmark flat `#D8DCFF`

## 3. Typography Rules

### Font Family (locked)
**Display Serif — Cormorant Garamond** (Google Fonts; weights 300, 400, 500): the hairline-contrast, long-limbed serif that matches the poster's lettering. My pick; swap candidates are Italiana and Cinzel Decorative (for more swash). Fallback: 'Cormorant', 'Playfair Display', Georgia, serif.
**Interface — Satoshi** (Fontshare, free for commercial use; weights 300, 400, 500, 700): nav, buttons, body, footer, the CTA band headline.
Fallback: 'General Sans', -apple-system, 'Segoe UI', sans-serif.
**Labels — Georama** (Google Fonts): micro-labels, numerals, vertical edge text, tile labels, tags.
Fallback: 'Satoshi', system-ui, sans-serif.

### Role Ownership
| Family | Owns | Never |
|--------|------|-------|
| Cormorant Garamond | Wordmark fallback, H1, H2 (≥28px) | UI text, buttons, labels |
| Satoshi | Nav, buttons, body, lead, card titles, footer, CTA band headline | The hero wordmark, tracked micro-labels |
| Georama | Micro-labels, numerals, vertical text, tile labels, tags | Paragraphs, headlines, buttons |

### Hierarchy (desktop)

| Role | Font | Size / Line | Weight | Tracking | Color |
|------|------|-------------|--------|----------|-------|
| Wordmark | Supplied Anghkooey wordmark (Cormorant Garamond fallback) | clamp(44px, 12.5vw, 176px) / 0.95 | asset-defined | asset-defined | Icy Periwinkle `#D8DCFF`; restrained optional glow |
| H1 (hero copy) | Cormorant Garamond | 64 / 68 | 400 | -0.01em | Cream |
| H2 | Cormorant Garamond | 48 / 54 | 400 | -0.01em | Cream |
| CTA Band Headline [B] | Satoshi | 56 / 60 | 300 | -0.01em | `#FFFFFF` |
| Card Title | Satoshi | 20 / 28 | 500 | 0 | Cream |
| Lead | Satoshi | 18 / 30 | 400 | 0 | Cream 70 |
| Body | Satoshi | 16 / 26 | 400 | 0 | Cream 70 |
| Nav | Satoshi | 12 / 16 | 500 | +0.08em, caps | Cream (active), Cream 55 |
| Button | Satoshi | 14 / 20 | 500 | +0.02em | Night on Cream |
| Micro-label [A] | Georama | 11 / 14 | 400 | +0.24em, caps | Cream 55 |
| Numeral [A] | Georama | 11 / 14 | 300, tabular | +0.1em | Cream 55 |
| Vertical Label [A] | Georama | 11 / 14 | 400 | +0.3em, caps, `writing-mode: vertical-rl` | Cream 55 |
| Tile Label [M] | Georama | 22 / 26 | 700 | -0.01em | Night on Cream |
| Tile Caption [M] | Georama | 14 / 18 | 400 | 0 | Cream 70 |
| Footer Heading [B] | Satoshi | 14 / 20 | 400 | 0 | `#9C978B` |
| Footer Link [B] | Satoshi | 15 / 20 | 400 | 0 | `#E9E3D3` |
| Footer Legal [B] | Satoshi | 14 / 20 | 400 | 0 | `#9C978B` |

### Principles
- Uppercase is for the wordmark, nav and micro-labels only. Headlines are sentence case.
- The serif is never under 28px. Georama is never over 22px.
- Micro-labels are decorative at 11px. Set `aria-hidden="true"` on any that duplicate real content.
- No italics in headlines; the poster's lettering is upright.
- One serif headline per section; subheads are always Satoshi.
- The CTA band headline is Satoshi Light, not the serif, so the footer matches the reference.

## 4. Component Stylings

### Hero Orb [A] (signature component)
- **Shape:** circle, diameter `min(92vh, 78vw)`, centered, with an `8px` feathered mask edge
- **Content:** a looping scene (8–10s, muted, `playsinline`, 1080px max, with a poster still); the supplied poster frame is the fallback
- **Rim:** Orb rim box-shadow plus a `1px` Hairline Strong ring
- **Flare:** the Sun flare gradient, upper left, pulsing between 0.75 and 1 opacity over 6s
- **Vignette:** Vignette gradient over everything
- **Sparkle layer:** up to 40 amber and cyan points, `2–4px`, twinkling over 2–5s, drifting along the foreground diagonal; pause when the tab is hidden
- **Idle motion:** background scene drifts `±1.5%` and scales `1.00 → 1.03` over 12s (reads as a moving image even on the still fallback)

### Wordmark [A]
- Centered over the orb's upper third, overlapping its rim, spanning about 77% of the viewport width at 1440px
- Use supplied official wordmark asset if present; otherwise live Cormorant text in Icy Periwinkle. Never recreate the logo geometry approximately or use the embedded WORLD lettering in the poster reference.
- On scroll it docks top-left as the nav logo (see Scroll Choreography)

### Ornaments & Edge HUD [A]
- **Hairline circles:** `1px` Hairline Strong, three to five, diameters `72px`, `120px` and `260px`, partly clipped by the viewport edge; slow rotation `120s`
- **Linked rings:** a row of 7 overlapping circles (`24px` diameter, `14px` step), `1px` Cream 55, top-left and top-right
- **Sparkle:** four-point star `12px`, Cream, `2px` glow, scale `0.8–1.15` over 3s; one top-center, one on each side edge, one bottom
- **Numerals:** corner numerals ("05") for the section index
- **Vertical labels:** left edge descriptor, right edge date or edition
- **Mid labels:** one left, one right at the orb's equator (a discipline and a category)
- All ornaments are `aria-hidden`; content in the slots is placeholder until you supply it

### Folded-A Brand Mark [V3] — official replacement
- **Asset:** official folded-A mark supplied by the owner, in Icy Periwinkle `#D8DCFF`. For scalable vector path reveal use an actual authorized SVG asset. If only a PNG is available, use a reveal mask/fade on that exact PNG, not invented tracing or a fabricated replacement.
- **Intro:** on Night Deep, a dim A silhouette appears; its existing fold edges reveal sequentially or through soft masks, luminance blooms and settles into a sharp flat A. Very brief Electric Indigo aura accompanies the reveal. Optional faint reflection below (intro only).
- **Sequence goal:** 2.4–3.2 seconds total first visit; never gate the Start Talking CTA behind a mandatory long intro. Every scroll, click, key or tap skips instantly to a usable state. Shorter/fewer animations on subsequent visits.
- **Motion beats:** (1) darkness 0–0.2s; (2) folded-A emerges/traces 0.2–1.1s; (3) folds bloom and settle 1.1–1.8s; (4) soft pulse 1.8–2.1s; (5) optional aperture opens into orb 2.1–3.0s. Fine-tune after browser inspection; no animation may alter the folded-A silhouette.
- **Navigation:** the same folded-A at ~20–24px, mostly static; optional subtle luminance pulse on navigation entry or hover. No pupil, blink or ring logo.
- **Accessibility:** reduced-motion visitors see the final folded-A + hero immediately. Intro never traps keyboard focus, scrolling or clicks. Logo remains legible without glow.
- **Motion reference disclaimer:** V3 establishes rhythm/light, NOT logo shape; never embed V3 video as the new Anghkooey logo.

### Aperture / Lens Transition [V3][V4]
- **Aperture shape:** almond/lens of two arcs, opening from a central glowing seam; it is a transitional mask, never the brand symbol; start ~`2.4:1` and scale to viewport
- **Rim:** `2px` Icy Periwinkle seam with `0 0 16px rgba(79,92,255,.8)` glow, following the aperture edge
- **Lids:** two Night Deep layers (upper and lower), meeting at a center seam; closed state is a `1px` glowing seam line
- **Use:** connect folded-A to orb intro, unfold hero narrative on scroll; optionally one further section transition only. No hard-coded mandatory wait.

### Navigation [V4]
- **Pill:** `#000` fill, `1px` Hairline border, radius `9999px`, padding `8px 20px`, centered `24px` from the top
- **Links:** Nav role; active link Cream, others Cream 55; `24px` gaps
- **After the wordmark docks:** official folded-A + Icy Periwinkle wordmark (`20px` high) left at `40px`, pill center, functional Start Talking CTA right
- **Bottom-left:** two `32px` circular social buttons (`1px` Hairline, glass fill) and the section counter in Georama
- **Bottom-right:** an outlined `© year` pill and a sound toggle (`32px` circle, equalizer icon)
- **Right edge:** vertical dot pager, `6px` dots, active dot Cream with a `10px` Hairline ring (desktop only)

### Buttons

**Primary (Cream)**
- Fill `#F4EEDF`, text `#05080F`, radius `9999px`, height `48px`, padding `0 28px`, Satoshi 500 14px
- Hover: `0 0 32px rgba(255,233,194,.35)`; Active: `scale(.98)`

**Secondary (Glass)**
- Glass Fill, `1px` Glass Border, text Cream, same size
- Hover: border Hairline Strong plus a soft Icy Periwinkle glow

**Quiet:** `rgba(244,238,223,.10)` fill, Cream text, `40px` high in the nav

**Viewfinder [B]** (CTA band only)
- Fill `rgba(244,238,223,.16)`, text `#FFFFFF`, radius `2px`, height `40px`, padding `0 20px`, soft glow `0 0 24px rgba(255,255,255,.12)`
- Four L-shaped brackets, `8 × 8px`, `1px` Cream 70, offset `4px` outside each corner
- Hover: brackets move out to `8px` offset over `200ms`

Focus ring everywhere: `2px solid #D8DCFF`, offset `3px`.

### Cards & Containers

**Feature Spotlight Grid [M]** (re-themed)
- 3 columns, no gaps; cells share `1px` Hairline lines
- `12px` "+" crosshair markers in Cream 40 at each cell's top-left and bottom-right corners
- **Spotlight:** `radial-gradient(ellipse 60% 55% at 20% 0%, rgba(246,178,91,.16), transparent 70%)`; on hover it rises to `.26` over `300ms`
- Padding `32px`, min height `260px`, ground Night (transparent cells)
- **Icon tile:** `48px`, radius `4px`, Glass Fill, `1px` Glass Border, icon `24px` at `1.5px` Cream stroke
- Title Satoshi 20/500 Cream; body Satoshi 16/26 Cream 70
- No shadow, no radius on cells

**Bento Grid [M]** (re-themed)
- **Container:** Glass Fill, `1px` Glass Border, radius `28px`, padding `20px`, `backdrop-filter: blur(20px)`
- **Grid:** 12 columns, `20px` gap; row 1 is an 8-column tile and a 4-column tile, row 2 is three 4-column tiles; row height `360px`
- **Tile:** one tint from Section 2, radius `12px`, no border, no shadow; a warm flare in its top-left, `radial-gradient(120% 90% at 0% 0%, rgba(246,178,91,.14), transparent 55%)`
- **Tile Label:** Cream pill, Night text, Georama 22/700, padding `10px 24px`, rotated `-3°` to `+4°` (vary per tile), with a Tile Caption `8px` above, offset `8px` left
- **Anchors:** top-center, center or left-center; one per tile
- **"Coming soon" variant:** Glass pill with Hairline border and Cream text
- **Art slot (optional):** a circular lens crop (about `55%` of tile height, bottom-right) with a feathered edge and a `1px` Hairline ring, matching the orb
- **Header:** split variant, H2 left and lead right (max `380px`); stat line in Georama 15/600 Sun Amber

**Section Header (shared)**
- Centered. Optional eyebrow pill (Glass Fill, Hairline border, `6px 16px`, Georama 12 caps +0.14em), once per section, never in the hero
- Then H2, then Lead; `16px` between each, `64px` below the block

### Footer [B] (used as it is)

**CTA Band**
- Ground Night, height about `100vh` max `720px`, content left at `70px` on a 1200 canvas
- Micro line "Get Early Access" in Satoshi 400 16 Cream 70, then the CTA Band Headline, then the Viewfinder button, `24px` apart
- **Art (right, bleeding off the top and right):** a large twisted ribbon with a heavy grain texture, running Ember Red and Peach into Teal and Sky. Supplied 3D render preferred.
- Bottom edge: `1px` Footer Line

**Footer**
- Ground `#101214` with `4%` grain; blurred Aurora blobs (Teal, Indigo, Peach, Sky; `blur 90–120px`) running diagonally across the bottom right
- **Left column:** logo lockup, description (Satoshi 400 15/24, `#9C978B`, max `40ch`), then three `28px` social squares (fill `#25272B`, `1px #34373C`, radius `6px`, icons `16px`)
- **Right columns:** Product and Resources, heading then four links, `28px` row spacing, hover to `#FFFFFF`
- **Divider:** `1px` Footer Line, then a bottom row: `© year Anghkooey. All rights reserved.` left, three legal links right with `64px` gaps
- Padding `64px` sides, `56px` top

### Inputs & Forms (extrapolated; none shown in the references)
- Glass Fill, `1px` Glass Border, radius `12px`, height `48px`, padding `0 16px`, Satoshi 16
- Focus: border `#D8DCFF` plus `0 0 0 4px rgba(79,92,255,.25)`
- Placeholder Cream 35 at 16px is decorative only; use a visible label in Satoshi 14/500

### Illustration & Imagery
- Every photograph or render is seen through a circular lens: feathered edge, Hairline ring, Vignette
- UI screenshots sit in rounded `12px` frames with `1px` Glass Border
- No drop shadows; light comes from the flare and the folded-A/aperture glow

## 5. Layout Principles

### Spacing System
**Base Unit:** `4px`
**Scale:** `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 120`

| Relationship | Value |
|--------------|-------|
| Eyebrow → H2 → Lead | 16 |
| Section header → content | 64 |
| Icon tile → title | 24 |
| Title → body | 8 |
| Card and tile grid gap | 20 |
| Card padding | 32 (spotlight), 20 (bento container) |
| Section padding, top and bottom | 120 desktop · 80 tablet · 64 mobile |

### Grid & Container
- **Max width** `1280px`, side padding `40px` desktop, `20px` mobile; 12 columns, `20px` gutter
- The hero and CTA band run edge to edge; content sections sit in the container

### Page Blueprint

| Order | Section | Ground | Source |
|-------|---------|--------|--------|
| 0 | Intro (folded-A → optional aperture) | Night Deep | [V3][V4] |
| 1 | Hero (pinned, three acts) | Night + orb | [A] |
| 2 | Features | Night | [M] spotlight grid |
| 3 | Output / Work | Night | [M] bento |
| 4 | CTA band | Night | [B] |
| 5 | Footer | Footer Ground | [B] |

### Scroll & Motion Choreography [V3][V4]

**Easing and duration tokens**
- `--ease-lid: cubic-bezier(.65,0,.15,1)` (lids and aperture)
- `--ease-out: cubic-bezier(.16,1,.3,1)` (reveals)
- Durations: micro `200ms`, reveal `700ms`, aperture `1000ms`

**Intro (first visit, ~2.4–3.2s, freely skippable)**
| Time | Event |
|------|-------|
| 0–0.2s | Night Deep; immediately accessible skip/start controls |
| 0.2–1.1s | Official folded-A silhouette reveals by masks or real SVG paths, with restrained periwinkle light |
| 1.1–1.8s | A gains definition; soft electric-indigo bloom settles; the underlying geometry stays intact |
| 1.8–2.1s | One restrained glow pulse, then static recognizable folded-A |
| 2.1–3.0s | Optional almond aperture opens from the A into the atmospheric orb; wordmark and ornaments become visible |

Any input immediately completes to the usable hero. Repeat visits use a minimal reveal or none; `prefers-reduced-motion` skips cinematic motion. Do not play the V3 ring/pupil video as a site asset.

**Hero scroll (pinned, `320vh` runway; mobile `240vh`; `p` is progress 0–1)**

| Act | p | Orb | Wordmark | Lids | Copy |
|-----|---|-----|----------|------|------|
| 1 Nudge | 0–0.10 | scale `1 → 1.03` | drifts up 2% | encroach 6% | scroll hint fades out |
| 2 Close | 0.10–0.32 | scale `→ .96`, blur `0 → 10px`, brightness `→ .6` | flies to the top-left: scale `→ 0.11`, tracking `.02 → .16em`, glow `→ 20%`; sits above the lids | meet at `p = .30`; the seam glows | hidden |
| 3 Open | 0.32–0.62 | shifts right `+14vw`, scale `.88`, blur `10 → 0`, brightness `1` | docked as nav logo; the official folded-A appears beside it | part with the glowing aperture rim | H1, lead, buttons rise `24px` and unblur, `80ms` stagger, buttons last |
| 4 Settle | 0.62–0.80 | idle drift | static | removed | fully shown, left column over a scrim |
| 5 Release | 0.80–1 | drifts up `8vh` | static | none | the pin ends; the next section enters |

- Scrim for the copy: `linear-gradient(90deg, rgba(5,8,15,.82), transparent 60%)`
- The wordmark layer sits above the lids so its flight is always visible. Scrolling up plays everything in reverse.
- **Implementation:** scoped GSAP + ScrollTrigger (React cleanup required), native scroll input, viewport-specific `gsap.matchMedia`. Animate inner elements of a pinned container, not the pin wrapper itself. Use `transform`/`opacity` primarily; use filters/clip paths sparingly. Add no scroll-smoother unless browser tests prove necessity.

**After the hero:** normal scrolling resumes. Sections enter lightly; a single optional aperture between Features and Output. Never trap scroll or force users through 320vh to access the app CTA.

**Reduced motion:** skip intro and pinned scroll. Immediately display brand, hero copy, Start Talking CTA, and a static orb; remove aperture, drift and sparkles. Ensure keyboard-accessible skip navigation.

### Sound (optional)
- Muted by default; the sound toggle (bottom-right) enables it. Browsers require a user gesture first.
- Optional cues: folded-A reveal, aperture opening, quiet hover. No looping music unless a user explicitly enables it.
- Save the preference; never auto-play.

### Whitespace Philosophy
The hero keeps only the orb, the wordmark and fine ornament, and the copy appears as the aperture opens. Content sections are airy with hairline structure, so the grids read as light and the orb stays the one heavy thing in the system.

### Border Radius Scale
- `2px` Viewfinder button · `4px` icon tiles · `6px` social squares · `12px` tiles, inputs, frames · `28px` bento container · `9999px` pills and buttons · `50%` orb and ring

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| 0 Night | `#05080F` | page |
| 1 Glass | fill, `1px` border, blur `16–20px` | bento container, pills, social buttons |
| 2 Hairline | `1px` Hairline lines | spotlight grid, ornaments |
| Glow | Orb rim, flare, Folded-A glow | orb, official mark, aperture |
| Lids | Night Deep overlay with glowing seam | transitions only |

**Philosophy:** there are no drop shadows. Depth comes from light: a warm flare in the upper left of the orb, tiles and cells, and a restrained Electric Indigo glow around the folded-A and aperture seam. Glass layers sit on Night and are separated by a border, not a shadow.

## 7. Do's and Don'ts

### Do
- Keep the orb the single focal hero image and official Icy Periwinkle wordmark the loudest type
- Draw ornament with `1px` cream lines only
- Put the sun flare in the upper left of every lit surface (orb, tiles, spotlight cells)
- Use Icy Periwinkle for the official folded-A/wordmark and aperture; Electric Indigo only as subtle light/focus accents
- Keep Aurora colors inside the CTA band and footer
- View every image through a circular lens with a feathered edge
- Let any input skip the intro, and honor reduced motion

### Don't
- Don't use Inter anywhere
- Don't set headlines in Satoshi or Georama, except the CTA band's Satoshi Light
- Don't add drop shadows or a second glow color
- Don't use pastel or flat light tiles; the bento is dark jewel tints
- Don't use Aurora gradients above the footer
- Don't run the intro on every page view
- Don't start sound without a user gesture

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Orb `92vw`; wordmark `12.5vw`; the orb moves up `12vh` (not right) in Act 3 and the copy sits below it; runway `240vh`; sparkles drop to 16; edge labels and the pager are hidden; nav is the mark plus a menu pill; spotlight is 1 column, bento is 1 column |
| Tablet | 640–1023px | Orb `min(86vh, 80vw)`; the Act 3 shift is `+8vw`; spotlight 2 columns, bento 2 columns with the wide tile spanning both |
| Desktop | 1024–1439px | Full behavior as specified |
| Wide | ≥1440px | Wordmark stops at `176px`; the container stays `1280px` |

### Type by Breakpoint
| Role | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| H1 | 40 / 44 | 52 / 56 | 64 / 68 |
| H2 | 32 / 38 | 40 / 46 | 48 / 54 |
| CTA Band Headline | 36 / 40 | 46 / 50 | 56 / 60 |
| Tile Label | 18 / 22 | 20 / 24 | 22 / 26 |

### Touch Targets and Performance
- Minimum `44 × 44px`; buttons `48px`
- Orb video: H.264 and WebM, under about `3MB`, `preload="metadata"`, paused when off screen; use the poster only when `Save-Data` is on
- Blur and filter on at most two layers at once; remove `will-change` after each act

## 9. Agent Prompt Guide

### Asset Slots (supply these; don't fabricate)
| Slot | What |
|------|------|
| Wordmark | owner-supplied ANGHKOOEY wordmark SVG, recolored Icy Periwinkle if asset permits |
| Folded-A logo | the official folded-A SVG/PNG from owner, no geometry reinterpretation; source SVG required for literal path drawing |
| Orb loop | original/authorized 8–10s seamless scene video, plus a poster still; poster reference A alone is NOT suitable as-is due to WORLD text |
| CTA ribbon | grainy twisted-ribbon render, transparent background |
| Sound stems | folded-A reveal, aperture, hover tick (optional; all off by default) |
| Tile art | circular lens crops for the bento (optional) |

### Quick Color Reference
- **Ground:** Night `#05080F` · Raised `#0B1119` · Deep `#02040A`
- **Text:** Cream `#F4EEDF` · Cream 70 · Cream 55
- **Orb:** Abyss `#1F6AA0` · Amber `#F6B25B` · Flare `#FFE9C2`
- **Identity:** Folded-A + wordmark `#D8DCFF` · optional halo `#4F5CFF`
- **Aurora (footer only):** Teal `#52A59C` · Indigo `#3F4E9A` · Peach `#E0916A` · Ember `#E5533D` · Sky `#3F7BC4`

### Token Starter
```css
:root{
  --font-display:'Cormorant Garamond','Cormorant','Playfair Display',Georgia,serif;
  --font-ui:'Satoshi','General Sans',-apple-system,'Segoe UI',sans-serif;
  --font-label:'Georama','Satoshi',system-ui,sans-serif;
  --night:#05080F; --night-deep:#02040A; --raised:#0B1119;
  --cream:#F4EEDF; --cream-70:rgba(244,238,223,.70); --cream-55:rgba(244,238,223,.55);
  --hairline:rgba(244,238,223,.18); --glass:rgba(244,238,223,.05); --glass-border:rgba(244,238,223,.14);
  --amber:#F6B25B; --abyss:#1F6AA0; --brand:#D8DCFF; --halo:#4F5CFF;
  --ease-lid:cubic-bezier(.65,0,.15,1); --ease-out:cubic-bezier(.16,1,.3,1);
  --r-tile:12px; --r-container:28px; --gap:20px; --section-y:120px;
}
```
Satoshi loads from Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap`); Cormorant Garamond and Georama from Google Fonts.

### Build Order
1. Fonts, tokens, Night ground, type ladder classes.
2. Buttons, pills, section header, inputs.
3. Static hero: orb with a poster still, wordmark, ornaments, edge HUD.
4. Official folded-A asset; soft reveal/bloom/pulse intro using authentic asset geometry.
5. Pinned hero scroll: Icy Periwinkle wordmark dock, optional aperture, copy reveal.
6. Nav pill, docked logo, bottom HUD, pager.
7. Spotlight grid, then bento.
8. CTA band and footer.
9. Restrained idle motion (sparkles, drift), sound toggle, reduced-motion and mobile variants.
10. Check contrast, the spacing table, performance and every breakpoint.

### Iteration Guide
1. **Fonts are locked:** supplied wordmark asset preferred; Cormorant Garamond fallback and H1/H2, Satoshi for UI, Georama for labels. No Inter.
2. **One orb, one wordmark.** Everything else defers to them.
3. **Ornament is 1px cream hairline only.** Circles, linked rings, sparkles, numerals, vertical text.
4. **The folded-A is the only brand symbol:** reveal/bloom/glow pulse using the supplied A. Ring/pupil/blink artwork belongs only to motion reference V3 and must never be implemented.
5. **Aperture is a cinematic transition, not a logo.** Keep one elegant lens-opening moment; simple fades elsewhere are allowed when clearer or faster.
6. **The Icy Periwinkle wordmark docks to the top-left** (with folded-A), above the aperture layers and without visual jumping.
7. **No drop shadows;** use glow, glass and hairlines.
8. **Aurora colors appear only from the CTA band down.**
9. **Bento tiles are dark jewel tints with a warm flare in the top-left;** labels are cream pills, tilted `-3°` to `+4°`.
10. **Spotlight cells are hairline-ruled with `+` crosshairs and an amber spotlight glow.**
11. **The footer follows [B] exactly:** CTA band with a Viewfinder button, then the columns, social squares, legal row and gradient backdrop.
12. **Always provide the skip path and the reduced-motion path.**


## 10. Landing Build & Review Contract (2026-10-09)

- **Stage, don't batch:** first establish design tokens/real brand assets; then produce a reviewable hero only; inspect desktop + mobile and repair; then build feature spotlights, memory story, messenger continuity, CTA, and footer one at a time. Move into `/app` only after the landing page is coherent.
- **Required real behavior:** Start Talking navigates to the working app/session path; Telegram opens the real bot; iMessage CTA uses a verified, provisioned contact/onboarding path; any policy/resource link must point to a real page or be removed until ready. Never claim live bookings, hotel inventory, user counts, or memory counts that are not verified.
- **No wallet button / fake sign-in:** the product currently uses web sessions, memory consent and channel linking; add full authentication only when actually implemented. Avoid generic Web3 interface patterns.
- **Hero media:** use an original/authorized visual asset. The poster reference containing 'WORLD' is a compositional guide, not a deployable Anghkooey hero asset. If moving video media does not exist, use a tasteful static/layered orb with CSS micro-parallax; do not imply a real video source was supplied.
- **No mock app data:** marketing scenes can be clearly illustrative editorial examples; dashboards, memory receipts and counts require actual backend values.
- **Acceptance after each stage:** check legibility, CTA visibility, nav semantics, 360/390/768/1280/1440-width layouts, keyboard focus, reduced motion, loading/error/empty states where relevant, scrolling backward, asset loading failures, and Next.js hydration. Use a real browser/computer-use capability if available; otherwise request screenshots and report unverified visuals.
- **Technology:** GSAP + ScrollTrigger is the one motion system for intro and scroll; CSS handles idle transforms; don't install Three.js or Anime.js merely to tick boxes. Anime.js SVG utilities or Three.js may be added later only for a demonstrated gap that GSAP cannot handle with available source assets.
