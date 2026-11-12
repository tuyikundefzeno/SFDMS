-- Removes the multi-school ownership model and restores the legacy shared-data RLS.
-- Back up first. This intentionally abandons school isolation.
BEGIN;

DROP VIEW IF EXISTS public.student_semester_totals;

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

DROP TRIGGER IF EXISTS assign_school_on_write ON public.classes;
DROP TRIGGER IF EXISTS assign_school_on_write ON public.semesters;
DROP TRIGGER IF EXISTS assign_school_on_write ON public.students;
DROP TRIGGER IF EXISTS assign_school_on_write ON public.fee_structure;
DROP TRIGGER IF EXISTS assign_school_on_write ON public.payments;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_class_school_fk;
ALTER TABLE public.fee_structure DROP CONSTRAINT IF EXISTS fee_class_school_fk;
ALTER TABLE public.fee_structure DROP CONSTRAINT IF EXISTS fee_semester_school_fk;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payment_student_school_fk;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payment_semester_school_fk;

ALTER TABLE public.students
    ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id)
    REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.fee_structure
    ADD CONSTRAINT fee_structure_class_id_fkey FOREIGN KEY (class_id)
    REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.fee_structure
    ADD CONSTRAINT fee_structure_semester_id_fkey FOREIGN KEY (semester_id)
    REFERENCES public.semesters(id) ON DELETE CASCADE;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_student_id_fkey FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_semester_id_fkey FOREIGN KEY (semester_id)
    REFERENCES public.semesters(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.students_school_admission_number_key;
DROP INDEX IF EXISTS public.students_admission_number_key;
CREATE INDEX IF NOT EXISTS students_admission_number_idx
    ON public.students (admission_number);
DROP INDEX IF EXISTS public.one_current_semester_per_school;
DROP INDEX IF EXISTS public.one_current_semester;
CREATE INDEX IF NOT EXISTS semesters_current_idx
    ON public.semesters (is_current) WHERE is_current = true;

DROP INDEX IF EXISTS public.classes_school_id_idx;
DROP INDEX IF EXISTS public.semesters_school_id_idx;
DROP INDEX IF EXISTS public.students_school_id_idx;
DROP INDEX IF EXISTS public.fee_structure_school_id_idx;
DROP INDEX IF EXISTS public.payments_school_id_idx;
DROP INDEX IF EXISTS public.users_school_id_idx;

DROP FUNCTION IF EXISTS public.assign_school_on_write();
DROP FUNCTION IF EXISTS public.is_school_admin();
DROP FUNCTION IF EXISTS public.current_school_id();
DROP FUNCTION IF EXISTS public.current_user_role();

ALTER TABLE public.classes DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.semesters DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.students DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.fee_structure DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

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
JOIN public.classes AS c ON c.id = s.class_id
CROSS JOIN public.semesters AS sem
LEFT JOIN public.fee_structure AS fs ON fs.class_id = c.id AND fs.semester_id = sem.id
LEFT JOIN public.payments AS p ON p.student_id = s.id AND p.semester_id = sem.id
GROUP BY s.id, c.id, sem.id, fs.required_amount;
GRANT SELECT ON public.student_semester_totals TO authenticated;
REVOKE ALL ON public.student_semester_totals FROM anon;

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
    FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Authenticated users read payments" ON public.payments
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users record payments" ON public.payments
    FOR INSERT TO authenticated WITH CHECK (recorded_by = (SELECT auth.uid()));
CREATE POLICY "Authenticated users update payments" ON public.payments
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users delete payments" ON public.payments
    FOR DELETE TO authenticated USING (true);

COMMIT;
