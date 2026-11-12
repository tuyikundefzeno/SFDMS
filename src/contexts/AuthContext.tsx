import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  role: 'leader' | 'admin' | null;
  schoolId: string | null;
  profileLoading: boolean;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'leader' | 'admin' | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
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
      setSchoolId(null);
      setProfileLoading(true);
      setAuthError(null);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) {
        setAuthError(`Unable to restore your session: ${error.message}`);
        setLoading(false);
        return;
      }
      setUser(data.session?.user ?? null);
      setRole(null);
      setSchoolId(null);
      setProfileLoading(Boolean(data.session?.user));
      setLoading(false);
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

  useEffect(() => {
    let active = true;
    if (!user) {
      setRole(null);
      setSchoolId(null);
      setProfileLoading(false);
      return () => { active = false; };
    }

    void supabase.from('users').select('role, school_id').eq('id', user.id).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setAuthError(`Unable to load your school profile: ${error?.message ?? 'Profile not found'}`);
          setRole(null);
          setSchoolId(null);
          setProfileLoading(false);
          return;
        }
        setRole(data.role === 'admin' ? 'admin' : 'leader');
        setSchoolId(data.school_id);
        setProfileLoading(false);
      });

    return () => { active = false; };
  }, [user]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, role, schoolId, profileLoading, loading, authError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
