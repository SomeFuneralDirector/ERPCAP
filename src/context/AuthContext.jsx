// context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../api/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, active, full_name")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Failed to load profile:", error.message);
      return null;
    }
    return data;
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;

      if (session) {
        const profile = await loadProfile(session.user.id);

        if (profile?.active === false) {
          await supabase.auth.signOut();
          setUser(null);
          setRole(null);
          setFullName(null);
          setLoading(false);
          return;
        }

        setUser(session.user);
        setRole(profile?.role || null);
        setFullName(profile?.full_name || null);
      }

      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await loadProfile(session.user.id);

          if (profile?.active === false) {
            await supabase.auth.signOut();
            setUser(null);
            setRole(null);
            setFullName(null);
            return;
          }

          setUser(session.user);
          setRole(profile?.role || null);
          setFullName(profile?.full_name || null);
        } else {
          setUser(null);
          setRole(null);
          setFullName(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, fullName, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);