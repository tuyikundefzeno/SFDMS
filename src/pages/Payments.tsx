import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { REQUIRED_AMOUNT_PER_SEMESTER, formatCurrency } from '../lib/constants';
import { Plus, X, Search, Receipt, Info } from 'lucide-react';
import { StudentAvatar } from './Students';
import { getStudentPhoto } from '../lib/studentPhotos';

interface GroupedStudentPayment {
  student_id: string;
  full_name: string;
  admission_number: string;
  class_name: string;
  semester_id: string;
  semester_name: string;
  total_paid: number;
  unpaid: number;
  photo_url?: string;
  history: { id: string; amount: number; paid_at: string; note: string }[];
}

export const Payments = () => {
  const [semesters, setSemesters] = useState<any[]>([]);
  const [studentPaymentSummaries, setStudentPaymentSummaries] = useState<GroupedStudentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Lightbox Photo Preview Modal
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null);

  const [form, setForm] = useState({
    student_id: '',
    student_name: '',
    student_photo: '',
    semester_id: '',
    amount: '',
    note: '',
  });

  const [previouslyPaid, setPreviouslyPaid] = useState<number>(0);

  const fetchPaymentsData = async () => {
    const [studentsRes, paymentsRes, semestersRes] = await Promise.all([
      supabase.from('students').select('*, classes(name)').eq('status', 'active'),
      supabase.from('payments').select('*, students(full_name), semesters(name)').order('paid_at', { ascending: false }),
      supabase.from('semesters').select('*').order('start_date', { ascending: false }),
    ]);

    const students  = studentsRes.data  || [];
    const payments  = paymentsRes.data  || [];
    const sems      = semestersRes.data || [];

    if (sems.length > 0) setSemesters(sems);
    const activeSem = sems.find((s: any) => s.is_current) || sems[0];

    if (activeSem) {
      const grouped: GroupedStudentPayment[] = students.map(student => {
        const studentPayments = payments.filter(p => p.student_id === student.id && p.semester_id === activeSem.id);
        const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const unpaid = Math.max(REQUIRED_AMOUNT_PER_SEMESTER - totalPaid, 0);

        return {
          student_id: student.id,
          full_name: student.full_name,
          admission_number: student.admission_number,
          class_name: student.classes?.name || '—',
          semester_id: activeSem.id,
          semester_name: activeSem.name,
          total_paid: totalPaid,
          unpaid: unpaid,
          photo_url: student.photo_url || null,
          history: studentPayments.map(p => ({
            id: p.id,
            amount: Number(p.amount),
            paid_at: p.paid_at,
            note: p.note,
          })),
        };
      });

      setStudentPaymentSummaries(grouped);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPaymentsData();
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('students')
      .select('*, classes(name)')
      .ilike('full_name', `%${query}%`)
      .eq('status', 'active')
      .limit(8);
    if (data) setSearchResults(data);
  };

  const fetchStudentPreviousPayments = async (studentId: string, semesterId: string) => {
    if (!studentId || !semesterId) return;
    const { data } = await supabase
      .from('payments')
      .select('amount')
      .eq('student_id', studentId)
      .eq('semester_id', semesterId);
    
    const total = data ? data.reduce((sum, p) => sum + Number(p.amount), 0) : 0;
    setPreviouslyPaid(total);
  };

  const selectStudent = (student: any) => {
    const current = semesters.find(s => s.is_current) || semesters[0];
    const semId = current ? current.id : '';
    setForm(f => ({
      ...f,
      student_id: student.id,
      student_name: student.full_name,
      student_photo: student.photo_url || '',
      semester_id: semId,
    }));
    setSearchQuery(student.full_name);
    setSearchResults([]);

    if (semId) {
      fetchStudentPreviousPayments(student.id, semId);
    }
  };

  const selectStudentFromRow = (summary: GroupedStudentPayment) => {
    setForm({
      student_id: summary.student_id,
      student_name: summary.full_name,
      student_photo: summary.photo_url || '',
      semester_id: summary.semester_id,
      amount: '',
      note: '',
    });
    setSearchQuery(summary.full_name);
    setPreviouslyPaid(summary.total_paid);
    setShowModal(true);
  };

  const handleDeletePaymentEntry = async (entryId: string, amount: number) => {
    if (!window.confirm(`Are you sure you want to remove payment entry of RWF ${amount.toLocaleString()}?`)) return;

    const { error } = await supabase.from('payments').delete().eq('id', entryId);
    if (error) {
      setMessage(`Error deleting payment: ${error.message}`);
    } else {
      setMessage(`Payment entry removed.`);
      fetchPaymentsData();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.student_id || !form.semester_id || !form.amount) return;

    const newAmountNum = parseFloat(form.amount);
    if (isNaN(newAmountNum) || newAmountNum <= 0) return;

    setSubmitting(true);
    setMessage('');

    const { error } = await supabase.from('payments').insert({
      student_id: form.student_id,
      semester_id: form.semester_id,
      amount: newAmountNum,
      recorded_by: '00000000-0000-0000-0000-000000000000',
      note: form.note,
    });

    setSubmitting(false);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      const newTotal = previouslyPaid + newAmountNum;
      setMessage(`Payment recorded! ${form.student_name} total paid updated to ${formatCurrency(newTotal)}.`);
      setForm({ student_id: '', student_name: '', student_photo: '', semester_id: '', amount: '', note: '' });
      setSearchQuery('');
      setPreviouslyPaid(0);
      setShowModal(false);
      fetchPaymentsData();
    }
  };

  const openModal = () => {
    setForm({ student_id: '', student_name: '', student_photo: '', semester_id: '', amount: '', note: '' });
    setSearchQuery('');
    setSearchResults([]);
    setPreviouslyPaid(0);
    setMessage('');
    setShowModal(true);
  };

  const newAmountNum = parseFloat(form.amount) || 0;
  const newTotalPaid = previouslyPaid + newAmountNum;
  const remainingUnpaid = Math.max(REQUIRED_AMOUNT_PER_SEMESTER - previouslyPaid, 0);
  const newRemainingUnpaid = Math.max(REQUIRED_AMOUNT_PER_SEMESTER - newTotalPaid, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Payments</h2>
          <p className="text-slate-500 mt-1">Record contributions per student with easy photo view.</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center space-x-2 bg-primary-700 text-white px-4 py-2 rounded-lg hover:bg-primary-800 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg font-medium ${message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      {/* Student Payments Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-slate-800">Student Contributions (Current Semester)</h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">1 Row Per Student</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="px-4 py-4 font-semibold">Photo</th>
                <th className="px-6 py-4 font-semibold">Student Name</th>
                <th className="px-6 py-4 font-semibold">ID Number</th>
                <th className="px-6 py-4 font-semibold">Class</th>
                <th className="px-6 py-4 font-semibold text-right">Total Amount Paid</th>
                <th className="px-6 py-4 font-semibold text-right">Total Unpaid</th>
                <th className="px-6 py-4 font-semibold">Payment History (Additions)</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">Loading...</td></tr>
              ) : studentPaymentSummaries.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No active students found. Add students first to record payments.</td></tr>
              ) : (
                studentPaymentSummaries.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      {s.photo_url ? (
                        <img
                          src={s.photo_url}
                          alt={s.full_name}
                          onClick={() => setPreviewPhoto({ url: s.photo_url!, name: s.full_name })}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                          title="Click to view full photo"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{s.full_name}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm font-mono">{s.admission_number}</td>
                    <td className="px-6 py-4 text-slate-600">{s.class_name}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800 tabular-nums">
                      {formatCurrency(s.total_paid)}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold tabular-nums ${s.unpaid <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {s.unpaid <= 0 ? '✓ Cleared' : formatCurrency(s.unpaid)}
                    </td>
                    <td className="px-6 py-4">
                      {s.history.length === 0 ? (
                        <span className="text-slate-400 text-xs italic">No payments yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {s.history.map((h) => (
                            <span
                              key={h.id}
                              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold"
                              title={`Paid at ${new Date(h.paid_at).toLocaleString()}${h.note ? ' - Note: ' + h.note : ''}`}
                            >
                              +{formatCurrency(h.amount)}
                              <button
                                onClick={() => handleDeletePaymentEntry(h.id, h.amount)}
                                className="text-emerald-400 hover:text-red-600 ml-1 text-xs"
                                title="Remove this entry"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => selectStudentFromRow(s)}
                        className="px-3 py-1.5 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Payment
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">Record Payment</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Student Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">Search Active Student</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Type student name..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudent(s)}
                        className="w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          {s.photo_url ? (
                            <img src={s.photo_url} alt={s.full_name} className="w-8 h-8 rounded-full object-cover border" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 border flex items-center justify-center text-slate-400">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                          <span className="font-medium text-slate-800 group-hover:text-primary-700">{s.full_name}</span>
                        </div>
                        <span className="text-sm text-slate-400">{s.classes?.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Student badge & history info */}
              {form.student_id && (
                <div className="space-y-3">
                  <div className="bg-primary-50 text-primary-700 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 border border-primary-200">
                    {form.student_photo ? (
                      <img src={form.student_photo} alt={form.student_name} className="w-10 h-10 rounded-full object-cover border-2 border-primary-600" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-primary-600">Selected Student:</p>
                      <p className="font-bold text-slate-900 text-base">{form.student_name}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium">Previously Paid</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(previouslyPaid)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Required Fee</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(REQUIRED_AMOUNT_PER_SEMESTER)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Total Unpaid</p>
                      <p className={`text-sm font-bold mt-0.5 ${remainingUnpaid <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {remainingUnpaid <= 0 ? '✓ Cleared' : formatCurrency(remainingUnpaid)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Semester */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                {semesters.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                    ⚠️ No semesters found. Please add a semester first.
                  </p>
                ) : (
                  <select
                    required
                    value={form.semester_id}
                    onChange={(e) => setForm(f => ({ ...f, semester_id: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    {semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.is_current ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Amount to Add (RWF)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="e.g. 5000"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                />
              </div>

              {/* Live Addition Calculation Preview */}
              {form.student_id && newAmountNum > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-emerald-600" />
                    <span>New Total Paid: <strong>{formatCurrency(previouslyPaid)}</strong> + <strong>{formatCurrency(newAmountNum)}</strong> = <strong className="text-emerald-800">{formatCurrency(newTotalPaid)}</strong></span>
                  </div>
                  <span className="font-bold text-emerald-800">
                    {newRemainingUnpaid <= 0 ? '✓ Fully Paid' : `Unpaid: ${formatCurrency(newRemainingUnpaid)}`}
                  </span>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Cash payment, partial payment"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-600 font-medium">Cancel</button>
                <button
                  type="submit"
                  disabled={submitting || !form.student_id || !form.semester_id || newAmountNum <= 0 || semesters.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {submitting ? 'Saving...' : 'Add Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
