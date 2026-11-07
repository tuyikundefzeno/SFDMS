import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AccountantDashboard } from './pages/AccountantDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { LiveReport } from './pages/LiveReport';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Semesters } from './pages/Semesters';
import { Payments } from './pages/Payments';

const RequireAuth = () => {
  const { user, role, loading, authError } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <p className="max-w-lg text-center text-red-700">{authError ?? 'Your account does not have access to this application.'}</p>
      </div>
    );
  }
  return <Outlet />;
};

const RequireRole = ({ allowedRole }: { allowedRole: 'admin' | 'accountant' }) => {
  const { role } = useAuth();
  if (role !== allowedRole) {
    return <Navigate to={role === 'admin' ? '/admin' : '/accountant'} replace />;
  }
  return <Outlet />;
};

const HomeRedirect = () => {
  const { role } = useAuth();
  return <Navigate to={role === 'admin' ? '/admin' : '/accountant'} replace />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route element={<RequireRole allowedRole="accountant" />}>
                <Route path="/accountant" element={<AccountantDashboard />} />
              </Route>
              <Route element={<RequireRole allowedRole="admin" />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/reports" element={<LiveReport />} />
                <Route path="/admin/students" element={<Students />} />
                <Route path="/admin/classes" element={<Classes />} />
                <Route path="/admin/semesters" element={<Semesters />} />
                <Route path="/admin/payments" element={<Payments />} />
              </Route>
              <Route path="*" element={<HomeRedirect />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
