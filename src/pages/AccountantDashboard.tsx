import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { REQUIRED_AMOUNT_PER_SEMESTER, formatCurrency } from '../lib/constants';
import { Search, Plus, Info } from 'lucide-react';

export const AccountantDashboard = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [currentSemester, setCurrentSemester] = useState<any>(null);
  
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [previouslyPaid, setPreviouslyPaid] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Fetch current semester
    const fetchSemester = async () => {
      const { data } = await supabase
        .from('semesters')
        .select('*')
        .eq('is_current', true)
        .single();
      if (data) setCurrentSemester(data);
    };
    fetchSemester();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Search ONLY ACTIVE students
    const { data, error } = await supabase
      .from('students')
      .select('*, classes(name)')
      .ilike('full_name', `%${searchQuery}%`)
      .eq('status', 'active')
      .limit(10);
      
    if (!error && data) {
      setStudents(data);
    }
  };

  const handleSelectStudent = async (student: any) => {
    setSelectedStudent(student);
    setAmount('');
    setNote('');

    // Fetch total amount previously paid by this active student for current semester
    if (currentSemester) {
      const { data } = await supabase
        .from('payments')
        .select('amount')
        .eq('student_id', student.id)
        .eq('semester_id', currentSemester.id);
      
      const total = data ? data.reduce((sum, p) => sum + Number(p.amount), 0) : 0;
      setPreviouslyPaid(total);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setMessage('Sign in before recording a payment.');
      return;
    }
    if (!selectedStudent || !currentSemester || !amount) return;

    const newAmountNum = parseFloat(amount);
    if (isNaN(newAmountNum) || newAmountNum <= 0) return;

    setIsSubmitting(true);
    setMessage('');

    const { error } = await supabase.from('payments').insert({
      student_id: selectedStudent.id,
      semester_id: currentSemester.id,
      amount: newAmountNum,
      recorded_by: user.id,
      note: note,
    });

    setIsSubmitting(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      const updatedTotal = previouslyPaid + newAmountNum;
      setMessage(`Payment of ${formatCurrency(newAmountNum)} recorded! New total paid by ${selectedStudent.full_name}: ${formatCurrency(updatedTotal)}.`);
      setAmount('');
      setNote('');
      setPreviouslyPaid(updatedTotal);
    }
  };

  const newAmountNum = parseFloat(amount) || 0;
  const newTotalPaid = previouslyPaid + newAmountNum;
  const remainingUnpaid = Math.max(REQUIRED_AMOUNT_PER_SEMESTER - previouslyPaid, 0);
  const newRemainingUnpaid = Math.max(REQUIRED_AMOUNT_PER_SEMESTER - newTotalPaid, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Record Payment</h2>
        <p className="text-slate-500 mt-1">Search for an active student to add to their contribution history.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg font-medium ${message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      {/* Search Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active student by name..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-primary-900 hover:bg-primary-800 text-white font-medium rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        {students.length > 0 && (
          <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100 pt-4">
            {students.map(student => (
              <div key={student.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{student.full_name}</p>
                  <p className="text-sm text-slate-500">{student.classes?.name} - ID: {student.admission_number}</p>
                </div>
                <button
                  onClick={() => handleSelectStudent(student)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedStudent?.id === student.id ? 'bg-primary-700 text-white' : 'text-primary-700 bg-primary-50 hover:bg-primary-100'}`}
                >
                  {selectedStudent?.id === student.id ? 'Selected' : 'Select Student'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Student Payment Card */}
      {selectedStudent && currentSemester && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Recording Payment for <span className="text-primary-700">{selectedStudent.full_name}</span>
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">ID: {selectedStudent.admission_number} · Class: {selectedStudent.classes?.name || '—'}</p>
            </div>
            <span className="bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-xs font-bold">
              {currentSemester.name}
            </span>
          </div>

          {/* Student Contribution History summary box */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs font-semibold text-slate-500">Previously Paid</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatCurrency(previouslyPaid)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Required Fee</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{formatCurrency(REQUIRED_AMOUNT_PER_SEMESTER)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Current Total Unpaid</p>
              <p className={`text-xl font-bold mt-0.5 ${remainingUnpaid <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {remainingUnpaid <= 0 ? '✓ Fully Cleared' : formatCurrency(remainingUnpaid)}
              </p>
            </div>
          </div>

          <form onSubmit={handlePaymentSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                New Payment Amount to Add (RWF)
              </label>
              <input
                type="number"
                required
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. 5000"
              />
            </div>

            {/* Live Addition Calculation Preview */}
            {newAmountNum > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-emerald-700 font-medium">New Total After This Payment:</p>
                    <p className="text-sm text-emerald-900 font-bold">
                      {formatCurrency(previouslyPaid)} (previous) + {formatCurrency(newAmountNum)} (new) = {formatCurrency(newTotalPaid)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-700 font-medium">Updated Unpaid:</p>
                  <p className="text-sm font-bold text-emerald-900">
                    {newRemainingUnpaid <= 0 ? '✓ 100% Fully Paid' : formatCurrency(newRemainingUnpaid)}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. Cash payment received by accountant"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="px-6 py-2.5 text-slate-600 hover:text-slate-800 mr-4 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || newAmountNum <= 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {isSubmitting ? 'Recording...' : `Add ${formatCurrency(newAmountNum || 0)} Payment`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
