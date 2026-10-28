import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../api/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);
  const profileUserId = useRef(null);

  const clearAuth = () => {
    profileUserId.current = null;
    setUser(null);
    setRole(null);
    setFullName(null);
  };

  const loadProfile = async (userId) => {
    try {
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
    } catch (err) {
      console.error("Failed to load profile:", err);
      return null;
    }
  };

  const applySession = async (session) => {
    if (!session?.user) {
      clearAuth();
      setLoading(false);
      return;
    }

    // Already loaded this user → just make sure loading is off
    if (profileUserId.current === session.user.id) {
      setLoading(false);
      return;
    }

    profileUserId.current = session.user.id;

    const profile = await loadProfile(session.user.id);

    // Account deactivated → force sign out
    if (profile?.active === false) {
      await supabase.auth.signOut();
      clearAuth();
      setLoading(false);
      return;
    }

    // Profile missing → treat as not authenticated (don't leave half-logged-in state)
    if (!profile) {
      console.warn("No profile found for user, signing out");
      profileUserId.current = null;
      await supabase.auth.signOut();
      clearAuth();
      setLoading(false);
      return;
    }

    setUser(session.user);
    setRole(profile.role || null);
    setFullName(profile.full_name || null);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    // 1. Restore session on first load / refresh
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data.session);
    });

    // 2. Listen for future auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Defer so we never run async Supabase work directly inside the callback
        setTimeout(() => {
          if (mounted) applySession(session);
        }, 0);
      }
    );

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