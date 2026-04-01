// context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      console.log('Session data:', session);
      
      if (session) {
        setUser(session.user);
        
        // Fetch role from profiles table
        supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data, error }) => {
            console.log('Profile data:', data);
            console.log('Profile error:', error);
            
            if (!error && data) {
              console.log('Setting role to:', data.role);
              setRole(data.role);
            } else {
              console.log('No role found for user');
            }
            setLoading(false);
          });
      } else {
        console.log('No session found');
        setLoading(false);
      }
    });

    // Listen to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session);
        
        if (session?.user) {
          setUser(session.user);
          supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()
            .then(({ data }) => {
              console.log('Updated role:', data?.role);
              setRole(data?.role || null);
            });
        } else {
          setUser(null);
          setRole(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  console.log('AuthContext state - user:', user, 'role:', role, 'loading:', loading);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);