import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../api/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(null); // { userId, promise }

  const clearAuth = () => {
    inFlight.current = null;
    setUser(null);
    setRole(null);
    setFullName(null);
  };

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, active, full_name")
      .eq("id", userId)
      .maybeSingle(); // returns null (no error) when no row exists
    return { data, error };
  };

  const applySession = (session) => {
    if (!session?.user) {
      clearAuth();
      setLoading(false);
      return Promise.resolve();
    }

    const userId = session.user.id;

    // Same user already loading/loaded -> wait for that SAME work
    if (inFlight.current?.userId === userId) {
      return inFlight.current.promise;
    }

    const promise = (async () => {
      const { data: profile, error } = await loadProfile(userId);

      // Transient error (network, etc.): keep the session, allow retry later
      if (error) {
        console.error("Failed to load profile:", error.message);
        inFlight.current = null;
        setUser(session.user);
        setLoading(false);
        return;
      }

      // Profile truly missing or deactivated -> sign out
      if (!profile || profile.active === false) {
        await supabase.auth.signOut();
        clearAuth();
        setLoading(false);
        return;
      }

      setUser(session.user);
      setRole(profile.role || null);
      setFullName(profile.full_name || null);
      setLoading(false);
    })();

    inFlight.current = { userId, promise };
    return promise;
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (mounted) applySession(session);
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, fullName, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);