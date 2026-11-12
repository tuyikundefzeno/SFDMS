import { useEffect, useState } from 'react';
import { Plus, School, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SchoolRecord {
  id: string;
  name: string;
}

export const SchoolAdmin = () => {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolName, setSchoolName] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [leaderEmail, setLeaderEmail] = useState('');
  const [leaderPassword, setLeaderPassword] = useState('');
  const [leaderSchool, setLeaderSchool] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSchools = async () => {
    const { data, error } = await supabase.from('schools').select('id, name').order('name');
    if (error) setMessage(`Unable to load schools: ${error.message}`);
    else setSchools(data ?? []);
  };

  useEffect(() => { void loadSchools(); }, []);

  const adminRequest = async (payload: Record<string, string>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    const response = await fetch('/api/schools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as { error?: string; school?: SchoolRecord };
    if (!response.ok) throw new Error(result.error ?? 'Administration request failed.');
    return result;
  };

  const createSchool = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await adminRequest({ action: 'create-school', name: schoolName });
      setSchoolName('');
      setMessage('School created.');
      await loadSchools();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create school.');
    } finally {
      setBusy(false);
    }
  };

  const createLeader = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await adminRequest({
        action: 'create-leader',
        fullName: leaderName,
        email: leaderEmail,
        password: leaderPassword,
        schoolId: leaderSchool,
      });
      setLeaderName('');
      setLeaderEmail('');
      setLeaderPassword('');
      setMessage('Leader account created and assigned to the selected school.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create leader.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">School Administration</h2>
        <p className="mt-1 text-slate-500">Manage schools and their leader accounts.</p>
      </div>

      {message && (
        <div role="status" className={`rounded-lg p-4 font-medium ${message.startsWith('Unable') || message.startsWith('Please') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={createSchool} className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><School className="h-5 w-5" /> Create School</h3>
          <label className="block text-sm font-medium text-slate-700" htmlFor="school-name">School name</label>
          <input id="school-name" required maxLength={120} value={schoolName} onChange={event => setSchoolName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:opacity-60"><Plus className="h-4 w-4" /> Create School</button>
        </form>

        <form onSubmit={createLeader} className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><UserPlus className="h-5 w-5" /> Create Leader</h3>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="leader-name">Full name</label>
            <input id="leader-name" required maxLength={120} value={leaderName} onChange={event => setLeaderName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="leader-email">Email</label>
            <input id="leader-email" required type="email" value={leaderEmail} onChange={event => setLeaderEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="leader-password">Initial password</label>
            <input id="leader-password" required type="password" minLength={12} value={leaderPassword} onChange={event => setLeaderPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <p className="mt-1 text-xs text-slate-500">At least 12 characters. Share it securely and have the leader change it after signing in.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="leader-school">School</label>
            <select id="leader-school" required value={leaderSchool} onChange={event => setLeaderSchool(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">Select a school</option>
              {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </div>
          <button disabled={busy || schools.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:opacity-60"><UserPlus className="h-4 w-4" /> Create Leader Account</button>
        </form>
      </section>

      <section className="border-t border-slate-200 pt-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-800">Schools</h3>
        <ul className="divide-y divide-slate-200">
          {schools.map(school => <li key={school.id} className="py-3 text-slate-700">{school.name}</li>)}
          {schools.length === 0 && <li className="py-3 text-slate-500">No schools found.</li>}
        </ul>
      </section>
    </div>
  );
};
