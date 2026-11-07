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
3. Deploy with the default build command `npm run build` and output directory
   `dist`. `vercel.json` includes the SPA fallback so direct navigation to app
   routes works.
4. Apply `supabase_schema.sql` to the connected Supabase project. In Supabase
   Auth settings, enable email sign-ups and configure the site URL and redirect
   URLs for your deployment. New sign-ups automatically receive the accountant
   role through a database trigger; the role is never accepted from client
   metadata. Create administrators through a trusted admin workflow. Each
   account needs a matching row in `public.users`; the application denies
   dashboard access if the role is missing.

Example administrator provisioning (replace the values in the SQL Editor):

```sql
INSERT INTO public.users (id, full_name, role)
VALUES ('<auth-user-uuid>', '<full-name>', 'admin');
```

The `.env` file is for local development and is excluded from Git. Configure
Vercel environment variables separately; local values are not uploaded or
transferred by a Git push.

## Checks

- `npm run lint`
- `npm run build`
