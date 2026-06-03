#!/bin/bash
# supabase-pre-edit-check.sh — fires before Write/Edit on supabase/{migrations,functions}/**.
# Emits a reminder via stderr (exit 0) so the message reaches Claude's context
# without blocking the tool call. Claude is expected to invoke the
# `supabase-patterns` skill before proceeding with the edit.

set -euo pipefail

# Read the tool input JSON from stdin
input=$(cat)

# Extract file_path. jq is preferred; fall back to grep+sed if not available.
if command -v jq >/dev/null 2>&1; then
  file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""')
else
  file_path=$(echo "$input" | grep -oP '"file_path"\s*:\s*"\K[^"]+' | head -1 || echo "")
fi

# Match supabase migrations and edge functions. Adjust if Vechelon adds more
# Supabase-touching directories that warrant the same scrutiny.
case "$file_path" in
  *"supabase/migrations/"*|*"supabase/functions/"*)
    cat >&2 <<'EOF'
[supabase-pre-edit-check] About to edit a Supabase migration or edge function.

Before proceeding, INVOKE THE supabase-patterns SKILL to walk through the
relevant footguns:

  • Pattern 1: Self-referencing RLS → SECURITY DEFINER helper, never inline EXISTS
  • Pattern 2: Views over RLS tables → WITH (security_invoker = true)
  • Pattern 3: supabase-js upsert + partial unique index → INSERT + 23505 catch
  • Pattern 4: signOut → scope: 'global' (default), never 'local'
  • Pattern 5: Fix-migration recreating dropped artifacts → DROP IF EXISTS at top
  • Pattern 6: auth.users.email backfill → tenant-safe via account_id = u.id

The skill is at ~/.claude/skills/supabase-patterns/SKILL.md.
EOF
    ;;
esac

# Always exit 0 — this is a reminder, not a gate.
exit 0
