import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../api/supabase'

function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

        setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setSaving(false)
      setError(error.message)
      return
    }

    const { error: activateError } = await supabase.rpc('activate_my_profile')
    setSaving(false)

    if (activateError) {
      // Password is already set at this point, don't block the user over
      // this, just log it. Worst case, an admin sees "Invited" a bit longer.
      console.error('activate_my_profile failed:', activateError)
    }

    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-sm">
        <h1 className="text-lg font-bold text-gray-800 mb-4">Set your password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-md transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SetPassword