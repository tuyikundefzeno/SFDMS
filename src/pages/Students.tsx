import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Edit, Trash2, FileSpreadsheet, Upload, Camera, CheckCircle, RefreshCw, Eye, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStudentPhoto, saveStudentPhoto, deleteStudentPhoto, compressImage } from '../lib/studentPhotos';

export interface StudentRecord {
  id?: string;
  full_name: string;
  admission_number: string;
  class_id: string;
  status: string;
  photo_url?: string;
  classes?: { name: string };
}

// Helper component for reliable student photo avatar rendering
export const StudentAvatar = ({
  studentId,
  photoUrl,
  name,
  size = 'w-10 h-10',
  onClick,
}: {
  studentId?: string;
  photoUrl?: string;
  name: string;
  size?: string;
  onClick?: () => void;
}) => {
  const [imgError, setImgError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | undefined>(getStudentPhoto(studentId, photoUrl));

  useEffect(() => {
    setCurrentUrl(getStudentPhoto(studentId, photoUrl));
    setImgError(false);
  }, [photoUrl, studentId]);

  useEffect(() => {
    const handlePhotoUpdated = (e: any) => {
      if (studentId && e.detail?.studentId === studentId) {
        setCurrentUrl(e.detail?.photoUrl || undefined);
        setImgError(false);
      }
    };
    window.addEventListener('sfms_photo_updated', handlePhotoUpdated);
    return () => window.removeEventListener('sfms_photo_updated', handlePhotoUpdated);
  }, [studentId]);

  if (currentUrl && !imgError) {
    return (
      <img
        src={currentUrl}
        alt={name}
        onError={() => setImgError(true)}
        onClick={onClick}
        className={`${size} rounded-full object-cover border border-slate-200 shadow-sm ${
          onClick ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-primary-500 transition-all' : ''
        }`}
      />
    );
  }

  // Fallback avatar with student initials
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <div
      onClick={onClick}
      className={`${size} rounded-full bg-primary-100 text-primary-800 font-bold border border-primary-200 flex items-center justify-center text-xs shadow-sm ${
        onClick ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-primary-500 transition-all' : ''
      }`}
      title={name}
    >
      {initials}
    </div>
  );
};

export const Students = () => {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [photoManagerStudent, setPhotoManagerStudent] = useState<StudentRecord | null>(null);
  const [targetStudentForCamera, setTargetStudentForCamera] = useState<StudentRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Single Student Form
  const [form, setForm] = useState({
    full_name: '',
    admission_number: '',
    class_id: '',
    status: 'active',
    photo_url: '',
  });

  // Bulk Excel/CSV & File Import State
  const [importedRows, setImportedRows] = useState<{ full_name: string; admission_number: string; class_name: string; class_id: string }[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [pdfTextContent, setPdfTextContent] = useState('');
  const [importing, setImporting] = useState(false);

  // Live Camera Stream State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');

  // Row file input ref mapping
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*, classes(name)')
        .order('created_at', { ascending: false });

      if (data && !error) {
        setStudents(data as any);
      }
    } catch (e: any) {
      console.warn('Error fetching students:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('name');
    if (data) setClasses(data);
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ full_name: '', admission_number: '', class_id: classes[0]?.id || '', status: 'active', photo_url: '' });
    setMessage('');
    setShowModal(true);
  };

  const handleOpenEdit = (student: any) => {
    setEditingId(student.id);
    const existingPhoto = getStudentPhoto(student.id, student.photo_url) || '';
    setForm({
      full_name: student.full_name,
      admission_number: student.admission_number,
      class_id: student.class_id,
      status: student.status,
      photo_url: existingPhoto,
    });
    setMessage('');
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete student "${name}"?`)) return;

    deleteStudentPhoto(id);
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      setMessage(`Error deleting student: ${error.message}`);
    } else {
      setMessage(`Student "${name}" deleted successfully.`);
      fetchStudents();
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setForm((f) => ({ ...f, photo_url: compressed }));
      } catch (err: any) {
        alert('Could not read image file: ' + err.message);
      }
    }
  };

  // Direct front-of-student photo upload from row file picker
  const handleDirectPhotoUpload = async (student: StudentRecord, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !student.id) return;

    setMessage(`Uploading and saving photo for ${student.full_name}...`);
    const result = await saveStudentPhoto(student.id, file);

    if (result.success) {
      setMessage(`Photo successfully updated for ${student.full_name}!`);
      // Update local student state
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, photo_url: result.photoUrl } : s))
      );
      if (photoManagerStudent?.id === student.id) {
        setPhotoManagerStudent({ ...photoManagerStudent, photo_url: result.photoUrl });
      }
    } else {
      setMessage(`Error saving photo: ${result.error}`);
    }
    // reset input
    if (e.target) e.target.value = '';
  };

  // ── Live Camera Capture & Direct Update ─────────────────────
  const startCamera = async (studentToUpdate?: StudentRecord) => {
    setCameraError('');
    if (studentToUpdate) {
      setTargetStudentForCamera(studentToUpdate);
    } else {
      setTargetStudentForCamera(null);
    }
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setCameraError('Unable to access camera: ' + (err.message || 'Permission denied or no camera device found.'));
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
    setTargetStudentForCamera(null);
  };

  const captureCameraPhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = Math.min(video.videoWidth || 640, 480);
      canvas.height = Math.min(video.videoHeight || 480, 480);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rawDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const compressedDataUrl = await compressImage(rawDataUrl, 320, 320, 0.82);

        if (targetStudentForCamera && targetStudentForCamera.id) {
          const result = await saveStudentPhoto(targetStudentForCamera.id, compressedDataUrl);
          if (result.success) {
            setMessage(`Camera photo updated for ${targetStudentForCamera.full_name}!`);
            setStudents((prev) =>
              prev.map((s) => (s.id === targetStudentForCamera.id ? { ...s, photo_url: compressedDataUrl } : s))
            );
            if (photoManagerStudent?.id === targetStudentForCamera.id) {
              setPhotoManagerStudent({ ...photoManagerStudent, photo_url: compressedDataUrl });
            }
          } else {
            setMessage(`Error updating photo: ${result.error}`);
          }
        } else {
          setForm((f) => ({ ...f, photo_url: compressedDataUrl }));
        }

        stopCamera();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    const payload: any = {
      full_name: form.full_name.trim(),
      admission_number: form.admission_number.trim(),
      class_id: form.class_id,
      status: form.status,
    };

    if (form.photo_url) {
      payload.photo_url = form.photo_url;
    }

    let error: any = null;
    let savedId = editingId;

    if (editingId) {
      const res = await supabase.from('students').update(payload).eq('id', editingId);
      if (res.error && res.error.code === 'PGRST204') {
        // Retry without photo_url column if DB doesn't have it yet
        delete payload.photo_url;
        const retry = await supabase.from('students').update(payload).eq('id', editingId);
        error = retry.error;
      } else {
        error = res.error;
      }

      if (form.photo_url && !error) {
        saveStudentPhoto(editingId, form.photo_url);
      }
    } else {
      const res = await supabase.from('students').insert(payload).select();
      if (res.error && res.error.code === 'PGRST204') {
        delete payload.photo_url;
        const retry = await supabase.from('students').insert(payload).select();
        error = retry.error;
        if (retry.data && retry.data[0]) {
          savedId = retry.data[0].id;
        }
      } else {
        error = res.error;
        if (res.data && res.data[0]) {
          savedId = res.data[0].id;
        }
      }

      if (savedId && form.photo_url && !error) {
        saveStudentPhoto(savedId, form.photo_url);
      }
    }

    setSubmitting(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(editingId ? 'Student updated successfully!' : 'Student added successfully!');
      setForm({ full_name: '', admission_number: '', class_id: '', status: 'active', photo_url: '' });
      setShowModal(false);
      fetchStudents();
    }
  };

  // ── Excel / CSV / File Reader ────────────────────────────────
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setPdfTextContent('');

    if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
      setImportedRows([]);
      setPdfTextContent(
        `📄 PDF File Loaded: "${file.name}" (${(file.size / 1024).toFixed(1)} KB).\nTo import students automatically, please upload an Excel (.xlsx / .csv) file, or use the Add Student form.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed = rawData.map((row, index) => {
          const name =
            row['Name'] ||
            row['Full Name'] ||
            row['Student Name'] ||
            row['full_name'] ||
            row['name'] ||
            `Student ${index + 1}`;
          const idNum =
            row['ID Number'] ||
            row['ID'] ||
            row['Admission Number'] ||
            row['admission_number'] ||
            row['ID_Number'] ||
            `ID-${Math.floor(100000 + Math.random() * 900000)}`;
          const className =
            row['Class'] ||
            row['Class Name'] ||
            row['class_name'] ||
            row['class'] ||
            classes[0]?.name ||
            'P1';

          const matchedClass =
            classes.find((c) => c.name.trim().toLowerCase() === String(className).trim().toLowerCase()) ||
            classes[0];

          return {
            full_name: String(name).trim(),
            admission_number: String(idNum).trim(),
            class_name: matchedClass?.name || 'Standard',
            class_id: matchedClass?.id || classes[0]?.id || '',
          };
        });

        setImportedRows(parsed);
      } catch (err: any) {
        alert('Error parsing file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    if (importedRows.length === 0) return;
    setImporting(true);

    const payload = importedRows.map((r) => ({
      full_name: r.full_name,
      admission_number: r.admission_number,
      class_id: r.class_id,
      status: 'active',
    }));

    const { error } = await supabase.from('students').insert(payload);
    setImporting(false);

    if (error) {
      alert('Import error: ' + error.message);
    } else {
      setMessage(`Successfully imported ${importedRows.length} new students from ${importFileName}!`);
      setShowImportModal(false);
      setImportedRows([]);
      setImportFileName('');
      fetchStudents();
    }
  };

  if (loading) return <div className="text-slate-500">Loading students...</div>;

  return (
    <div className="space-y-6">
      {/* Hidden canvas for taking snapshot */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header & Quick Action Buttons */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Students</h2>
          <p className="text-slate-500 mt-1">
            Manage student records, photos (upload front of student or live camera), and imports.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowImportModal(true);
              setImportedRows([]);
              setImportFileName('');
              setPdfTextContent('');
            }}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Excel / PDF</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 bg-primary-700 hover:bg-primary-800 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg font-medium flex items-center justify-between ${
            message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-xs font-bold underline opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Student List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
              <th className="px-6 py-4 font-semibold">Photo (Front)</th>
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">ID Number</th>
              <th className="px-6 py-4 font-semibold">Class</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No students yet. Click "Add Student" or "Import Excel / PDF" to get started.
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const photoSrc = getStudentPhoto(student.id, student.photo_url);
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    {/* PHOTO COLUMN IN FRONT OF STUDENT */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {/* Avatar with click to open photo manager */}
                        <div
                          className="relative group cursor-pointer"
                          onClick={() => setPhotoManagerStudent(student)}
                          title="Click to view or manage photo"
                        >
                          <StudentAvatar
                            studentId={student.id}
                            photoUrl={student.photo_url}
                            name={student.full_name}
                            size="w-11 h-11"
                          />
                          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </div>

                        {/* Quick Direct Actions in front of student */}
                        <div className="flex flex-col gap-1">
                          {/* Direct File Upload button */}
                          <label
                            className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium cursor-pointer transition-colors shadow-2xs border border-slate-200"
                            title="Upload photo file for this student"
                          >
                            <Upload className="w-3 h-3 text-slate-500" />
                            <span>Upload</span>
                            <input
                              ref={(el) => {
                                if (student.id) fileInputRefs.current[student.id] = el;
                              }}
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleDirectPhotoUpload(student, e)}
                              className="hidden"
                            />
                          </label>

                          {/* Live Camera Button */}
                          <button
                            type="button"
                            onClick={() => startCamera(student)}
                            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium transition-colors border border-emerald-200 shadow-2xs"
                            title="Capture live camera photo for this student"
                          >
                            <Camera className="w-3 h-3 text-emerald-600" />
                            <span>Camera</span>
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-medium text-slate-800">{student.full_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-sm">{student.admission_number}</td>
                    <td className="px-6 py-4 text-slate-600">{student.classes?.name || '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                          student.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => setPhotoManagerStudent(student)}
                          className="text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1 text-xs bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200"
                          title="View & Change Student Photo"
                        >
                          <ImageIcon className="w-3.5 h-3.5" /> Photo
                        </button>
                        <button
                          onClick={() => handleOpenEdit(student)}
                          className="text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 text-xs bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg border border-primary-200"
                        >
                          <Edit className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(student.id!, student.full_name)}
                          className="text-red-500 hover:text-red-700 font-medium flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg border border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Direct Student Photo Manager Lightbox Modal ─────────── */}
      {photoManagerStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-slate-800">Photo: {photoManagerStudent.full_name}</h3>
              </div>
              <button
                onClick={() => setPhotoManagerStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-center">
              <div className="flex justify-center">
                {getStudentPhoto(photoManagerStudent.id, photoManagerStudent.photo_url) ? (
                  <img
                    src={getStudentPhoto(photoManagerStudent.id, photoManagerStudent.photo_url)}
                    alt={photoManagerStudent.full_name}
                    className="w-48 h-48 object-cover rounded-2xl border-4 border-white shadow-xl ring-1 ring-slate-200"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-2xl bg-primary-50 border-2 border-dashed border-primary-300 flex flex-col items-center justify-center text-primary-700">
                    <StudentAvatar
                      studentId={photoManagerStudent.id}
                      name={photoManagerStudent.full_name}
                      size="w-20 h-20 text-2xl"
                    />
                    <span className="text-xs font-medium mt-3 text-slate-500">No photo uploaded yet</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 font-mono">
                ID Number: <span className="font-semibold text-slate-700">{photoManagerStudent.admission_number}</span>
              </div>

              {/* Action buttons inside photo modal */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-50 hover:bg-primary-100 text-primary-700 font-semibold rounded-xl text-xs cursor-pointer border border-primary-200 transition-colors shadow-sm">
                  <Upload className="w-4 h-4" />
                  <span>Upload Photo File</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleDirectPhotoUpload(photoManagerStudent, e)}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    const s = photoManagerStudent;
                    setPhotoManagerStudent(null);
                    startCamera(s);
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm"
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Camera Photo</span>
                </button>
              </div>

              {getStudentPhoto(photoManagerStudent.id, photoManagerStudent.photo_url) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm(`Remove photo for ${photoManagerStudent.full_name}?`)) {
                      if (photoManagerStudent.id) {
                        await deleteStudentPhoto(photoManagerStudent.id);
                        setStudents((prev) =>
                          prev.map((s) => (s.id === photoManagerStudent.id ? { ...s, photo_url: undefined } : s))
                        );
                        setPhotoManagerStudent({ ...photoManagerStudent, photo_url: undefined });
                        setMessage(`Photo removed for ${photoManagerStudent.full_name}.`);
                      }
                    }
                  }}
                  className="w-full text-xs text-red-500 hover:text-red-700 font-medium py-1"
                >
                  Remove Current Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Excel / PDF / File Upload Space Modal ──────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-800">Easy Bulk Import (Excel / CSV / PDF)</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-8 text-center bg-slate-50 hover:bg-emerald-50/50 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={handleExcelUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">Click to upload or drag & drop your file here</p>
                <p className="text-xs text-slate-400 mt-1">Supports Excel (.xlsx, .xls), CSV (.csv), and PDF (.pdf)</p>
              </div>

              {pdfTextContent && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm whitespace-pre-wrap font-mono">
                  {pdfTextContent}
                </div>
              )}

              {importedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Parsed {importedRows.length} Students from "{importFileName}"
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 border-b">
                          <th className="p-2.5 font-semibold">#</th>
                          <th className="p-2.5 font-semibold">Student Name</th>
                          <th className="p-2.5 font-semibold">ID Number</th>
                          <th className="p-2.5 font-semibold">Assigned Class</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 text-slate-400">{i + 1}</td>
                            <td className="p-2.5 font-medium text-slate-800">{r.full_name}</td>
                            <td className="p-2.5 font-mono text-slate-600">{r.admission_number}</td>
                            <td className="p-2.5 text-slate-600">{r.class_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => {
                        setImportedRows([]);
                        setImportFileName('');
                      }}
                      className="px-4 py-2 text-slate-600 font-medium text-sm"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleBulkImport}
                      disabled={importing}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {importing ? 'Importing...' : `Confirm & Import ${importedRows.length} Students`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Live Camera Capture Modal ───────────────────────────── */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold">
                  {targetStudentForCamera
                    ? `Update Photo for ${targetStudentForCamera.full_name}`
                    : 'Live Camera Capture'}
                </h3>
              </div>
              <button onClick={stopCamera} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-center bg-slate-950">
              {cameraError ? (
                <div className="p-4 bg-red-900/50 text-red-200 text-sm rounded-lg border border-red-800">
                  {cameraError}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-xl pointer-events-none" />
                </div>
              )}

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-5 py-2 text-slate-400 hover:text-white font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureCameraPhoto}
                  disabled={!!cameraError}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  {targetStudentForCamera ? 'Snap & Save Photo' : 'Capture Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Single Student Modal (with File & Camera Photo Upload) ──── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Edit Student' : 'Add New Student'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Photo Upload & Live Camera Options */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-4">
                  <StudentAvatar photoUrl={form.photo_url} name={form.full_name || 'Student'} size="w-14 h-14" />
                  <div className="flex-1 text-xs space-y-1">
                    <label className="block font-semibold text-slate-700">
                      {form.photo_url ? 'Current Photo' : 'Student Photo'}
                    </label>
                    <p className="text-slate-400">
                      {form.photo_url
                        ? 'Click Retake Camera Photo or upload a new file to update.'
                        : 'Upload an image file or snap a live camera photo.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg font-medium text-xs cursor-pointer shadow-sm">
                    <ImageIcon className="w-3.5 h-3.5 text-primary-600" />
                    <span>Upload File</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
                  >
                    {form.photo_url ? <RefreshCw className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                    <span>{form.photo_url ? 'Retake Photo' : 'Live Camera'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Jean Pierre Habimana"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ID Number</label>
                <input
                  type="text"
                  required
                  value={form.admission_number}
                  onChange={(e) => setForm({ ...form, admission_number: e.target.value })}
                  placeholder="e.g. 1200180012345678"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
                {classes.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                    ⚠️ No classes found. Please add classes first.
                  </p>
                ) : (
                  <select
                    required
                    value={form.class_id}
                    onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm"
                  >
                    <option value="">Select a class...</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} — {cls.level}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || classes.length === 0}
                  className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-60 text-sm"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Student' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
