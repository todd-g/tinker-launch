# Crumble — Project Handoff

**Name:** Crumble
**Tagline (hero):** *This* is the way the cookie crumbles
**Subhead:** See what every user, in every country, sees and experiences — and what fires behind the banner.
**Domain:** TBD — check `crumble.dev`, `crumble.app`, `getcrumble.com`, `trycrumble.com`, `crumble.io`

A dev-friendly cookie consent product positioned as **"Lighthouse / a11y score, but for consent."** The wedge is a beautiful, shareable visual artifact — a **Consent Canvas** — that shows what users in different jurisdictions actually see and experience on a site, with full evidence (screenshots, video, network, cookies, console) at each step of the consent flow.

## Brand voice

Not preachy compliance. Not legalese. Confident, dev-toned, with personality. The italicized *This* in the tagline converts a fatalistic idiom ("oh well, that's the way the cookie crumbles") into a confident claim ("here is precisely the way it crumbles"). Lean into the idiom — it's reusable across surfaces:

- **Per-canvas header:** *"This is how the cookie crumbles for nytimes.com in Germany."* Every shared link feels custom + on-brand.
- **Loading state:** *"Working out how the cookie crumbles…"*
- **Empty / no-violations state:** *"Cleanly crumbled. No issues found."*
- **CTA on free tier:** *"See how it crumbles in your country →"* (paid: all countries)

The idiom is reusable, which is the sign of a good brand line. Use it without it getting tired.

---

## Why now

The Consent Management Platform (CMP) market is dominated by legal/marketing-led incumbents (OneTrust, Cookiebot/Usercentrics, Iubenda, Termly, Osano, Didomi, Sourcepoint, TrustArc, Ketch). All are paste-this-script-tag + log-into-our-dashboard products. APIs exist but are afterthoughts. None offer real CLIs, config-as-code, codebase scanners, or agent-friendly tooling.

**One credible dev-first competitor exists:** c15t / consent.io (Christopher Burns). TypeScript-native, real CLI, hosted backend, Apache-2.0, ~1.7k GitHub stars. They are executing the "Resend-of-consent" playbook well, but the hosted product is still early.

**Open lanes that no one has filled:**
1. Visual consent matrix — what users actually see across jurisdictions/choices
2. Public Consent Grade — Lighthouse-style scoring for marketing flywheel
3. Static-analysis codebase scanner — `consent scan` against repo, not website crawler
4. CI drift detection for consent config
5. Terraform/Pulumi-style infrastructure-as-code for consent

The canvas/grade angle is the most differentiated and most viral.

---

## Core thesis (the thing to prove first)

**A Consent Canvas is shareable enough inside an org that it sells the product without sales.**

The mechanic:
- Dev runs a scan on their own site → gets a beautiful shareable URL
- Posts in Slack / sends to PM / sends to legal
- "Holy shit, look what we look like in Germany when users reject all"
- Someone in the org says "we need this for our other 3 sites" → conversion

This is the Loom playbook: the artifact is the marketing. Per-country freemium is the natural paywall.

---

## Product shape

### Three views, same captured data

1. **Canvas (graph view)** — branching tree of consent states. Root = pre-banner. Branches: accept-all / reject-all / granular / dismiss. Each node has screenshot + video + network + cookies + console + compliance flags. Pin-and-diff feature shows what changed between any two states (the regulator-defensible artifact).

2. **Matrix (audit view)** — jurisdictions (EU GDPR, UK, CA CPRA, BR LGPD, etc.) × required behaviors (no pre-consent trackers, reject as easy as accept, withdrawal mechanism, etc.). ✓/✗/⚠ cells link to the canvas node that proves each cell.

3. **Consent Grade (public, free)** — Lighthouse-style letter grade. Anyone enters a URL, gets a grade + 1-2 sample canvas nodes (teaser). Massive SEO + marketing flywheel. "How does competitor.com score?" pages get organic traffic.

### Eventual: CLI + codebase scanner (v2, not v1)

- `consent scan` against a repo
- Static analysis of `package.json` imports + script tags + env vars
- Maps to a curated vendor registry (Hotjar, Segment, PostHog, GA4, Stripe, Sentry, etc.)
- Generates `consent.config.ts`
- CI mode: fail build when new tracker added but not declared
- CMP-agnostic — output adapters for c15t, Cookiebot, Klaro, raw JSON

**Don't build this until canvas has traction.** Different audience (devs only), narrower wedge, harder demo.

---

## Why canvas first, CLI second

- Canvas is **visual → shareable → viral** across roles (dev / PM / legal / design)
- CLI is **dev-only → narrower wedge** → harder to spread organically
- Shareable artifact creates internal pull ("you gotta see this")
- Per-country/per-path freemium is a natural gate
- CLI becomes the v2 expansion once canvas pulls users in; sells naturally as a Pro feature when devs want CI integration

---

## Pricing thesis (rough)

- **Free** — 1 country, accept-all + reject-all only, public canvas, watermark, Consent Grade letter
- **Pro (~$29/mo)** — all countries, all paths (granular, dismiss, navigation), private canvases, history, no watermark
- **Team (~$79-99/mo)** — multi-site, Slack alerts, GitHub PR comments, audit log retention, drift detection
- **Enterprise (custom)** — SSO, SOC2, cryptographically signed audit log for regulators, custom vendor registry entries

Anchor: **"saves one person one hour = no-brainer pay"** — calibration is correct. The agency-side experience confirms this price point converts.

---

## First step: concierge MVP (week 1)

**Do not build the engine first. Test whether the canvas spreads.**

1. **Pick 10 well-known sites** with distinctly different consent behavior. Suggested mix: nytimes.com, ft.com, theguardian.com, stripe.com, spotify.com, notion.so, vercel.com, openai.com, anthropic.com, plus one site from your agency network you can demo to a real buyer.

2. **Hand-run captures** via Browserbase (account already exists from another project). 4 countries × 2 paths = 8 captures per site = 80 total. Done in a weekend.
   - Countries: US, DE (EU/GDPR), GB (UK GDPR), BR (LGPD)
   - Paths: pre-consent + accept-all + reject-all (3 nodes minimum per country)
   - Set locale, timezone, geolocation, Accept-Language per persona
   - Use sticky sessions so accept/reject look like the same user

3. **Build one static Next.js page per site** at `yourdomain.com/canvas/[site-slug]`. Render the captured nodes as a branching graph (React Flow or tldraw). Embed Browserbase's session replay URLs as a free shortcut for video player.

4. **Lead each canvas with a single red flag** — "🚨 nytimes.com fires Google Analytics before consent in Germany." Canvases that say *something is broken* get shared; canvases that say *everything is fine* don't.

5. **OG/SEO meta tags** so Slack/Twitter unfurl beautifully. Hero preview image is the canvas screenshot.

6. **Bottom CTA**: "scan your site →" → email waitlist (no real product yet).

7. **Post the juiciest canvas** (probably FT or NYT) on Twitter / HN / Slack networks. See what spreads.

### Success signal
Canvases get shared without you sharing them. Waitlist signups from people you didn't pitch to. Replies asking "can you do my site?"

### Failure signal
Crickets. The visual is less viral than we're hoping. Pivot the angle or kill — but you learned in 1 week, not 1 quarter.

---

## What to NOT build week 1

- ❌ Codebase scanner / CLI — different audience, v2
- ❌ Real auth / accounts / billing — Stripe checkout + magic link later
- ❌ Matrix view — canvas alone is the viral artifact; matrix serves legal, comes after PMF
- ❌ Consent Grade scoring system — marketing flywheel comes after capture pipeline works
- ❌ Self-serve URL submission — concierge means hand-curated
- ❌ Vendor signature library — heuristic selector (`button:has-text("Accept")`) is fine for 10 hand-picked sites; fix the 3 that break by hand

---

## Key technical bets (decide early, don't over-engineer)

1. **Banner detection strategy (long-term):** hybrid of (a) vendor-signature library — detect OneTrust, Cookiebot, Didomi, Termly, etc. via their global JS objects / DOM signatures, covers ~70%; (b) Claude vision fallback on the screenshot for custom banners. Hybrid is the moat — competitors with only signatures can't handle custom banners.

2. **Capture backend:** Browserbase. Account already set up. Residential proxies with country targeting included. Session replay URLs (browserbase.com/sessions/<id>) work as a free v0 video player. Cost at concierge scale (~80 sessions) is a few dollars.

3. **Stack:** Next.js + Vercel + Browserbase. No DB needed for concierge phase — captured data is just a folder of JSON + PNG + MP4 per site, committed to the repo. Add Supabase/Neon when self-serve lands.

4. **Canvas rendering:** React Flow (structured graph) or tldraw (infinite-canvas vibes). Either works; React Flow is more constrained and probably better for v1.

---

## What the next agent/session should do

In priority order:

1. **Register the domain** before building anything. Name is **Crumble**. Check availability in priority order: `crumble.dev` → `crumble.app` → `getcrumble.com` → `trycrumble.com` → `crumble.io`. Grab whichever is best of the available set. Probably grab two if cheap (the brand domain + a `.com` redirect).

2. **Wireframe the canvas page** (the static site users will see and share). One artifact, designed for shareability:
   - Hero: site URL + the most damning flag in 24pt type
   - Below: the branching graph (3-5 nodes for v0)
   - Each node detail: screenshot, video clip, network/cookies/console panels
   - Footer CTA: "scan your site" + waitlist email
   - OG image: composed snapshot of the canvas

3. **Write the Browserbase capture script** — already have an account. Need:
   - Personas table (country, locale, timezone, geo coords, Accept-Language)
   - Per (site, persona) session creation with sticky residential proxy
   - Capture pre-consent → click accept-all → capture → end session
   - Separate session for reject-all (sticky proxy per session)
   - Save: screenshot, video (Browserbase records by default), network log, cookies, console
   - Run against the 10 chosen sites × 4 countries × 2 paths

4. **Build the static canvas pages** from captured data. Manual fixups OK — this is concierge, not self-serve.

5. **Launch:** post 1-2 of the juiciest canvases. Twitter, HN "Show", privacy/dev Slack groups, agency network. Measure what spreads.

6. **Decide based on signal:** build self-serve (canvas as a product), or pivot, or kill.

---

## Open questions (decide week 1)

- Domain pick from the Crumble shortlist
- Are public canvases default? (Probably yes — shareability is the whole thesis)
- Watermark / "Made with Crumble" branding on free canvases — what's the design treatment?
- Charge from day 1 or wait until waitlist signals?
- 4 countries for v0 or wider (add IN, AU, CA, FR)?
- How to handle banners that fail detection — flag visibly in the canvas, or skip the site?
- Where does the legal-side audit log live in the long-term product roadmap? (Probably a Team-tier unlock)

---

## Reference: competitive landscape (one-line each)

- **OneTrust** — enterprise legal, $$$, dashboard-only
- **Cookiebot / Usercentrics** — SMB/marketing, script tag + GUI
- **Iubenda / Termly / CookieYes** — SMB self-serve, plugin-based
- **Osano / Didomi / Sourcepoint / TrustArc / Ketch** — mid-market to enterprise, varying API depth, all GUI-led
- **Transcend** — closest enterprise-grade dev-aware product (airgap.js OSS), priced for series-C+
- **Klaro / orestbida cookieconsent** — open-source widgets, no backend/SaaS
- **c15t / consent.io** — the one to watch. Real Resend-style dev-first attempt. Strong open-source, hosted product still early. We'd compete on visual artifact + grade flywheel, not on the headless React banner library (they win that).

---

## TL;DR for the next session

Build a beautiful, shareable, hand-curated visual canvas of how 10 famous sites handle cookie consent across 4 countries. Lead with violations. Post the juiciest one publicly. See if it spreads. If yes → build the self-serve engine. If no → pivot in week 2.

**Browserbase account exists. Skill stack (Next.js + Vercel + Playwright) is familiar. The bet is on the artifact's shareability, not on building anything novel technically.**

---

## Quick reference: brand

- **Name:** Crumble
- **Hero:** *This* is the way the cookie crumbles
- **Subhead:** See what every user, in every country, sees and experiences — and what fires behind the banner.
- **Voice:** confident, dev-toned, idiom-forward, anti-legalese
- **Reusable idiom hook:** "how it crumbles" — works in canvas headers, loading states, CTAs, empty states
