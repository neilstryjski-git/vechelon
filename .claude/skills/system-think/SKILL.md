---
name: system-think
description: >
  Activates when the user asks to build, design, or implement a user flow that
  should be considered in context of the broader system. Also invokable via
  /system-think [user-type] [flow-name]. Reads a pre-generated architecture
  snapshot first to stay context-light, cross-references the specified flow
  against all architecture layers, and outputs a versioned action log .md file
  with milestone/epic plan and optional Stride tasks.
allowed-tools: Read, Grep, Glob, Write
---

# System Thinking Skill

You are performing a structured architecture cross-reference for a specified user
flow. Surface conflicts, gaps, integration points, and open decisions — then
translate findings into a versioned, plannable action log.

Stay context-light. The architecture snapshot is your primary source. Do not
do broad project scans unless the snapshot is absent or explicitly stale.

---

## Phase 1 — Load Architecture Context

**Step 1: Check for snapshot**

Look for: `.claude/skills/system-think/arch-snapshot.md`

- If found: read it. This is your primary architecture source. Proceed to Phase 2.
- If not found: tell the user — *"No architecture snapshot found. Run
  `/system-think-init` to generate one, then re-invoke this skill."* Stop.

**Step 2: Check snapshot freshness (lightweight only)**

Read the `Last updated` and `Snapshot version` fields from the snapshot header.
Do not glob or scan the project. If the snapshot is present, trust it — freshness
is the user's responsibility via re-running `/system-think-init`.

---

## Phase 2 — Flow Intake

Identify the flow being analyzed. Source priority:

1. Slash command args: `/system-think [user-type] [flow-name]`
2. User description in conversation — extract the most likely user type and flow name

**Always confirm before proceeding.**

Once you have a candidate user type and flow name, cross-reference both against
the snapshot's User Types and Existing Documented Flows sections.

Present your interpretation back to the user:

  *"I'm reading this as: **[User Type]** / **[Flow Name]**.*
  *Closest matches in the snapshot: [list matches or 'none found'].*
  *Does this look right, or should I adjust before we proceed?"*

If there's ambiguity in either the user type or the flow name:
- Offer the closest snapshot matches as options
- Ask one focused question to resolve — don't ask about both at once
- If the flow is net-new (not in snapshot), confirm explicitly:
  *"This flow doesn't appear in the snapshot yet — I'll treat it as new.
  Confirmed user type is [X]?"*

Only proceed to Phase 3 once the user has confirmed both.

If the user has provided flow steps, use them verbatim. If not, infer logical
steps from context and state your assumptions clearly at the top of the output.

---

## Phase 3 — Cross-Reference Analysis

Check the flow against every architecture layer in the snapshot. Skip any layer
with no intersection — do not pad with generic observations.

### 3a. User Type Alignment
- Does this user type exist in the snapshot? Is it named consistently?
- Does this flow create, modify, or terminate the user type's record?
- Are there other user types who share steps, states, or data in this flow?
- Conflicts, overlaps, or gaps with other user types?

### 3b. State Machine Integrity
- Which state machine(s) does this flow touch?
- Does the flow respect valid state transitions?
- Are there timed thresholds that apply?
- Does the flow introduce a state not currently modeled?
- Does the flow assume a transition that doesn't exist?

### 3c. Identity & Enrollment
- How does the user enter the system in this flow?
- Does this flow engage any shadow record, guest path, or deferred identity pattern?
- What happens if the user abandons mid-flow?

### 3d. Data & Information Systems
- What data does this flow read, write, or delete?
- Does it respect purge rules or privacy constraints in the snapshot?
- Are there schema fields this flow requires that don't exist yet?
- Does it touch offline/local stores?

### 3e. Architectural Constraints & Doctrines
- Does this flow violate any doctrine or principle recorded in the snapshot?
- Does it require infrastructure not yet provisioned?
- Does it introduce a dependency that conflicts with the tech stack?

### 3f. Integration Points
- What other flows or systems does this flow hand off to or receive from?
- Are those integration points already defined?
- What happens at the boundaries — success, failure, timeout?

---

## Phase 4 — Output: Action Log

**File location:** `arch/system-think/`
**Base name:** `system-think-[user-type]-[flow-name].md`
**Versioning:**
- Glob for existing files matching the base name
- If none: write `v1`
- If prior versions exist: write `v[n+1]`
- Never overwrite an existing version
- Include at top of any file after v1: `**Supersedes:** [previous filename]`

---

### Output Structure

```
# System Think: [User Type] — [Flow Name]
**Version:** v[n]
**Date:** [YYYY-MM-DD]
**Project:** [Project name from snapshot]
**Snapshot version used:** [from snapshot header]
**Supersedes:** [previous filename, or n/a]

---

## Flow Summary
[2–3 sentence plain-language description of the flow as understood]

**Assumptions made:** [Any inferred steps or unstated details]

---

## Architecture Findings

### Conflicts
[Issues that will break existing architecture if built as-is]

### Gaps
[Things the architecture doesn't support that this flow requires]

### Integration Points
[Existing systems/flows this flow must connect with]

### Open Decisions
[Architectural choices this flow forces that haven't been resolved]

---

## Milestone Plan

### Milestone 1 — [Action-oriented name]
**Goal:** [What done looks like]
**Depends on:** [Prior milestone or prerequisite, if any]

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| [abbrev]-01 | | | Design / Eng / Decision / Research | |

### Milestone 2 — ...

---

## Outstanding Questions for Human Review
1. ...
```

---

## Stride Integration (optional)

If the Stride skill or hooks are active in this environment, generate Stride tasks
from the Milestone Plan using existing Stride conventions. Do not duplicate Stride
field definitions here. If Stride is not present, the milestone plan markdown
is the complete output.

---

## Behaviour Rules

- **Snapshot first, always.** Never scan the project broadly when a snapshot exists.
- **No hallucinated architecture.** If a doc or pattern isn't in the snapshot, say so.
- **Confirm before analysis.** Never run Phase 3 without explicit user confirmation
  of user type and flow name.
- **One question at a time.** If both user type and flow name are ambiguous,
  resolve user type first.
- **One output file per invocation.** Never append to an existing system-think file.
- **Task IDs** use a short flow abbreviation + sequential number: `reg-01`, `ride-03`.
- **Task types**: Design, Eng, Decision, Research — exactly these four.
- **Milestone naming**: Action-oriented. "Resolve identity gap" not "Phase 1".
- **Auto-detect**: If the user asks to build, design, or implement a user flow
  and the request implies holistic system consideration, treat it as a system-think
  invocation. Confirm user type and flow name before proceeding.
