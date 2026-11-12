import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, LayoutDashboard, FileBarChart, Users, BookOpen, CreditCard, CalendarDays, Sparkles, School } from 'lucide-react';

export const Layout = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Record Payment', path: '/accountant', icon: CreditCard },
    { name: 'Payments', path: '/admin/payments', icon: CreditCard },
    { name: 'Live Report', path: '/admin/reports', icon: FileBarChart },
    { name: 'Students', path: '/admin/students', icon: Users },
    { name: 'Classes', path: '/admin/classes', icon: BookOpen },
    { name: 'Semesters', path: '/admin/semesters', icon: CalendarDays },
    { name: 'AI Insights', path: '/admin/ai-insights', icon: Sparkles },
    ...(role === 'admin' ? [{ name: 'Schools', path: '/admin/schools', icon: School }] : []),
  ];

  if (!user) return <Outlet />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full bg-primary-900 text-white flex flex-col shadow-xl lg:w-64 lg:shrink-0">
        <div className="p-4 lg:p-6">
          <h1 className="text-xl font-bold leading-tight">School Feeding</h1>
          <p className="text-primary-300 text-sm mt-1">{role === 'admin' ? 'Administrator' : 'School access'}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:mt-2 lg:flex-1 lg:flex-col lg:space-y-1 lg:overflow-x-visible lg:px-4 lg:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex shrink-0 items-center space-x-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:space-x-3 lg:px-4 lg:py-3 lg:text-base ${
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
        <div className="flex items-center justify-between gap-3 border-t border-primary-800 p-3 lg:block lg:p-4">
          <div className="min-w-0 break-all px-2 text-xs text-primary-300 lg:mb-3 lg:text-sm">
            {user?.email}
          </div>
          <button
            onClick={handleSignOut}
            className="flex shrink-0 items-center space-x-2 rounded-lg px-3 py-2 text-left text-sm text-primary-100 transition-colors hover:bg-primary-800 hover:text-white lg:w-full lg:space-x-3 lg:px-4 lg:text-base"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-screen">
        <header className="z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-8 sm:py-4">
          <h2 className="text-xl font-semibold text-slate-800">
            {navItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}
          </h2>
        </header>
        <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
