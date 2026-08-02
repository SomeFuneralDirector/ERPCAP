import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../api/supabase'

const TABS = [
  { key: 'logins', label: 'Login History' },
  { key: 'changes', label: 'Data Changes' },
  { key: 'imports', label: 'File Imports' },
]

const PAGE_SIZE = 20

const LOGIN_STATUS_STYLES = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const ACTION_STYLES = {
  created: 'bg-green-100 text-green-700',
  updated: 'bg-amber-100 text-amber-700',
  deleted: 'bg-red-100 text-red-700',
}

const IMPORT_STATUS_STYLES = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

const PLATFORM_STYLES = {
  shopee: 'bg-orange-100 text-orange-600',
  lazada: 'bg-blue-100 text-blue-600',
  tiktok: 'bg-gray-800 text-white',
}

function formatExact(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Skeleton({ className = 'h-10 w-full' }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse`} />
}

function parseDevice(userAgent) {
  if (!userAgent) return '—'
  const ua = userAgent.toLowerCase()
  const isTablet = /ipad|tablet/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))
  const isMobile = /mobi|iphone|android/.test(ua)

  if (isTablet) return 'Tablet'
  if (isMobile) return 'Mobile'
  return 'Desktop'
}

function Activity_logs() {
  const [activeTab, setActiveTab] = useState('logins')

  const [logins, setLogins] = useState([])
  const [changes, setChanges] = useState([])
  const [imports, setImports] = useState([])

  const [loading, setLoading] = useState({ logins: true, changes: true, imports: true })
  const [errorMsg, setErrorMsg] = useState({ logins: '', changes: '', imports: '' })
  const [search, setSearch] = useState('')
  const [expandedImport, setExpandedImport] = useState(null)

  const fetchLogins = useCallback(async () => {
    setLoading((p) => ({ ...p, logins: true }))
    const { data, error } = await supabase
      .from('login_logs')
      .select('id, user_email, user_agent, status, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setErrorMsg((p) => ({ ...p, logins: error.message }))
    } else {
      setLogins(data || [])
      setErrorMsg((p) => ({ ...p, logins: '' }))
    }
    setLoading((p) => ({ ...p, logins: false }))
  }, [])

  const fetchChanges = useCallback(async () => {
    setLoading((p) => ({ ...p, changes: true }))
    const { data, error } = await supabase
      .from('data_change_logs')
      .select('id, user_email, table_name, record_label, action, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setErrorMsg((p) => ({ ...p, changes: error.message }))
    } else {
      setChanges(data || [])
      setErrorMsg((p) => ({ ...p, changes: '' }))
    }
    setLoading((p) => ({ ...p, changes: false }))
  }, [])

  const fetchImports = useCallback(async () => {
    setLoading((p) => ({ ...p, imports: true }))
    const { data, error } = await supabase
      .from('import_logs')
      .select(
        'id, platform, filename, file_hash, date_from, date_to, row_count, ' +
        'inserted, skipped, errors, status, reject_reason, imported_at, imported_by'
      )
      .order('imported_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setErrorMsg((p) => ({ ...p, imports: error.message }))
    } else {
      setImports(data || [])
      setErrorMsg((p) => ({ ...p, imports: '' }))
    }
    setLoading((p) => ({ ...p, imports: false }))
  }, [])

  useEffect(() => {
    fetchLogins()
    fetchChanges()
    fetchImports()

    const channel = supabase
      .channel('activity-logs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_logs' }, fetchLogins)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'data_change_logs' }, fetchChanges)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'import_logs' }, fetchImports)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchLogins, fetchChanges, fetchImports])

  const q = search.trim().toLowerCase()

  const filteredLogins = q
    ? logins.filter(
        (l) =>
          l.user_email?.toLowerCase().includes(q) ||
          l.user_agent?.toLowerCase().includes(q) ||
          parseDevice(l.user_agent).toLowerCase().includes(q)
      )
    : logins

  const filteredChanges = q
    ? changes.filter(
        (c) =>
          c.user_email?.toLowerCase().includes(q) ||
          c.table_name?.toLowerCase().includes(q) ||
          c.record_label?.toLowerCase().includes(q) ||
          c.detail?.toLowerCase().includes(q)
      )
    : changes

  const filteredImports = q
    ? imports.filter(
        (i) =>
          i.filename?.toLowerCase().includes(q) ||
          i.platform?.toLowerCase().includes(q) ||
          i.status?.toLowerCase().includes(q)
      )
    : imports

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Login history, data changes, and file import activity across the system
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {/* Tabs + search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div className="flex gap-2 border-b border-gray-200 md:border-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
                  activeTab === t.key
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-red-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Search this log…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
        </div>

        {/* ── Login History ── */}
        {activeTab === 'logins' && (
          <>
            {errorMsg.logins && (
              <p className="text-xs text-red-600 mb-3">{errorMsg.logins}</p>
            )}
            {loading.logins ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}
              </div>
            ) : filteredLogins.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">
                No login activity recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">User</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Device</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogins.map((l) => (
                      <tr key={l.id} className="border-b border-gray-100 hover:bg-red-50/30">
                        <td className="px-4 py-2.5 text-gray-700">{l.user_email || '—'}</td>
                        <td
                          className="px-4 py-2.5 text-gray-600 text-xs"
                          title={l.user_agent || ''}
                        >
                          {parseDevice(l.user_agent)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                              LOGIN_STATUS_STYLES[l.status] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {l.status || 'unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{formatExact(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Data Changes ── */}
        {activeTab === 'changes' && (
          <>
            {errorMsg.changes && (
              <p className="text-xs text-red-600 mb-3">{errorMsg.changes}</p>
            )}
            {loading.changes ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}
              </div>
            ) : filteredChanges.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">
                No data changes recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredChanges.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium capitalize shrink-0 ${
                        ACTION_STYLES[c.action] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.action || 'changed'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">{c.user_email || 'Someone'}</span>{' '}
                        {c.action === 'created' ? 'created' : c.action === 'deleted' ? 'deleted' : 'updated'}{' '}
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {c.table_name}
                        </span>
                        {c.record_label && (
                          <>
                            {' '}— <span className="font-medium">{c.record_label}</span>
                          </>
                        )}
                      </p>
                      {c.detail && (
                        <p className="text-xs text-gray-400 mt-0.5">{c.detail}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatExact(c.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── File Imports ── */}
        {activeTab === 'imports' && (
          <>
            {errorMsg.imports && (
              <p className="text-xs text-red-600 mb-3">{errorMsg.imports}</p>
            )}
            {loading.imports ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}
              </div>
            ) : filteredImports.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">
                No file imports recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600 w-8" />
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">File</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Platform</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Date Range</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Rows</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Inserted</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Skipped</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImports.map((i) => {
                      const hasDetail =
                        (i.errors && i.errors.length > 0) || i.reject_reason
                      const isExpanded = expandedImport === i.id
                      return (
                        <React.Fragment key={i.id}>
                          <tr
                            className={`border-b border-gray-100 ${
                              hasDetail ? 'cursor-pointer hover:bg-red-50/30' : ''
                            } ${isExpanded ? 'bg-red-50/40' : ''}`}
                            onClick={() => hasDetail && setExpandedImport(isExpanded ? null : i.id)}
                          >
                            <td className="px-4 py-2.5 text-gray-400 text-center">
                              {hasDetail && (
                                <span className="text-xs">{isExpanded ? '▾' : '▸'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600 truncate max-w-xs">
                              {i.filename || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                                  PLATFORM_STYLES[i.platform?.toLowerCase()] || 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {i.platform || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">
                              {i.date_from || i.date_to
                                ? `${i.date_from || '—'} → ${i.date_to || '—'}`
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700">{i.row_count ?? 0}</td>
                            <td className="px-4 py-2.5 text-green-700 font-semibold">
                              {i.inserted ?? 0}
                            </td>
                            <td className="px-4 py-2.5 text-amber-600">
                              {i.skipped ?? 0}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                                  IMPORT_STATUS_STYLES[i.status] || 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {i.status || 'unknown'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{formatExact(i.imported_at)}</td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-red-50/40 border-b border-red-100">
                              <td colSpan={9} className="px-8 py-4">
                                {i.reject_reason && (
                                  <p className="text-xs text-red-600 mb-2">
                                    <span className="font-semibold">Rejected:</span> {i.reject_reason}
                                  </p>
                                )}
                                {i.errors && i.errors.length > 0 && (
                                  <>
                                    <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                                      Row errors ({i.errors.length})
                                    </p>
                                    <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                                      {i.errors.map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Activity_logs