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
    role TEXT NOT NULL CHECK (role IN ('admin', 'accountant')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.users (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            NEW.id::TEXT
        ),
        'accountant'
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

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by UUID NOT NULL REFERENCES public.users(id),
    note TEXT
);

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

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.role
    FROM public.users AS u
    WHERE u.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

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

DROP POLICY IF EXISTS "Authenticated users read schools" ON public.schools;
DROP POLICY IF EXISTS "Admins manage schools" ON public.schools;
DROP POLICY IF EXISTS "Allow all authenticated to read schools" ON public.schools;
DROP POLICY IF EXISTS "Allow admin full access to schools" ON public.schools;
CREATE POLICY "Authenticated users read schools" ON public.schools
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage schools" ON public.schools
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read classes" ON public.classes;
DROP POLICY IF EXISTS "Admins manage classes" ON public.classes;
DROP POLICY IF EXISTS "Allow all authenticated to read classes" ON public.classes;
DROP POLICY IF EXISTS "Allow admin full access to classes" ON public.classes;
CREATE POLICY "Authenticated users read classes" ON public.classes
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage classes" ON public.classes
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read semesters" ON public.semesters;
DROP POLICY IF EXISTS "Admins manage semesters" ON public.semesters;
DROP POLICY IF EXISTS "Allow all authenticated to read semesters" ON public.semesters;
DROP POLICY IF EXISTS "Allow admin full access to semesters" ON public.semesters;
CREATE POLICY "Authenticated users read semesters" ON public.semesters
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage semesters" ON public.semesters
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read students" ON public.students;
DROP POLICY IF EXISTS "Admins manage students" ON public.students;
DROP POLICY IF EXISTS "Allow all authenticated to read students" ON public.students;
DROP POLICY IF EXISTS "Allow admin full access to students" ON public.students;
CREATE POLICY "Authenticated users read students" ON public.students
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage students" ON public.students
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read fee structure" ON public.fee_structure;
DROP POLICY IF EXISTS "Admins manage fee structure" ON public.fee_structure;
DROP POLICY IF EXISTS "Allow all authenticated to read fee_structure" ON public.fee_structure;
DROP POLICY IF EXISTS "Allow admin full access to fee_structure" ON public.fee_structure;
CREATE POLICY "Authenticated users read fee structure" ON public.fee_structure
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage fee structure" ON public.fee_structure
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Users read own profile or admins read all" ON public.users;
DROP POLICY IF EXISTS "Admins manage user profiles" ON public.users;
DROP POLICY IF EXISTS "Allow all authenticated to read users" ON public.users;
DROP POLICY IF EXISTS "Allow admin full access to users" ON public.users;
CREATE POLICY "Users read own profile or admins read all" ON public.users
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid())
        OR (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "Admins manage user profiles" ON public.users
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read payments" ON public.payments;
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
DROP POLICY IF EXISTS "Accountants record payments" ON public.payments;
DROP POLICY IF EXISTS "Allow all authenticated to read payments" ON public.payments;
DROP POLICY IF EXISTS "Allow admin full access to payments" ON public.payments;
DROP POLICY IF EXISTS "Allow accountant to insert payments" ON public.payments;
CREATE POLICY "Authenticated users read payments" ON public.payments
    FOR SELECT TO authenticated
    USING ((SELECT public.get_user_role()) IN ('admin', 'accountant'));
CREATE POLICY "Admins manage payments" ON public.payments
    FOR ALL TO authenticated
    USING ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');
CREATE POLICY "Accountants record payments" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.get_user_role()) = 'accountant'
        AND recorded_by = (SELECT auth.uid())
    );
