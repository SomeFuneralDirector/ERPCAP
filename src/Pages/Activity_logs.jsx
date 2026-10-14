import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../api/supabase'
import { formatPeso } from '../lib/Finance'

/* ── Design tokens (aligned with Inventory / platform palette) ───────────── */
const C = {
  accent: '#B3211B',
  accentHover: '#8E1A15',
  accentSoft: '#FBEAE9',
  accentSoftBorder: '#F3C9C7',
  text: '#1C1C1F',
  textMuted: '#6B6B70',
  textFaint: '#9A9AA0',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  success: '#15803D',
  successSoft: '#EEF6EF',
  warning: '#A15C07',
  warningSoft: '#FBF3E7',
  warningBorder: '#F1DDB8',
  shopee: '#EE4D2D',
  lazada: '#0F146D',
  tiktok: '#101113',
  surface: '#F6F6F7',
}

const TABS = [
  { key: 'logins', label: 'Login History' },
  { key: 'changes', label: 'Data Changes' },
  { key: 'imports', label: 'File Imports' },
  { key: 'archive', label: 'Archive' },
]

const PAGE_SIZE = 20
const ARCHIVE_LIMIT = 100
const POLL_INTERVAL_MS = 5000

const CASH_TYPE_LABEL = { debit: 'Cash In', credit: 'Cash Out' }

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
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Turn snake_case / camelCase keys into readable labels */
function humanLabel(key) {
  if (!key) return ''
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

/* ── Status / action chips ───────────────────────────────────────────────── */

function StatusChip({ label, tone = 'neutral' }) {
  const styles = {
    success: { backgroundColor: C.successSoft, color: C.success },
    danger: { backgroundColor: C.accentSoft, color: C.accent },
    warning: { backgroundColor: C.warningSoft, color: C.warning },
    neutral: { backgroundColor: '#F4F4F5', color: C.textMuted },
    dark: { backgroundColor: C.tiktok, color: '#fff' },
  }
  const s = styles[tone] || styles.neutral
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium capitalize"
      style={s}
    >
      {label}
    </span>
  )
}

function PlatformChip({ platform }) {
  const p = (platform || '').toLowerCase()
  const map = {
    shopee: { bg: '#FFF0ED', color: C.shopee },
    lazada: { bg: '#EEF0F8', color: C.lazada },
    tiktok: { bg: '#F4F4F5', color: C.tiktok },
  }
  const s = map[p] || { bg: '#F4F4F5', color: C.textMuted }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {platform || '—'}
    </span>
  )
}

/* ── Human-readable detail panels (no raw DB tables) ─────────────────────── */

function DetailPanel({ children }) {
  return (
    <div
      className="rounded-lg px-4 py-3.5 mb-3 ml-0 md:ml-12 space-y-2.5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  )
}

function DetailRow({ label, children, mono }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4">
      <span
        className="text-sm shrink-0 sm:w-36 pt-0.5"
        style={{ color: C.textMuted }}
      >
        {label}
      </span>
      <span
        className={`text-sm flex-1 break-words ${mono ? 'font-mono' : ''}`}
        style={{ color: C.text }}
      >
        {children}
      </span>
    </div>
  )
}

/** For "updated" change logs that have { field: { old, new } } shape */
function ChangeDiffPanel({ detail }) {
  const entries = Object.entries(detail || {})
  if (entries.length === 0) return null

  return (
    <DetailPanel>
      {entries.map(([field, change]) => (
        <div key={field} className="space-y-1">
          <p className="text-sm font-medium" style={{ color: C.text }}>
            {humanLabel(field)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: C.accentSoft, color: C.accent }}
            >
              {formatValue(change?.old)}
            </span>
            <span style={{ color: C.textFaint }}>→</span>
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: C.successSoft, color: C.success }}
            >
              {formatValue(change?.new)}
            </span>
          </div>
        </div>
      ))}
    </DetailPanel>
  )
}

/** For create / delete / generic object snapshots */
function RecordSnapshotPanel({ data, exclude = [] }) {
  if (!data || typeof data !== 'object') return null
  const entries = Object.entries(data).filter(
    ([k]) => !exclude.includes(k) && k !== 'id'
  )
  if (entries.length === 0) return null

  // Prefer a sensible order for common inventory fields
  const preferred = [
    'product_code',
    'product_name',
    'category',
    'shopee_stock',
    'lazada_stock',
    'tiktok_stock',
    'stock',
    'reorder_point',
    'updated_at',
    'created_at',
  ]
  const ordered = [
    ...preferred.filter((k) => data[k] !== undefined),
    ...entries.map(([k]) => k).filter((k) => !preferred.includes(k)),
  ]

  return (
    <DetailPanel>
      {ordered.map((field) => (
        <DetailRow key={field} label={humanLabel(field)} mono={field.includes('code') || field.includes('_id')}>
          {formatValue(data[field])}
        </DetailRow>
      ))}
    </DetailPanel>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

function Activity_logs() {
  const [activeTab, setActiveTab] = useState('logins')

  const [logins, setLogins] = useState([])
  const [changes, setChanges] = useState([])
  const [imports, setImports] = useState([])
  const [archivedRecords, setArchivedRecords] = useState([])
  const [archivedEntries, setArchivedEntries] = useState([])

  // Date range — same pattern as Admin / Finance dashboards
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  )
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

  const [loading, setLoading] = useState({
    logins: true,
    changes: true,
    imports: true,
    archivedRecords: true,
    archivedEntries: true,
  })
  const [errorMsg, setErrorMsg] = useState({
    logins: '',
    changes: '',
    imports: '',
    archivedRecords: '',
    archivedEntries: '',
  })
  const [search, setSearch] = useState('')
  const [expandedImport, setExpandedImport] = useState(null)
  const [expandedChange, setExpandedChange] = useState(null)
  const [expandedArchive, setExpandedArchive] = useState(null)

  const [restoreTarget, setRestoreTarget] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [actionError, setActionError] = useState('')

  const prevJsonRef = useRef({})

  const loadSource = useCallback(async (key, build, setter, mode) => {
    if (mode === 'initial') setLoading((p) => ({ ...p, [key]: true }))
    const { data, error } = await build()

    if (error) {
      setErrorMsg((p) => ({ ...p, [key]: error.message }))
    } else {
      const fresh = data || []
      const json = JSON.stringify(fresh)
      if (mode === 'initial' || json !== prevJsonRef.current[key]) {
        prevJsonRef.current[key] = json
        setter(fresh)
      }
      setErrorMsg((p) => (p[key] ? { ...p, [key]: '' } : p))
    }
    setLoading((p) => (p[key] ? { ...p, [key]: false } : p))
  }, [])

  const loadAll = useCallback(
    (mode) => {
      // Inclusive end-of-day so the selected "to" date is fully covered
      const fromIso = dateFrom ? `${dateFrom}T00:00:00` : null
      const toIso = dateTo ? `${dateTo}T23:59:59.999` : null

      loadSource(
        'logins',
        () => {
          let q = supabase
            .from('login_logs')
            .select('id, user_email, user_agent, status, created_at')
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)
          if (fromIso) q = q.gte('created_at', fromIso)
          if (toIso) q = q.lte('created_at', toIso)
          return q
        },
        setLogins,
        mode
      )

      loadSource(
        'changes',
        () => {
          let q = supabase
            .from('data_change_logs')
            .select('id, user_email, table_name, record_label, action, detail, created_at')
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)
          if (fromIso) q = q.gte('created_at', fromIso)
          if (toIso) q = q.lte('created_at', toIso)
          return q
        },
        setChanges,
        mode
      )

      loadSource(
        'imports',
        () => {
          let q = supabase
            .from('import_logs')
            .select(
              'id, platform, filename, file_hash, date_from, date_to, row_count, ' +
                'inserted, skipped, errors, status, reject_reason, imported_at, imported_by'
            )
            .order('imported_at', { ascending: false })
            .limit(PAGE_SIZE)
          if (fromIso) q = q.gte('imported_at', fromIso)
          if (toIso) q = q.lte('imported_at', toIso)
          return q
        },
        setImports,
        mode
      )

      loadSource(
        'archivedRecords',
        () => {
          let q = supabase
            .from('archived_records')
            .select('id, table_name, record_id, record_label, data, archived_by_email, archived_at')
            .order('archived_at', { ascending: false })
            .limit(ARCHIVE_LIMIT)
          if (fromIso) q = q.gte('archived_at', fromIso)
          if (toIso) q = q.lte('archived_at', toIso)
          return q
        },
        setArchivedRecords,
        mode
      )

      loadSource(
        'archivedEntries',
        () => {
          let q = supabase
            .from('ledger_entries')
            .select('id, date, detail, type, amount, archived_at, ledger_categories ( name )')
            .eq('archived', true)
            .order('archived_at', { ascending: false })
            .limit(ARCHIVE_LIMIT)
          if (fromIso) q = q.gte('archived_at', fromIso)
          if (toIso) q = q.lte('archived_at', toIso)
          return q
        },
        setArchivedEntries,
        mode
      )
    },
    [loadSource, dateFrom, dateTo]
  )

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

  async function handleRestoreConfirm() {
    if (!restoreTarget) return
    setRestoring(true)
    setActionError('')

    let error = null
    if (restoreTarget.kind === 'record') {
      const res = await supabase.rpc('restore_archived_record', {
        p_archive_id: restoreTarget.record.id,
      })
      error = res.error
    } else {
      const res = await supabase
        .from('ledger_entries')
        .update({ archived: false, archived_at: null, archived_by: null })
        .eq('id', restoreTarget.entry.id)
      error = res.error
    }

    setRestoring(false)

    if (error) {
      console.error('Restore failed:', error)
      setActionError(`Couldn't restore that item. ${error.message || ''}`)
      setRestoreTarget(null)
      return
    }

    setRestoreTarget(null)
    loadAll('poll')
  }

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

  const archiveItems = useMemo(() => {
    const records = archivedRecords.map((r) => ({
      kind: 'record',
      key: `rec-${r.id}`,
      time: r.archived_at,
      record: r,
    }))
    const entries = archivedEntries.map((e) => ({
      kind: 'entry',
      key: `ent-${e.id}`,
      time: e.archived_at || e.date,
      entry: e,
    }))
    return [...records, ...entries].sort((a, b) => new Date(b.time) - new Date(a.time))
  }, [archivedRecords, archivedEntries])

  const filteredArchive = q
    ? archiveItems.filter((item) => {
        if (item.kind === 'record') {
          const r = item.record
          return (
            r.table_name?.toLowerCase().includes(q) ||
            r.record_label?.toLowerCase().includes(q) ||
            r.archived_by_email?.toLowerCase().includes(q) ||
            JSON.stringify(r.data || {}).toLowerCase().includes(q)
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

  const archiveLoading = loading.archivedRecords || loading.archivedEntries
  const archiveError = errorMsg.archivedRecords || errorMsg.archivedEntries

  const restoreLabel =
    restoreTarget?.kind === 'record'
      ? restoreTarget.record.record_label || restoreTarget.record.table_name
      : restoreTarget?.entry?.detail

  const actionTone = (action) => {
    if (action === 'created') return 'success'
    if (action === 'deleted') return 'danger'
    if (action === 'updated') return 'warning'
    return 'neutral'
  }

  const loginTone = (status) => {
    if (status === 'success') return 'success'
    if (status === 'failed') return 'danger'
    return 'neutral'
  }

  const importTone = (status) => {
    if (status === 'success') return 'success'
    if (status === 'partial') return 'warning'
    if (status === 'failed') return 'danger'
    return 'neutral'
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.surface }}>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div
          className="bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h1 className="text-3xl font-semibold" style={{ color: C.text }}>
            Activity Logs
          </h1>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
                style={{ borderColor: C.borderStrong, color: C.text }}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`
                  e.target.style.borderColor = C.accent
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none'
                  e.target.style.borderColor = C.borderStrong
                }}
              />
              <span className="text-base" style={{ color: C.textFaint }}>
                to
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
                style={{ borderColor: C.borderStrong, color: C.text }}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`
                  e.target.style.borderColor = C.accent
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none'
                  e.target.style.borderColor = C.borderStrong
                }}
              />
            </div>
          </div>
        </div>

        {/* Main card */}
        <div
          className="bg-white rounded-lg shadow-sm p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          {/* Tabs + search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div className="flex gap-1 border-b md:border-0" style={{ borderColor: C.border }}>
              {TABS.map((t) => {
                const active = activeTab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className="px-4 py-2.5 font-semibold cursor-pointer text-base border-b-2 transition-colors"
                    style={{
                      borderColor: active ? C.accent : 'transparent',
                      color: active ? C.accent : C.textMuted,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Search this log…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg text-base focus:outline-none transition-colors"
                style={{ borderColor: C.borderStrong, color: C.text }}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`
                  e.target.style.borderColor = C.accent
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none'
                  e.target.style.borderColor = C.borderStrong
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xl leading-none cursor-pointer"
                  style={{ color: C.textFaint }}
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
                <p className="text-sm mb-3 rounded-md px-4 py-3" style={{ color: C.accent, backgroundColor: C.accentSoft, border: `1px solid ${C.accentSoftBorder}` }}>
                  {errorMsg.logins}
                </p>
              )}
              {loading.logins ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : filteredLogins.length === 0 ? (
                <p className="text-base italic py-10 text-center" style={{ color: C.textFaint }}>
                  No login activity recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                  <table className="w-full text-base">
                    <thead style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                      <tr>
                        <th className="px-5 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          User
                        </th>
                        <th className="px-5 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Device
                        </th>
                        <th className="px-5 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          When
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogins.map((l) => (
                        <tr
                          key={l.id}
                          className="transition-colors"
                          style={{ borderBottom: `1px solid ${C.border}` }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.accentSoft)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td className="px-5 py-3.5" style={{ color: C.text }}>
                            {l.user_email || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-sm" style={{ color: C.textMuted }} title={l.user_agent || ''}>
                            {parseDevice(l.user_agent)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusChip label={l.status || 'unknown'} tone={loginTone(l.status)} />
                          </td>
                          <td className="px-5 py-3.5 text-sm" style={{ color: C.textFaint }}>
                            {formatExact(l.created_at)}
                          </td>
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
                <p className="text-sm mb-3 rounded-md px-4 py-3" style={{ color: C.accent, backgroundColor: C.accentSoft, border: `1px solid ${C.accentSoftBorder}` }}>
                  {errorMsg.changes}
                </p>
              )}
              {loading.changes ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : filteredChanges.length === 0 ? (
                <p className="text-base italic py-10 text-center" style={{ color: C.textFaint }}>
                  No data changes recorded yet.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {filteredChanges.map((c) => {
                    const detail = parseDetail(c.detail)
                    const isExpanded = expandedChange === c.id
                    const isUpdateWithDiff =
                      c.action === 'updated' &&
                      detail &&
                      Object.values(detail).some((v) => v && typeof v === 'object' && ('old' in v || 'new' in v))

                    return (
                      <div key={c.id} style={{ borderColor: C.border }}>
                        <div
                          className={`flex items-start gap-3 py-3.5 px-1 ${detail ? 'cursor-pointer' : ''}`}
                          style={isExpanded ? { backgroundColor: C.accentSoft } : undefined}
                          onClick={() => detail && setExpandedChange(isExpanded ? null : c.id)}
                        >
                          <StatusChip label={c.action || 'changed'} tone={actionTone(c.action)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-base" style={{ color: C.text }}>
                              <span className="font-semibold">{c.user_email || 'Someone'}</span>{' '}
                              {c.action === 'created' ? 'created' : c.action === 'deleted' ? 'deleted' : 'updated'}{' '}
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-sm font-medium"
                                style={{ backgroundColor: C.surface, color: C.textMuted }}
                              >
                                {c.table_name}
                              </span>
                              {c.record_label && (
                                <>
                                  {' '}
                                  · <span className="font-medium">{c.record_label}</span>
                                </>
                              )}
                            </p>
                            {c.detail && !detail && (
                              <p className="text-sm mt-0.5" style={{ color: C.textFaint }}>
                                {c.detail}
                              </p>
                            )}
                            {detail && (
                              <p className="text-sm mt-0.5 font-medium" style={{ color: C.accent }}>
                                {isExpanded ? '▾ Hide details' : '▸ Show details'}
                              </p>
                            )}
                          </div>
                          <span className="text-sm shrink-0" style={{ color: C.textFaint }}>
                            {formatExact(c.created_at)}
                          </span>
                        </div>

                        {isExpanded && detail && (
                          isUpdateWithDiff ? (
                            <ChangeDiffPanel detail={detail} />
                          ) : (
                            <RecordSnapshotPanel data={detail} />
                          )
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
                <p className="text-sm mb-3 rounded-md px-4 py-3" style={{ color: C.accent, backgroundColor: C.accentSoft, border: `1px solid ${C.accentSoftBorder}` }}>
                  {errorMsg.imports}
                </p>
              )}
              {loading.imports ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : filteredImports.length === 0 ? (
                <p className="text-base italic py-10 text-center" style={{ color: C.textFaint }}>
                  No file imports recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                  <table className="w-full text-base">
                    <thead style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold w-8" style={{ color: C.textMuted }} />
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          File
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Platform
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Date range
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Rows
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Inserted
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Skipped
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: C.textMuted }}>
                          When
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredImports.map((i) => {
                        const hasDetail = (i.errors && i.errors.length > 0) || i.reject_reason
                        const isExpanded = expandedImport === i.id
                        return (
                          <React.Fragment key={i.id}>
                            <tr
                              className={`transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                              style={{
                                borderBottom: `1px solid ${C.border}`,
                                backgroundColor: isExpanded ? C.accentSoft : undefined,
                              }}
                              onClick={() => hasDetail && setExpandedImport(isExpanded ? null : i.id)}
                              onMouseEnter={(e) => {
                                if (!isExpanded) e.currentTarget.style.backgroundColor = C.accentSoft
                              }}
                              onMouseLeave={(e) => {
                                if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'
                              }}
                            >
                              <td className="px-4 py-3.5 text-center text-sm" style={{ color: C.textFaint }}>
                                {hasDetail && (isExpanded ? '▾' : '▸')}
                              </td>
                              <td className="px-4 py-3.5 font-mono text-sm truncate max-w-[200px]" style={{ color: C.textMuted }}>
                                {i.filename || '—'}
                              </td>
                              <td className="px-4 py-3.5">
                                <PlatformChip platform={i.platform} />
                              </td>
                              <td className="px-4 py-3.5 text-sm" style={{ color: C.textMuted }}>
                                {i.date_from || i.date_to
                                  ? `${i.date_from || '—'} → ${i.date_to || '—'}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3.5" style={{ color: C.text }}>
                                {i.row_count ?? 0}
                              </td>
                              <td className="px-4 py-3.5 font-semibold" style={{ color: C.success }}>
                                {i.inserted ?? 0}
                              </td>
                              <td className="px-4 py-3.5" style={{ color: C.warning }}>
                                {i.skipped ?? 0}
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusChip label={i.status || 'unknown'} tone={importTone(i.status)} />
                              </td>
                              <td className="px-4 py-3.5 text-sm" style={{ color: C.textFaint }}>
                                {formatExact(i.imported_at)}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr style={{ backgroundColor: C.accentSoft, borderBottom: `1px solid ${C.accentSoftBorder}` }}>
                                <td colSpan={9} className="px-6 py-4">
                                  {i.reject_reason && (
                                    <p className="text-sm mb-2" style={{ color: C.accent }}>
                                      <span className="font-semibold">Rejected:</span> {i.reject_reason}
                                    </p>
                                  )}
                                  {i.errors && i.errors.length > 0 && (
                                    <>
                                      <p className="text-sm font-semibold mb-1.5 uppercase tracking-wide" style={{ color: C.textMuted }}>
                                        Row errors ({i.errors.length})
                                      </p>
                                      <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: C.text }}>
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

          {/* ── Archive ── */}
          {activeTab === 'archive' && (
            <>
              {archiveError && (
                <p className="text-sm mb-3 rounded-md px-4 py-3" style={{ color: C.accent, backgroundColor: C.accentSoft, border: `1px solid ${C.accentSoftBorder}` }}>
                  {archiveError}
                </p>
              )}
              {actionError && (
                <p className="text-sm mb-3 rounded-md px-4 py-3" style={{ color: C.accent, backgroundColor: C.accentSoft, border: `1px solid ${C.accentSoftBorder}` }}>
                  {actionError}
                </p>
              )}
              {archiveLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : filteredArchive.length === 0 ? (
                <p className="text-base italic py-10 text-center" style={{ color: C.textFaint }}>
                  Nothing has been archived yet.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {filteredArchive.map((item) => {
                    if (item.kind === 'entry') {
                      const e = item.entry
                      return (
                        <div key={item.key} className="flex items-start gap-3 py-3.5 px-1">
                          <StatusChip label="archived" tone="neutral" />
                          <div className="flex-1 min-w-0">
                            <p className="text-base" style={{ color: C.text }}>
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-sm font-medium mr-1"
                                style={{ backgroundColor: C.surface, color: C.textMuted }}
                              >
                                cash book
                              </span>
                              <span className="font-medium">{e.detail}</span>
                              {e.ledger_categories?.name && (
                                <span
                                  className="ml-2 inline-block px-2 py-0.5 rounded-full text-sm font-medium"
                                  style={{ backgroundColor: C.surface, color: C.textMuted }}
                                >
                                  {e.ledger_categories.name}
                                </span>
                              )}
                            </p>
                            <p className="text-sm mt-0.5" style={{ color: C.textFaint }}>
                              Entry dated {e.date} ·{' '}
                              <span style={{ color: e.type === 'debit' ? C.success : C.accent }}>
                                {CASH_TYPE_LABEL[e.type] || e.type} {formatPeso(e.amount)}
                              </span>
                            </p>
                          </div>
                          <span className="text-sm shrink-0" style={{ color: C.textFaint }}>
                            {formatExact(e.archived_at)}
                          </span>
                          <button
                            onClick={() => setRestoreTarget({ kind: 'entry', entry: e })}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                            style={{
                              color: C.accent,
                              border: `1px solid ${C.accentSoftBorder}`,
                              backgroundColor: C.accentSoft,
                            }}
                          >
                            Restore
                          </button>
                        </div>
                      )
                    }

                    const r = item.record
                    const data = r.data && typeof r.data === 'object' ? r.data : null
                    const isExpanded = expandedArchive === item.key
                    return (
                      <div key={item.key} style={{ borderColor: C.border }}>
                        <div
                          className={`flex items-start gap-3 py-3.5 px-1 ${data ? 'cursor-pointer' : ''}`}
                          style={isExpanded ? { backgroundColor: C.accentSoft } : undefined}
                          onClick={() => data && setExpandedArchive(isExpanded ? null : item.key)}
                        >
                          <StatusChip label="deleted" tone="danger" />
                          <div className="flex-1 min-w-0">
                            <p className="text-base" style={{ color: C.text }}>
                              <span className="font-semibold">{r.archived_by_email || 'Someone'}</span> deleted{' '}
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-sm font-medium"
                                style={{ backgroundColor: C.surface, color: C.textMuted }}
                              >
                                {r.table_name}
                              </span>
                              {r.record_label && (
                                <>
                                  {' '}
                                  · <span className="font-medium">{r.record_label}</span>
                                </>
                              )}
                            </p>
                            {data && (
                              <p className="text-sm mt-0.5 font-medium" style={{ color: C.accent }}>
                                {isExpanded ? '▾ Hide record' : '▸ Show record'}
                              </p>
                            )}
                          </div>
                          <span className="text-sm shrink-0" style={{ color: C.textFaint }}>
                            {formatExact(r.archived_at)}
                          </span>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setRestoreTarget({ kind: 'record', record: r })
                            }}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                            style={{
                              color: C.accent,
                              border: `1px solid ${C.accentSoftBorder}`,
                              backgroundColor: C.accentSoft,
                            }}
                          >
                            Restore
                          </button>
                        </div>

                        {isExpanded && data && (
                          <RecordSnapshotPanel
                            data={data}
                            exclude={['archived', 'archived_at', 'archived_by']}
                          />
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

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-semibold" style={{ color: C.text }}>
                Restore this item?
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-base mb-1" style={{ color: C.text }}>
                <span className="font-semibold">{restoreLabel}</span>
              </p>
              <p className="text-sm" style={{ color: C.textMuted }}>
                {restoreTarget.kind === 'entry'
                  ? 'This entry goes back to the Cash Book and counts in your reports again.'
                  : `This record goes back into ${restoreTarget.record.table_name} exactly as it was when it was archived.`}
              </p>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="px-4 py-2 rounded-md text-base font-medium cursor-pointer transition-colors"
                style={{ color: C.textMuted, backgroundColor: C.surface }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreConfirm}
                disabled={restoring}
                className="px-4 py-2 rounded-md text-base font-semibold text-white cursor-pointer transition-colors disabled:opacity-50"
                style={{ backgroundColor: C.accent }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.accentHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.accent)}
              >
                {restoring ? 'Restoring…' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Activity_logs