-- ==========================================
-- SCHOOL FEEDING MANAGEMENT SYSTEM SCHEMA
-- ==========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Tables
CREATE TABLE public.schools (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.classes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.semesters (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one semester is current at a time
CREATE UNIQUE INDEX one_current_semester ON public.semesters (is_current) WHERE is_current = true;

CREATE TABLE public.students (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name TEXT NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    admission_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.fee_structure (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    required_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (class_id, semester_id)
);

-- Users table linking to auth.users
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'accountant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0 OR amount < 0), -- Allow negative for adjustments
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by UUID NOT NULL REFERENCES public.users(id),
    note TEXT
);

-- 2. Create View for Real-time Reporting
-- This computes the total payments per student per semester
CREATE OR REPLACE VIEW public.student_semester_totals AS
SELECT 
    s.id AS student_id,
    s.full_name,
    s.admission_number,
    c.id AS class_id,
    c.name AS class_name,
    sem.id AS semester_id,
    sem.name AS semester_name,
    fs.required_amount,
    COALESCE(SUM(p.amount), 0) AS total_paid,
    CASE 
        WHEN fs.required_amount = 0 THEN 100
        ELSE (COALESCE(SUM(p.amount), 0) / fs.required_amount) * 100 
    END AS percentage_paid,
    CASE
        WHEN COALESCE(SUM(p.amount), 0) >= fs.required_amount THEN 'PAID'
        WHEN COALESCE(SUM(p.amount), 0) >= (fs.required_amount / 2) THEN 'PARTIAL'
        ELSE 'BELOW HALF'
    END AS status
FROM public.students s
JOIN public.classes c ON s.class_id = c.id
CROSS JOIN public.semesters sem
LEFT JOIN public.fee_structure fs ON fs.class_id = c.id AND fs.semester_id = sem.id
LEFT JOIN public.payments p ON p.student_id = s.id AND p.semester_id = sem.id
GROUP BY s.id, c.id, sem.id, fs.required_amount;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Helper function to get the current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Users can read everything (both admin and accountant need to see this data)
CREATE POLICY "Allow all authenticated to read schools" ON public.schools FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read classes" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read semesters" ON public.semesters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read fee_structure" ON public.fee_structure FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read users" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all authenticated to read payments" ON public.payments FOR SELECT TO authenticated USING (true);

-- Admins can do everything
CREATE POLICY "Allow admin full access to schools" ON public.schools FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to classes" ON public.classes FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to semesters" ON public.semesters FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to students" ON public.students FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to fee_structure" ON public.fee_structure FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to users" ON public.users FOR ALL TO authenticated USING (public.get_user_role() = 'admin');
CREATE POLICY "Allow admin full access to payments" ON public.payments FOR ALL TO authenticated USING (public.get_user_role() = 'admin');

-- Accountants can INSERT payments but not update or delete
CREATE POLICY "Allow accountant to insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.get_user_role() IN ('admin', 'accountant'));

-- Note: Because we enabled real-time on payments, we need to add the table to the replication publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
