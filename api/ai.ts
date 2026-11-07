import type { IncomingMessage, ServerResponse } from 'node:http';

type Request = IncomingMessage & { body?: unknown };
type Response = ServerResponse & {
  status: (code: number) => Response;
  json: (body: unknown) => void;
};

type Language = 'English' | 'Kinyarwanda' | 'French';
type Tone = 'Friendly' | 'Formal';

interface Semester {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

interface SchoolClass {
  id: string;
  name: string;
  level: string;
}

interface Student {
  id: string;
  full_name: string;
  class_id: string;
  status: string;
}

interface Payment {
  id: string;
  student_id: string;
  semester_id: string;
  amount: number | string;
  paid_at: string | null;
  ai_reviewed_at?: string | null;
}

interface Fee {
  class_id: string;
  semester_id: string;
  required_amount: number | string;
}

interface SchoolData {
  semesters: Semester[];
  classes: SchoolClass[];
  students: Student[];
  payments: Payment[];
  fees: Fee[];
  paymentsByStudentSemester: Map<string, Payment[]>;
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

const FALLBACK_FEE = 24000;
const MAX_ROWS = 10000;
const DEFAULT_LANGUAGE: Language = 'English';

export const config = { maxDuration: 30 };

const json = (res: Response, status: number, body: unknown) => {
  res.status(status).json(body);
};

const getString = (value: unknown) => typeof value === 'string' ? value : '';

const parseLanguage = (value: unknown): Language =>
  value === 'Kinyarwanda' || value === 'French' ? value : DEFAULT_LANGUAGE;

const parseBody = (req: Request): Record<string, unknown> => {
  if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    const parsed: unknown = JSON.parse(req.body);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  throw new Error('Invalid request body');
};

const getBackendConfig = () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return { url: url.replace(/\/+$/, ''), key };
};

const getAccessToken = (req: Request) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length);
};

const fetchJson = async <T>(url: string, headers: Record<string, string>): Promise<T> => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};

const getSchoolData = async (token: string): Promise<SchoolData> => {
  const { url, key } = getBackendConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const query = async <T>(table: string, select: string, order = '') => {
    const records: T[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset <= MAX_ROWS; offset += pageSize) {
      headers['Range-Unit'] = 'items';
      headers.Range = `${offset}-${offset + pageSize - 1}`;
      const page = await fetchJson<T[]>(
        `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}${order}`,
        headers,
      );
      if (offset >= MAX_ROWS && page.length) {
        throw new Error(`Too many ${table} records to analyze safely`);
      }
      records.push(...page);
      if (page.length < pageSize) return records;
    }
    return records;
  };

  const [semesters, classes, students, payments, fees] = await Promise.all([
    query<Semester>('semesters', 'id,name,start_date,end_date,is_current', '&order=start_date.desc'),
    query<SchoolClass>('classes', 'id,name,level', '&order=name.asc'),
    query<Student>('students', 'id,full_name,class_id,status', '&order=full_name.asc'),
    query<Payment>('payments', 'id,student_id,semester_id,amount,paid_at,ai_reviewed_at', '&order=paid_at.desc'),
    query<Fee>('fee_structure', 'class_id,semester_id,required_amount'),
  ]);
  const paymentsByStudentSemester = new Map<string, Payment[]>();
  for (const payment of payments) {
    const key = `${payment.student_id}:${payment.semester_id}`;
    const group = paymentsByStudentSemester.get(key);
    if (group) group.push(payment);
    else paymentsByStudentSemester.set(key, [payment]);
  }
  return { semesters, classes, students, payments, fees, paymentsByStudentSemester };
}

const getCurrentSemester = (semesters: Semester[]) =>
  semesters.find(semester => semester.is_current)
  ?? semesters.find(semester => new Date(semester.end_date) >= new Date())
  ?? semesters[0]
  ?? null;

const getFee = (data: SchoolData, classId: string, semesterId: string) => {
  const fee = data.fees.find(item => item.class_id === classId && item.semester_id === semesterId);
  return fee ? Number(fee.required_amount) : FALLBACK_FEE;
};

const getStudentPayments = (data: SchoolData, studentId: string, semesterId: string) =>
  data.paymentsByStudentSemester.get(`${studentId}:${semesterId}`) ?? [];

const totalPaid = (payments: Payment[]) =>
  payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

const getSemesterExpected = (data: SchoolData, semesterId: string) =>
  data.students
    .filter(student => student.status === 'active')
    .reduce((sum, student) => sum + getFee(data, student.class_id, semesterId), 0);

const getSemesterCollected = (data: SchoolData, semesterId: string) =>
  totalPaid(data.payments.filter(payment => payment.semester_id === semesterId));

const getElapsedFraction = (semester: Semester) => {
  const start = new Date(`${semester.start_date}T00:00:00Z`).getTime();
  const end = new Date(`${semester.end_date}T23:59:59Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
};

const analyzeRisks = (data: SchoolData, current: Semester) => {
  const activeStudents = data.students.filter(student => student.status === 'active');
  const previousSemesters = data.semesters.filter(semester =>
    semester.id !== current.id && new Date(`${semester.end_date}T23:59:59Z`) < new Date(),
  );
  const elapsed = getElapsedFraction(current);
  const rows = activeStudents.map(student => {
    const required = getFee(data, student.class_id, current.id);
    const paid = totalPaid(getStudentPayments(data, student.id, current.id));
    const history = previousSemesters.map(semester => {
      const historicalRequired = getFee(data, student.class_id, semester.id);
      const historicalPaid = totalPaid(getStudentPayments(data, student.id, semester.id));
      return { required: historicalRequired, paid: historicalPaid };
    });
    const incompleteHistory = history.filter(item => item.paid < item.required).length;
    const hasNoCurrentPayment = paid === 0;
    const hasLargeBalanceLate = elapsed >= 0.6 && paid < required * 0.5;
    let risk: 'Low' | 'Medium' | 'High' = 'Low';

    if ((hasNoCurrentPayment && elapsed >= 0.35 && incompleteHistory >= 1)
      || (hasLargeBalanceLate && incompleteHistory >= 1)
      || (hasNoCurrentPayment && elapsed >= 0.65)) {
      risk = 'High';
    } else if ((hasNoCurrentPayment && elapsed >= 0.1) || hasLargeBalanceLate || incompleteHistory >= 1) {
      risk = 'Medium';
    }

    return {
      studentId: student.id,
      studentName: student.full_name,
      classId: student.class_id,
      className: data.classes.find(item => item.id === student.class_id)?.name ?? 'Unknown class',
      amountPaid: paid,
      amountRemaining: Math.max(0, required - paid),
      risk,
      previousIncompleteSemesters: incompleteHistory,
    };
  }).filter(row => row.amountRemaining > 0);

  return rows.sort((a, b) => {
    const priority = { High: 0, Medium: 1, Low: 2 };
    return priority[a.risk] - priority[b.risk] || b.amountRemaining - a.amountRemaining;
  });
};

const findPaymentIssues = (data: SchoolData): PaymentIssue[] => {
  const studentById = new Map(data.students.map(student => [student.id, student]));
  const classById = new Map(data.classes.map(schoolClass => [schoolClass.id, schoolClass]));
  const totals = new Map<string, number>();
  const issuesByPayment = new Map<string, PaymentIssue>();
  const duplicateGroups = new Map<string, Payment[]>();
  const addIssue = (payment: Payment, reason: string) => {
    const student = studentById.get(payment.student_id);
    const className = student ? classById.get(student.class_id)?.name ?? 'Unknown class' : 'Unknown class';
    const existing = issuesByPayment.get(payment.id);
    if (existing) existing.reason += `; ${reason}`;
    else issuesByPayment.set(payment.id, {
      id: payment.id,
      studentName: student?.full_name ?? 'Unknown student',
      className,
      amount: Number(payment.amount),
      paidAt: payment.paid_at,
      reason,
      checked: Boolean(payment.ai_reviewed_at),
    });
  };

  for (const payment of data.payments) {
    const student = studentById.get(payment.student_id);
    const semester = data.semesters.find(item => item.id === payment.semester_id);

    if (!student) addIssue(payment, 'Student record could not be found');
    if (!payment.paid_at) addIssue(payment, 'Payment date is missing');
    if (!semester) addIssue(payment, 'Semester record could not be found');
    const totalKey = `${payment.student_id}:${payment.semester_id}`;
    totals.set(totalKey, (totals.get(totalKey) ?? 0) + Number(payment.amount));

    const paidDay = payment.paid_at?.slice(0, 10) ?? 'missing-date';
    const duplicateKey = `${payment.student_id}:${payment.semester_id}:${Number(payment.amount)}:${paidDay}`;
    const duplicateGroup = duplicateGroups.get(duplicateKey);
    if (duplicateGroup) duplicateGroup.push(payment);
    else duplicateGroups.set(duplicateKey, [payment]);
  }

  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      for (const payment of group) {
        addIssue(payment, 'Possible duplicate: same student, amount, semester, and date');
      }
    }
  }

  for (const [key, paid] of totals) {
    const [studentId, semesterId] = key.split(':');
    const student = studentById.get(studentId);
    if (!student) continue;
    const required = getFee(data, student.class_id, semesterId);
    if (paid > required) {
      for (const payment of getStudentPayments(data, student.id, semesterId)) {
        const reason = `Student's semester total (${Math.round(paid)} RWF) is above the ${Math.round(required)} RWF fee`;
        addIssue(payment, reason);
      }
    }
  }

  return Array.from(issuesByPayment.values()).sort((a, b) => Number(a.checked) - Number(b.checked));
};

const getOverview = (data: SchoolData, current: Semester, language: Language) => {
  const activeStudents = data.students.filter(student => student.status === 'active');
  const currentPayments = data.payments.filter(payment => payment.semester_id === current.id);
  const collected = totalPaid(currentPayments);
  const expected = getSemesterExpected(data, current.id);
  const unpaid = Math.max(0, expected - collected);
  const classes = data.classes.map(schoolClass => {
    const students = activeStudents.filter(student => student.class_id === schoolClass.id);
    const classCollected = students.reduce((sum, student) =>
      sum + totalPaid(getStudentPayments(data, student.id, current.id)), 0);
    const classExpected = students.reduce((sum, student) => sum + getFee(data, student.class_id, current.id), 0);
    return { id: schoolClass.id, name: schoolClass.name, collected: classCollected, expected: classExpected };
  }).filter(schoolClass => schoolClass.expected > 0);
  const byCollection = [...classes].sort((a, b) => b.collected - a.collected);
  const prediction = getPrediction(data, current, collected, expected);

  return {
    semester: current,
    collected,
    expected,
    unpaid,
    percentageCollected: expected > 0 ? (collected / expected) * 100 : 0,
    classes,
    highestClass: byCollection[0]?.name ?? null,
    lowestClass: byCollection.at(-1)?.name ?? null,
    risks: analyzeRisks(data, current),
    prediction,
    issues: findPaymentIssues(data),
    language,
  };
};

const getPrediction = (data: SchoolData, current: Semester, collected: number, expected: number) => {
  const elapsed = getElapsedFraction(current);
  const paceEstimate = elapsed > 0.08 ? collected / elapsed : collected;
  const previous = data.semesters.filter(semester =>
    semester.id !== current.id && new Date(`${semester.end_date}T23:59:59Z`) < new Date(),
  );
  const historicalCollections = previous.map(semester => getSemesterCollected(data, semester.id));
  const historicalEstimate = historicalCollections.length
    ? historicalCollections.reduce((sum, value) => sum + value, 0) / historicalCollections.length
    : null;
  const estimate = historicalEstimate === null
    ? paceEstimate
    : elapsed > 0.08
      ? paceEstimate * 0.6 + historicalEstimate * 0.4
      : historicalEstimate;

  return {
    collected,
    predicted: Math.max(collected, Math.min(expected || estimate, estimate)),
    expected,
    elapsedFraction: elapsed,
    historicalSemesters: historicalCollections.length,
    explanation: historicalEstimate === null
      ? 'This estimate uses the collection pace so far. It will improve when previous semester records are available.'
      : 'This estimate combines the current collection pace with average collections from previous semesters.',
  };
};

const formatRwf = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} RWF`;

const getGeminiKey = () => process.env.GEMINI_API_KEY;
const getOpenAiKey = () => process.env.OPENAI_API_KEY;

const askModel = async (systemPrompt: string, userPrompt: string) => {
  const geminiApiKey = getGeminiKey();
  if (geminiApiKey) {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!response.ok) throw new Error(`AI provider failed (${response.status})`);
    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text ?? '')
      .join('')
      .trim();
    if (!content) throw new Error('AI returned an empty response');
    return JSON.parse(content) as Record<string, unknown>;
  }

  const apiKey = getOpenAiKey();
  if (!apiKey) throw new Error('AI is not configured');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI provider failed (${response.status})`);
  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned an empty response');
  return JSON.parse(content) as Record<string, unknown>;
};

const generateSummary = async (overview: ReturnType<typeof getOverview>, language: Language) => {
  const facts = {
    semester: overview.semester.name,
    totalCollected: formatRwf(overview.collected),
    totalUnpaid: formatRwf(overview.unpaid),
    percentageCollected: `${overview.percentageCollected.toFixed(1)}%`,
    classPaidMost: overview.highestClass,
    classPaidLeast: overview.lowestClass,
  };
  const result = await askModel(
    `Write a plain-language school-feeding summary in ${language}. Return JSON with key "summary". Use exactly 3 to 5 short sentences. Mention all supplied facts: total collected, total unpaid, percentage collected, class that collected the most, and class that collected the least. Keep all class names and number values exactly as supplied. Use only supplied facts. If no class names are supplied, say class comparison is not available. Do not invent dates, causes, or recommendations.`,
    JSON.stringify(facts),
  );
  const summary = getString(result.summary);
  const sentences = summary.match(/(?<!\d)[.!?]+(?=\s|$)/g)?.length ?? 0;
  const digits = summary.replace(/\D/g, '');
  const requiredValues = [
    overview.collected,
    overview.unpaid,
    Number(overview.percentageCollected.toFixed(1)),
  ].map(value => String(value).replace(/\D/g, ''));
  const missingClassName = [overview.highestClass, overview.lowestClass]
    .some(name => name && !summary.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  if (!summary || sentences < 3 || sentences > 5
    || requiredValues.some(value => value && !digits.includes(value))
    || missingClassName) {
    throw new Error('AI returned a summary that did not match the school data');
  }
  return summary;
};

const getReminder = async (
  data: SchoolData,
  studentId: string,
  current: Semester,
  language: Language,
  tone: Tone,
  deadline: string,
) => {
  const student = data.students.find(item => item.id === studentId);
  if (!student) throw new Error('Student not found');
  const paid = totalPaid(getStudentPayments(data, studentId, current.id));
  const remaining = Math.max(0, getFee(data, student.class_id, current.id) - paid);
  const firstName = student.full_name.trim().split(/\s+/)[0] ?? student.full_name;
  const result = await askModel(
    `Write one polite parent/guardian payment reminder in ${language}, with a ${tone.toLowerCase()} tone. Return JSON with key "message". Address them as "Dear Parent/Guardian" or the natural equivalent. Use only this first name, balance, semester, and deadline. Do not invent school policies, fees, contacts, or facts. Do not claim to send the message.`,
    JSON.stringify({
      studentFirstName: firstName,
      amountRemaining: formatRwf(remaining),
      semester: current.name,
      deadline,
    }),
  );
  const message = getString(result.message);
  if (!message) throw new Error('AI returned an invalid reminder');
  return message;
};

const getQuestionFacts = (data: SchoolData, current: Semester, question: string) => {
  const normalized = question.toLocaleLowerCase();
  const activeStudents = data.students.filter(student => student.status === 'active');
  const classMatch = data.classes.find(schoolClass =>
    normalized.includes(schoolClass.name.toLocaleLowerCase())
    || (schoolClass.level && normalized.includes(schoolClass.level.toLocaleLowerCase())),
  );
  const asksAboutStudents = /\b(who|which|list|names? of|how many)\b/i.test(question);
  const asksAboutPaymentStatus = /\b(paid|payment|unpaid|owe|owing|balance)\b/i.test(question);
  if (asksAboutStudents && asksAboutPaymentStatus) {
    const asksWhoIsUnpaid = /\b(unpaid|not paid|haven.t paid|hasn.t paid|still owe|owing|outstanding)\b/i.test(question);
    const matchingStudents = activeStudents
      .filter(student => !classMatch || student.class_id === classMatch.id)
      .map(student => ({
        student: student.full_name,
        class: data.classes.find(schoolClass => schoolClass.id === student.class_id)?.name ?? 'Unknown class',
        amountPaid: totalPaid(getStudentPayments(data, student.id, current.id)),
        amountRemaining: Math.max(0, getFee(data, student.class_id, current.id)
          - totalPaid(getStudentPayments(data, student.id, current.id))),
      }))
      .filter(row => asksWhoIsUnpaid ? row.amountRemaining > 0 : row.amountPaid > 0);
    return {
      kind: asksWhoIsUnpaid ? 'unpaid_students' : 'paid_students',
      className: classMatch?.name ?? null,
      currency: 'RWF',
      rows: matchingStudents,
    };
  }

  const collectionIntent = /(collect(?:ed|ion)?|received|how much.*paid)/i.test(question);
  if (collectionIntent && /(week|today|month|semester|total|overall)/i.test(question)) {
    const now = new Date();
    const start = new Date(now);
    if (/today/i.test(question)) start.setHours(0, 0, 0, 0);
    else if (/week/i.test(question)) {
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      start.setHours(0, 0, 0, 0);
    } else if (/month/i.test(question)) {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      const collected = getSemesterCollected(data, current.id);
      return { kind: 'collection_total', period: current.name, collected, currency: 'RWF' };
    }
    const collected = data.payments
      .filter(payment => payment.paid_at && new Date(payment.paid_at) >= start && new Date(payment.paid_at) <= now)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    return {
      kind: 'collection_total',
      period: /today/i.test(question) ? 'today' : /week/i.test(question) ? 'this week' : 'this month',
      collected,
      currency: 'RWF',
    };
  }

  if (/(total unpaid|amount unpaid|unpaid total|remaining balance)/i.test(question)) {
    const expected = getSemesterExpected(data, current.id);
    return {
      kind: 'unpaid_total',
      unpaid: Math.max(0, expected - getSemesterCollected(data, current.id)),
      currency: 'RWF',
    };
  }
  return null;
};

const getChatAnswer = async (data: SchoolData, current: Semester, question: string, language: Language) => {
  if (!question.trim() || question.length > 500) throw new Error('Enter a question of 1 to 500 characters.');
  const facts = getQuestionFacts(data, current, question);
  if (!facts) {
    return { answer: 'I do not have this information', rows: [] };
  }
  const rows = facts.kind === 'unpaid_students' || facts.kind === 'paid_students'
    ? facts.rows ?? []
    : [];
  const factsForModel = facts.kind === 'unpaid_students' || facts.kind === 'paid_students'
    ? {
      kind: facts.kind,
      className: facts.className,
      currency: facts.currency,
      studentCount: rows.length,
      totalRemaining: rows.reduce((sum, row) => sum + row.amountRemaining, 0),
      totalPaid: rows.reduce((sum, row) => sum + row.amountPaid, 0),
    }
    : facts;
  const result = await askModel(
    `Answer the school staff member's question in ${language} using ONLY the JSON data provided. Return JSON with "answer" as one short sentence. Do not calculate from facts that are not present. If the data is empty or insufficient, answer exactly "I do not have this information". Do not add a table; the application displays rows separately.`,
    JSON.stringify({ question, facts: factsForModel }),
  );
  const answer = getString(result.answer);
  if (!answer) throw new Error('AI returned an invalid answer');
  return {
    answer,
    rows,
  };
};

const markIssueChecked = async (token: string, paymentId: string) => {
  const { url, key } = getBackendConfig();
  const response = await fetch(
    `${url}/rest/v1/payments?id=eq.${encodeURIComponent(paymentId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ai_reviewed_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) throw new Error(`Unable to update review status (${response.status})`);
};

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const token = getAccessToken(req);
  if (!token) return json(res, 401, { error: 'Please sign in to use AI Insights.' });

  try {
    const { url, key } = getBackendConfig();
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return json(res, 401, { error: 'Your session expired. Please sign in again.' });

    const body = parseBody(req);
    const action = getString(body.action);
    const language = parseLanguage(body.language);

    if (action === 'mark_checked') {
      const paymentId = getString(body.paymentId);
      if (!/^[\da-f-]{36}$/i.test(paymentId)) return json(res, 400, { error: 'Invalid payment record.' });
      await markIssueChecked(token, paymentId);
      return json(res, 200, { ok: true });
    }

    const data = await getSchoolData(token);
    const current = getCurrentSemester(data.semesters);

    if (!current) {
      return json(res, 200, {
        error: 'No semester is set up yet. Add a semester to see insights.',
        empty: true,
      });
    }

    if (action === 'overview') {
      const overview = getOverview(data, current, language);
      let summary: string | null = null;
      let aiError: string | undefined;
      if (data.students.length) {
        try {
          summary = await generateSummary(overview, language);
        } catch (error) {
          console.error('AI Insights summary failed:', error);
          aiError = getAiErrorMessage(error);
        }
      }
      return json(res, 200, { ...overview, summary, ...(aiError ? { error: aiError } : {}) });
    }

    if (action === 'reminder') {
      const studentId = getString(body.studentId);
      const tone: Tone = body.tone === 'Formal' ? 'Formal' : 'Friendly';
      const deadline = getString(body.deadline) || current.end_date;
      if (!/^[\da-f-]{36}$/i.test(studentId)) return json(res, 400, { error: 'Choose a student first.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return json(res, 400, { error: 'Enter a valid deadline.' });
      const message = await getReminder(data, studentId, current, language, tone, deadline);
      return json(res, 200, { message });
    }

    if (action === 'chat') {
      const question = getString(body.question);
      const answer = await getChatAnswer(data, current, question, language);
      return json(res, 200, answer);
    }

    return json(res, 400, { error: 'Unknown AI Insights action.' });
  } catch (error) {
    console.error('AI Insights request failed:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('AI is not configured') || message.includes('AI provider')) {
      return json(res, 503, { error: getAiErrorMessage(error) });
    }
    if (message.includes('Invalid request')) return json(res, 400, { error: 'Invalid request.' });
    if (message.includes('Backend request failed') || message.includes('Supabase is not configured')) {
      if (message.includes('(400)')) {
        return json(res, 503, {
          error: 'Supabase rejected the school-data query. Run the latest supabase_schema.sql in your project and verify its tables.',
        });
      }
      if (message.includes('(401)') || message.includes('(403)')) {
        return json(res, 503, {
          error: 'Supabase denied access. Check the Supabase server environment variables and sign in again.',
        });
      }
      if (message.includes('Supabase is not configured')) {
        return json(res, 503, {
          error: 'Supabase server configuration is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY, then redeploy.',
        });
      }
      return json(res, 503, { error: 'Could not load school data. Check the Supabase configuration and try again.' });
    }
    return json(res, 500, { error: 'AI is not available now, please try again.' });
  }
}

function getAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('AI is not configured')) {
    return 'AI is not configured. Add GEMINI_API_KEY to the server environment and redeploy.';
  }
  const status = Number(message.match(/AI provider failed \((\d+)\)/)?.[1]);
  if (status === 400 || status === 401 || status === 403) {
    return getGeminiKey()
      ? 'The AI provider rejected its API key. Verify GEMINI_API_KEY and enable the Gemini API for that key.'
      : 'The AI provider rejected its API key. Verify the configured AI key and provider settings.';
  }
  if (status === 429) {
    return getGeminiKey()
      ? 'The AI provider quota was exceeded. Check your Gemini API quota and billing settings.'
      : 'The AI provider quota was exceeded. Check your AI provider quota and billing settings.';
  }
  if (status === 404 && getGeminiKey()) {
    return 'The configured AI model was not found. Check GEMINI_MODEL in the server environment.';
  }
  if (status) return `The AI provider request failed (${status}). Check the server configuration and try again.`;
  return 'The AI response could not be processed. Check the server logs and try again.';
}
