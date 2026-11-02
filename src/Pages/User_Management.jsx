import React, { useState, useEffect } from 'react'
import { supabase } from '../api/supabase'

const ROLES = ['admin', 'inventory', 'marketing', 'sales', 'production']

const C = {
  accent: '#B3211B',
  accentHover: '#8E1A15',
  accentSoft: '#FBEAE9',
  textMuted: '#6B6B70',
  border: '#E4E4E7',
}

function User_Management() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setUsers(data)
    }
    setLoading(false)
  }

  async function handleRoleChange(userId, newRole) {
    setSavingId(userId)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      setError(error.message)
    } else {
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, role: newRole } : u))
      )
    }
    setSavingId(null)
  }

  async function handleToggleActive(user) {
    setSavingId(user.id)
    const newActive = !user.active

    const { error } = await supabase
      .from('profiles')
      .update({ active: newActive })
      .eq('id', user.id)

    if (error) {
      setError(error.message)
    } else {
      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, active: newActive } : u))
      )
    }
    setSavingId(null)
  }

  function openAddModal() {
    setEditingUser(null)
    setModalOpen(true)
  }

  function openEditModal(user) {
    setEditingUser(user)
    setModalOpen(true)
  }

  async function handleSaveUser(formData) {
    setError(null)

    if (editingUser) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          role: formData.role,
        })
        .eq('id', editingUser.id)

      if (error) {
        setError(error.message)
        return
      }

      setUsers(prev =>
        prev.map(u =>
          u.id === editingUser.id ? { ...u, ...formData } : u
        )
      )
      setModalOpen(false)
      return
    }

    setCreating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setError('No authentication token found. Please log in again.')
        setCreating(false)
        return
      }

      const requestBody = {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        redirectTo: `${window.location.origin}/set-password`,
      }

      const response = await fetch(
        'https://ddwkxtffyajfdwveoann.supabase.co/functions/v1/admin-create-user',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || `Error ${response.status}: ${response.statusText}`)
        return
      }

      if (!data?.profile) {
        setError('User created but no profile returned')
        return
      }

      setUsers(prev => [data.profile, ...prev])
      setModalOpen(false)
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setCreating(false)
    }
  }

  const filteredUsers = users.filter(u => {
    const isDeactivated = u.active === false
    const isInvited = u.status === 'invited' && !isDeactivated

    if (activeTab === 'active' && (isDeactivated || isInvited)) return false
    if (activeTab === 'invited' && !isInvited) return false
    if (activeTab === 'deactivated' && !isDeactivated) return false

    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (
      search &&
      !u.full_name?.toLowerCase().includes(search.toLowerCase()) &&
      !u.email?.toLowerCase().includes(search.toLowerCase())
    )
      return false
    return true
  })

  const activeCount = users.filter(u => u.active !== false && u.status !== 'invited').length
  const invitedCount = users.filter(u => u.status === 'invited' && u.active !== false).length
  const deactivatedCount = users.filter(u => u.active === false).length

  function statusBadge(user) {
    if (user.active === false) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          Inactive
        </span>
      )
    }
    if (user.status === 'invited') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
          Invited
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        Active
      </span>
    )
  }

  return (
    <div className="p-6" style={{ backgroundColor: '#F6F6F7', minHeight: '100vh' }}>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        {activeTab !== 'deactivated' && (
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ backgroundColor: C.accent }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.accentHover)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.accent)}
          >
            + Add User
          </button>
        )}
      </div>

      {error && (
        <div
          className="rounded-md px-4 py-3 mb-4 text-sm border"
          style={{
            color: C.accent,
            backgroundColor: C.accentSoft,
            borderColor: '#F3C9C7',
          }}
        >
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {[
            { key: 'active', label: `Active Users (${activeCount})` },
            { key: 'invited', label: `Invited (${invitedCount})` },
            { key: 'deactivated', label: `Deactivated (${deactivatedCount})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'border-red-700 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 cursor-pointer"
          >
            <option value="all">All roles</option>
            {ROLES.map(r => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading users…</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No {activeTab} users found.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-900 text-white">
                  <th className="py-2.5 px-3 text-left text-xs font-semibold tracking-wide">Name</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold tracking-wide">Email</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold tracking-wide">Role</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold tracking-wide">Status</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const isDeactivated = user.active === false
                  const isInvited = user.status === 'invited' && !isDeactivated

                  return (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-gray-800">
                        {user.full_name || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{user.email}</td>
                      <td className="py-2.5 px-3">
                        {isDeactivated || isInvited ? (
                          <span className="text-xs text-gray-500 capitalize">
                            {user.role}
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            disabled={savingId === user.id}
                            onChange={e => handleRoleChange(user.id, e.target.value)}
                            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-red-300 cursor-pointer"
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 px-3">{statusBadge(user)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isDeactivated && !isInvited && (
                            <button
                              onClick={() => openEditModal(user)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={savingId === user.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                            style={
                              isDeactivated
                                ? {
                                    backgroundColor: '#F3F4F6',
                                    color: '#374151',
                                    border: '1px solid #D1D5DB',
                                  }
                                : {
                                    backgroundColor: C.accent,
                                    color: '#fff',
                                  }
                            }
                            onMouseEnter={e => {
                              if (!isDeactivated && !e.currentTarget.disabled) {
                                e.currentTarget.style.backgroundColor = C.accentHover
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isDeactivated) {
                                e.currentTarget.style.backgroundColor = C.accent
                              }
                            }}
                          >
                            {isDeactivated
                              ? 'Restore'
                              : isInvited
                              ? 'Cancel invite'
                              : 'Deactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <UserModal
          user={editingUser}
          saving={creating}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveUser}
        />
      )}
    </div>
  )
}

function UserModal({ user, saving, onClose, onSave }) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [role, setRole] = useState(user?.role || ROLES[0])

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ full_name: fullName, email, role })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            {user ? 'Edit User' : 'Add User'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Full Name <span style={{ color: C.accent }}>*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email <span style={{ color: C.accent }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={!!user}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-600 cursor-pointer"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {!user && (
            <p className="text-xs text-gray-400">
              An invite link will be emailed to this address. The user sets their own password when they click it.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: C.accent }}
              onMouseEnter={e => {
                if (!saving) e.currentTarget.style.backgroundColor = C.accentHover
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = C.accent
              }}
            >
              {saving ? 'Sending…' : user ? 'Save Changes' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default User_Management