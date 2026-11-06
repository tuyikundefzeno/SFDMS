import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { AccountantDashboard } from './pages/AccountantDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { LiveReport } from './pages/LiveReport';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Semesters } from './pages/Semesters';
import { Payments } from './pages/Payments';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/admin" replace />} />

            <Route path="/accountant" element={<AccountantDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/reports" element={<LiveReport />} />
            <Route path="/admin/students" element={<Students />} />
            <Route path="/admin/classes" element={<Classes />} />
            <Route path="/admin/semesters" element={<Semesters />} />
            <Route path="/admin/payments" element={<Payments />} />

            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
