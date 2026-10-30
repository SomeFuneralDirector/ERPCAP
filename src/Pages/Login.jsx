import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import LOGINBG1 from '../assets/LOGINBG1.jpg';
import logotry from '../assets/logo.jpg';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../api/supabase';

const LOCKOUT_MINUTES = 5;
const MAX_ATTEMPTS = 5;

// Turn raw auth errors into short, friendly messages.
const friendlyAuthError = (message = '') => {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Your email or password is incorrect. Please check and try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Please check your inbox.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'We could not connect. Please check your internet and try again.';
  }
  return message || 'Something went wrong. Please try again.';
};

function ErrorModal({ title, message, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="login-error-title"
        aria-describedby="login-error-message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle size={26} />
        </div>

        <h3 id="login-error-title" className="mt-4 text-lg font-semibold text-gray-800">
          {title}
        </h3>
        <p id="login-error-message" className="mt-2 text-sm text-gray-600 leading-relaxed">
          {message}
        </p>

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorModal, setErrorModal] = useState(null);
  const navigate = useNavigate();

  const showError = (title, message) => setErrorModal({ title, message });
  const closeError = () => setErrorModal(null);

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
        status,
        user_agent: navigator.userAgent,
      },
    ]);

    if (logError) {
      console.error('Failed to record login log:', logError.message);
    }
  };

  const checkLockout = async () => {
    const { data, error } = await supabase.rpc('get_login_lockout', { p_email: email });
    if (error) {
      console.error('Lockout check failed:', error.message);
      return null;
    }
    return data ? new Date(data) : null;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (submitting || remainingSeconds > 0) return;

    setSubmitting(true);
    closeError();

    try {
      const currentLock = await checkLockout();
      if (currentLock && currentLock.getTime() > Date.now()) {
        setLockedUntil(currentLock);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        await logLogin('failed');

        const newLock = await checkLockout();
        if (newLock && newLock.getTime() > Date.now()) {
          setLockedUntil(newLock);
        } else {
          showError('Login failed', friendlyAuthError(error.message));
        }
        setPassword('');
        return;
      }

      const user = data.user;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, active')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        await logLogin('failed');
        await supabase.auth.signOut();
        showError(
          'No access',
          'No role is assigned to this account. Please contact your admin.'
        );
        return;
      }

      if (profile.active === false) {
        await logLogin('failed');
        await supabase.auth.signOut();
        showError(
          'Account deactivated',
          'This account has been deactivated. Please contact your admin.'
        );
        return;
      }

      await logLogin('success');

      await new Promise((r) => setTimeout(r, 150));

      const roleRoutes = {
        admin: '/admin',
        marketing: '/marketing',
        sales: '/sales',
        inventory: '/inventory',
        production: '/production',
      };

      navigate(roleRoutes[profile.role] || '/', { replace: true });
    } catch (err) {
      console.error('Unexpected login error:', err);
      showError(
        'Something went wrong',
        friendlyAuthError(err?.message || 'Please try again.')
      );
      setPassword('');
    } finally {
      setSubmitting(false);
    }
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
            <p className="text-sm text-red-700 mt-1">Log in to continue</p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-red-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLocked || submitting}
                className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray-700 placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-red-700">Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLocked || submitting}
                  className="w-full pl-4 pr-12 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray-700 placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isLocked || submitting}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-red-700 hover:text-red-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              {/* Forgot password under the password field */}
              <div className="mt-2 text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-red-700 hover:text-red-900 underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {isLocked && (
              <p className="text-sm font-medium text-red-700 bg-white/40 rounded-lg px-3 py-2 text-center">
                Too many failed attempts. Try again in {minutes}:
                {String(seconds).padStart(2, '0')}.
              </p>
            )}

            <button
              type="submit"
              disabled={isLocked || submitting}
              className="w-full py-3 rounded-lg bg-red-600/90 backdrop-blur-sm text-white font-semibold hover:bg-red-700 transition-all duration-300 ease-in-out hover:scale-105 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isLocked ? 'Locked' : submitting ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        </div>
      </div>

      {errorModal && (
        <ErrorModal
          title={errorModal.title}
          message={errorModal.message}
          onClose={closeError}
        />
      )}
    </div>
  );
}

export default Login;