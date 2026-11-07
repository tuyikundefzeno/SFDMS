import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type UserRole = 'admin' | 'accountant';

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setRole(null);
      setAuthError(null);
      if (!nextUser) setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) {
        setAuthError(`Unable to restore your session: ${error.message}`);
        setLoading(false);
        return;
      }
      setUser(data.session?.user ?? null);
      if (!data.session?.user) setLoading(false);
    }).catch((error: unknown) => {
      if (!active || authEventReceived) return;
      setAuthError(`Unable to restore your session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id;

  useEffect(() => {
    let active = true;

    if (!userId) {
      setRole(null);
      return () => { active = false; };
    }

    setRole(null);
    setAuthError(null);
    setLoading(true);
    void Promise.resolve(supabase.rpc('get_user_role')).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(`Unable to verify your account role: ${error.message}`);
      } else if (data === 'admin' || data === 'accountant') {
        setRole(data);
      } else {
        setAuthError('Your account has no assigned role. Contact an administrator.');
      }
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(`Unable to verify your account role: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    });

    return () => { active = false; };
  }, [userId]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, authError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
