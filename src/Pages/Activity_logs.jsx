import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../api/supabase'
import { formatPeso } from '../lib/Finance'

const TABS = [
  { key: 'logins', label: 'Login History' },
  { key: 'changes', label: 'Data Changes' },
  { key: 'imports', label: 'File Imports' },
  { key: 'archive', label: 'Archive' },
]

const PAGE_SIZE = 20
const ARCHIVE_LIMIT = 50
const POLL_INTERVAL_MS = 5000

const CASH_TYPE_LABEL = { debit: 'Cash In', credit: 'Cash Out' }

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

function parseDetail(detail) {
  if (!detail) return null
  try {
    const parsed = JSON.parse(detail)
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed
    return null
  } catch {
    return null
  }
}

function formatValue(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
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
  const [archivedEntries, setArchivedEntries] = useState([])

  const [loading, setLoading] = useState({
    logins: true,
    changes: true,
    imports: true,
    archive: true,
  })
  const [errorMsg, setErrorMsg] = useState({
    logins: '',
    changes: '',
    imports: '',
    archive: '',
  })
  const [search, setSearch] = useState('')
  const [expandedImport, setExpandedImport] = useState(null)
  const [expandedChange, setExpandedChange] = useState(null)

  // Last payload applied to state for each log, so an identical poll skips
  // the setState and the re-render that comes with it.
  const prevJsonRef = useRef({ logins: '', changes: '', imports: '', archive: '' })

  const applyIfChanged = useCallback((key, fresh, setter, force = false) => {
    const json = JSON.stringify(fresh)
    if (force || json !== prevJsonRef.current[key]) {
      prevJsonRef.current[key] = json
      setter(fresh)
    }
  }, [])

  // mode: 'initial' shows the skeletons and always applies the result.
  // 'poll' is silent and only applies the result if it changed. Each log
  // only loads its latest rows, so refetching them is cheap.
  const fetchLogins = useCallback(
    async (mode = 'poll') => {
      if (mode === 'initial') setLoading((p) => ({ ...p, logins: true }))
      const { data, error } = await supabase
        .from('login_logs')
        .select('id, user_email, user_agent, status, created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        setErrorMsg((p) => ({ ...p, logins: error.message }))
      } else {
        applyIfChanged('logins', data || [], setLogins, mode === 'initial')
        setErrorMsg((p) => (p.logins ? { ...p, logins: '' } : p))
      }
      setLoading((p) => (p.logins ? { ...p, logins: false } : p))
    },
    [applyIfChanged]
  )

  const fetchChanges = useCallback(
    async (mode = 'poll') => {
      if (mode === 'initial') setLoading((p) => ({ ...p, changes: true }))
      const { data, error } = await supabase
        .from('data_change_logs')
        .select('id, user_email, table_name, record_label, action, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        setErrorMsg((p) => ({ ...p, changes: error.message }))
      } else {
        applyIfChanged('changes', data || [], setChanges, mode === 'initial')
        setErrorMsg((p) => (p.changes ? { ...p, changes: '' } : p))
      }
      setLoading((p) => (p.changes ? { ...p, changes: false } : p))
    },
    [applyIfChanged]
  )

  const fetchImports = useCallback(
    async (mode = 'poll') => {
      if (mode === 'initial') setLoading((p) => ({ ...p, imports: true }))
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
        applyIfChanged('imports', data || [], setImports, mode === 'initial')
        setErrorMsg((p) => (p.imports ? { ...p, imports: '' } : p))
      }
      setLoading((p) => (p.imports ? { ...p, imports: false } : p))
    },
    [applyIfChanged]
  )

  // Cash Book entries that were archived from the Cash Book page.
  const fetchArchivedEntries = useCallback(
    async (mode = 'poll') => {
      if (mode === 'initial') setLoading((p) => ({ ...p, archive: true }))
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('id, date, detail, type, amount, archived_at, ledger_categories ( name )')
        .eq('archived', true)
        .order('archived_at', { ascending: false })
        .limit(ARCHIVE_LIMIT)

      if (error) {
        setErrorMsg((p) => ({ ...p, archive: error.message }))
      } else {
        applyIfChanged('archive', data || [], setArchivedEntries, mode === 'initial')
        setErrorMsg((p) => (p.archive ? { ...p, archive: '' } : p))
      }
      setLoading((p) => (p.archive ? { ...p, archive: false } : p))
    },
    [applyIfChanged]
  )

  const loadAll = useCallback(
    (mode) => {
      fetchLogins(mode)
      fetchChanges(mode)
      fetchImports(mode)
      fetchArchivedEntries(mode)
    },
    [fetchLogins, fetchChanges, fetchImports, fetchArchivedEntries]
  )

  // Polling: refetches on an interval, but only while the tab is visible.
  // It pauses in background tabs and catches up the moment the tab is
  // visible again.
  useEffect(() => {
    loadAll('initial')

    let intervalId = null

    const startPolling = () => {
      if (intervalId) return
      intervalId = setInterval(() => {
        loadAll('poll')
      }, POLL_INTERVAL_MS)
    }

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAll('poll')
        startPolling()
      } else {
        stopPolling()
      }
    }

    if (document.visibilityState === 'visible') {
      startPolling()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadAll])

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

  // Archive = deleted records across the system (from data_change_logs)
  // plus Cash Book entries that were archived, newest first.
  const archiveItems = useMemo(() => {
    const deleted = changes
      .filter((c) => c.action === 'deleted')
      .map((c) => ({
        kind: 'deleted',
        key: `del-${c.id}`,
        time: c.created_at,
        record: c,
      }))
    const archived = archivedEntries.map((e) => ({
      kind: 'archived',
      key: `arc-${e.id}`,
      time: e.archived_at || e.date,
      entry: e,
    }))
    return [...deleted, ...archived].sort(
      (a, b) => new Date(b.time) - new Date(a.time)
    )
  }, [changes, archivedEntries])

  const filteredArchive = q
    ? archiveItems.filter((item) => {
        if (item.kind === 'deleted') {
          const c = item.record
          return (
            c.user_email?.toLowerCase().includes(q) ||
            c.table_name?.toLowerCase().includes(q) ||
            c.record_label?.toLowerCase().includes(q) ||
            c.detail?.toLowerCase().includes(q)
          )
        }
        const e = item.entry
        return (
          'cash book'.includes(q) ||
          e.detail?.toLowerCase().includes(q) ||
          e.ledger_categories?.name?.toLowerCase().includes(q) ||
          CASH_TYPE_LABEL[e.type]?.toLowerCase().includes(q) ||
          e.date?.includes(q)
        )
      })
    : archiveItems

  const archiveLoading = loading.changes || loading.archive
  const archiveError = errorMsg.changes || errorMsg.archive

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {/* Tabs + search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div className="flex gap-2 border-b border-gray-200 md:border-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 font-semibold cursor-pointer text-sm border-b-2 transition ${
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
                {filteredChanges.map((c) => {
                  const detail = parseDetail(c.detail)
                  const isExpanded = expandedChange === c.id
                  return (
                    <div key={c.id}>
                      <div
                        className={`flex items-start gap-3 py-3 ${
                          detail ? 'cursor-pointer' : ''
                        } ${isExpanded ? 'bg-red-50/30' : ''}`}
                        onClick={() => detail && setExpandedChange(isExpanded ? null : c.id)}
                      >
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
                          {c.detail && !detail && (
                            <p className="text-xs text-gray-400 mt-0.5">{c.detail}</p>
                          )}
                          {detail && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {isExpanded ? '▾ Hide details' : '▸ Show details'}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{formatExact(c.created_at)}</span>
                      </div>

                      {isExpanded && detail && (
                        <div className="bg-gray-50 rounded-lg px-4 py-3 mb-3 -mt-1 ml-0 md:ml-14">
                          {c.action === 'updated' ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 uppercase">
                                  <th className="text-left font-semibold pb-1 pr-3">Field</th>
                                  <th className="text-left font-semibold pb-1 pr-3">Before</th>
                                  <th className="text-left font-semibold pb-1">After</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(detail).map(([field, change]) => (
                                  <tr key={field} className="border-t border-gray-200">
                                    <td className="py-1 pr-3 font-mono text-gray-600">{field}</td>
                                    <td className="py-1 pr-3 text-red-600">
                                      {formatValue(change?.old)}
                                    </td>
                                    <td className="py-1 text-green-700">
                                      {formatValue(change?.new)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <table className="w-full text-xs">
                              <tbody>
                                {Object.entries(detail).map(([field, value]) => (
                                  <tr key={field} className="border-t border-gray-200 first:border-0">
                                    <td className="py-1 pr-3 font-mono text-gray-500 align-top whitespace-nowrap">
                                      {field}
                                    </td>
                                    <td className="py-1 text-gray-700 break-all">
                                      {formatValue(value)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
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

        {/* ── Archive (archived Cash Book entries + deleted records) ── */}
        {activeTab === 'archive' && (
          <>
            {archiveError && (
              <p className="text-xs text-red-600 mb-3">{archiveError}</p>
            )}
            {archiveLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}
              </div>
            ) : filteredArchive.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">
                Nothing has been archived or deleted yet.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredArchive.map((item) => {
                  if (item.kind === 'archived') {
                    const e = item.entry
                    return (
                      <div key={item.key} className="flex items-start gap-3 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium capitalize shrink-0 bg-gray-100 text-gray-600">
                          archived
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              cash book
                            </span>{' '}
                            <span className="font-medium">{e.detail}</span>
                            {e.ledger_categories?.name && (
                              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                                {e.ledger_categories.name}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Entry dated {e.date} ·{' '}
                            <span
                              className={
                                e.type === 'debit' ? 'text-green-600' : 'text-red-600'
                              }
                            >
                              {CASH_TYPE_LABEL[e.type] || e.type} {formatPeso(e.amount)}
                            </span>
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {formatExact(e.archived_at)}
                        </span>
                      </div>
                    )
                  }

                  const c = item.record
                  const detail = parseDetail(c.detail)
                  const isExpanded = expandedChange === c.id
                  return (
                    <div key={item.key}>
                      <div
                        className={`flex items-start gap-3 py-3 ${
                          detail ? 'cursor-pointer' : ''
                        } ${isExpanded ? 'bg-red-50/30' : ''}`}
                        onClick={() => detail && setExpandedChange(isExpanded ? null : c.id)}
                      >
                        <span className="px-2 py-1 rounded-full text-xs font-medium capitalize shrink-0 bg-red-100 text-red-700">
                          deleted
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            <span className="font-semibold">{c.user_email || 'Someone'}</span> deleted{' '}
                            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {c.table_name}
                            </span>
                            {c.record_label && (
                              <>
                                {' '}— <span className="font-medium">{c.record_label}</span>
                              </>
                            )}
                          </p>
                          {detail && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {isExpanded ? '▾ Hide deleted record' : '▸ Show deleted record'}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{formatExact(c.created_at)}</span>
                      </div>

                      {isExpanded && detail && (
                        <div className="bg-gray-50 rounded-lg px-4 py-3 mb-3 -mt-1 ml-0 md:ml-14">
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(detail).map(([field, value]) => (
                                <tr key={field} className="border-t border-gray-200 first:border-0">
                                  <td className="py-1 pr-3 font-mono text-gray-500 align-top whitespace-nowrap">
                                    {field}
                                  </td>
                                  <td className="py-1 text-gray-700 break-all">{formatValue(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Activity_logs