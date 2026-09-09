import React, { useState, useEffect } from 'react';
import LOGINBG1 from '../assets/LOGINBG1.jpg';
import IFLOGO from '../assets/IFLOGO.jpeg';
import logotry from '../assets/logo.jpg'
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';

const LOCKOUT_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function Login() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lockedUntil, setLockedUntil] = useState(null); // Date | null
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Countdown ticker: recalculates remaining lockout time every second
  // and clears the lock once it expires.
  useEffect(() => {
    if (!lockedUntil) {
      setRemainingSeconds(0);
      return;
    }

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
      if (secondsLeft === 0) {
        setLockedUntil(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const logLogin = async (status) => {
    const { error: logError } = await supabase.from('login_logs').insert([
      {
        user_email: email,
        status, // 'success' | 'failed'
        user_agent: navigator.userAgent,
      },
    ]);

    if (logError) {
      // Logging should never break the login flow itself, but we do want to see why it failed
      console.error('Failed to record login log:', logError.message);
    }
  };

  const checkLockout = async () => {
    const { data, error } = await supabase.rpc('get_login_lockout', { p_email: email });
    if (error) {
      // If the lockout check itself fails, don't block login over it,
      // fail open rather than locking everyone out on an infra hiccup.
      console.error('Lockout check failed:', error.message);
      return null;
    }
    return data ? new Date(data) : null;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    // Re-check with the server before every attempt, not just trust
    // local state, since local state resets on refresh.
    const currentLock = await checkLockout();
    if (currentLock && currentLock.getTime() > Date.now()) {
      setLockedUntil(currentLock);
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      await logLogin('failed');

      // This failure may have just pushed them over the threshold,
      // check again so the countdown appears immediately.
      const newLock = await checkLockout();
      if (newLock && newLock.getTime() > Date.now()) {
        setLockedUntil(newLock);
      } else {
        alert(error.message);
      }

      setSubmitting(false);
      return
    }

    const user = data.user;

    const {data: profile, error: profileError} = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile){
      await logLogin('failed');
      await supabase.auth.signOut();
      alert("No role assigned to the user")
      setSubmitting(false);
      return;
    }

    if (profile.active === false) {
      await logLogin('failed');
      await supabase.auth.signOut();
      alert('This account has been deactivated. Contact your admin.');
      setSubmitting(false);
      return;
    }

    await logLogin('success');

    const roleRoutes = {
      admin: '/admin',
      marketing: '/marketing',
      sales: '/sales',
      inventory: '/inventory',
      production: '/production'
    };

    navigate(roleRoutes[profile.role] || '/')
  };

  const isLocked = remainingSeconds > 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 font-poppins relative"
      style={{
        backgroundImage: `url(${LOGINBG1})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    > 
      <div className="w-full max-w-md relative z-10">
        
        <div className="bg-white/20 backdrop-blur-md rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/30">

          <div className="text-center">
            <img
              src={logotry}
              alt="logo"
              className="mx-auto h-20 w-20 sm:h-25 sm:w-25 rounded-full shadow-sm border-2 border-white/50 bg-white/30 transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl hover:border-red-500/70 cursor-pointer"
            />
            <h2 className="mt-4 text-2xl sm:text-3xl font-semibold text-red-700">
              Welcome Back
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Sign in to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-red-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLocked || submitting}
                className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray/500 placeholder-gray focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-red-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLocked || submitting}
                className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray/500 placeholder-gray focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                placeholder="Enter your password"
              />
            </div>

            {isLocked && (
              <p className="text-sm font-medium text-red-700 bg-white/40 rounded-lg px-3 py-2 text-center">
                Too many failed attempts. Try again in {minutes}:{String(seconds).padStart(2, '0')}.
              </p>
            )}

            <button
              type="submit"
              disabled={isLocked || submitting}
              className="w-full py-3 rounded-lg bg-red-600/90 backdrop-blur-sm text-white font-semibold hover:bg-red-700 transition-all duration-300 ease-in-out hover:scale-105 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isLocked ? 'Locked' : submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default Login;