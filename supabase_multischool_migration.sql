-- Multi-school data isolation migration for existing Supabase projects.
-- Back up the database before running. Run after supabase_schema.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
    default_school_id UUID;
BEGIN
    SELECT id INTO default_school_id
    FROM public.schools
    WHERE name = 'Default School'
    ORDER BY created_at, id
    LIMIT 1;

    IF default_school_id IS NULL THEN
        INSERT INTO public.schools (name)
        VALUES ('Default School')
        RETURNING id INTO default_school_id;
    END IF;

    ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.fee_structure ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'leader';

    UPDATE public.classes SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.semesters SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.students SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.fee_structure SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.payments SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.users SET school_id = default_school_id WHERE school_id IS NULL;
END;
$$;

ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.semesters ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.fee_structure ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN school_id SET NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('leader', 'admin'));

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_admission_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_school_admission_number_key
    ON public.students (school_id, admission_number);

DROP INDEX IF EXISTS public.one_current_semester;
CREATE UNIQUE INDEX IF NOT EXISTS one_current_semester_per_school
    ON public.semesters (school_id) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS classes_school_id_idx ON public.classes (school_id);
CREATE INDEX IF NOT EXISTS semesters_school_id_idx ON public.semesters (school_id);
CREATE INDEX IF NOT EXISTS students_school_id_idx ON public.students (school_id);
CREATE INDEX IF NOT EXISTS fee_structure_school_id_idx ON public.fee_structure (school_id);
CREATE INDEX IF NOT EXISTS payments_school_id_idx ON public.payments (school_id);
CREATE INDEX IF NOT EXISTS users_school_id_idx ON public.users (school_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_id_school_id_key') THEN
        ALTER TABLE public.classes ADD CONSTRAINT classes_id_school_id_key UNIQUE (id, school_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'semesters_id_school_id_key') THEN
        ALTER TABLE public.semesters ADD CONSTRAINT semesters_id_school_id_key UNIQUE (id, school_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_id_school_id_key') THEN
        ALTER TABLE public.students ADD CONSTRAINT students_id_school_id_key UNIQUE (id, school_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_class_school_fk') THEN
        ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_class_id_fkey;
        ALTER TABLE public.students ADD CONSTRAINT students_class_school_fk
            FOREIGN KEY (class_id, school_id) REFERENCES public.classes (id, school_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_class_school_fk') THEN
        ALTER TABLE public.fee_structure DROP CONSTRAINT IF EXISTS fee_structure_class_id_fkey;
        ALTER TABLE public.fee_structure ADD CONSTRAINT fee_class_school_fk
            FOREIGN KEY (class_id, school_id) REFERENCES public.classes (id, school_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_semester_school_fk') THEN
        ALTER TABLE public.fee_structure DROP CONSTRAINT IF EXISTS fee_structure_semester_id_fkey;
        ALTER TABLE public.fee_structure ADD CONSTRAINT fee_semester_school_fk
            FOREIGN KEY (semester_id, school_id) REFERENCES public.semesters (id, school_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_student_school_fk') THEN
        ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_student_id_fkey;
        ALTER TABLE public.payments ADD CONSTRAINT payment_student_school_fk
            FOREIGN KEY (student_id, school_id) REFERENCES public.students (id, school_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_semester_school_fk') THEN
        ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_semester_id_fkey;
        ALTER TABLE public.payments ADD CONSTRAINT payment_semester_school_fk
            FOREIGN KEY (semester_id, school_id) REFERENCES public.semesters (id, school_id) ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.role FROM public.users AS u WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.school_id FROM public.users AS u WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(public.current_user_role() = 'admin', false)
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_school_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_school_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_school_id UUID;
BEGIN
    SELECT u.school_id INTO caller_school_id
    FROM public.users AS u
    WHERE u.id = (SELECT auth.uid());

    IF caller_school_id IS NULL THEN
        RAISE EXCEPTION 'A school-linked authenticated profile is required';
    END IF;

    IF public.is_school_admin() THEN
        NEW.school_id := COALESCE(NEW.school_id, caller_school_id);
    ELSE
        NEW.school_id := caller_school_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_school_on_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['classes', 'semesters', 'students', 'fee_structure', 'payments']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS assign_school_on_write ON public.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER assign_school_on_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assign_school_on_write()',
            table_name
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    default_school_id UUID;
BEGIN
    SELECT id INTO default_school_id
    FROM public.schools
    WHERE name = 'Default School'
    ORDER BY created_at, id
    LIMIT 1;

    INSERT INTO public.users (id, full_name, school_id, role)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            NEW.id::TEXT
        ),
        default_school_id,
        'leader'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP VIEW IF EXISTS public.student_semester_totals;
CREATE VIEW public.student_semester_totals
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
        ELSE COALESCE(SUM(p.amount), 0) / COALESCE(fs.required_amount, 24000) * 100
    END AS percentage_paid,
    CASE
        WHEN COALESCE(SUM(p.amount), 0) >= COALESCE(fs.required_amount, 24000) THEN 'PAID'
        WHEN COALESCE(SUM(p.amount), 0) >= COALESCE(fs.required_amount, 24000) / 2 THEN 'PARTIAL'
        ELSE 'BELOW HALF'
    END AS status
FROM public.students AS s
JOIN public.classes AS c ON c.id = s.class_id AND c.school_id = s.school_id
CROSS JOIN public.semesters AS sem
LEFT JOIN public.fee_structure AS fs
    ON fs.class_id = c.id AND fs.semester_id = sem.id AND fs.school_id = s.school_id
LEFT JOIN public.payments AS p
    ON p.student_id = s.id AND p.semester_id = sem.id AND p.school_id = s.school_id
GROUP BY s.id, c.id, sem.id, fs.required_amount;

GRANT SELECT ON public.student_semester_totals TO authenticated;
REVOKE ALL ON public.student_semester_totals FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.schools, public.classes, public.semesters, public.students,
       public.fee_structure, public.users, public.payments
    TO authenticated;
REVOKE ALL ON public.schools, public.classes, public.semesters, public.students,
    public.fee_structure, public.users, public.payments FROM anon;

DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY (ARRAY['schools', 'classes', 'semesters', 'students', 'fee_structure', 'users', 'payments'])
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
    END LOOP;
END;
$$;

CREATE POLICY school_read_scope ON public.schools
    FOR SELECT TO authenticated
    USING (public.is_school_admin() OR id = (SELECT public.current_school_id()));
CREATE POLICY school_admin_manage ON public.schools
    FOR ALL TO authenticated
    USING (public.is_school_admin())
    WITH CHECK (public.is_school_admin());

CREATE POLICY classes_school_scope ON public.classes
    FOR ALL TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
    WITH CHECK (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY semesters_school_scope ON public.semesters
    FOR ALL TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
    WITH CHECK (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY students_school_scope ON public.students
    FOR ALL TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
    WITH CHECK (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY fees_school_scope ON public.fee_structure
    FOR ALL TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
    WITH CHECK (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY payments_school_read ON public.payments
    FOR SELECT TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY payments_school_insert ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
        AND (public.is_school_admin() OR recorded_by = (SELECT auth.uid()))
    );
CREATE POLICY payments_school_update ON public.payments
    FOR UPDATE TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()))
    WITH CHECK (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY payments_school_delete ON public.payments
    FOR DELETE TO authenticated
    USING (public.is_school_admin() OR school_id = (SELECT public.current_school_id()));
CREATE POLICY users_profile_read_scope ON public.users
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR public.is_school_admin());

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

COMMIT;
