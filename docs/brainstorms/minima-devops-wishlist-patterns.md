# Minima DevOps Wishlist — Developer Requirements

## 1. Purpose & how to read this

This is a **requirements / wishlist document**, not an architecture spec. It describes the developer experience we want and the outcomes we're asking engineering to deliver — it deliberately does **not** prescribe the *how*. Every choice about tooling, cloud services, the database-branching technique, the IaC approach, the CI system, and build-vs-buy is explicitly the CTO's and engineering's call. Each ask below is written as an **outcome + acceptance criteria**, so you can design against a clear "definition of done" without us boxing in your implementation.

> Background context only (not a constraint that drives these asks): we're standardizing on AWS + Python + RDS Postgres + React. The asks are written to hold regardless of the exact tech chosen — if another approach satisfies the outcome, that's fine.

### What we understand we're asking for

We know this isn't free. Per-branch full environments and agentic checks on every PR cost real money (compute, database spin-up, agent/LLM run time) and real engineering time to build and operate. We're asking for them anyway because the parallelism and the caught-before-prod safety are worth more to us than the ephemeral spend — and we'd rather pay for environments that clean themselves up than continue absorbing the developer-hour cost of the shared-staging bottleneck we have today. Where the trade-off gets expensive, the priority order in §9 reflects how we'd phase the spend, and the cross-cutting requirements in §7 (cost-awareness, auto-reclaim) are there precisely so the costs stay bounded and attributable. These asks come from a team that understands the economics and intends the spend to be measured and accountable.

> *(For the landscape on how teams keep this cost bounded — TTL reapers, orphan detection, per-environment cost attribution via tagging — see the consolidated cross-cutting orientation note in §7. The cost-awareness outcome itself is stated there.)*

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

> **A realism note for step 5.** We don't expect the agentic checks (coverage judgment, browser QA) to be infallible. They will sometimes be slow, sometimes wrong. That's exactly why we're asking for them to be **advisory and non-blocking by default**, clearly separated from the objective checks that *do* gate a merge, fast enough not to stall the PR, and trivial to inspect and override when a verdict is wrong. An agentic check that silently blocks a correct merge is a worse developer experience than no check at all — so the requirement is that these run *behind* the cheap checks, explain themselves, and never trap a developer. We'd rather ship this layer as a trusted advisor that earns its way toward gating than as an unreliable gate that erodes trust on day one.

> **How teams commonly assemble this end-to-end flow (orientation, not a requirement).** The shape described above maps onto the now-common trunk-based + ephemeral-preview pattern; the conceptual origin most teams reference is the Heroku Review Apps and Vercel/Netlify preview lineage. See the operating-model orientation note under A1 for the branching-model landscape. The specific composition is engineering's call (see §8).

---

## 5. Current pain → what we want

| Today (current state) | What we want instead |
|---|---|
| Deploys run from individual developer machines via local scripts, so the process is not standardized, recorded, or reproducible, and depends on a single person's knowledge. | Standardized **cloud-run deploys** with a recorded, repeatable process and tracked status. Nothing critical lives only on one machine. |
| A single shared staging stack means only one feature of work can proceed at a time; features collide and work serializes. | **One isolated environment per unit of work**, so any number of features proceed in parallel without ever waiting on each other. |
| Wiring a database to an environment requires manually changing the env var on staging to point at it — a manual, error-prone, easy-to-forget step. | **Auto-wired databases** — an environment knows its own database with zero manual configuration. |
| Configuration and secrets are currently stored in a plaintext text file in S3, which offers no structure, per-environment scoping, access control, or audit trail. | **Structured, per-environment, self-service config/secrets** that are safe to read and write, easy to look up, and leave an audit trail. |
| There is no control plane: it is not possible to see what exists, what is deployed where, which database an environment points at, or the status of anything. | A **single control plane** showing every environment, deploy, database mapping, and job status. |

---

## 6. The asks

Each ask: **The ask** (one sentence) → **Why** (pain removed) → **What good looks like** (the developer experience) → **Requirements** (testable, technology-agnostic acceptance criteria). Tool names, where they appear, are illustrative only — never a requirement.

---

### A. Operating model & branching

#### A1 — A defined branching methodology (ask 5)

- **The ask:** Adopt a single, written branching model where `main` represents production and auto-deploys, all other work happens on short-lived feature branches, and there is no shared staging environment.
- **Why:** We have no standard today. A shared staging stack serializes work and creates collisions, and the deploy process is undocumented institutional knowledge. The modern pattern is per-branch throwaway environments, and we want that to be our default.
- **What good looks like:**
  - A developer always knows: `main` = prod, my branch = my own disposable environment.
  - No one asks "is staging free?" because there is no shared staging to contend for.
- **Requirements:**
  - `main` is the single source of truth for production and deploys to prod automatically on merge.
  - All non-prod work happens on feature branches, each of which can have its own full environment.
  - The model does **not** rely on any long-lived shared pre-prod / staging environment; per-branch ephemeral environments are the standard pre-prod path.
  - The model is documented and is the default path — the easy path, not the exception.
- **How teams commonly solve this:** Common approaches in the industry are trunk-based development and GitHub Flow with short-lived branches, where the shared staging environment is replaced by ephemeral per-PR preview environments, and production is protected with feature flags and progressive (canary/gradual) delivery. Listed for orientation, not as a recommendation.

> *Note on branching language:* `main`/feature-branch terminology is intrinsic to this ask — it **is** the methodology. Elsewhere in this document, where we say a unit of work "triggers" an environment, deploy, or teardown, treat the specific trigger (a push, a PR event, a merge, a label, a manual action) as engineering's choice — see §8.

---

### B. Per-feature environments

#### B1 — Per-feature environments, each with its own database (ask 1)

- **The ask:** Every unit of work automatically gets its own complete, production-like environment, including its **own dedicated database**.
- **Why:** A single shared staging means only one feature of work can proceed at a time. Isolated per-feature environments remove that bottleneck entirely and let features be tested against real, independent data.
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
- **How teams commonly solve this:** Teams either provision preview/ephemeral environments from infrastructure-as-code in CI (Terraform/Pulumi/CDK/SST) or adopt a packaged preview-environment platform. Build-vs-buy is engineering's call, and the full platform shortlist lives in §8's build-vs-buy fork.

---

### C. Configuration & secrets

#### C1 — Structured, self-service config & secrets to replace the S3 text file (ask 2)

- **The ask:** Replace the plaintext S3 text file with a structured, per-environment config/secrets system that's easy to read from and write to — including both **auto-supplied** database connection info *and* an easy way for a developer to **look up** that connection info — and that works for feature deploys.
- **Why:** Configuration and secrets are currently stored in a plaintext text file in S3, which provides no structure, no per-environment scoping, no access control, and no audit trail. Adding a variable for a new feature, or pointing at a new database, is manual and error-prone, and there is no clean way to retrieve a connection string when debugging.
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
- **How teams commonly solve this:** Common approaches include managed secret/parameter stores such as AWS SSM Parameter Store and AWS Secrets Manager, or dedicated tools like Doppler, Infisical, HashiCorp Vault, or SOPS. The prevailing pattern is hierarchical per-environment paths, with values injected at deploy or runtime rather than checked in. Listed for orientation, not as a recommendation; the choice of store is engineering's call (see §8).

---

### D. Database lifecycle

#### D1 — Migrations as part of normal feature-branch work (ask 4)

- **The ask:** Applying database migrations is a normal, automatic part of working on a feature.
- **Why:** Today, with one shared staging database, a schema change for one feature can break another in-flight feature's environment — and applying a migration means remembering to run it by hand against the shared DB. That is the same shared-staging pain from §5, expressed specifically as schema collisions between in-flight features and forgotten manual apply steps. With per-feature auto-applied migrations, your environment's database always matches your branch's code, and no one else's work breaks because of your schema change.
- **What good looks like:**
  - A developer adds a migration in their branch, pushes, and the environment's database reflects it — no manual apply step against a shared DB.
  - Migration runs are visible and their success/failure is clear.
- **Requirements:**
  - Migrations defined in a unit of work are applied automatically to that environment's database as part of the deploy/preview flow.
  - Migration runs are logged with status (success/failure) and surfaced where the developer can see them.
  - Migrations in one feature's environment never affect prod or any other environment's database.
  - The same migration path is used on the way to production, so prod migrations are not a separate, untested mechanism.
- **How teams commonly solve this:** Teams typically use a versioned migration tool — for Python, Alembic (SQLAlchemy) or Django migrations; more broadly Atlas (Ariga), Flyway, Liquibase, or Sqitch — and run migrations in CI against the branch database; some add a control plane such as Bytebase. Because `main` ships automatically here, the common companion practice is expand/contract (backward-compatible) migrations for zero-downtime. Listed for orientation, not as a recommendation.

#### D2 — Per-feature database teardown on promotion (covered with E1 / ask 3)

- See **E1** — a feature's database is destroyed and reclaimed automatically when its work is promoted/merged, alongside the rest of its environment. The database is torn down, not just disconnected.

---

### E. Environment lifecycle & cleanup

#### E1 — Automatic teardown of environments, databases, and config on merge (ask 3)

- **The ask:** When a unit of work is merged/promoted, its environment, **its feature database, and its config** are torn down and reclaimed automatically.
- **Why:** Temporary things should not linger. Orphaned environments and databases accumulate cost, clutter, and confusion. Cleanup should not depend on someone remembering.
- **What good looks like:**
  - The developer merges and moves on — **the environment, its dedicated database, and its scoped config are all gone**, with nothing left to clean up by hand.
  - There is never an accumulation of stale environments or abandoned databases to search through.
- **Requirements:**
  - On promotion/merge (and when a unit of work is otherwise closed/abandoned), the environment is automatically destroyed. *(Which lifecycle events count as "done" is engineering's call — see §8.)*
  - That unit of work's **database is automatically destroyed and reclaimed** — not merely detached.
  - That unit of work's **scoped config/secrets are removed/reclaimed**.
  - Teardown is recorded (what was destroyed, when) and visible in the control plane.
  - No manual step is required for routine cleanup; a manual override to force-clean is available for edge cases.
- **How teams commonly solve this:** A common approach is a workflow triggered on PR close/merge that destroys the IaC-managed environment, with TTL reapers and orphan detection as a safety net for environments that are abandoned rather than cleanly closed — see §7. Listed for orientation, not as a recommendation.

---

### F. Automated quality gates on PRs

> These run on the PR, against its isolated environment, and **report results back on the PR**. **Required pipeline order:** cheap, objective, **blocking** checks first (F1) → then the more expensive **advisory** agentic layer (F2 coverage adequacy, F3 browser QA). A PR that fails the cheap objective checks must **not** consume the expensive agentic/browser resources. Objective checks gate merges; agentic checks are advisory by default (see the realism note in §4) — they inform, they explain themselves, and a developer can see why one failed and override a wrong verdict.

> **How teams commonly wire the gate itself (orientation, not a requirement).** The cheap objective checks are typically wired as required status checks under branch protection, so the merge button stays disabled until they pass; the expensive agentic jobs are then gated to run only after those succeed. This is the prevailing mechanism for the F1-before-F2/F3 ordering, listed for orientation rather than as a prescribed setup.

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
- **How teams commonly solve this:** The objective layer is commonly a linter + type checker + SAST wired as required checks (e.g. ruff/mypy/semgrep for Python, eslint/tsc for TypeScript), plus dependency tools (Dependabot/Renovate) and secret scanning. The self-resolve loop often rides on mechanical auto-fixers like `ruff` / `eslint`, run in suggestion mode (e.g. `--fix-dry-run`) and posted as reviewable suggestions the developer accepts or rejects — aligned with the "never auto-applied without acceptance" rule above, not applied to the branch directly. Listed for orientation, not as a recommendation. *(For the separate AI-reviewer vendor landscape — Greptile, CodeRabbit, etc. — see the AI-review-engine fork in §8.)*
- **Notes:** A Greptile-style AI review is illustrative of the *kind* of check — choice of engine is engineering's (see §8, which holds the AI-reviewer landscape).

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
- **How teams commonly solve this:** Because this ask is about behavioral adequacy, the closest-fit approaches are LLM-judge / agentic ones that reason about whether the feature is exercised rather than counting lines (features in tools such as Qodo and Codecov AI behavioral-coverage). Some teams additionally run mutation testing (mutmut for Python, Stryker for JavaScript) as an adjacent objective technique that probes whether tests actually catch defects, with line/branch coverage as a floor. Listed for orientation, not as a recommendation.

#### F3 — Human-language browser QA on PRs (ask 8)

- **The ask:** After the objective checks, run QA scripts written in **plain human language** ("do this, do that"), executed by an agent driving a **real browser** against the PR's environment.
- **Why:** Traditional e2e scripts are brittle — tied to fragile DOM selectors that break frequently. We want QA expressed as human intent ("log in, create a project, confirm it appears in the list"), executed by an agent that adapts, so QA scripts survive UI churn and are writable by anyone.
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
- **How teams commonly solve this:** This sits in the emerging natural-language / self-healing E2E category, where agents drive a real browser via Playwright or computer-use, capture evidence (screenshots, video, logs), and mitigate flakiness with seeded data and retries. Listed for orientation, not as a recommendation, and noting the in-house executor preference below.
- **Notes:** **In scope:** wiring the QA layer to execute via our existing **propagator** orchestrator (our in-house Claude Code worker sessions that can drive a browser). **Out of scope:** building a new browser-driving agent from scratch — we already have one. Using propagator is our strong preference because it exists today; if engineering finds a materially better executor that meets the requirement, that is open for discussion.

---

### G. Standardized cloud deploys

#### G1 — Cloud-run, status-tracked deploys (no laptop scripts) (ask 9)

- **The ask:** Deploys run in the cloud through a standardized pipeline — never from a developer's local machine — with deployment status tracked and visible.
- **Why:** Deploys currently run from individual developer machines via local scripts, so the process is not standardized, recorded, or reproducible, and it depends on a single person's knowledge. We want deploys to be a recorded, repeatable cloud operation.
- **What good looks like:**
  - A developer triggers a deploy as part of the normal workflow — not by running a script on their laptop.
  - Anyone can see whether a deploy is in progress, succeeded, or failed, and what version is live.
- **Requirements:**
  - Deploys execute in the cloud via a standardized, reproducible pipeline; no critical step depends on an individual's local machine.
  - Every deploy is recorded (what, where, when, by whom, which commit) and has a queryable status.
  - The deploy process is identical across feature environments and prod (differences are config, not procedure).
  - Deploy status is surfaced in the control plane (see H1).
- **How teams commonly solve this:** Common AWS-oriented anchors: GitHub Actions (or CodePipeline) authenticating via OIDC, deploying to a container/serverless target, with deploy state published through a deployments API. Listed for orientation; compute and CI are engineering's call (see §8).

---

### H. The control plane

#### H1 — A single pane of glass for everything (ask 10)

- **The ask:** One control plane that shows all deploys, all live environments/stacks, which database each environment points at, and the status of everything.
- **Why:** There is currently no control plane, so it is not possible to answer "what's deployed where, pointing at which DB, in what state?" without manual investigation across systems.
- **What good looks like:**
  - A developer opens one place and sees their environment, its URL, its database, its deploy status, and its check/QA results — and can pull up its connection details when they need to debug (per C1).
  - Ops/leads can see every environment that's up and spot orphans or failures at a glance.
- **Requirements:**
  - A single interface lists all environments (prod + every feature env) with their status.
  - For each environment it shows: URL, deploy status/version, **which database it's wired to**, a self-service path to its connection details (per C1), and the results of its quality gates (F1–F3) with the objective/advisory distinction made clear.
  - It shows deploy history and the status of background jobs (provisioning, migrations, teardown, QA runs).
  - It reflects reality automatically (no manual updating to stay accurate).
  - It's the place a developer goes to "watch it all happen."
- **How teams commonly solve this:** Common approaches range from internal developer platforms / portals such as Backstage, Cortex, or Port.io to a thin in-house dashboard that federates data from GitHub, the cloud provider, and the IaC state backend. Listed for orientation, not as a recommendation; build-vs-buy here is explicitly engineering's call (see §8).

---

## 7. Cross-cutting requirements

These apply to **everything** above:

- **Visibility / observability** — every environment, deploy, migration, teardown, and QA/review job is observable, with status and logs, from the control plane. If it runs, it's visible.
- **Safety & easy rollback** — production is always releasable; a bad prod deploy can be rolled back quickly and obviously; mistakes are caught before prod by the objective quality gates.
- **Access control** — it's clear and enforced who can deploy, who can destroy an environment, and who can read/write secrets; sensitive actions are gated appropriately.
- **Cost-awareness** — ephemeral environments, databases, and agentic runs don't quietly pile up cost; idle/orphaned resources are reclaimed (tying into auto-teardown) and their cost is attributable per environment.
- **Audit** — config/secret changes and reads, deploys, and environment create/destroy actions leave a who-did-what-when trail.

> **How teams commonly satisfy these cross-cutting needs (orientation, not requirements).** This is the single orientation note for the recurring platform mechanisms. Access control is commonly handled with short-lived credentials via OIDC instead of long-lived keys; cost-awareness with resource tagging for per-environment attribution plus TTL reapers and orphan/cost-guard detection; rollback with blue/green or canary deploys and feature flags; and audit with the cloud provider's native trail (for example AWS CloudTrail) alongside the secret store's own access logs. These are prevailing patterns offered for orientation; the outcomes above are what's required.

---

## 8. Decisions we're leaving to engineering (the HOW)

The team has no preference on *how* these are met, as long as the requirement is met. The big forks below are **the CTO's call**. The "How teams commonly solve this" notes throughout §6–7 are landscape orientation only — they **inform** these decisions, they do not override them. Where those notes already hold a vendor/tool list, the forks below cross-reference them rather than restate the lists.

- **Per-feature databases** — *Requirement: every feature env gets its own isolated, production-shaped DB, provisioned automatically and quickly (target: usable in minutes). → Engineering's call how.* Concrete techniques that exist today include managed-Postgres branching (e.g. Neon), native RDS snapshot-restore, Amazon Aurora fast (copy-on-write) cloning, and per-feature schemas or databases on a shared instance, with seeding or anonymized-prod-data approaches for the initial state — **we have no preference among them; pick whatever meets the requirement.** (Listing the AWS-native options alongside Neon is deliberate: we're not steering toward any one of them. Note the engine is fixed as Postgres per B1's parity requirement, so MySQL-only branching techniques are not applicable to this stack.)
- **What "triggers" each step** — *Requirement: environments appear, deploy, and tear down automatically across the lifecycle of a unit of work. → Engineering's call which events drive them* (push, PR open/close, merge, label, manual action, etc.).
- **Environment provisioning & teardown** — *Requirement: feature envs appear automatically and tear themselves down (env + DB + config) when work is done. → Engineering's call how* (IaC tooling and approach are yours to pick — e.g. Terraform, Pulumi, AWS CDK, or SST, listed as landscape only; see the B1 note).
- **Config & secrets store** — *Requirement: structured, per-env, secure, self-service, auditable, auto-injected DB creds, with a self-service read path. → Engineering's call which store/service* (vendor landscape is in the C1 note — SSM Parameter Store, Secrets Manager, Doppler, Infisical, Vault, SOPS — orientation, not a steer).
- **Compute** — *Requirement: production-like environments that deploy via a standard cloud pipeline. → Engineering's call what runs the apps* (containers, serverless, managed platform, etc.).
- **AI review engine** — *Requirement: objective automated bug/security review on PRs, plus developer-reviewed suggested fixes. → Engineering's call which engine* (Greptile, CodeRabbit, Diamond (now Cursor), Qodo Merge, Sourcery, Korbit, Amazon Q Developer (code review), GitHub Copilot code review, or a custom LLM-based reviewer — all landscape examples, none a steer). *(F1's own note covers the deterministic linter layer; this fork holds the AI-reviewer landscape.)*
- **CI system** — *Requirement: PR-triggered checks and cloud deploys with tracked status. → Engineering's call which CI.*
- **Build vs. buy** — *Requirement: preview environments and a control plane that meet §6 B/H. → Engineering's call whether to build, buy, or assemble from existing platforms.* For preview environments, packaged platforms include Qovery, Release.com, Bunnyshell, Northflank, Coherence, or env0; for the control plane, see the H1 note (Backstage, Cortex, Port.io). Orientation only.
- **Agentic QA executor** — *Requirement: human-language QA run by an agent in a real browser, gated behind the objective checks. → Our strong preference is our existing **propagator** orchestrator, because we already have it; the wiring is yours, and a clearly-better alternative is open for discussion.*

---

## 9. Priorities (what hurts most right now)

This is the team's **sense of priority by developer pain relieved** — not a mandate on sequence or effort.

1. **Get deploys off laptops and into the cloud** (G1). Cheapest, highest-relief: removes the non-standard local scripts, the single-person dependency, and the no-record problem. Standardized, status-tracked cloud deploys.
2. **Get secrets out of the S3 text file** (C1). Also cheap, also high-relief: structured, per-env, safe, self-service config — and the foundation everything else wires into.
3. **Parallel per-feature environments + auto-wired DBs + migrations + control-plane visibility** (A1, B1, D1, E1, H1). The core unlock: end the shared-staging bottleneck, remove manual env-var repointing, make environments self-cleaning, and finally be able to *see what's where*.
4. **The agentic quality layer** (F1, F2, F3). Highest leverage once the platform exists: objective AI review + developer-reviewed self-resolve, coverage-adequacy judgment, and human-language browser QA via propagator.

> **Reconciling this list with §4.** The day-in-the-life in §4 shows the **end state** — the integrated experience where per-feature environments and the agentic layer are the headline. This priority order is about **sequencing relief, not importance**. Items 1 and 2 are the quick wins that relieve the most acute pain today and lay the foundation everything else plugs into; **items 3 and 4 are where the day-in-the-life actually comes true.** Ranking the agentic layer last is a statement about *when the team would spend*, not about how much it is wanted — it's the multiplier, and it's also the most expensive and least-proven layer, so it earns its place last on the route even though it's central to the destination. Read the narrative as where the team is going, and this list as the order it would get there.