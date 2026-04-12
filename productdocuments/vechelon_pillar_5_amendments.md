# Vechelon | Pillar V: Amendments (v1.0.0)

Project: Vechelon | Current Version: v1.0.0 | Last Sync Date: 2026-04-11 | Status: COMMITTED

---

## 1. Amendment History

This document records formal extensions or corrections to the established Pillars (I–IV).

| # | Date | Target Pillar | Type | Description |
|---|---|---|---|---|
| A-01 | 2026-04-11 | Pillar II (Specs) | Schema | Replace single `tenant_id` on `accounts` with `account_tenants` junction table to support multi-membership. |
| A-02 | 2026-04-11 | Pillar II (Specs) | Schema | Add `show_calendar_to_pending` (boolean) to `tenants` table. |

---

## 2. Technical Details

### A-01: Multi-Membership Schema Extension
**Rationale:** Decision RP-D-15. To support riders belonging to multiple clubs, the relationship between `accounts` and `tenants` must be many-to-many. 

**Changes:**
1. **Remove** `tenant_id` and `role` from the `accounts` table.
2. **Create** `account_tenants` junction table:
   - `account_id` (UUID FK → accounts)
   - `tenant_id` (UUID FK → tenants)
   - `status` (Enum: 'initiated', 'affiliated', 'archived')
   - `role` (Enum: 'admin', 'member', 'guest')
   - `joined_at` (Timestamp)

---

### A-02: Conditional Calendar Access
**Rationale:** Decision RP-D-23. Enables manual-enrollment clubs to optionally show upcoming rides to pending riders.

**Changes:**
1. **Add** `show_calendar_to_pending` (boolean, default: false) to the `tenants` table.
