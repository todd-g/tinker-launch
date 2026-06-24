# Greene County Software Co-op — Exploration

**Date:** 2026-06-24
**Status:** Early ideation / pre-feasibility
**Thesis:** A member-owned, nonprofit cooperative that replaces the out-of-county software
subscriptions Greene County businesses pay every month — hosting proven open-source tools
locally and offering them **at cost**, so the money stays in the county.

---

## The concept (decisions locked this session)

- **Delivery model:** a **hosted co-op / nonprofit** shared local service. Members pay at-cost.
  Not pure self-host, not a high-margin business.
- **Who it serves:** **rooted, owner-operated businesses that employ local people** — the
  Chamber-member base. Explicitly **NOT** absentee operators / value-extractors.
  - **Out of scope:** individual Airbnb / short-term-rental homeowners (politically and
    culturally misaligned — seen locally as extracting value).
  - **In scope:** actual owner-operated **inns / hotels / motels** that employ locals.
- **Local reality (corrects generic research):**
  - **Food delivery (DoorDash/Grubhub) barely exists here** — it's rural. The generic "biggest
    dollars-out = delivery commissions" finding does **not** apply to Greene County.
  - Connectivity is **not** a constraint — if a business already pays for Square/Squarespace,
    it already has wifi.

## How to rank "impact"

> **Impact = (# local businesses using it) × ($ leaving county per business) × (buildability/adoptability)**

The third factor is the killer: the biggest dollar drains are often the hardest to replace, so
"most impactful" and "best first move" are usually different targets. Lead with a fast, provable
win to earn credibility; go after the big-dollars prize once you have reference customers.

## Greene County context

- ~47–48K population. Economy: tourism/hospitality, food, main-street retail, trades/services,
  agriculture, second homes. In the **Capital Region** NY REDC.
- **Micro-business dominated:** ~82% of establishments have <10 employees, ~63% have <5.
  *(Source figures are ~2003 vintage — see Data Gaps. Structurally still true for a rural county.)*
  → **Onboarding non-technical owners is both the hardest part and the moat.** A local co-op can
  set it up in person at the counter; a national SaaS never will.

## Payments deep-dive (the key insight)

A flat **Stripe pass-through POS saves almost nothing on the swipe rate** — ~80% of every card
fee is interchange + network assessments that flow to the customer's bank and Visa/MC and is
unavoidable for everyone. Stripe in-person (2.7% + 5¢) is even a hair worse than Square (2.6% + 10¢).

**The real savings is the monthly software stack, exactly as hypothesized:**

- **Toast:** ~$69–79/mo base per terminal, then **Online Ordering ~$75/mo + Marketing ~$75/mo +
  Loyalty ~$50/mo** → a normal restaurant lands at **$400–500/mo (~$5–6K/yr) in software alone.**
- **Square:** Free / Plus $49 / Premium $149, with add-ons piling on **$100–300/mo**.

→ A co-op product that **bundles online ordering + marketing + loyalty + website at-cost
(~$25–50/mo)** can save a restaurant **$3,000–5,500/yr** — *without touching the processing rate.*
The product is **"a POS/software suite that doesn't nickel-and-dime you on modules,"** not "a
cheaper payment processor."

**The Bank of Greene County angle:** it's a federally-chartered **savings bank** (not a credit
union) HQ'd in Catskill that **already offers merchant services**. Partnership layers:
1. *Realistic:* co-op provides software + bank does acquiring at interchange-plus with a thin local
   markup → shave ~0.3–0.6% vs Stripe (~$2–3K/yr on a $500K restaurant).
2. *Audacious (north star):* the bank is <$10B assets → **Durbin-exempt → earns higher debit
   interchange.** If it issues debit cards to county residents used at county merchants processed
   by the co-op, the interchange stays local too — the full "money recirculates in Greene County" loop.
3. *Honest constraint:* a POS outage on a Saturday dinner rush is high-stakes — payments is the
   big prize but **target #2–3, not the first build.**

## Recalibrated first-target shortlist (rural, no-delivery, no-STR, rooted-biz-only)

| First target | Dollars-out *here* | Build base | Stakes / adoption |
|---|---|---|---|
| ★ **Restaurant online-ordering + marketing bundle** | Med–High, provable (~$3–5K/yr/restaurant from killing Toast/Square modules) | TastyIgniter (MIT) + Listmonk | Medium (online layer, not in-person POS); tight community = fast referrals |
| **Scheduling** (trades/salons/services) | Low–Med | Cal.com / Cal.diy (MIT) | Low stakes; "create new behavior" adoption; biggest segment by count |
| **Websites** (universal) | Med but broad | WordPress / Ghost | Low stakes; commodity + painful migration |
| **Email** (universal) | Low (flat fee) | Listmonk (AGPLv3) | Low stakes; deliverability is the real ops burden |
| **Payments / POS** (+ Bank of Greene County) | **Highest** (revenue-scaled) | Hard build | Highest stakes — the big prize, target #2–3 |
| ~~Accounting~~ | Med, sticky | **License-blocked** (Invoice Ninja Elastic License bars SaaS hosting) | Skip as early target |
| ~~OTA commissions~~ (legit hotels/inns) | High/property | Can't self-host demand-gen | Network-effect moat; long-term only |

**Recommendation:** lead with the **restaurant online-ordering + marketing bundle** — best blend of
provable dollars, an existing build base, a tight referral community, and a wedge toward the payments
prize. If the very first build must be maximally low-risk, **scheduling for trades** is the safe
alternative. Then sequence: ordering bundle → light POS/payments (with the bank) → universal
utility bundle (website/email/scheduling) for everyone.

**Adapt-and-host, don't build from scratch.** Verified open-source bases:
- Online ordering → **TastyIgniter** (MIT) · https://tastyigniter.com
- Scheduling → **Cal.com / Cal.diy** (MIT) · https://cal.com
- Email → **Listmonk** (AGPLv3) · https://listmonk.app
- ⚠️ Invoicing → **Invoice Ninja** but **Elastic License 2.0 forbids hosting-as-a-service** — blocked for the co-op model.
- ⚠️ POS → **Floreant** is offline and doesn't process payments — weak; in-person POS is a real build.

## Economic-impact case (for the pitch)

The "keep money local" thesis rests on the **local multiplier effect** — locally-owned vendors
recirculate substantially more revenue in-community than national chains.
⚠️ The specific Civic Economics / AMIBA figures were **not yet verified** in research — source
before citing in any pitch.

## Data gaps to close before any pitch

1. **Business counts are ~2003 vintage and the dollars-out was never computed.** Pull current
   figures for **Greene County, FIPS 36039**:
   - US Census **County Business Patterns 2023** (establishments/employment/payroll by NAICS)
   - Census **Nonemployer Statistics** (sole-prop counts *and receipts* by NAICS)
   - **NYS DOL QCEW** (establishment/employment/wages by NAICS)
   Then compute dollars-out per category (restaurants × Toast-stack, all-biz × payment processing, etc.).
2. **Local-multiplier studies** (Civic Economics / AMIBA) need separate sourcing.

## Files in this folder

- [`grants-pipeline.md`](grants-pipeline.md) — live grant opportunities + applicant-path analysis
- [`concept-memo.md`](concept-memo.md) — one-page memo for the Chamber / IDA / SBDC
- [`survey-instrument.md`](survey-instrument.md) — business survey that produces the dollars-out number
- [`outreach-scripts.md`](outreach-scripts.md) — USDA call script + IDA/EDC email

## Immediate next moves

1. **Call the Capital Region SBDC** (covers Greene) — free market research, start the survey now.
2. **Call the USDA RD NY State Office** (Syracuse, 315-477-6400) — pre-screen RBDG eligibility.
3. **Email the Greene County IDA / EDC** — recruit an eligible grant applicant.
4. **Decide the applicant entity** (IDA / EDC / wife's fiscal-sponsor nonprofit / new 501c3) — the gate on every grant.
