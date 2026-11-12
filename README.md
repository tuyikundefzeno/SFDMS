# School Feeding Management System

A React, TypeScript, Vite, and Supabase application for managing school feeding
students and payments.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to your Supabase project URL and publishable/anon key.
3. Back up the database, apply `supabase_schema.sql` in the Supabase SQL Editor,
   then apply `supabase_multischool_migration.sql`. Existing rows are assigned to
   `Default School` without deleting them.
4. Start the app with `npm run dev`.

The anon/publishable key is intended for browser use and is not a substitute for
database access policies. Never use a Supabase `service_role` key in a `VITE_`
variable.

## Vercel deployment

1. Import this repository into Vercel and select the Vite framework preset.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's
   Environment Variables for every environment you will deploy (Production,
   Preview, and Development as applicable).
   AI Insights needs the server-only variables `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`. School administration additionally
   needs `SUPABASE_SERVICE_ROLE_KEY`, which must be configured only in the server
   environment and must never use a `VITE_` prefix. Get the Gemini key from Google AI
   Studio, enable the Gemini API for it, and do not prefix it with `VITE_`.
   `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`. If a
   configured model is unavailable to your key, the API checks the models
   enabled for that key and retries with an available text-generation model.
   These server variables must be set in Vercel separately from your local
   `.env` file.
3. Deploy with the default build command `npm run build` and output directory
   `dist`. `vercel.json` includes the SPA fallback so direct navigation to app
   routes works.
4. Back up the connected Supabase project, apply `supabase_schema.sql`, then
   apply `supabase_multischool_migration.sql`. Configure the Supabase Auth site
   URL and redirect URLs. Disable public email sign-ups; administrators create
   leader accounts through `/admin/schools`.
5. Promote one trusted existing account to administrator in the Supabase SQL
   Editor, replacing the email below with that account's email:

   ```sql
   UPDATE public.users AS profile
   SET role = 'admin'
   FROM auth.users AS auth_user
   WHERE profile.id = auth_user.id
     AND auth_user.email = 'trusted-admin@example.org';
   ```

   Existing accounts remain assigned to `Default School` as leaders until
   accounts are created for other schools. Leaders receive their school ID from
   their database profile. Database triggers override a leader-supplied school
   ID, and row-level security scopes reads and writes to that profile.
   Administrators can access all schools. The service-role key is used only by
   the server-side school administration API.

   ## Verify school isolation

   Use non-production test accounts and unique test names. In `/admin/schools`,
   create `Isolation Test School A` and `Isolation Test School B`, then create
   `leader-a@example.org` and `leader-b@example.org` assigned to the matching
   schools. Sign in as Leader B and add a uniquely named test student and payment.
   Copy that student's ID and School B ID for the checks below. Use each leader's
   own access token; never use the service-role key for these requests.

   1. As Leader A, request School B's student by ID from
      `/rest/v1/students?id=eq.<B_STUDENT_ID>&select=id,full_name`. Expected: an
      empty array. Request `/rest/v1/schools?id=eq.<B_SCHOOL_ID>&select=id,name`;
      expected: an empty array.
   2. Repeat with URL variations such as adding `school_id=eq.<B_SCHOOL_ID>` or
      changing the report URL to include `?school_id=<B_SCHOOL_ID>`. Expected:
      School B rows remain absent; client-supplied filters cannot widen RLS.
   3. As Leader A, attempt a REST insert using School B's `school_id` and B's
      `class_id`. Expected: the request fails because the database forces Leader
      A's school and the composite foreign key refuses a cross-school class.
   4. Open `/admin/reports` as Leader A, export CSV and PDF, and search each for
      the unique test student's name and ID. Expected: neither export contains
      School B's test data. Also inspect dashboard totals and AI Insights while
      signed in as A; they should use only A's records.
   5. As the administrator, query both schools and confirm both test records are
      visible. Delete the test data and accounts after verification.

   The endpoint uses the same RLS-limited bearer token for normal school queries;
   the admin provisioning endpoint is separately protected by the profile's
   `admin` role. Record response status/body and export search results as test
   evidence. The repository's static checks do not substitute for running this
   procedure against the migrated Supabase project.

## Migration and rollback

1. Back up the database and verify the backup before applying either SQL file.
2. Apply `supabase_schema.sql` if the base schema has not already been installed.
3. Apply `supabase_multischool_migration.sql`; it runs in a transaction and
   backfills existing data to `Default School`.
4. Promote a trusted administrator as shown above, configure server-only
   environment variables, and disable public sign-ups.
5. To undo, back up again, stop app traffic, and follow
   `supabase_multischool_rollback.sql`. Rollback returns to the old single-school
   shared-access model and removes role/school ownership fields. To preserve
   every row, rollback restores non-unique admission-number and current-semester
   indexes; review duplicate values and restore the old uniqueness rules manually
   if the data permits it. Use rollback only when intentionally abandoning
   isolation, and restore the backup if any rollback statement fails.

## AI Insights

The authenticated `/admin/ai-insights` page uses the Vercel serverless function
at `/api/ai`. The function checks the caller's Supabase access token and queries
school records using that user's session and database policies. The Gemini key
is used only on the server. The AI receives summary totals for summaries,
first name plus balance/deadline for a reminder, or only relevant aggregate
facts for supported chat questions; matching student names are displayed from
the database, not sent to Gemini. Questions such as “Who has paid?” and “Who
has not paid in Senior 3?” are supported. Unsupported questions receive a
helpful prompt with examples of supported payment questions. Reminder messages are drafts; a person must
edit/review and copy them before sending.

Run `supabase_schema.sql` and `supabase_multischool_migration.sql` before using
this page. Its database queries use the caller's RLS-restricted session. Vite's
development server does not run Vercel functions; use the Vercel
CLI's `vercel dev` command to test `/api/ai` locally. Install the CLI if needed
with `npm install --global vercel`, then set the server variables above in
Vercel or a local `.env.local` file before running `vercel dev`. A Gemini key
in `.env` is not automatically transferred when you push or deploy through
Vercel; add it to the Vercel project's Environment Variables and redeploy.

### Test the six AI Insights features

1. **AI summary:** Open AI Insights, choose English, Kinyarwanda, or French,
   then press **Refresh summary**. Confirm the summary includes collected,
   unpaid, percentage, and the highest- and lowest-collecting classes.
2. **Early warning:** Add students and current/past semester payment records.
   Filter the risk table by class and risk. Risk is a guide based on semester
   progress and incomplete past semesters, not a confirmed late notice.
3. **Reminder:** Pick a student with a balance, set a deadline and tone, press
   **Write reminder**, edit the draft, then press **Copy**. Verify nothing is
   sent automatically.
4. **Ask in normal words:** Try “Who has paid?”, “Who has not paid in Senior
   3?”, and “How much did we collect this week?” The answers/table should match database records.
   Try an unsupported question and confirm the helpful prompt suggests
   supported payment questions.
5. **Low-payment follow-up:** Review the list of active students with recorded
   current-semester payments above RWF 0 and up to RWF 5,000. Confirm fees and
   balances match the payment records, filter by class, and download the
   follow-up PDF for printing. Use **Student PDF** on a row to download an
   individual parent/guardian follow-up notice for that student.
6. **Semester prediction:** Compare the collected and estimated bars. Confirm
   the page labels the prediction as an estimate and gives its basis.
7. **Mistake checker:** Add test records that may be duplicated or put a
   student's semester total over the fee. Check that they are flagged, then
   press **Mark as checked**. The page marks them for review but does not edit
   or delete payment values.

The `.env` file is for local development and is excluded from Git. Configure
Vercel environment variables separately; local values are not uploaded or
transferred by a Git push.

## Checks

- `npm run lint`
- `npm run build`
