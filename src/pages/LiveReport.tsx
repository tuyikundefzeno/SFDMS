import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Download, FileText, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REQUIRED_AMOUNT_PER_SEMESTER, formatCurrency } from '../lib/constants';
import { StudentAvatar } from './Students';
import { getStudentPhoto } from '../lib/studentPhotos';

interface ReportRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  class_name: string;
  semester_id: string;
  semester_name: string;
  required_amount: number;
  total_paid: number;
  percentage_paid: number;
  status: 'PAID' | 'PARTIAL' | 'BELOW HALF';
  photo_url?: string;
}

export const LiveReport = () => {
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  
  // Lightbox Modal for Photo Preview
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null);

  const fetchReportData = async () => {
    try {
      const [reportRes, studentsRes] = await Promise.all([
        supabase.from('student_semester_totals').select('*'),
        supabase.from('students').select('*'),
      ]);

      const reportData = reportRes.data || [];
      const studentsData = studentsRes.data || [];
      const photoMap = new Map(studentsData.map((s: any) => [s.id, s.photo_url]));

      const merged = reportData.map((r: any) => ({
        ...r,
        photo_url: getStudentPhoto(r.student_id, photoMap.get(r.student_id)),
      }));

      setData(merged as ReportRow[]);
    } catch (err) {
      console.warn('Error loading live report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
    supabase.from('classes').select('*').then(({ data }) => { if (data) setClasses(data); });
    supabase.from('semesters').select('*').then(({ data }) => {
      if (data) {
        setSemesters(data);
        const current = data.find((s: any) => s.is_current);
        if (current) setFilterSemester(current.name);
      }
    });

    const channel = supabase.channel('payments_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, () => {
        fetchReportData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Deduplicate per student
  const filtered = (() => {
    let rows = data.filter((row) => {
      if (filterClass && row.class_name !== filterClass) return false;
      if (filterSemester && row.semester_name !== filterSemester) return false;
      return true;
    });

    const map = new Map<string, ReportRow>();
    for (const r of rows) {
      if (!map.has(r.student_id)) {
        map.set(r.student_id, { ...r });
      } else {
        const existing = map.get(r.student_id)!;
        const newPaid = Number(existing.total_paid) + Number(r.total_paid);
        const req = REQUIRED_AMOUNT_PER_SEMESTER;
        const pct = (newPaid / req) * 100;
        const status = newPaid >= req ? 'PAID' : newPaid >= req / 2 ? 'PARTIAL' : 'BELOW HALF';
        
        map.set(r.student_id, {
          ...existing,
          total_paid: newPaid,
          percentage_paid: pct,
          status: status,
        });
      }
    }

    let result = Array.from(map.values());

    if (filterStatus) {
      result = result.filter(r => r.status === filterStatus);
    }

    return result;
  })();

  const getEffectiveRequired = (row: ReportRow) =>
    row.required_amount || REQUIRED_AMOUNT_PER_SEMESTER;

  const getEffectivePct = (row: ReportRow) => {
    const req = getEffectiveRequired(row);
    return req === 0 ? 100 : (row.total_paid / req) * 100;
  };

  const getStatusColor = (pct: number) => {
    if (pct < 50) return 'text-red-600 font-semibold';
    if (pct < 100) return 'text-amber-500 font-semibold';
    return 'text-emerald-600 font-semibold';
  };

  const getRowBg = (pct: number) => {
    if (pct < 50) return 'bg-red-50/60';
    if (pct < 100) return 'bg-amber-50/60';
    return 'bg-emerald-50/60';
  };

  const getBadgeStyle = (status: string) => {
    if (status === 'PAID') return 'bg-emerald-100 text-emerald-800';
    if (status === 'PARTIAL') return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  };

  const totalCollected = filtered.reduce((sum, r) => sum + Number(r.total_paid), 0);
  const totalExpected  = filtered.length * REQUIRED_AMOUNT_PER_SEMESTER;
  const totalUnpaid    = Math.max(totalExpected - totalCollected, 0);
  const overallPct     = totalExpected === 0 ? 0 : (totalCollected / totalExpected) * 100;

  // ── CSV Export ─────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Student Name', 'ID Number', 'Class', 'Semester', `Required (${REQUIRED_AMOUNT_PER_SEMESTER} RWF)`, 'Total Paid (RWF)', 'Total Unpaid (RWF)', '% Paid', 'Status'];
    const rows = filtered.map(r => {
      const pct = getEffectivePct(r);
      const req = getEffectiveRequired(r);
      const unpaid = Math.max(req - Number(r.total_paid), 0);
      return [
        `"${r.full_name}"`,
        r.admission_number,
        `"${r.class_name}"`,
        `"${r.semester_name}"`,
        REQUIRED_AMOUNT_PER_SEMESTER,
        r.total_paid,
        unpaid,
        `${pct.toFixed(1)}%`,
        r.status,
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ── PDF Export ─────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('School Feeding Contribution Report', 14, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const subtitle = [
      filterSemester ? `Semester: ${filterSemester}` : 'Current Semester',
      filterClass ? `Class: ${filterClass}` : 'All Classes',
      `Required per student: RWF ${REQUIRED_AMOUNT_PER_SEMESTER.toLocaleString()}`,
      `Generated: ${new Date().toLocaleDateString('en-RW')}`,
    ].join('   |   ');
    doc.text(subtitle, 14, 18);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138); doc.text('Legend:', 14, 28);
    doc.setTextColor(220, 38, 38);  doc.text('■ BELOW HALF  (< 50% paid)', 30, 28);
    doc.setTextColor(217, 119, 6);  doc.text('■ PARTIAL  (50–99% paid)', 95, 28);
    doc.setTextColor(5, 150, 105);  doc.text('■ PAID  (100% paid)', 155, 28);

    const paidCount    = filtered.filter(r => r.status === 'PAID').length;
    const partialCount = filtered.filter(r => r.status === 'PARTIAL').length;
    const belowCount   = filtered.filter(r => r.status === 'BELOW HALF').length;
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Students: ${filtered.length}   |   Paid: ${paidCount}   |   Partial: ${partialCount}   |   Below Half: ${belowCount}   |   Total Unpaid: RWF ${totalUnpaid.toLocaleString()}`,
      14, 34
    );

    autoTable(doc, {
      startY: 38,
      head: [['Student Name', 'ID Number', 'Class', 'Semester', `Required`, 'Total Paid', 'Total Unpaid', '% Paid', 'Status']],
      body: filtered.map(r => {
        const pct = getEffectivePct(r);
        const req = getEffectiveRequired(r);
        const unpaid = Math.max(req - Number(r.total_paid), 0);
        return [
          r.full_name,
          r.admission_number,
          r.class_name,
          r.semester_name,
          `RWF ${REQUIRED_AMOUNT_PER_SEMESTER.toLocaleString()}`,
          `RWF ${Number(r.total_paid).toLocaleString()}`,
          unpaid <= 0 ? '✓ Cleared' : `RWF ${unpaid.toLocaleString()}`,
          `${pct.toFixed(1)}%`,
          r.status,
        ];
      }),
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' },
        7: { halign: 'right', fontStyle: 'bold' },
        8: { halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}  —  School Feeding Management System`, 14, doc.internal.pageSize.getHeight() - 5);
    }

    doc.save(`contribution_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return <div className="flex justify-center py-12 text-slate-500">Loading report...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Live Contribution Report</h2>
          <p className="text-slate-500 mt-1">
            Required per student per semester:{' '}
            <span className="font-bold text-primary-700">{formatCurrency(REQUIRED_AMOUNT_PER_SEMESTER)}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm font-medium text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={exportPDF}
            className="flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white px-4 py-2 rounded-lg shadow-sm font-medium text-sm">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Class</label>
          <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Semester</label>
          <select value={filterSemester} onChange={e => setFilterSemester(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">All Semesters</option>
            {semesters.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">All Statuses</option>
            <option value="PAID">PAID</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="BELOW HALF">BELOW HALF</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => { setFilterClass(''); setFilterSemester(''); setFilterStatus(''); }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-primary-700 font-medium">
            Clear filters
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-3xl font-bold text-primary-800">{filtered.length}</p>
          <p className="text-sm text-slate-500 mt-1">Total Active Students</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-4">
          <p className="text-3xl font-bold text-emerald-700">{filtered.filter(r => r.status === 'PAID').length}</p>
          <p className="text-sm text-emerald-600 mt-1">Fully Paid</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4">
          <p className="text-3xl font-bold text-amber-700">{filtered.filter(r => r.status === 'PARTIAL').length}</p>
          <p className="text-sm text-amber-600 mt-1">Partial</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4">
          <p className="text-3xl font-bold text-red-700">{filtered.filter(r => r.status === 'BELOW HALF').length}</p>
          <p className="text-sm text-red-600 mt-1">Below Half</p>
        </div>
      </div>

      {/* Overall collection progress */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-700">Overall Collection Progress</span>
          <span className="text-sm font-bold text-primary-700">{overallPct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${overallPct >= 100 ? 'bg-emerald-500' : overallPct >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
            style={{ width: `${Math.min(overallPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Collected: <strong className="text-slate-700">{formatCurrency(totalCollected)}</strong></span>
          <span>Total Unpaid: <strong className="text-red-600">{formatCurrency(totalUnpaid)}</strong></span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="px-4 py-4 font-semibold">Photo</th>
                <th className="px-6 py-4 font-semibold">Student Name</th>
                <th className="px-6 py-4 font-semibold">ID Number</th>
                <th className="px-6 py-4 font-semibold">Class</th>
                <th className="px-6 py-4 font-semibold">Semester</th>
                <th className="px-6 py-4 font-semibold text-right">Required</th>
                <th className="px-6 py-4 font-semibold text-right">Total Paid</th>
                <th className="px-6 py-4 font-semibold text-right">Total Unpaid</th>
                <th className="px-6 py-4 font-semibold text-right">% Paid</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-slate-400">
                    No data yet. Add semesters, students and record payments to see the report.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const pct = getEffectivePct(row);
                  const req = getEffectiveRequired(row);
                  const unpaid = Math.max(req - Number(row.total_paid), 0);
                  return (
                    <tr key={row.student_id} className={`transition-colors hover:brightness-95 ${getRowBg(pct)}`}>
                      <td className="px-4 py-3">
                        <StudentAvatar
                          studentId={row.student_id}
                          photoUrl={row.photo_url}
                          name={row.full_name}
                          size="w-10 h-10"
                          onClick={() => {
                            const p = getStudentPhoto(row.student_id, row.photo_url);
                            if (p) setPreviewPhoto({ url: p, name: row.full_name });
                          }}
                        />
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">{row.full_name}</td>
                      <td className="px-6 py-4 text-slate-500 text-sm font-mono">{row.admission_number}</td>
                      <td className="px-6 py-4 text-slate-600">{row.class_name}</td>
                      <td className="px-6 py-4 text-slate-600">{row.semester_name}</td>
                      <td className="px-6 py-4 text-right tabular-nums text-slate-600">
                        {formatCurrency(req)}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-800">
                        {formatCurrency(Number(row.total_paid))}
                      </td>
                      <td className={`px-6 py-4 text-right tabular-nums font-semibold ${unpaid <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {unpaid <= 0 ? '✓ Cleared' : formatCurrency(unpaid)}
                      </td>
                      <td className={`px-6 py-4 text-right tabular-nums ${getStatusColor(pct)}`}>
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${getBadgeStyle(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo Lightbox Popup */}
      {previewPhoto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-md" onClick={() => setPreviewPhoto(null)}>
          <div className="relative bg-white rounded-2xl p-4 max-w-sm w-full mx-4 text-center shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-800 text-sm">{previewPhoto.name}</h4>
              <button onClick={() => setPreviewPhoto(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <img src={previewPhoto.url} alt={previewPhoto.name} className="w-full h-72 object-cover rounded-xl shadow-inner border border-slate-200" />
            <p className="text-xs text-slate-400">Student Profile Photo</p>
          </div>
        </div>
      )}
    </div>
  );
};
