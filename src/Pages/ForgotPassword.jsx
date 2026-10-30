import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import LOGINBG1 from '../assets/LOGINBG1.jpg'
import logotry from '../assets/logo.jpg'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Uses the variable names already defined in .env
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_KEY

      if (!supabaseUrl || !anonKey) {
        console.error('Missing env vars:', {
          VITE_SUPABASE_URL: !!supabaseUrl,
          VITE_SUPABASE_KEY: !!anonKey,
        })
        setError('Missing configuration. Please contact support.')
        return
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({
            email: email.trim(),
            redirectTo: `${window.location.origin}/set-password`,
          }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        console.error('Forgot password error:', response.status, data)
        setError(data.error || data.message || 'Something went wrong. Please try again.')
        return
      }

      setDone(true)
    } catch (err) {
      console.error(err)
      setError('Could not connect. Please check your internet and try again.')
    } finally {
      setSubmitting(false)
    }
  }

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
              className="mx-auto h-20 w-20 rounded-full shadow-sm border-2 border-white/50 bg-white/30"
            />
            <h2 className="mt-4 text-2xl sm:text-3xl font-semibold text-red-700">
              Forgot password?
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Enter your email and we’ll send you a reset link
            </p>
          </div>

          {done ? (
            <div className="mt-6 text-center space-y-4">
              <div className="bg-white/40 rounded-lg px-4 py-3 text-sm text-gray-800">
                If an account exists for <strong>{email}</strong>, a reset link has been sent.
                Please check your inbox.
              </div>
              <Link
                to="/"
                className="inline-block text-sm font-semibold text-red-700 hover:text-red-900 underline"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label className="text-sm font-medium text-red-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray-700 placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                  placeholder="Enter your email"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50/80 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg bg-red-600/90 text-white font-semibold hover:bg-red-700 transition-all duration-300 hover:scale-105 shadow-md disabled:opacity-50 disabled:hover:scale-100"
              >
                {submitting ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link
                  to="/"
                  className="text-sm font-medium text-red-700 hover:text-red-900 underline"
                >
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword