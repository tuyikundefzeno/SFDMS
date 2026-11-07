-- School Feeding Management System - Supabase setup
-- Run in Supabase Dashboard > SQL Editor. This script is safe to rerun.

CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT semesters_valid_dates CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_current_semester
    ON public.semesters (is_current)
    WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    admission_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE TABLE IF NOT EXISTS public.fee_structure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    required_amount NUMERIC(10, 2) NOT NULL DEFAULT 24000
        CHECK (required_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, semester_id)
);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.users (id, full_name)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            NEW.id::TEXT
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO public.users (id, full_name)
SELECT
    u.id,
    COALESCE(
        NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
        u.id::TEXT
    )
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by UUID NOT NULL REFERENCES public.users(id),
    note TEXT,
    ai_reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS ai_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS students_class_id_idx
    ON public.students (class_id);
CREATE INDEX IF NOT EXISTS payments_student_semester_idx
    ON public.payments (student_id, semester_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx
    ON public.payments (paid_at DESC);

CREATE OR REPLACE VIEW public.student_semester_totals
WITH (security_invoker = true)
AS
SELECT
    s.id AS student_id,
    s.full_name,
    s.admission_number,
    c.id AS class_id,
    c.name AS class_name,
    sem.id AS semester_id,
    sem.name AS semester_name,
    COALESCE(fs.required_amount, 24000::NUMERIC) AS required_amount,
    COALESCE(SUM(p.amount), 0)::NUMERIC AS total_paid,
    CASE
        WHEN COALESCE(fs.required_amount, 24000) = 0 THEN 100
        ELSE COALESCE(SUM(p.amount), 0)
             / COALESCE(fs.required_amount, 24000) * 100
    END AS percentage_paid,
    CASE
        WHEN COALESCE(SUM(p.amount), 0) >= COALESCE(fs.required_amount, 24000)
            THEN 'PAID'
        WHEN COALESCE(SUM(p.amount), 0) >= COALESCE(fs.required_amount, 24000) / 2
            THEN 'PARTIAL'
        ELSE 'BELOW HALF'
    END AS status
FROM public.students AS s
JOIN public.classes AS c ON c.id = s.class_id
CROSS JOIN public.semesters AS sem
LEFT JOIN public.fee_structure AS fs
    ON fs.class_id = c.id AND fs.semester_id = sem.id
LEFT JOIN public.payments AS p
    ON p.student_id = s.id AND p.semester_id = sem.id
GROUP BY s.id, c.id, sem.id, fs.required_amount;

GRANT SELECT ON public.student_semester_totals TO authenticated;
REVOKE ALL ON public.student_semester_totals FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.schools, public.classes, public.semesters, public.students,
       public.fee_structure, public.users, public.payments
    TO authenticated;
REVOKE ALL
    ON public.schools, public.classes, public.semesters, public.students,
       public.fee_structure, public.users, public.payments
    FROM anon;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY (ARRAY[
              'schools', 'classes', 'semesters', 'students',
              'fee_structure', 'users', 'payments'
          ])
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename
        );
    END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_role();
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

CREATE POLICY "Authenticated users manage schools" ON public.schools
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage classes" ON public.classes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage semesters" ON public.semesters
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage students" ON public.students
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage fee structure" ON public.fee_structure
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users read profiles" ON public.users
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own profile" ON public.users
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Authenticated users read payments" ON public.payments
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users record payments" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (recorded_by = (SELECT auth.uid()));
CREATE POLICY "Authenticated users update payments" ON public.payments
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users delete payments" ON public.payments
    FOR DELETE TO authenticated USING (true);
