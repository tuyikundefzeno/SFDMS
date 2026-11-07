import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen } from 'lucide-react';

export const Login = () => {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading, authError } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  if (user) {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setNotice('');

    try {
      if (isSigningUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else if (!data.session) {
          setIsSigningUp(false);
          setPassword('');
          setNotice('Account created. Check your email to confirm your address, then sign in.');
        } else {
          setNotice('Account created. You now have full access to the system.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) setError(signInError.message);
      }
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to complete your request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center shadow-lg">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          School Feeding Management
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isSigningUp ? 'Create an account for full access to the system' : 'Sign in to access your dashboard'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-slate-100">
          {!user && <form className="space-y-6" onSubmit={handleLogin}>
            {(error || authError) && (
              <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                {error || authError}
              </div>
            )}
            {notice && (
              <div role="status" className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm border border-emerald-100">
                {notice}
              </div>
            )}

            {isSigningUp && (
              <div>
                <label htmlFor="full-name" className="block text-sm font-medium text-slate-700">
                  Full name
                </label>
                <div className="mt-1">
                  <input
                    id="full-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete={isSigningUp ? 'new-password' : 'current-password'}
                  minLength={isSigningUp ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-70"
              >
                {isLoading
                  ? (isSigningUp ? 'Creating account...' : 'Signing in...')
                  : (isSigningUp ? 'Create account' : 'Sign in')}
              </button>
            </div>
            <p className="text-center text-sm text-slate-600">
              {isSigningUp ? 'Already have an account?' : 'Need an account?'}{' '}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setIsSigningUp(!isSigningUp);
                  setError('');
                  setNotice('');
                }}
                className="font-medium text-primary-700 hover:text-primary-800 disabled:opacity-70"
              >
                {isSigningUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </form>}
        </div>
      </div>
    </div>
  );
};
