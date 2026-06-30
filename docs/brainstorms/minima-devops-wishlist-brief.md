# Minima DevOps Wishlist — Brief

*The one-page version. Full requirements doc: [minima-devops-wishlist.md](minima-devops-wishlist.md).*

> **Vision:** A developer opens a PR and automatically gets a complete, isolated, production-like environment — with its own database — that runs every check and QA pass for them, surfaces the results in one place, and tears itself down on merge.

This is a **requirements / wishlist** — the *what*, not the *how*. Tooling, cloud services, the DB-branching technique, IaC, CI, build-vs-buy are all engineering's call.

## The shift we're asking for

| Today | What we want |
|---|---|
| Deploys run from a developer's laptop — not standardized, recorded, or reproducible | **Standardized cloud deploys**, status-tracked, reproducible |
| One shared staging — only one feature at a time, work collides and serializes | **One isolated environment per feature** — parallel by default |
| Make a new DB → manually repoint a staging env var | **Auto-wired databases** — each env knows its own DB, zero manual steps |
| Secrets live in a plaintext **txt file in S3** | **Structured, per-env, self-service, audited** config & secrets |
| Can't see what's deployed where, pointing at which DB | **One control plane** for every env, deploy, DB, and job |

## The 10 asks

| # | Ask | Outcome |
|---|---|---|
| 1 | **Branching model** | `main` = prod and auto-deploys; all work on short-lived feature branches; no shared staging |
| 2 | **Per-feature environments** | Every branch gets a full, production-like env **with its own database**, provisioned automatically |
| 3 | **Config & secrets** | Replace the S3 txt file — structured, per-env, self-service to add/update vars; DB creds auto-injected *and* easy to look up |
| 4 | **Migrations on branches** | A schema change rides the branch and applies to that env's DB automatically; same path to prod |
| 5 | **Auto-cleanup** | On merge, the env **+ its database + its config** tear down and reclaim themselves — nothing lingers |
| 6 | **Objective PR review** | Automated, repeatable bug/security review on every PR, with developer-reviewed one-click fixes *(bonus)* |
| 7 | **Coverage adequacy** | An agentic check judges whether the e2e tests actually exercise the new feature, and names the gaps |
| 8 | **Human-language browser QA** | QA written as plain intent ("do this, do that" — not brittle DOM selectors), run by an agent in a real browser via **propagator** |
| 9 | **Cloud deploys** | No laptop scripts — standardized cloud pipeline, every deploy recorded with queryable status |
| 10 | **Control plane** | One pane of glass: every env, its URL, its DB, deploy status, check/QA results, age, cost — with action buttons |

**Quality gates run in two tiers:** cheap **objective/blocking** checks first (#6), then the expensive **agentic/advisory** layer (#7, #8) only if those pass. Agentic checks are advisory-by-default — they inform and explain themselves, and never trap a developer on a flaky verdict.

**Cross-cutting:** everything observable, safe + easy rollback, access-controlled (who deploys / destroys / reads secrets), cost-aware (idle envs auto-reclaimed), and audited.

## Priorities (by pain relieved, not importance)

1. **Get deploys off laptops** → cloud, status-tracked. *Cheap, highest relief.*
2. **Get secrets out of S3** → structured, per-env, self-service. *Cheap, and the foundation everything wires into.*
3. **Parallel per-feature envs + auto DBs + migrations + control plane.** *The core unlock — ends the shared-staging bottleneck.*
4. **The agentic quality layer** (review, coverage, browser QA). *The multiplier — most expensive and least-proven, so last on the route, not least wanted.*

## The HOW is the CTO's call

We have no preference on implementation, only on outcomes. Explicitly engineering's to decide: how per-branch databases are provisioned (**managed-Postgres branching like Neon, RDS/Aurora clones, or shared-schema — any is fine if it meets the requirement**), the IaC approach, the secrets store, the compute, the CI system, the AI-review engine, and build-vs-buy for preview envs and the control plane.
