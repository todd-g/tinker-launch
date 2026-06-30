# Minima DevOps Wishlist — Developer Requirements

## 1. Purpose & how to read this

This is a **requirements / wishlist document**, not an architecture spec. It describes the developer experience the team wants and the outcomes engineering is being asked to deliver — it deliberately does **not** prescribe the *how*. Every choice about tooling, cloud services, the database-branching technique, the IaC approach, the CI system, and build-vs-buy is explicitly the CTO's and engineering's call. Each ask below is written as an **outcome + acceptance criteria**, so engineering can design against a clear "definition of done" without the implementation being constrained.

> Background context only (not a constraint that drives these asks): the team is standardizing on AWS + Python + RDS Postgres + React. The asks are written to hold regardless of the exact technology chosen — if another approach satisfies the outcome, that is acceptable.

### What we understand we're asking for

These capabilities carry real cost. Per-branch full environments and agentic checks on every PR consume compute, database spin-up, and agent/LLM run time, and they take engineering time to build and operate. The team is requesting them because the parallelism and the catch-before-prod safety are worth more than the ephemeral spend, and because environments that clean themselves up are preferable to the developer-hours lost to the current shared-staging bottleneck. Where the trade-off becomes expensive, the priority order in §9 reflects how the team would phase the spend, and the cross-cutting requirements in §7 (cost-awareness, auto-reclaim) exist so the costs stay bounded and attributable. These asks come from a team that understands the economics and intends the spend to be measured, attributable, and accountable.

---

## 2. The one-sentence vision

> **A developer opens a PR and automatically gets a complete, isolated, production-like environment — with its own database — that runs every check and QA pass for them, surfaces the results in one place, and tears itself down on merge.**

---

## 3. Guiding principles

- **Parallel by default** — no two engineers ever wait on a shared environment; every unit of work gets its own.
- **Zero manual wiring** — environments configure themselves; nobody hand-edits an env var to point at a new database.
- **Self-service** — a developer can add a config value, look up a connection string, or spin up a full environment without filing a ticket or pinging ops.
- **Nothing important happens only on a laptop** — deploys, checks, and migrations run in the cloud, on the record, reproducibly.
- **If it exists, you can see it** — every environment, deploy, database, and job is visible with its status in one place.
- **Safe to ship** — production is always releasable; mistakes are caught before prod and are easy to roll back.
- **Cleans up after itself** — temporary things (per-feature environments, feature databases, their config) disappear automatically when no longer needed.

---

## 4. A day in the life (the experience we want)

An engineer picks up a feature. They:

1. **Branch** off `main` and start coding.
2. **Push** the branch / open a PR. That alone is enough — no local deploy script, no manual setup.
3. A **preview environment spins up automatically**, with **its own fresh database**, wired up with no manual env-var editing.
4. **Migrations apply automatically** to that database as part of the normal workflow.
5. The PR runs its quality gates in two tiers. First the **cheap, objective, blocking checks**: automated bug/security review and the standard test suite. Only if those pass does the PR spend the more expensive **advisory agentic layer** — a coverage-adequacy judgment (does the e2e suite actually exercise this feature?) and a QA pass that drives a real browser through human-language QA scripts. Everything **reports back on the PR**.
6. The engineer **watches the whole thing in one control plane** — the env that's up, which DB it's pointing at, the deploy status, the check results — and can **pull up the environment's connection details** there if they need to access the database directly.
7. On approval they **merge**. Production **auto-deploys**, and the feature environment + its database + its config **tear themselves down** automatically.

No laptop scripts. No shared-staging collision. No manual env-var repointing to remember. No uncertainty about where something deployed.

> **A realism note for step 5.** The agentic checks (coverage judgment, browser QA) are not expected to be infallible. They will sometimes be slow and sometimes wrong. That is precisely why the team is asking for them to be **advisory and non-blocking by default**, clearly separated from the objective checks that *do* gate a merge, fast enough not to stall the PR, and straightforward to inspect and override when a verdict is wrong. An agentic check that silently blocks a good merge is a worse developer experience than no check at all — so the requirement is that these run *behind* the cheap checks, explain themselves, and never trap a developer. The intent is to ship this layer as a trusted advisor that earns its way toward gating, rather than as an unreliable gate that erodes trust on day one.

---

## 5. Current pain → what we want

| Today (current state) | What we want instead |
|---|---|
| Deploys currently run from individual developer machines via local scripts, so the process is not standardized, recorded, or reproducible, and depends on a single person's knowledge. | Standardized **cloud-run deploys** with a recorded, repeatable process and tracked status. Nothing critical lives only on one machine. |
| A single shared staging stack means only one feature of work can proceed at a time. Features collide and work serializes. | **One isolated environment per unit of work**, so any number of features proceed in parallel without ever waiting on each other. |
| Wiring a database to an environment is a manual step: creating a new database requires changing the env var on staging to point to it, which is error-prone and easy to forget. | **Auto-wired databases** — an environment knows its own database with zero manual configuration. |
| Config and secrets are currently stored in a plaintext text file in S3, which offers no structure, no per-environment scoping, no access control, and no audit trail. | **Structured, per-environment, self-service config/secrets** that are safe to read and write, easy to look up, and leave an audit trail. |
| There is currently no control plane: nobody can see what exists, what is deployed where, which database an environment points at, or the status of any of it. | A **single control plane** showing every environment, deploy, database mapping, and job status. |

---

## 6. The asks

Each ask: **The ask** (one sentence) → **Why** (pain removed) → **What good looks like** (the developer experience) → **Requirements** (testable, technology-agnostic acceptance criteria). Tool names, where they appear, are illustrative only — never a requirement.

---

### A. Operating model & branching

#### A1 — A defined branching methodology (ask 5)

- **The ask:** Adopt a single, written branching model where `main` represents production and auto-deploys, all other work happens on short-lived feature branches, and there is no shared staging environment.
- **Why:** There is currently no standard. A shared staging stack serializes work and creates collisions, and the deploy process is undocumented institutional knowledge. The modern pattern of per-branch throwaway environments is the team's preferred default.
- **What good looks like:**
  - A developer always knows: `main` = prod, my branch = my own disposable environment.
  - No one asks "is staging free?" because there is no shared staging to contend for.
- **Requirements:**
  - `main` is the single source of truth for production and deploys to prod automatically on merge.
  - All non-prod work happens on feature branches, each of which can have its own full environment.
  - The model does **not** rely on any long-lived shared pre-prod / staging environment; per-branch ephemeral environments are the standard pre-prod path.
  - The model is documented and is the default path — the easy path, not the exception.

> *Note on branching language:* `main`/feature-branch terminology is intrinsic to this ask — it **is** the methodology. Elsewhere in this document, where we say a unit of work "triggers" an environment, deploy, or teardown, treat the specific trigger (a push, a PR event, a merge, a label, a manual action) as engineering's choice — see §8.

---

### B. Per-feature environments

#### B1 — Per-feature environments, each with its own database (ask 1)

- **The ask:** Every unit of work automatically gets its own complete, production-like environment, including its **own dedicated database**.
- **Why:** A single shared staging stack allows only one feature of work to proceed at a time. Isolated per-feature environments remove that bottleneck entirely and let features be tested against real, independent data.
- **What good looks like:**
  - Starting a unit of work is all it takes — the environment appears on its own.
  - Two engineers on two features never touch the same env or the same database.
  - The environment is close enough to production that what passes there is trustworthy.
- **Requirements:**
  - Each unit of work provisions a full, isolated environment automatically, with no manual steps. *(What event triggers provisioning is engineering's call — see §8.)*
  - Each environment has its **own** database, isolated from prod and from every other environment.
  - The database is provisioned automatically and is ready quickly — **target: usable in under a few minutes from trigger**, so it never becomes a friction point — and seeded/branched to a usable, production-shaped state.
  - The environment is reachable at a predictable, discoverable URL.
  - **Production parity:** the environment matches production on the dimensions that affect correctness — same runtime/language versions, same database engine and major version, same schema, comparable configuration shape — so that a passing check there is meaningful signal for prod. (Scale and data volume need not match.)
  - *Implementation of DB provisioning (branch/clone/fresh-instance) is engineering's call — see §8.*

---

### C. Configuration & secrets

#### C1 — Structured, self-service config & secrets to replace the S3 text file (ask 2)

- **The ask:** Replace the plaintext S3 text file with a structured, per-environment config/secrets system that's easy to read from and write to — including both **auto-supplied** database connection info *and* an easy way for a developer to **look up** that connection info — and that works for feature deploys.
- **Why:** Config and secrets are currently stored in a plaintext text file in S3, with no structure, no per-environment scoping, no access control, and no audit trail. Adding a variable for a new feature, or pointing at a new database, is a manual and error-prone step, and there is no clean way to retrieve a connection string for debugging.
- **What good looks like:**
  - A developer can **add or update an env var for their feature themselves**, scoped to the right environment(s), without filing a ticket.
  - The database connection string is **provided automatically** to the running app — never hand-pasted.
  - A developer can **easily and securely look up** the current connection details for an environment they own — e.g. to point a local `psql` or DB GUI at a feature database, debug, or run a one-off query.
  - Reading or setting config is a simple, safe, self-service operation.
- **Requirements:**
  - Config/secrets are stored in a structured store, **scoped per environment** (prod, each feature env).
  - Secret values are stored and transmitted securely, with controlled, auditable access — not as shared plaintext.
  - A developer can add/update a variable for their feature self-service, and it reaches that feature's environment.
  - Each environment's **database connection details are injected automatically** into the running app — the developer never manually wires an env var to a database.
  - A developer can **self-service retrieve** the current connection details / config for any environment they own, via an audited read (e.g. surfaced in the control plane, H1) — not only have them auto-injected. The retrieval path is access-controlled and logged.
  - The same mechanism works for ephemeral feature environments, not just prod.
  - Changes and reads of sensitive values are auditable (who did what, when).

---

### D. Database lifecycle

#### D1 — Migrations as part of normal feature-branch work (ask 4)

- **The ask:** Applying database migrations is a normal, automatic part of working on a feature.
- **Why:** Today, with one shared staging database, a schema change for one feature can break another in-flight feature's environment, and applying a migration requires running it by hand against the shared database. This is the same shared-staging pain from §5, expressed specifically as schema collisions between in-flight features and forgotten manual apply steps. With per-feature auto-applied migrations, an environment's database always matches its branch's code, and no one else's work breaks because of a schema change.
- **What good looks like:**
  - A developer adds a migration in their branch, pushes, and the environment's database reflects it — no manual apply step against a shared DB.
  - Migration runs are visible and their success/failure is clear.
- **Requirements:**
  - Migrations defined in a unit of work are applied automatically to that environment's database as part of the deploy/preview flow.
  - Migration runs are logged with status (success/failure) and surfaced where the developer can see them.
  - Migrations in one feature's environment never affect prod or any other environment's database.
  - The same migration path is used on the way to production, so prod migrations are not a separate, untested mechanism.

#### D2 — Per-feature database teardown on promotion (covered with E1 / ask 3)

- See **E1** — a feature's database is destroyed and reclaimed automatically when its work is promoted/merged, alongside the rest of its environment. The database is torn down, not just disconnected.

---

### E. Environment lifecycle & cleanup

#### E1 — Automatic teardown of environments, databases, and config on merge (ask 3)

- **The ask:** When a unit of work is merged/promoted, its environment, **its feature database, and its config** are torn down and reclaimed automatically.
- **Why:** Temporary resources should not linger. Orphaned environments and databases accumulate cost, clutter, and confusion. Cleanup should not depend on someone remembering to do it.
- **What good looks like:**
  - The developer merges and moves on — **the environment, its dedicated database, and its scoped config are all gone**, with nothing left to clean up by hand.
  - There is never an accumulation of stale environments or abandoned databases to search through.
- **Requirements:**
  - On promotion/merge (and when a unit of work is otherwise closed/abandoned), the environment is automatically destroyed. *(Which lifecycle events count as "done" is engineering's call — see §8.)*
  - That unit of work's **database is automatically destroyed and reclaimed** — not merely detached.
  - That unit of work's **scoped config/secrets are removed/reclaimed**.
  - Teardown is recorded (what was destroyed, when) and visible in the control plane.
  - No manual step is required for routine cleanup; a manual override to force-clean is available for edge cases.

---

### F. Automated quality gates on PRs

> These run on the PR, against its isolated environment, and **report results back on the PR**. **Required pipeline order:** cheap, objective, **blocking** checks first (F1) → then the more expensive **advisory** agentic layer (F2 coverage adequacy, F3 browser QA). A PR that fails the cheap objective checks must **not** consume the expensive agentic/browser resources. Objective checks gate merges; agentic checks are advisory by default (see the realism note in §4) — they inform, they explain themselves, and a developer can see why one failed and override a wrong verdict.

#### F1 — Objective automated review + self-resolve (ask 6)

- **The ask:** Every PR gets an automated, objective first-pass review — repeatable bug/security checks — **plus** a system that can offer developer-reviewed fixes for the findings it raises.
- **Why:** First-pass review is currently human-only and inconsistent. Objective, repeatable checks catch the easy issues before a human looks, and offering a ready-to-accept fix shortens the loop without anyone leaving the PR.
- **What good looks like:**
  - The developer opens a PR and gets back concrete, actionable bug/security findings automatically.
  - For clear-cut findings, the system offers a **suggested fix the developer can accept or reject in one click**, right on the PR.
- **Requirements:**
  - An automated review runs on every PR and posts objective findings (bugs, security issues) back to the PR.
  - Findings are specific and actionable (location + explanation), not vague.
  - The check is repeatable and consistent across PRs.
  - These objective checks are **blocking** and run **before** the advisory agentic layer (F2/F3).
- **Self-resolve (stretch / bonus — ask 6's second half):**
  - **Stretch:** for findings it raises, the review system can produce an **applicable, developer-reviewed fix** — a committed suggestion / proposed patch / one-click "apply on the PR" — that the developer **accepts or rejects**, closing the loop without leaving the PR.
  - **What good looks like (testable):** for at least the mechanical / clear-cut class of findings, the developer sees a concrete proposed change they can apply with one action; the fix is **never auto-applied to the branch without the developer's acceptance**, and rejecting it is a first-class, frictionless option.
- **Notes:** A Greptile-style AI review is illustrative of the *kind* of check — choice of engine is engineering's (see §8).

#### F2 — Coverage-adequacy check (ask 7)

- **The ask:** A check judges whether the e2e tests actually cover the new feature well enough.
- **Why:** A green test run does not establish that the tests exercise the new behavior. The team wants a system that reasons about whether the feature is meaningfully covered, not just whether existing tests pass.
- **What good looks like:**
  - On a PR, the developer gets a judgment: does the e2e suite adequately exercise what this PR changed, and where are the gaps?
- **Requirements:**
  - An automated check evaluates whether the PR's changes are covered by e2e tests and reports a clear adequacy assessment plus specific coverage gaps, back on the PR.
  - It reasons about the *feature's behavior*, not only line/branch coverage numbers.
  - It runs **after** the objective checks (F1) and is **advisory / non-blocking by default**: it informs the developer and reviewers, but does not by itself block a merge unless the team later opts to promote it to a gate.
  - It runs fast enough not to stall the PR, and a developer can see *why* it reached its verdict and override it when it's wrong.

#### F3 — Human-language browser QA on PRs (ask 8)

- **The ask:** After the objective checks, run QA scripts written in **plain human language** ("do this, do that"), executed by an agent driving a **real browser** against the PR's environment.
- **Why:** Traditional e2e scripts are brittle, tied to fragile DOM selectors that break frequently. The team wants QA expressed as human intent ("log in, create a project, confirm it appears in the list"), executed by an agent that adapts, so QA scripts survive UI churn and are writable by anyone.
- **What good looks like:**
  - QA is authored in natural language, not selector-coupled code.
  - On a PR, those scripts run against the live preview environment and report pass/fail with evidence.
  - Non-engineers can write and read the QA scripts.
- **Requirements:**
  - QA scenarios are authored in human language, describing intent — **not** brittle selector/DOM-class steps.
  - An agent executes them by exercising the application through a real browser against the PR's isolated environment.
  - This QA pass runs **only after** the objective checks (F1) have run, so a PR that fails the cheap objective checks does **not** consume browser-QA resources.
  - Results (pass/fail per scenario, with evidence such as logs/screenshots) report back on the PR.
  - It is **advisory / non-blocking by default**, runs without stalling the PR, and makes it easy to see why a scenario failed and to override a wrong verdict.
  - Runs are repeatable and resilient to incidental UI changes that don't alter intended behavior.
- **Notes:** **In scope:** wiring the QA layer to execute via the existing **propagator** orchestrator (the in-house Claude Code worker sessions that can drive a browser). **Out of scope:** building a new browser-driving agent from scratch — one already exists. Using propagator is the team's strong preference because it exists today; if engineering finds a materially better executor that meets the requirement, that is open for discussion.

---

### G. Standardized cloud deploys

#### G1 — Cloud-run, status-tracked deploys (no laptop scripts) (ask 9)

- **The ask:** Deploys run in the cloud through a standardized pipeline — never from a developer's local machine — with deployment status tracked and visible.
- **Why:** Deploys currently run from developer laptops via local scripts, so there is no standard, no record, no reproducibility, and dependence on a single person's knowledge. The team wants deploys to be a recorded, repeatable cloud operation.
- **What good looks like:**
  - A developer triggers a deploy as part of the normal workflow — not by running a script on their laptop.
  - Anyone can see whether a deploy is in progress, succeeded, or failed, and what version is live.
- **Requirements:**
  - Deploys execute in the cloud via a standardized, reproducible pipeline; no critical step depends on an individual's local machine.
  - Every deploy is recorded (what, where, when, by whom, which commit) and has a queryable status.
  - The deploy process is identical across feature environments and prod (differences are config, not procedure).
  - Deploy status is surfaced in the control plane (see H1).

---

### H. The control plane

#### H1 — A single pane of glass for everything (ask 10)

- **The ask:** One control plane that shows all deploys, all live environments/stacks, which database each environment points at, and the status of everything.
- **Why:** There is currently no control plane, so there is no way to answer "what's deployed where, pointing at which DB, in what state?" without manual investigation across systems.
- **What good looks like:**
  - A developer opens one place and sees their environment, its URL, its database, its deploy status, and its check/QA results — and can pull up its connection details when they need to debug (per C1).
  - Ops/leads can see every environment that's up and spot orphans or failures at a glance.
- **Requirements:**
  - A single interface lists all environments (prod + every feature env) with their status.
  - For each environment it shows: URL, deploy status/version, **which database it's wired to**, a self-service path to its connection details (per C1), and the results of its quality gates (F1–F3) with the objective/advisory distinction made clear.
  - It shows deploy history and the status of background jobs (provisioning, migrations, teardown, QA runs).
  - It reflects reality automatically (no manual updating to stay accurate).
  - It's the place a developer goes to "watch it all happen."

---

## 7. Cross-cutting requirements

These apply to **everything** above:

- **Visibility / observability** — every environment, deploy, migration, teardown, and QA/review job is observable, with status and logs, from the control plane. If it runs, it's visible.
- **Safety & easy rollback** — production is always releasable; a bad prod deploy can be rolled back quickly and obviously; mistakes are caught before prod by the objective quality gates.
- **Access control** — it's clear and enforced who can deploy, who can destroy an environment, and who can read/write secrets; sensitive actions are gated appropriately.
- **Cost-awareness** — ephemeral environments, databases, and agentic runs don't quietly pile up cost; idle/orphaned resources are reclaimed (tying into auto-teardown) and their cost is attributable per environment.
- **Audit** — config/secret changes and reads, deploys, and environment create/destroy actions leave a who-did-what-when trail.

---

## 8. Decisions we're leaving to engineering (the HOW)

The team has no preference on *how* these are met, as long as the requirement is met. The major forks below are **the CTO's call**:

- **Per-feature databases** — *Requirement: every feature env gets its own isolated, production-shaped DB, provisioned automatically and quickly (target: usable in minutes). → Engineering's call how.* Techniques that exist today include managed-Postgres branching (e.g. Neon), native RDS/Aurora snapshot-clones, and per-feature schemas on a shared instance — **the team has no preference among them; pick whatever meets the requirement.** (The AWS-native options are listed alongside Neon deliberately, to avoid steering toward any one of them.)
- **What "triggers" each step** — *Requirement: environments appear, deploy, and tear down automatically across the lifecycle of a unit of work. → Engineering's call which events drive them* (push, PR open/close, merge, label, manual action, etc.).
- **Environment provisioning & teardown** — *Requirement: feature envs appear automatically and tear themselves down (env + DB + config) when work is done. → Engineering's call how* (IaC tooling and approach are engineering's to pick).
- **Config & secrets store** — *Requirement: structured, per-env, secure, self-service, auditable, auto-injected DB creds, with a self-service read path. → Engineering's call which store/service.*
- **Compute** — *Requirement: production-like environments that deploy via a standard cloud pipeline. → Engineering's call what runs the apps* (containers, serverless, managed platform, etc.).
- **AI review engine** — *Requirement: objective automated bug/security review on PRs, plus developer-reviewed suggested fixes. → Engineering's call which engine* (Greptile-style or otherwise).
- **CI system** — *Requirement: PR-triggered checks and cloud deploys with tracked status. → Engineering's call which CI.*
- **Build vs. buy** — *Requirement: preview environments and a control plane that meet §6 B/H. → Engineering's call whether to build, buy, or assemble from existing platforms.*
- **Agentic QA executor** — *Requirement: human-language QA run by an agent in a real browser, gated behind the objective checks. → The team's strong preference is the existing **propagator** orchestrator, because it already exists; the wiring is engineering's, and a clearly-better alternative is open for discussion.*

---

## 9. Priorities (what hurts most right now)

This is the team's **sense of priority by developer pain relieved** — not a mandate on sequence or effort.

1. **Get deploys off laptops and into the cloud** (G1). Cheapest, highest-relief: removes the local-script dependence, the single-person knowledge risk, and the no-record problem. Standardized, status-tracked cloud deploys.
2. **Get secrets out of the S3 text file** (C1). Also cheap, also high-relief: structured, per-env, safe, self-service config — and the foundation everything else wires into.
3. **Parallel per-feature environments + auto-wired DBs + migrations + control-plane visibility** (A1, B1, D1, E1, H1). The core unlock: end the shared-staging bottleneck, remove manual env-var repointing, make environments self-cleaning, and finally be able to *see what's where*.
4. **The agentic quality layer** (F1, F2, F3). Highest leverage once the platform exists: objective AI review + developer-reviewed self-resolve, coverage-adequacy judgment, and human-language browser QA via propagator.

> **Reconciling this list with §4.** The day-in-the-life in §4 shows the **end state** — the integrated experience where per-feature environments and the agentic layer are the headline. This priority order is about **sequencing relief, not importance**. Items 1 and 2 are the quick wins that resolve the most acute current pain and lay the foundation everything else plugs into; **items 3 and 4 are where the day-in-the-life actually comes true.** Ranking the agentic layer last is a statement about *when the team would spend*, not about how much it is wanted — it is the multiplier, and it is also the most expensive and least-proven layer, so it is placed last on the route even though it is central to the destination. Read the narrative as where the team is going, and this list as the order it would get there.