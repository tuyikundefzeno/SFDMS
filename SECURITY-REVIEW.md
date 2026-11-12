# Backend Security Review

**Scope:** Supabase schema, row-level security policies, browser-to-Supabase
access, and Vercel API routes.

## Finding and status

| # | Severity | Location | Control | Status |
|---|----------|----------|---------|--------|
| 1 | HIGH | [`supabase_multischool_migration.sql`](./supabase_multischool_migration.sql) | Leader reads and writes are restricted by `users.school_id`; school ownership is forced by a database trigger. | Implemented; live DB not verified |
| 2 | HIGH | [`api/schools.ts`](./api/schools.ts) | School/leader provisioning validates the bearer session and requires the profile role `admin`. Service-role access stays server-side. | Implemented; live DB not verified |
| 3 | MEDIUM | [`supabase_schema.sql`](./supabase_schema.sql) | Rerunning the base schema preserves migrated roles and policies. | Implemented; SQL not executed here |

## Access model

Leaders can read and manage rows whose `school_id` matches their own profile.
Admins can read and manage rows across schools. A leader cannot alter profile
role or school assignment, and the database trigger replaces a leader-supplied
school ID on inserts or ownership updates. Composite foreign keys prevent
payments, students, and fee records from linking across schools. The report view
uses invoker security, and the AI endpoint queries with the caller's bearer
token so RLS applies there as well.

The school administration endpoint uses `SUPABASE_SERVICE_ROLE_KEY` only on the
server after verifying the caller's admin role. Never place this value in a
`VITE_` variable or browser bundle. Disable public email sign-ups after
promoting the initial administrator.

## Verification notes

This review is static; no live Supabase project was accessed and no test schools
or leader accounts were created here. Back up the database, apply
`supabase_schema.sql`, then apply `supabase_multischool_migration.sql` before
testing. The README contains the ordered migration, bootstrap, rollback, and
cross-school API/export test steps.
