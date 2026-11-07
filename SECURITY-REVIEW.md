# Backend Security Review

**Scope:** Supabase schema, row-level security policies, and browser-to-Supabase
access. This repository does not contain a separate application server or API
routes.

## Finding

| # | Severity | Location | Vulnerability | Confidence |
|---|----------|----------|---------------|------------|
| 1 | MEDIUM | [`supabase_schema.sql`](./supabase_schema.sql), lines 234–236 | The accountant payment-insert policy verifies the caller's role but does not require `payments.recorded_by` to equal the authenticated user's ID. An authenticated accountant can call Supabase directly and attribute a payment to another user, weakening the payment audit trail. | 9/10 |

### Recommended remediation

Require `recorded_by = (SELECT auth.uid())` in the accountant insert policy's
`WITH CHECK` condition. Apply the same invariant in a database constraint or
trigger if it must remain enforced independently of policy changes.

## Verification notes

This review was static; no live Supabase project was accessed. The finding is
based on the checked-in schema and should be addressed in the database before
relying on the payment recorder as an audit trail.
