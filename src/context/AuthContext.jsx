// context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;

      if (session) {
        supabase
          .from('profiles')
          .select('role, active')
          .eq('id', session.user.id)
          .single()
          .then(async ({ data, error }) => {
            if (!error && data?.active === false) {
              await supabase.auth.signOut();
              setUser(null);
              setRole(null);
              setLoading(false);
              return;
            }

            setUser(session.user);
            if (!error && data) {
              setRole(data.role);
            }
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          supabase
            .from('profiles')
            .select('role, active')
            .eq('id', session.user.id)
            .single()
            .then(async ({ data, error }) => {
              if (!error && data?.active === false) {
                await supabase.auth.signOut();
                setUser(null);
                setRole(null);
                return;
              }

              setUser(session.user);
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

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);