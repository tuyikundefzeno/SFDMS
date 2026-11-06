import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Edit, Trash2 } from 'lucide-react';

export const Semesters = () => {
  const [semesters, setSemesters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });

  const fetchSemesters = async () => {
    const { data } = await supabase.from('semesters').select('*').order('start_date', { ascending: false });
    if (data) setSemesters(data);
    setLoading(false);
  };

  useEffect(() => { fetchSemesters(); }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ name: '', start_date: '', end_date: '', is_current: false });
    setMessage('');
    setShowModal(true);
  };

  const handleOpenEdit = (sem: any) => {
    setEditingId(sem.id);
    setForm({
      name: sem.name,
      start_date: sem.start_date,
      end_date: sem.end_date,
      is_current: sem.is_current,
    });
    setMessage('');
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete semester "${name}"?`)) return;
    const { error } = await supabase.from('semesters').delete().eq('id', id);
    if (error) {
      setMessage(`Error deleting: ${error.message}`);
    } else {
      setMessage(`Semester "${name}" deleted.`);
      fetchSemesters();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    if (form.is_current) {
      // Unset current for other semesters
      if (editingId) {
        await supabase.from('semesters').update({ is_current: false }).neq('id', editingId);
      } else {
        await supabase.from('semesters').update({ is_current: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      }
    }

    let error;
    if (editingId) {
      const res = await supabase.from('semesters').update({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        is_current: form.is_current,
      }).eq('id', editingId);
      error = res.error;
    } else {
      const res = await supabase.from('semesters').insert({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        is_current: form.is_current,
      });
      error = res.error;
    }

    setSubmitting(false);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(editingId ? 'Semester updated successfully!' : 'Semester added successfully!');
      setForm({ name: '', start_date: '', end_date: '', is_current: false });
      setShowModal(false);
      fetchSemesters();
    }
  };

  const setAsCurrent = async (id: string) => {
    await supabase.from('semesters').update({ is_current: false }).neq('id', id);
    await supabase.from('semesters').update({ is_current: true }).eq('id', id);
    fetchSemesters();
  };

  if (loading) return <div className="text-slate-500">Loading semesters...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Semesters</h2>
          <p className="text-slate-500 mt-1">Manage academic semesters and set the current one.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-2 bg-primary-700 text-white px-4 py-2 rounded-lg hover:bg-primary-800 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add Semester</span>
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg font-medium ${message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">Start Date</th>
              <th className="px-6 py-4 font-semibold">End Date</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {semesters.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No semesters yet. Click "Add Semester" to get started.
                </td>
              </tr>
            ) : (
              semesters.map((sem) => (
                <tr key={sem.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800">{sem.name}</td>
                  <td className="px-6 py-4 text-slate-600">{sem.start_date}</td>
                  <td className="px-6 py-4 text-slate-600">{sem.end_date}</td>
                  <td className="px-6 py-4">
                    {sem.is_current ? (
                      <span className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-primary-100 text-primary-800">
                        Current
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-3">
                      {!sem.is_current && (
                        <button
                          onClick={() => setAsCurrent(sem.id)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-semibold bg-primary-50 px-2 py-1 rounded"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(sem)}
                        className="text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 text-sm"
                      >
                        <Edit className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(sem.id, sem.name)}
                        className="text-red-500 hover:text-red-700 font-medium flex items-center gap-1 text-sm"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Semester Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Edit Semester' : 'Add New Semester'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Semester Name</label>
                <input type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Term 1 - 2025"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" required value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" required value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_current" checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                  className="w-4 h-4 accent-primary-700" />
                <label htmlFor="is_current" className="text-sm font-medium text-slate-700">Set as current semester</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-600 font-medium">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-60">
                  {submitting ? 'Saving...' : editingId ? 'Update Semester' : 'Add Semester'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
