# AI Ways of Working (WoW) - VEcheLOn

## Stride Task Management

### Agent Routing & Capabilities
To support multiple AI agents working on the same board, agent-specific authentication and capability-based routing are required:

#### Authentication
- **Gemini CLI:** Uses `.stride_auth_gemini.md`
- **Claude Code:** Uses `.stride_auth_claude.md`
- **Fallback:** `.stride_auth.md`

#### Routing via Capabilities
When creating tasks, populate the `required_capabilities` field (array) to route to the correct agent:

- **Gemini CLI:** `api_design`, `code_review`, `database_design`, `performance_optimization`, `refactoring`, `security_analysis`, `ui_design`
- **Claude Code:** `code_generation`, `debugging`, `devops`, `documentation`, `file_operations`, `git`, `testing`, `ui_implementation`, `web_browsing`

### Task Workflow
1.  **Claim:** Always use the `stride-claiming-tasks` skill before claiming.
2.  **Implementation:** Follow the `stride-subagent-workflow` decision matrix.
3.  **Completion:** Always use the `stride-completing-tasks` skill to run validation hooks before finishing.

### Branching Strategy (Conflict Prevention)
Each agent works on a **dedicated branch per task** — never directly on `main`.

- `before_doing` hook: pulls latest `main` then creates branch `$TASK_IDENTIFIER` (e.g. `W8`, `G1-W5`)
- `before_review` hook: opens a PR against `main`
- **Neil merges PRs sequentially** — this serializes all changes and surfaces conflicts at review time, not at push time

**Task design rule:** Use Stride `dependencies` to sequence tasks that touch overlapping `key_files`. Never let two agents work on the same files simultaneously.

## Documentation Protocols
- **BUGS.md:** Track active and resolved issues. Update after every fix.
- **PROJECT_ROADMAP.md:** High-level goals and pending features. Check at the start of every session.
- **AI_WOW.md:** This file. Mandates absolute precedence for project-specific protocols.

## The Product Trio Framework

The Four Pillar documents (`productdocuments/`) were produced by the **Product Trio Agent** (defined in `~/tools/skills/Product Trio Agent.md`). Claude Code and Gemini CLI are **"The Hands"** in this framework.

### Rules for The Hands
- The Pillar files are the **Bedrock** — the authoritative source of truth. Follow them, do not override them from chat.
- Pillar updates must follow the **MACD Protocol** (Move, Add, Change, Delete) with explicit change log headers at the top of each file.
- Never update a Pillar based on a casual comment. Only update when the PM has explicitly confirmed a MACD action.
- If a technical challenge requires a **strategic decision** (not a technical one), flag it and bring it back to a "Mind" session — do not resolve it autonomously.
- `/exportdocs` and `/handshake` are Brain-session commands (Gemini AI Studio / ChatGPT). The Hands do not issue these.

### MACD Change Log Header (add to top of any Pillar file you modify)
```
**Project:** VEcheLOn
**Current Version:** vX.X.X
**Last Sync Date:** YYYY-MM-DD
**Status:** COMMITTED

| Version | Date | Time | MACD Action | Decision | Lead |
|---------|------|------|-------------|----------|------|
| v1.0.0  | YYYY-MM-DD | HH:MM | ADD | Initial commit | PM |
```
