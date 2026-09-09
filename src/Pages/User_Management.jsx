import React, { useState, useEffect } from 'react'
import { supabase } from '../api/supabase'
import { Eye, EyeOff } from 'lucide-react'

const ROLES = ['admin', 'inventory', 'marketing', 'sales', 'production']

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
  const { error } = await supabase
    .from('profiles')
    .update({ active: !user.active })
    .eq('id', user.id)

  if (error) {
    setError(error.message)
  } else {
    setUsers(prev =>
      prev.map(u => (u.id === user.id ? { ...u, active: !u.active } : u))
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
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Inactive</span>
    }
    if (user.status === 'invited') {
      return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Invited</span>
    }
    return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            User Management
          </h1>
        </div>
        {activeTab !== 'deactivated' && (
          <button
            onClick={openAddModal}
            className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg shadow transition cursor-pointer"
          >
            + Add User
          </button>
        )}
      </div>

      {error && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 cursor-pointer font-semibold text-sm border-b-2 transition ${
              activeTab === 'active'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            Active Users ({activeCount})
          </button>
          <button
            onClick={() => setActiveTab('invited')}
            className={`px-4 py-2 cursor-pointer font-semibold text-sm border-b-2 transition ${
              activeTab === 'invited'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-amber-500'
            }`}
          >
            Invited ({invitedCount})
          </button>
          <button
            onClick={() => setActiveTab('deactivated')}
            className={`px-4 py-2 font-semibold cursor-pointer text-sm border-b-2 transition ${
              activeTab === 'deactivated'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            Deactivated ({deactivatedCount})
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
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
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
            >
              <option value="all">All roles</option>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-gray-400 text-sm italic">
            No {activeTab} users found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Role</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const isDeactivated = user.active === false
                  const isInvited = user.status === 'invited' && !isDeactivated

                  return (
                    <tr
                      key={user.id}
                      className={`border-b border-gray-100 hover:bg-red-50/40"
                      }`}
                    >
                      <td className="py-2 pr-4 font-medium text-gray-700">
                        {user.full_name || '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{user.email}</td>
                      <td className="py-2 pr-4">
                        {isDeactivated || isInvited ? (
                          <span className="text-xs text-gray-500 capitalize">
                            {user.role}
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            disabled={savingId === user.id}
                            onChange={e => handleRoleChange(user.id, e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-4">{statusBadge(user)}</td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isDeactivated && !isInvited && (
                            <button
                              onClick={() => openEditModal(user)}
                              className="text-red-600 hover:underline text-xs font-semibold"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={savingId === user.id}
                            className={`text-xs font-semibold transition disabled:opacity-50 ${
                              isDeactivated
                                ? 'text-gray-500 hover:text-gray-700 hover:underline'
                                : 'text-gray-400 hover:text-red-600 hover:underline'
                            }`}
                          >
                            {isDeactivated ? 'Restore' : isInvited ? 'Cancel invite' : 'Deactivate'}
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          {user ? 'Edit User' : 'Add User'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={!!user}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
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

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-700 hover:bg-red-600 text-white disabled:opacity-50"
            >
              {saving ? 'Sending...' : user ? 'Save Changes' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default User_Management