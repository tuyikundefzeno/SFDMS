import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, LayoutDashboard, FileBarChart, Users, BookOpen, CreditCard, CalendarDays } from 'lucide-react';

export const Layout = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = role === 'admin' ? [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Payments', path: '/admin/payments', icon: CreditCard },
    { name: 'Live Report', path: '/admin/reports', icon: FileBarChart },
    { name: 'Students', path: '/admin/students', icon: Users },
    { name: 'Classes', path: '/admin/classes', icon: BookOpen },
    { name: 'Semesters', path: '/admin/semesters', icon: CalendarDays },
  ] : [
    { name: 'Record Payment', path: '/accountant', icon: CreditCard },
  ];

  if (!user) return <Outlet />;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-primary-900 text-white flex flex-col shadow-xl">
        <div className="p-6">
          <h1 className="text-xl font-bold leading-tight">School Feeding</h1>
          <p className="text-primary-300 text-sm mt-1 capitalize">{role} Portal</p>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary-700 text-white shadow-md'
                  : 'text-primary-100 hover:bg-primary-800 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-primary-800">
          <div className="mb-3 px-2 text-sm text-primary-300 break-all">
            {user?.email}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-3 px-4 py-2 w-full text-left text-primary-100 hover:bg-primary-800 hover:text-white rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white shadow-sm border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-slate-800">
            {navItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}
          </h2>
        </header>
        <div className="flex-1 overflow-auto p-8 bg-slate-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
