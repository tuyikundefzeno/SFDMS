# School Feeding Management System

A React, TypeScript, Vite, and Supabase application for managing school feeding
students and payments.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to your Supabase project URL and publishable/anon key.
3. Apply `supabase_schema.sql` in the Supabase SQL Editor.
4. Start the app with `npm run dev`.

The anon/publishable key is intended for browser use and is not a substitute for
database access policies. Never use a Supabase `service_role` key in a `VITE_`
variable.

## Vercel deployment

1. Import this repository into Vercel and select the Vite framework preset.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's
   Environment Variables for every environment you will deploy (Production,
   Preview, and Development as applicable).
   AI Insights also needs the server-only variables `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`. Get the Gemini key from Google AI
   Studio, enable the Gemini API for it, and do not prefix it with `VITE_`.
   `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`. If a
   configured model is unavailable to your key, the API checks the models
   enabled for that key and retries with an available text-generation model.
   These server variables must be set in Vercel separately from your local
   `.env` file.
3. Deploy with the default build command `npm run build` and output directory
   `dist`. `vercel.json` includes the SPA fallback so direct navigation to app
   routes works.
4. Apply `supabase_schema.sql` to the connected Supabase project. In Supabase
   Auth settings, enable email sign-ups and configure the site URL and redirect
   URLs for your deployment. No application roles are used: every signed-in
   account can view and manage all application data and pages. New accounts
   receive a profile automatically when they sign up. Payment entries must be
   attributed to the signed-in user when created.

Keep public sign-ups enabled only if anyone should be able to create an account
and receive full access.

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

Run the updated `supabase_schema.sql` in the Supabase SQL Editor before using
this page. It adds `payments.ai_reviewed_at` for the mistake checker's review
button. Vite's development server does not run Vercel functions; use the Vercel
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
