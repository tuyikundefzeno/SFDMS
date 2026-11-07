import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  FileDown,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../lib/constants';
import { supabase } from '../lib/supabase';

type Language = 'English' | 'Kinyarwanda' | 'French';
type RiskLevel = 'Low' | 'Medium' | 'High';

interface RiskStudent {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  amountPaid: number;
  amountRemaining: number;
  risk: RiskLevel;
}

interface PaymentIssue {
  id: string;
  studentName: string;
  className: string;
  amount: number;
  paidAt: string | null;
  reason: string;
  checked: boolean;
}

interface LowPaymentStudent {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  className: string;
  amountPaid: number;
  amountRequired: number;
  amountRemaining: number;
  percentagePaid: number;
}

interface InsightOverview {
  semester: { id: string; name: string; start_date: string; end_date: string };
  collected: number;
  expected: number;
  unpaid: number;
  percentageCollected: number;
  classes: { id: string; name: string; collected: number; expected: number }[];
  highestClass: string | null;
  lowestClass: string | null;
  risks: RiskStudent[];
  lowPaymentLimit: number;
  lowPaymentStudents: LowPaymentStudent[];
  prediction: {
    collected: number;
    predicted: number;
    expected: number;
    explanation: string;
    historicalSemesters: number;
  };
  issues: PaymentIssue[];
  summary: string | null;
  empty?: boolean;
  error?: string;
}

interface ChatReply {
  answer: string;
  rows: { student: string; class: string; amountPaid: number; amountRemaining: number }[];
}

const languages: Language[] = ['English', 'Kinyarwanda', 'French'];
const riskColor: Record<RiskLevel, string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Medium: 'bg-amber-100 text-amber-800',
  High: 'bg-red-100 text-red-800',
};

const getApiError = async (response: Response) => {
  const result = await response.json().catch(() => null) as { error?: string } | null;
  return result?.error ?? 'AI is not available now, please try again.';
};

const callAi = async <T,>(payload: Record<string, unknown>): Promise<T> => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.access_token) throw new Error('Please sign in again to use AI Insights.');

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(import.meta.env.DEV
      ? 'The AI API is not running. Start the app with `vercel dev`; `npm run dev` does not run API functions.'
      : 'The AI API returned an unexpected response. Check that the Vercel API function deployed successfully.');
  }
  if (!response.ok) throw new Error(await getApiError(response));
  return response.json() as Promise<T>;
};

const SummarySkeleton = () => (
  <div className="space-y-3 animate-pulse" aria-label="Loading summary">
    <div className="h-4 w-full rounded bg-slate-200" />
    <div className="h-4 w-11/12 rounded bg-slate-200" />
    <div className="h-4 w-4/5 rounded bg-slate-200" />
  </div>
);

export const AIInsights = () => {
  const [language, setLanguage] = useState<Language>('English');
  const [overview, setOverview] = useState<InsightOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedLowPaymentClass, setSelectedLowPaymentClass] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');
  const [reminderTone, setReminderTone] = useState<'Friendly' | 'Formal'>('Friendly');
  const [deadline, setDeadline] = useState('');
  const [reminderStudentId, setReminderStudentId] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [reminderLoading, setReminderLoading] = useState(false);
  const [copiedReminder, setCopiedReminder] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatReply, setChatReply] = useState<ChatReply | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [checkingId, setCheckingId] = useState('');
  const [issueError, setIssueError] = useState('');

  const loadOverview = useCallback(async (nextLanguage: Language, refresh = false) => {
    setPageError('');
    if (refresh) setSummaryLoading(true);
    try {
      const result = await callAi<InsightOverview>({ action: 'overview', language: nextLanguage });
      setOverview(result);
      setDeadline(current => current || result.semester?.end_date || '');
      if (result.error) setPageError(result.error);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'AI is not available now, please try again.');
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(language);
  }, [language, loadOverview]);

  const filteredRisks = useMemo(() =>
    (overview?.risks ?? []).filter(student =>
      (selectedClass === 'all' || student.classId === selectedClass)
      && (selectedRisk === 'all' || student.risk === selectedRisk),
    ), [overview?.risks, selectedClass, selectedRisk]);

  const lowPaymentStudents = useMemo(() =>
    (overview?.lowPaymentStudents ?? []).filter(student =>
      selectedLowPaymentClass === 'all' || student.classId === selectedLowPaymentClass,
    ), [overview?.lowPaymentStudents, selectedLowPaymentClass]);

  const exportStudentFollowUpPdf = (student: LowPaymentStudent) => {
    if (!overview) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedDate = new Date().toLocaleDateString('en-RW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    doc.setProperties({
      title: `Contribution Follow-Up - ${student.studentName}`,
      subject: 'Individual student contribution follow-up',
      creator: 'School Feeding Management System',
    });
    doc.setFillColor(6, 78, 59);
    doc.rect(0, 0, pageWidth, 48, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 48, pageWidth, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('Student Contribution Follow-Up', 18, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Parent / guardian meeting record', 18, 30);
    doc.setFontSize(9);
    doc.text(`Generated ${generatedDate}`, 18, 39);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(student.studentName, 18, 69);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Admission number: ${student.admissionNumber}`, 18, 78);
    doc.text(`Class: ${student.className}`, 18, 85);
    doc.text(`Semester: ${overview.semester.name}`, 18, 92);

    doc.setFillColor(240, 253, 250);
    doc.roundedRect(18, 104, pageWidth - 36, 57, 4, 4, 'F');
    doc.setTextColor(6, 78, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SEMESTER CONTRIBUTION SUMMARY', 26, 116);

    doc.setDrawColor(204, 251, 241);
    doc.line(26, 122, pageWidth - 26, 122);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Contribution recorded', 26, 134);
    doc.text('Semester fee', 91, 134);
    doc.text('Balance remaining', 153, 134);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(180, 83, 9);
    doc.text(formatCurrency(student.amountPaid), 26, 145);
    doc.setTextColor(30, 41, 59);
    doc.text(formatCurrency(student.amountRequired), 91, 145);
    doc.setTextColor(185, 28, 28);
    doc.text(formatCurrency(student.amountRemaining), 153, 145);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Meeting request', 18, 181);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const message = doc.splitTextToSize(
      'Please visit the school with your parent or guardian to review this semester’s school-feeding contribution and discuss any questions about the recorded balance.',
      pageWidth - 36,
    );
    doc.text(message, 18, 190, { lineHeightFactor: 1.6 });

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(18, 215, pageWidth - 36, 21, 3, 3, 'F');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(9);
    doc.text(
      'This notice is based on recorded payments. Please contact the school if a payment is missing or incorrect.',
      24,
      228,
    );

    const signatureY = Math.min(258, pageHeight - 33);
    doc.setDrawColor(148, 163, 184);
    doc.line(18, signatureY, 88, signatureY);
    doc.line(119, signatureY, pageWidth - 18, signatureY);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text('Parent / guardian signature and date', 18, signatureY + 6);
    doc.text('School representative and date', 119, signatureY + 6);

    doc.setDrawColor(226, 232, 240);
    doc.line(18, pageHeight - 17, pageWidth - 18, pageHeight - 17);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text('School Feeding Management System | Please handle student information confidentially', 18, pageHeight - 11);

    const safeName = student.studentName
      .normalize('NFKD')
      .replace(/[^\w -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || student.studentId;
    doc.save(`contribution-follow-up-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportLowPaymentPdf = () => {
    if (!overview || lowPaymentStudents.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedDate = new Date().toLocaleDateString('en-RW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const className = selectedLowPaymentClass === 'all'
      ? 'All classes'
      : overview.classes.find(item => item.id === selectedLowPaymentClass)?.name ?? 'Selected class';
    const totalPaid = lowPaymentStudents.reduce((total, student) => total + student.amountPaid, 0);
    const totalRemaining = lowPaymentStudents.reduce((total, student) => total + student.amountRemaining, 0);

    doc.setProperties({
      title: `Low Payment Follow-Up - ${overview.semester.name}`,
      subject: 'Student contribution follow-up list',
      creator: 'School Feeding Management System',
    });
    doc.setFillColor(6, 78, 59);
    doc.rect(0, 0, pageWidth, 34, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 34, pageWidth, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Student Contribution Follow-Up', 14, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Supportive parent/guardian meeting list', 14, 23);
    doc.setFontSize(9);
    doc.text(`Generated ${generatedDate}`, pageWidth - 14, 23, { align: 'right' });

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Semester: ${overview.semester.name}`, 14, 47);
    doc.text(`Class: ${className}`, pageWidth / 2, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Students with a payment above RWF 0 and up to RWF ${overview.lowPaymentLimit.toLocaleString()} of their semester fee.`,
      14,
      54,
    );
    doc.text(
      'Please confirm records and invite a parent/guardian to discuss contribution support.',
      14,
      60,
    );

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Student name', 'Admission no.', 'Class', 'Paid', 'Semester fee', 'Balance', 'Paid %']],
      body: lowPaymentStudents.map((student, index) => [
        String(index + 1),
        student.studentName,
        student.admissionNumber,
        student.className,
        formatCurrency(student.amountPaid),
        formatCurrency(student.amountRequired),
        formatCurrency(student.amountRemaining),
        `${student.percentagePaid.toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      foot: [[
        '',
        '',
        '',
        `Totals (${lowPaymentStudents.length})`,
        formatCurrency(totalPaid),
        '',
        formatCurrency(totalRemaining),
        '',
      ]],
      showFoot: 'lastPage',
      footStyles: { fillColor: [236, 253, 245], textColor: [6, 78, 59], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      bodyStyles: { textColor: [51, 65, 85], fontSize: 8.5, cellPadding: 3.2 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
        7: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('School Feeding Management System | Verify payment records before follow-up', 14, pageHeight - 7);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }

    doc.save(`low-payment-follow-up-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const writeReminder = async (student: RiskStudent) => {
    setReminderStudentId(student.studentId);
    setReminderText('');
    setCopiedReminder(false);
    setReminderLoading(true);
    setPageError('');
    try {
      const result = await callAi<{ message: string }>({
        action: 'reminder',
        studentId: student.studentId,
        language,
        tone: reminderTone,
        deadline,
      });
      setReminderText(result.message);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'AI is not available now, please try again.');
    } finally {
      setReminderLoading(false);
    }
  };

  const copyReminder = async () => {
    try {
      await navigator.clipboard.writeText(reminderText);
      setCopiedReminder(true);
    } catch {
      setPageError('Could not copy the reminder. Please select and copy it manually.');
    }
  };

  const askQuestion = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatQuestion.trim()) return;
    setChatLoading(true);
    setChatError('');
    setChatReply(null);
    try {
      const result = await callAi<ChatReply>({
        action: 'chat',
        question: chatQuestion.trim(),
        language,
      });
      setChatReply(result);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'AI is not available now, please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  const markChecked = async (issueId: string) => {
    setCheckingId(issueId);
    setIssueError('');
    try {
      await callAi<{ ok: boolean }>({ action: 'mark_checked', paymentId: issueId });
      setCheckedIds(ids => [...ids, issueId]);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : 'Could not mark this record as checked.');
    } finally {
      setCheckingId('');
    }
  };

  const issues = (overview?.issues ?? []).map(issue =>
    checkedIds.includes(issue.id) ? { ...issue, checked: true } : issue,
  );
  const openIssues = issues.filter(issue => !issue.checked);
  const maxChartValue = Math.max(overview?.prediction.expected ?? 0, overview?.prediction.predicted ?? 0, 1);
  const hasStudents = Boolean(overview?.risks.length || overview?.classes.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> Helpful school data, made clearer
          </div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">AI Insights</h1>
          <p className="mt-1 text-sm text-slate-500">
            {overview?.semester?.name ? `Current semester: ${overview.semester.name}` : 'Understand payments and spot what needs attention.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          Language
          <select
            value={language}
            onChange={event => {
              setPageError('');
              setLoading(true);
              setLanguage(event.target.value as Language);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            {languages.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </header>

      <div role="note" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertCircle className="h-4 w-4 shrink-0" />
        AI gives suggestions. Please check before you act.
      </div>

      {pageError && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{pageError}</span>
          <button onClick={() => void loadOverview(language, true)} className="shrink-0 font-semibold underline">Try again</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading school insights…</div>
      ) : overview?.empty ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Bot className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">No semester yet</h2>
          <p className="mt-1 text-sm text-slate-500">{overview.error}</p>
        </div>
      ) : !hasStudents ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Bot className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">No students yet</h2>
          <p className="mt-1 text-sm text-slate-500">Add students to see insights.</p>
        </div>
      ) : overview && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  <Sparkles className="h-5 w-5 text-indigo-600" /> AI summary
                </h2>
                <p className="mt-1 text-xs text-slate-500">A simple snapshot of the current semester.</p>
              </div>
              <button
                onClick={() => {
                  setPageError('');
                  void loadOverview(language, true);
                }}
                disabled={summaryLoading}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${summaryLoading ? 'animate-spin' : ''}`} />
                Refresh summary
              </button>
            </div>
            <div className="mt-5 min-h-16 rounded-xl bg-indigo-50/70 p-4 text-sm leading-7 text-slate-700">
              {summaryLoading ? <SummarySkeleton /> : overview.summary
                ?? 'AI summary is unavailable. Check the setup message above, then try again.'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Total collected', overview.collected],
                ['Total unpaid', overview.unpaid],
                ['Collection progress', overview.percentageCollected, true],
                ['Students at risk', overview.risks.length],
              ].map(([label, value, percent]) => (
                <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-base font-bold text-slate-800">
                    {percent ? `${Number(value).toFixed(1)}%` : label === 'Students at risk' ? value : formatCurrency(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="low-payment-title" className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-amber-50 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Payment follow-up
                  </div>
                  <h2 id="low-payment-title" className="text-lg font-bold text-slate-900">
                    Parent/guardian follow-up list
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Students who have paid more than RWF 0 and no more than {formatCurrency(overview.lowPaymentLimit)}
                    {' '}toward their current-semester fee, based on recorded payments.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="text-xs font-medium text-slate-500">
                    Filter by class
                    <select
                      value={selectedLowPaymentClass}
                      onChange={event => setSelectedLowPaymentClass(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      <option value="all">All classes</option>
                      {overview.classes.map(schoolClass => (
                        <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={exportLowPaymentPdf}
                    disabled={lowPaymentStudents.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />
                    Download / print PDF
                  </button>
                </div>
              </div>
            </div>

            {lowPaymentStudents.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-semibold text-slate-800">No students match this payment range.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Students with no recorded payments are shown in the early-warning list instead.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-sm">
                  <span className="font-semibold text-slate-800">
                    {lowPaymentStudents.length} student{lowPaymentStudents.length === 1 ? '' : 's'} to follow up
                  </span>
                  <span className="text-xs text-slate-500">
                    {overview.semester.name} · verify records before contacting families
                  </span>
                </div>
                <div className="overflow-x-auto p-5 pt-3">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Student</th>
                        <th className="px-3 py-3 font-semibold">Admission no.</th>
                        <th className="px-3 py-3 font-semibold">Class</th>
                        <th className="px-3 py-3 text-right font-semibold">Paid</th>
                        <th className="px-3 py-3 text-right font-semibold">Fee</th>
                        <th className="px-3 py-3 text-right font-semibold">Balance</th>
                        <th className="px-3 py-3 text-right font-semibold">Progress</th>
                        <th className="px-3 py-3 text-right font-semibold">Individual PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lowPaymentStudents.map(student => (
                        <tr key={student.studentId} className="transition hover:bg-emerald-50/50">
                          <td className="px-3 py-3 font-semibold text-slate-800">{student.studentName}</td>
                          <td className="px-3 py-3 text-slate-600">{student.admissionNumber}</td>
                          <td className="px-3 py-3 text-slate-600">{student.className}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-amber-700">{formatCurrency(student.amountPaid)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatCurrency(student.amountRequired)}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-red-700">{formatCurrency(student.amountRemaining)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{student.percentagePaid.toFixed(1)}%</td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => exportStudentFollowUpPdf(student)}
                              aria-label={`Download individual follow-up PDF for ${student.studentName}`}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                              Student PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
                  This is a payment-record follow-up aid, not a disciplinary list. Please confirm each record and speak with families respectfully.
                </p>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Early warning for late payers</h2>
                <p className="mt-1 text-sm text-slate-500">A guide based on this semester’s payments and past semester records.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-500">
                  Class
                  <select value={selectedClass} onChange={event => setSelectedClass(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="all">All classes</option>
                    {overview.classes.map(schoolClass => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Risk level
                  <select value={selectedRisk} onChange={event => setSelectedRisk(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="all">All levels</option>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </label>
              </div>
            </div>

            {filteredRisks.length === 0 ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-800">
                No students match these filters. There are no payment warnings to show.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Student</th>
                      <th className="px-3 py-3 font-semibold">Class</th>
                      <th className="px-3 py-3 text-right font-semibold">Paid</th>
                      <th className="px-3 py-3 text-right font-semibold">Remaining</th>
                      <th className="px-3 py-3 font-semibold">Risk</th>
                      <th className="px-3 py-3 font-semibold">Reminder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRisks.map(student => (
                      <tr key={student.studentId} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-medium text-slate-800">{student.studentName}</td>
                        <td className="px-3 py-3 text-slate-600">{student.className}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatCurrency(student.amountPaid)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(student.amountRemaining)}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${riskColor[student.risk]}`}>{student.risk}</span></td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => void writeReminder(student)}
                            disabled={reminderLoading}
                            className="rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                          >
                            Write reminder
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="text-xs font-medium text-slate-500">
                Reminder deadline
                <input type="date" value={deadline} onChange={event => setDeadline(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
                <span className="mt-1 block font-normal">Default is the semester end date. Adjust to your school’s deadline.</span>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Message tone
                <select value={reminderTone} onChange={event => setReminderTone(event.target.value as 'Friendly' | 'Formal')} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                  <option>Friendly</option><option>Formal</option>
                </select>
              </label>
              <p className="pb-2 text-xs text-slate-500">Messages are drafts only. A teacher must review and send them.</p>
            </div>

            {reminderStudentId && (
              <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800">Reminder draft</h3>
                  <button onClick={() => { setReminderStudentId(''); setReminderText(''); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
                </div>
                {reminderLoading ? (
                  <p className="text-sm text-slate-500">Writing a polite reminder…</p>
                ) : (
                  <>
                    <textarea
                      value={reminderText}
                      onChange={event => { setReminderText(event.target.value); setCopiedReminder(false); }}
                      rows={5}
                      aria-label="Edit reminder message"
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    <button onClick={() => void copyReminder()} disabled={!reminderText} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">
                      {copiedReminder ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                      {copiedReminder ? 'Copied' : 'Copy'}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Bot className="h-5 w-5 text-indigo-600" /> Ask in normal words</h2>
              <p className="mt-1 text-sm text-slate-500">Ask about this semester’s payment records.</p>
              <form onSubmit={event => void askQuestion(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={chatQuestion}
                  onChange={event => setChatQuestion(event.target.value)}
                  maxLength={500}
                  placeholder="Who has paid? Who has not paid in Senior 3?"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button disabled={chatLoading || !chatQuestion.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">
                  <Send className="h-4 w-4" /> Ask
                </button>
              </form>
              {chatLoading && <p className="mt-4 text-sm text-slate-500">Checking the payment records…</p>}
              {chatError && <p role="alert" className="mt-4 text-sm text-red-700">{chatError}</p>}
              {chatReply && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-medium leading-6 text-slate-800">{chatReply.answer}</p>
                  {chatReply.rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-xs">
                        <thead className="text-slate-500"><tr><th className="py-2">Student</th><th>Class</th><th className="text-right">Paid</th><th className="text-right">Remaining</th></tr></thead>
                        <tbody className="divide-y divide-slate-200">
                          {chatReply.rows.map((row, index) => (
                            <tr key={`${row.student}-${index}`}><td className="py-2 font-medium">{row.student}</td><td>{row.class}</td><td className="text-right">{formatCurrency(row.amountPaid)}</td><td className="text-right">{formatCurrency(row.amountRemaining)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Semester prediction</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Estimate, not a fact</p>
                </div>
                <span className="rounded-full bg-amber-50 p-2 text-amber-700"><Sparkles className="h-5 w-5" /></span>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  ['Collected so far', overview.prediction.collected, 'bg-primary-600'],
                  ['Estimated total', overview.prediction.predicted, 'bg-amber-500'],
                ].map(([label, value, color]) => (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-600">{label}</span>
                      <span className="font-bold text-slate-800">{formatCurrency(Number(value))}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Number(value) / maxChartValue * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{overview.prediction.explanation}</p>
              <p className="mt-2 text-xs text-slate-400">
                {overview.prediction.historicalSemesters
                  ? `Compared with ${overview.prediction.historicalSemesters} previous semester(s).`
                  : 'No completed previous semesters were found.'}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><AlertCircle className="h-5 w-5 text-amber-600" /> Mistake checker</h2>
                <p className="mt-1 text-sm text-slate-500">Possible issues to review. Nothing is changed or deleted automatically.</p>
              </div>
              <span className="text-sm font-semibold text-slate-500">{openIssues.length} record(s) to check</span>
            </div>
            {issueError && <p role="alert" className="mt-3 text-sm text-red-700">{issueError}</p>}
            {issues.length === 0 ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-800">
                <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />
                No possible payment mistakes were found.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Possible issue</th><th className="px-3 py-3">Review</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {issues.map(issue => (
                      <tr key={issue.id} className={issue.checked ? 'bg-slate-50 text-slate-500' : ''}>
                        <td className="px-3 py-3 font-medium">{issue.studentName}</td>
                        <td className="px-3 py-3">{issue.className}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(issue.amount)}</td>
                        <td className="px-3 py-3">{issue.paidAt ? new Date(issue.paidAt).toLocaleDateString() : 'Missing'}</td>
                        <td className="max-w-sm px-3 py-3">{issue.reason}</td>
                        <td className="px-3 py-3">
                          {issue.checked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Checked</span>
                          ) : (
                            <button onClick={() => void markChecked(issue.id)} disabled={checkingId === issue.id} className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                              {checkingId === issue.id ? 'Saving…' : 'Mark as checked'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
