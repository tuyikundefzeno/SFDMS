import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { LandingPage } from './pages/LandingPage';
import { AccountantDashboard } from './pages/AccountantDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { LiveReport } from './pages/LiveReport';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Semesters } from './pages/Semesters';
import { Payments } from './pages/Payments';
import { AIInsights } from './pages/AIInsights';

const RequireAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/accountant" element={<AccountantDashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/reports" element={<LiveReport />} />
              <Route path="/admin/students" element={<Students />} />
              <Route path="/admin/classes" element={<Classes />} />
              <Route path="/admin/semesters" element={<Semesters />} />
              <Route path="/admin/payments" element={<Payments />} />
              <Route path="/admin/ai-insights" element={<AIInsights />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
