import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import LOGINBG1 from '../assets/LOGINBG1.jpg'
import logotry from '../assets/logo.jpg'
import { supabase } from '../api/supabase'

function ErrorModal({ title, message, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle size={26} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-800">{title}</h3>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{message}</p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errorModal, setErrorModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
        return
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setReady(true)
          subscription.unsubscribe()
        }
      })

      const timeout = setTimeout(() => {
        setReady(true)
        subscription.unsubscribe()
      }, 3000)

      return () => {
        clearTimeout(timeout)
        subscription.unsubscribe()
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorModal(null)

    if (password !== confirm) {
      setErrorModal({
        title: 'Passwords do not match',
        message: 'Please make sure both password fields are the same.',
      })
      return
    }

    if (password.length < 8) {
      setErrorModal({
        title: 'Password too short',
        message: 'Password must be at least 8 characters long.',
      })
      return
    }

    setSaving(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setSaving(false)
      setErrorModal({
        title: 'Could not set password',
        message: error.message || 'Something went wrong. Please try again.',
      })
      return
    }

    const { error: activateError } = await supabase.rpc('activate_my_profile')
    setSaving(false)

    if (activateError) {
      console.error('activate_my_profile failed:', activateError)
    }

    navigate('/')
  }

  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 font-poppins"
        style={{
          backgroundImage: `url(${LOGINBG1})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <p className="text-white text-sm bg-black/30 backdrop-blur-sm px-4 py-2 rounded-lg">
          Preparing your account...
        </p>
      </div>
    )
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
              className="mx-auto h-20 w-20 sm:h-25 sm:w-25 rounded-full shadow-sm border-2 border-white/50 bg-white/30 transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl hover:border-red-500/70 cursor-pointer"
            />
            <h2 className="mt-4 text-2xl sm:text-3xl font-semibold text-red-700">
              Set your password
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Create a password to finish setting up your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* New Password */}
            <div>
              <label className="text-sm font-medium text-red-700">New password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={saving}
                  className="w-full pl-4 pr-12 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray-700 placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={saving}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-red-700 hover:text-red-900 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-sm font-medium text-red-700">Confirm password</label>
              <div className="relative mt-1">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  disabled={saving}
                  className="w-full pl-4 pr-12 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray-700 placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition disabled:opacity-60"
                  placeholder="Repeat your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  disabled={saving}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-red-700 hover:text-red-900 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-lg bg-red-600/90 backdrop-blur-sm text-white font-semibold hover:bg-red-700 transition-all duration-300 ease-in-out hover:scale-105 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? 'Saving...' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>

      {errorModal && (
        <ErrorModal
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal(null)}
        />
      )}
    </div>
  )
}

export default SetPassword