import { createContext, useContext, type ReactNode } from 'react';

// Simplified context since login is removed
const AuthContext = createContext({
  user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@school.com' },
  role: 'admin', // Hardcoded as admin so you can see everything
  loading: false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  return (
    <AuthContext.Provider value={{
      user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@school.com' },
      role: 'admin',
      loading: false,
      signOut: async () => {}
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
