import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { REQUIRED_AMOUNT_PER_SEMESTER, formatCurrency } from '../lib/constants';
import {
  FileBarChart, Users, BookOpen, CreditCard,
  CalendarDays, TrendingUp, AlertCircle, CheckCircle, Clock
} from 'lucide-react';

interface Stats {
  totalStudents: number;
  totalSemesters: number;
  totalCollected: number;
  totalExpected: number;
  totalUnpaid: number;
  overallPct: number;
  paidCount: number;
  partialCount: number;
  belowCount: number;
  totalPaymentRecords: number;
  classStats: { name: string; collected: number; expected: number; pct: number; students: number }[];
  semesterStats: { name: string; collected: number; expected: number; pct: number; students: number; isCurrent: boolean }[];
}

export const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [studentsRes, semestersRes, paymentsRes, classesRes] = await Promise.all([
        supabase.from('students').select('id, class_id, classes(name)').eq('status', 'active'),
        supabase.from('semesters').select('*'),
        supabase.from('payments').select('amount, student_id, semester_id'),
        supabase.from('classes').select('id, name'),
      ]);

      const students  = studentsRes.data  || [];
      const semesters = semestersRes.data || [];
      const payments  = paymentsRes.data  || [];
      const classes   = classesRes.data   || [];

      const currentSem = semesters.find((s: any) => s.is_current) || semesters[0];
      const activeSemId = currentSem ? currentSem.id : null;

      const totalStudents   = students.length;
      const totalSemesters  = semesters.length;
      const totalExpected   = totalStudents * REQUIRED_AMOUNT_PER_SEMESTER; // Current semester baseline
      const totalCollected  = payments.reduce((s, p) => s + Number(p.amount), 0);
      const totalUnpaid     = Math.max(totalExpected - totalCollected, 0);
      const overallPct      = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

      // 1 Row per Student for current semester
      const studentRows = students.map(s => {
        const studentPayments = activeSemId 
          ? payments.filter(p => p.student_id === s.id && p.semester_id === activeSemId)
          : payments.filter(p => p.student_id === s.id);
        const paid = studentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const status =
          paid >= REQUIRED_AMOUNT_PER_SEMESTER ? 'PAID'
          : paid >= REQUIRED_AMOUNT_PER_SEMESTER / 2 ? 'PARTIAL'
          : 'BELOW HALF';
        return { student_id: s.id, paid, status };
      });

      const paidCount    = studentRows.filter(r => r.status === 'PAID').length;
      const partialCount = studentRows.filter(r => r.status === 'PARTIAL').length;
      const belowCount   = studentRows.filter(r => r.status === 'BELOW HALF').length;

      const classStats = classes.map(cls => {
        const classStudents = students.filter((s: any) => s.class_id === cls.id);
        const classExpected = classStudents.length * REQUIRED_AMOUNT_PER_SEMESTER;
        const classCollected = payments
          .filter(p => classStudents.some((s: any) => s.id === p.student_id))
          .reduce((sum, p) => sum + Number(p.amount), 0);
        return {
          name: cls.name,
          students: classStudents.length,
          collected: classCollected,
          expected: classExpected,
          pct: classExpected > 0 ? (classCollected / classExpected) * 100 : 0,
        };
      }).sort((a, b) => b.pct - a.pct);

      const semesterStats = semesters.map(sem => {
        const semExpected  = totalStudents * REQUIRED_AMOUNT_PER_SEMESTER;
        const semCollected = payments
          .filter(p => p.semester_id === sem.id)
          .reduce((sum, p) => sum + Number(p.amount), 0);
        return {
          name: sem.name,
          students: totalStudents,
          collected: semCollected,
          expected: semExpected,
          pct: semExpected > 0 ? (semCollected / semExpected) * 100 : 0,
          isCurrent: sem.is_current,
        };
      });

      setStats({
        totalStudents, totalSemesters, totalCollected, totalExpected,
        totalUnpaid, overallPct, paidCount, partialCount, belowCount,
        totalPaymentRecords: payments.length,
        classStats, semesterStats,
      });
      setLoading(false);
    };

    fetchStats();
  }, []);

  const navCards = [
    { title: 'Record Payment', path: '/admin/payments', icon: CreditCard, color: 'bg-primary-700' },
    { title: 'Live Report', path: '/admin/reports', icon: FileBarChart, color: 'bg-indigo-600' },
    { title: 'Students', path: '/admin/students', icon: Users, color: 'bg-emerald-600' },
    { title: 'Classes', path: '/admin/classes', icon: BookOpen, color: 'bg-amber-500' },
    { title: 'Semesters', path: '/admin/semesters', icon: CalendarDays, color: 'bg-purple-600' },
  ];

  const getPctColor = (pct: number) =>
    pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500';
  const getPctText = (pct: number) =>
    pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-600';

  return (
    <div className="space-y-8">
      {/* Nav Cards */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Admin Dashboard</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {navCards.map((card) => (
            <Link key={card.path} to={card.path}
              className="block p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group">
              <div className={`w-10 h-10 ${card.color} text-white rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm`}>
                <card.icon className="w-5 h-5" />
              </div>
              <p className="font-semibold text-slate-700 text-sm">{card.title}</p>
            </Link>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading statistics...</div>
      ) : stats ? (
        <>
          {/* KPI Row */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-600" /> Overall Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-primary-700', bg: 'bg-primary-50 border-primary-200' },
                { label: 'Total Collected', value: formatCurrency(stats.totalCollected), icon: CreditCard, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                { label: 'Total Unpaid', value: formatCurrency(stats.totalUnpaid), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
                { label: 'Payment Records', value: stats.totalPaymentRecords, icon: Clock, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-5 ${card.bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="font-semibold text-slate-700">Overall Collection Progress</p>
                <p className="text-sm text-slate-400">Based on {formatCurrency(REQUIRED_AMOUNT_PER_SEMESTER)} per student per semester</p>
              </div>
              <span className={`text-2xl font-bold ${getPctText(stats.overallPct)}`}>
                {stats.overallPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
              <div className={`h-4 rounded-full transition-all ${getPctColor(stats.overallPct)}`}
                style={{ width: `${Math.min(stats.overallPct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-2">
              <span>Collected: <strong className="text-slate-600">{formatCurrency(stats.totalCollected)}</strong></span>
              <span>Total Unpaid: <strong className="text-red-600">{formatCurrency(stats.totalUnpaid)}</strong></span>
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-slate-500">Fully Paid</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{stats.paidCount}</p>
                <p className="text-xs text-slate-400">students</p>
              </div>
              <div className="text-center border-x border-slate-100">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-slate-500">Partial</span>
                </div>
                <p className="text-2xl font-bold text-amber-500">{stats.partialCount}</p>
                <p className="text-xs text-slate-400">students</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-slate-500">Below Half</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{stats.belowCount}</p>
                <p className="text-xs text-slate-400">students</p>
              </div>
            </div>
          </div>

          {/* Per-Semester Stats */}
          {stats.semesterStats.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-purple-600" /> Per-Semester Breakdown
              </h3>
              <div className="grid gap-4">
                {stats.semesterStats.map(sem => (
                  <div key={sem.name} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800">{sem.name}</p>
                          {sem.isCurrent && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">Current</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">{sem.students} students · Required: {formatCurrency(REQUIRED_AMOUNT_PER_SEMESTER)} each</p>
                      </div>
                      <span className={`text-lg font-bold ${getPctText(sem.pct)}`}>{sem.pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getPctColor(sem.pct)}`}
                        style={{ width: `${Math.min(sem.pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                      <span>Collected: <strong className="text-slate-600">{formatCurrency(sem.collected)}</strong></span>
                      <span>Total Unpaid: <strong className="text-red-600">{formatCurrency(Math.max(sem.expected - sem.collected, 0))}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-Class Stats */}
          {stats.classStats.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" /> Per-Class Breakdown
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {stats.classStats.map(cls => (
                  <div key={cls.name} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-slate-800">{cls.name}</p>
                        <p className="text-sm text-slate-400">{cls.students} students</p>
                      </div>
                      <span className={`text-lg font-bold ${getPctText(cls.pct)}`}>{cls.pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getPctColor(cls.pct)}`}
                        style={{ width: `${Math.min(cls.pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                      <span>Collected: <strong className="text-slate-600">{formatCurrency(cls.collected)}</strong></span>
                      <span>Total Unpaid: <strong className="text-red-600">{formatCurrency(Math.max(cls.expected - cls.collected, 0))}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
