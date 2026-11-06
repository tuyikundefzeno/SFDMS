import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Edit, Trash2 } from 'lucide-react';

export const Classes = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    name: '',
    level: '',
  });

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setClasses(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ name: '', level: '' });
    setMessage('');
    setShowModal(true);
  };

  const handleOpenEdit = (cls: any) => {
    setEditingId(cls.id);
    setForm({ name: cls.name, level: cls.level });
    setMessage('');
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete class "${name}"? All associated students will also be removed.`)) return;
    
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) {
      setMessage(`Error deleting: ${error.message}`);
    } else {
      setMessage(`Class "${name}" deleted successfully.`);
      fetchClasses();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.name.trim();
    const trimmedLevel = form.level.trim();

    if (!trimmedName || !trimmedLevel) return;

    // Check duplicate (ignore current editing class)
    const exists = classes.some(
      (cls) => cls.id !== editingId && cls.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (exists) {
      setMessage(`Error: Class "${trimmedName}" already exists!`);
      return;
    }

    setSubmitting(true);
    setMessage('');

    let error;
    if (editingId) {
      // Update existing class
      const res = await supabase
        .from('classes')
        .update({ name: trimmedName, level: trimmedLevel })
        .eq('id', editingId);
      error = res.error;
    } else {
      // Insert new class
      const res = await supabase.from('classes').insert({
        name: trimmedName,
        level: trimmedLevel,
      });
      error = res.error;
    }

    setSubmitting(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(editingId ? 'Class updated successfully!' : 'Class added successfully!');
      setForm({ name: '', level: '' });
      setShowModal(false);
      fetchClasses();
    }
  };

  if (loading) return <div className="text-slate-500">Loading classes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Classes</h2>
          <p className="text-slate-500 mt-1">Manage school classes and levels.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-2 bg-primary-700 text-white px-4 py-2 rounded-lg hover:bg-primary-800 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add Class</span>
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
              <th className="px-6 py-4 font-semibold">Class Name</th>
              <th className="px-6 py-4 font-semibold">Level</th>
              <th className="px-6 py-4 font-semibold">Created</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {classes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  No classes yet. Click "Add Class" to get started.
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800">{cls.name}</td>
                  <td className="px-6 py-4 text-slate-600">{cls.level}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {new Date(cls.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleOpenEdit(cls)}
                        className="text-primary-600 hover:text-primary-800 p-1 font-medium flex items-center gap-1 text-sm"
                      >
                        <Edit className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cls.id, cls.name)}
                        className="text-red-500 hover:text-red-700 p-1 font-medium flex items-center gap-1 text-sm"
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

      {/* Add/Edit Class Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Edit Class' : 'Add New Class'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Class Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Primary 1A"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Level
                </label>
                <input
                  type="text"
                  required
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  placeholder="e.g. Primary, Secondary, Senior 1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Class' : 'Add Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
