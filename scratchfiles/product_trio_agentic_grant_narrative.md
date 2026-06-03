# Product Trio Agentic — Grant & Partnership Narrative

**Purpose:** Source narrative for grant applications (IRAP / RAII) and stakeholder validation conversations.
**Prepared:** 2026-05-25
**Status:** Working draft for positioning — grounded in the framework definition (`Product Trio Agent: Strategic Operating Manual`) and its live application building Vechelon.

> Note on honesty: this document distinguishes what the framework *is and has demonstrably done* from what is *still being validated or commercialised*. Sections 5 and 7 are deliberately candid about maturity, because a credible grant narrative is stronger than an inflated one.

---

## 1. Problem Statement

When AI enters a product team, the team's source of truth quietly collapses. Decisions get made in fluid, high-entropy chat sessions with AI assistants, but those decisions are never enshrined anywhere durable — so coding agents and humans alike "drift," silently re-deciding settled questions, hallucinating requirements, and overwriting committed logic. The result is that AI accelerates *output* while degrading *coherence*: teams move faster toward a product nobody actually agreed to build, with no auditable trail of why.

The Product Trio Agentic framework exists to solve this **artifact-drift and AI-hallucination problem** — to let teams harness AI's speed for both discovery and execution without losing the immutable, governed source of truth that keeps a product coherent.

---

## 2. The Framework — What It Is

The framework is a structured operating model that separates **discovery from execution** and puts a governance protocol between them. In plain language, it has three layers:

**The Mind (discovery).** A high-fidelity discovery environment where a human Project Manager works with an AI Orchestrator. The Orchestrator simulates a classic **product trio** — three voices in deliberate tension:

- **Product (PM):** value, scope, prioritisation
- **Design (UX):** adoption, friction, user experience
- **Engineering (Eng):** feasibility, technical debt, architecture

The redefinition is the key move: in a traditional trio these are three *people* who meet periodically. Here, one AI Orchestrator voices all three with **explicit persona friction** — it must speak as each role and push back ("Speaking as Engineering: this introduces unbounded retry cost"), surfacing trade-offs continuously rather than in scheduled ceremonies. The human PM steers and ratifies; the AI generates, argues, and reconciles.

**The Bedrock (source of truth).** Nothing from the Mind is "real" until it is written into the **Four Pillars** — immutable, versioned Markdown artifacts:

- **Pillar I — The Charter:** mission, constraints, personas, glossary, problem statement
- **Pillar II — The Specs:** strategic PRD, technical/security spec, UX logic
- **Pillar III — The V-Model:** BDD scenarios (Given/When/Then) and the definition of done
- **Pillar IV — The Ledger:** roadmap, decision history, change log

**The Hands (execution).** Coding agents (Claude Code, Gemini CLI) take *only the committed Bedrock* — never the chat history — and build. They own the codebase and may evolve the Pillars to match technical reality, but only under the same governance protocol.

The connective tissue is the **MACD Protocol** (Move, Add, Change, Delete): no Pillar is ever updated casually. Changes require explicit human confirmation ("I propose an ADD to Pillar II — do you confirm?"), and every confirmed change writes a dated, timestamped **Ledger receipt**. When the Hands hit a blocker that is *strategic* rather than technical, the **Gap Loop** routes it back to the Mind for a Brain session rather than letting a coding agent silently decide product direction.

**What it does that a traditional trio does not:** it makes the trio continuous and AI-driven rather than periodic and meeting-bound; it enforces an immutable, auditable source of truth between thinking and building; and it gives autonomous coding agents a governed contract to work against, so AI speed never outruns AI accountability.

---

## 3. What's Novel

The framework borrows liberally but departs deliberately:

- **vs. Agile/Scrum:** Agile optimises iteration cadence but is silent on *where truth lives* and offers no defense against AI drift. Product Trio Agentic adds the Mind/Bedrock separation and MACD governance as a first-class concern — the artifact stack *is* the methodology, not a byproduct of sprints. It keeps Agile's iterative spirit but replaces "working software over documentation" with "**governed** documentation as the contract for working software" — a necessary inversion once AI agents, not just humans, consume the docs.

- **vs. Shape Up:** Shape Up's "shaped pitch → bet → build" pipeline inspired the discovery-then-commit discipline. The framework extends it by making shaping a *continuous AI-mediated* activity (the simulated trio) rather than a pre-cycle human exercise, and by formalising the committed artifact (Bedrock) with versioning and an amendment protocol Shape Up leaves informal.

- **vs. Scrum roles:** Scrum separates PO/SM/team. The framework collapses the *generative* side into one AI Orchestrator voicing all trio roles, while elevating a single human PM as ratifier — a structure that only makes sense once an AI can credibly hold three perspectives at once.

- **vs. Stride:** Stride governs the *execution* lifecycle (task claim → explore → implement → review → complete) with quality gates. Product Trio Agentic governs the *decision* lifecycle upstream of any task. They are complementary layers, not competitors (see §4). The framework's novel contribution is the **handoff-integrity rule** — coding agents receive the Bedrock, not the conversation — which is precisely the seam where AI products usually lose coherence.

The deepest novelty, and the most relevant to a responsible-AI mandate: the framework treats **AI drift as the primary failure mode** and builds the entire process around preventing it — human-in-the-loop ratification, an immutable audit trail (the Ledger), and a hard rule that strategic decisions never get made autonomously by an agent.

---

## 4. Stride Integration

Stride is the **execution and quality layer** that the framework's "Hands" operate within. Where the Four Pillars answer *what should be built and why*, Stride answers *how the building is governed task-by-task*.

The connection points:

- **Bedrock → Stride tasks.** Committed Pillar decisions decompose into Stride goals and tasks (on a project board), each enriched with key files, acceptance criteria, verification steps, and pitfalls drawn from the Bedrock.
- **Governed execution lifecycle.** Each task moves through a defined workflow — claim → explore → implement → review → complete — with the coding agent dispatching specialised sub-agents (exploration, planning, review) along the way.
- **Three Amigos review.** Code review is handled autonomously by a reviewer agent against the task's acceptance criteria and the Bedrock's intent, so the human PM is freed to do strategy and UAT rather than line-by-line review.
- **Telemetry & traceability.** Every completion records what was explored, reviewed, and changed — producing the same audit discipline at the *execution* layer that MACD/the Ledger produce at the *decision* layer.

**What the combination enables that neither does alone:** Stride alone gives you disciplined task execution but no governed source of strategic truth — tasks can be perfectly executed toward an incoherent product. Product Trio Agentic alone gives you a governed source of truth but no enforced execution discipline — decisions can be beautifully documented and then sloppily built. Together they close the loop: **a strategic decision is ratified into the Bedrock, decomposed into governed Stride tasks, built and reviewed by agents against that Bedrock, and any blocker that turns out to be strategic is routed back up to a Brain session** — an unbroken, auditable chain from intent to merged code.

---

## 5. Vechelon as Proof Point

Vechelon — a multi-tenant SaaS platform for cycling clubs (ride scheduling, routes, rosters, QR-based guest join, and a live-ride safety layer) — has been built end-to-end under this framework by a solo founder working with AI agents. It is the framework's first full proof point.

**What has been confirmed:**

- **The Bedrock holds.** Vechelon maintains committed Four-Pillar sets across multiple product surfaces (admin portal, rider portal, multi-tenancy/VoC/innovation-accounting, and the Rail 3 mobile safety app). The Pillars have remained the authoritative source of truth across dozens of features.
- **MACD prevents drift in practice.** Real strategic pivots — e.g., a subdomain-based multi-tenancy architecture decision, and a ratified "Voice & Tone" amendment that swept tactical/military copy out of the product — went through Brain sessions, were ratified by the human PM, and were enshrined with Ledger receipts before the Hands executed them. Casual chat suggestions did *not* silently become product.
- **The Hands execute autonomously against the Bedrock.** Feature goals and a steady stream of defects have been implemented, reviewed, and merged by coding agents working from committed specs and Stride tasks — including production incident response (e.g., an RLS infinite-recursion outage diagnosed, hot-fixed, and hardened) and a run of defect fixes shipped through the full Stride lifecycle.
- **The Gap Loop works.** When agents hit genuinely strategic ambiguity, work stopped and returned to the PM/Brain rather than being resolved unilaterally — the exact behaviour the framework is designed to produce.

**What is still being refined:**

- **Execution-layer friction.** The Stride workflow has rough edges (e.g., board-state/column transitions and defect-claim quirks) that add bookkeeping overhead; reconciling the board with shipped work is not yet frictionless.
- **Process bookkeeping under speed.** Under rapid iteration, ticket creation has at times lagged the code (work shipped first, tracked after) — a tension between velocity and traceability the framework is meant to resolve, not reintroduce.
- **Capability routing, deprecated.** An earlier model that routed tasks to specific agents by declared "capabilities" was retired once a single agent proved capable across the board — a simplification learned by building.

---

## 6. Scalability and Modularity

The framework is designed to scale by **role multiplication**, not by changing its shape:

- **Solo founder / micro-business (validated):** one human PM + one AI Orchestrator (voicing all three trio roles) + one or more coding-agent "Hands." This is the Vechelon configuration. The framework's whole value proposition is that it makes a single person plus AI behave like a coherent, governed product organisation.
- **Growing team:** human specialists progressively *take over* individual trio voices from the AI (a real Designer assumes the UX voice; an Eng lead assumes the Engineering voice), while the Bedrock and MACD protocol remain unchanged. The artifacts and governance don't need to be rebuilt — humans simply occupy roles the AI was simulating.
- **Enterprise product org:** multiple Brain sessions across product lines, multiple coding agents and human engineers as the Hands, each product line maintaining its own Four-Pillar Bedrock, all under the same MACD discipline and audit trail.

**What makes it modular:**

- **The Pillars are independent artifacts** — a product can have one Bedrock set per surface or product line, composed and referenced without entanglement (Vechelon already does this across Rails 1–3 with cross-referenced, inherited constraints).
- **The execution layer is swappable.** Stride is the current execution/quality layer, but the framework only requires *some* governed task lifecycle — the Bedrock/MACD core is independent of the specific tool.
- **The Hands are interchangeable.** Any competent coding agent (Claude Code, Gemini CLI, others) can be the Hands, because they work from the committed Bedrock contract, not from a particular tool's session state.
- **The protocol is layer-agnostic.** MACD governs decisions; the Stride lifecycle governs execution. Either can evolve independently as long as the handoff contract (Bedrock in, governed work out) holds.

---

## 7. Current State

**Complete and in active use:**

- The framework itself — Mind/Bedrock philosophy, Four Pillars, MACD protocol, the Hands handoff contract, and the Amendment/Gap-Loop protocols — is fully defined and operational.
- A working reference implementation (Vechelon) built and maintained under it, with committed Bedrock across multiple surfaces, a live decision Ledger, and an integrated Stride execution layer with autonomous agent review.
- Demonstrated end-to-end loop: Brain session → MACD ratification → Bedrock commit → Stride task decomposition → agent implementation + review → merge, with strategic blockers routed back up.

**Actively being iterated:**

- Execution-layer ergonomics (Stride workflow friction, ticket/board reconciliation under high velocity).
- Tightening the discipline that keeps traceability from lagging speed.
- Ongoing Vechelon feature work (rider-experience flows, platform-admin tooling, multi-tenancy hardening) continues to stress-test the framework on real product surfaces.

**Remaining to develop or validate:**

- **Commercial packaging.** The framework is proven as an internal operating model; turning it into a transferable product/methodology offering (templates, tooling, onboarding) is the next build.
- **Multi-human scaling, validated.** The role-multiplication scaling model (§6) is designed but not yet proven beyond the solo-founder configuration — validating it on a multi-person team is a key near-term milestone.
- **Formal metrics.** Quantifying the framework's claimed benefits (drift reduction, decision-to-merge traceability, defect/incident rates) into evidence suitable for grant reporting and customer ROI cases.
- **Responsible-AI framing.** Articulating the governance/audit properties (human-in-the-loop ratification, immutable decision trail, no-autonomous-strategic-decisions rule) in the formal terms a RAII-type program expects.

---

*Sources: `Product Trio Agent: Strategic Operating Manual` (framework definition); Vechelon Four-Pillar Bedrock (Rails 1–3); Vechelon decision Ledger and Stride board history.*
