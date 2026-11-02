import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../api/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeactivationModal, setShowDeactivationModal] = useState(false);

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
      .maybeSingle();
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

      // Profile truly missing or deactivated -> force logout
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

  // Listen for live deactivation while the user is already logged in
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-active-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new.active === false) {
            // Show modal first instead of logging out immediately
            setShowDeactivationModal(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Initial session + auth state listener
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

  const handleAcknowledgeDeactivation = async () => {
    setShowDeactivationModal(false);
    await supabase.auth.signOut();
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ user, role, fullName, loading }}>
      {children}

      {/* Deactivation Modal */}
      {showDeactivationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Account Deactivated
            </h2>

            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              Your account has been deactivated by an administrator.
              <br />
              You will now be logged out.
            </p>

            <button
              onClick={handleAcknowledgeDeactivation}
              className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-2.5 rounded-lg transition"
            >
              OK, Log me out
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);