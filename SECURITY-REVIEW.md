# Backend Security Review

**Scope:** Supabase schema, row-level security policies, and browser-to-Supabase
access. This repository does not contain a separate application server or API
routes.

## Finding and status

| # | Severity | Location | Vulnerability | Confidence |
|---|----------|----------|---------------|------------|
| 1 | MEDIUM | [`supabase_schema.sql`](./supabase_schema.sql) | **Resolved:** payment inserts require `recorded_by` to match the authenticated user's ID. All authenticated users can now manage all records by design; there are no application roles. | 9/10 |

## Access model

Any signed-in user can read, insert, update, and delete application data. This
is full access, not an admin/accountant separation. Payment inserts are
attributed to the submitting user, but authenticated users can still update or
delete payment records.

## Verification notes

This review is static; no live Supabase project was accessed. Apply the updated
schema in the Supabase SQL Editor for these policies to take effect.
