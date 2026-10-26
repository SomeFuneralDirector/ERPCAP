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

const PAGE_SIZE = 20 // rows shown per page
const FETCH_LIMIT = 500 // most recent rows loaded per log (paged + searched on the client)
const POLL_INTERVAL_MS = 5000

const CASH_TYPE_LABEL = { debit: 'Cash In', credit: 'Cash Out' }

// Table that holds your users' id + email (used to show who archived a cash book entry).
// Change this to match your project, e.g. 'profiles' or 'users'.
const USERS_TABLE = 'profiles'

// Which page of the app each archived table belongs to.
// Add your own table names here; anything missing falls back to a readable table name.
const PAGE_LABELS = {
  products: 'Inventory',
  ledger_entries: 'Cash Book',
  ledger_categories: 'Cash Book',
}

function pageLabel(table) {
  return PAGE_LABELS[table] || humanLabel(table) || '—'
}

// Shared cell classes so the tables have identical spacing
const TH = 'px-5 py-3 text-left text-sm font-semibold whitespace-nowrap'
const TD = 'px-5 py-3.5 align-middle'

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

/** Small grey tag used for table names */
function TableTag({ children }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-sm font-medium"
      style={{ backgroundColor: C.surface, color: C.textMuted }}
    >
      {children}
    </span>
  )
}

/* ── Shared list/table building blocks ───────────────────────────────────── */

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <p
      className="text-sm mb-3 rounded-md px-4 py-3"
      style={{
        color: C.accent,
        backgroundColor: C.accentSoft,
        border: `1px solid ${C.accentSoftBorder}`,
      }}
    >
      {message}
    </p>
  )
}

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
function pageNumbers(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push(`gap-${n}`)
    out.push(n)
  })
  return out
}

function Pagination({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  const btn = 'min-w-[2.25rem] px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-sm" style={{ color: C.textMuted }}>
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          type="button"
          className={btn}
          style={{ color: C.textMuted, border: `1px solid ${C.borderStrong}` }}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        {pageNumbers(page, pages).map((n) =>
          typeof n === 'number' ? (
            <button
              key={n}
              type="button"
              className={btn}
              onClick={() => onChange(n)}
              style={
                n === page
                  ? { color: '#fff', backgroundColor: C.accent, border: `1px solid ${C.accent}` }
                  : { color: C.textMuted, border: `1px solid ${C.borderStrong}` }
              }
            >
              {n}
            </button>
          ) : (
            <span key={n} className="px-1 text-sm" style={{ color: C.textFaint }}>
              …
            </span>
          )
        )}
        <button
          type="button"
          className={btn}
          style={{ color: C.textMuted, border: `1px solid ${C.borderStrong}` }}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

/** Handles error / loading / empty states + pagination the same way for every tab */
function LogPanel({ error, loading, noRows, emptyText, page, total, onPageChange, children }) {
  return (
    <>
      <ErrorBanner message={error} />
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : noRows ? (
        <p className="text-base italic py-10 text-center" style={{ color: C.textFaint }}>
          {emptyText}
        </p>
      ) : (
        <>
          {children}
          <Pagination page={page} total={total} onChange={onPageChange} />
        </>
      )}
    </>
  )
}

function LogTable({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.border}` }}>
      <table className="w-full text-base">
        <thead style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={TH} style={{ color: C.textMuted }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** One row style + one hover style for all tabs */
function LogRow({ expandable = false, expanded = false, onToggle, children }) {
  const rest = expanded ? C.accentSoft : 'transparent'
  return (
    <tr
      className={`transition-colors ${expandable ? 'cursor-pointer' : ''}`}
      style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: rest }}
      onClick={expandable ? onToggle : undefined}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.accentSoft)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rest)}
    >
      {children}
    </tr>
  )
}

function DateCell({ value }) {
  return (
    <td className={`${TD} text-sm whitespace-nowrap`} style={{ color: C.textFaint }}>
      {formatExact(value)}
    </td>
  )
}

/** Right-aligned last column: details toggle and/or action buttons */
function ActionsCell({ children }) {
  return (
    <td className={`${TD} text-right whitespace-nowrap`}>
      <div className="flex items-center justify-end gap-3">{children}</div>
    </td>
  )
}

function DetailsToggle({ expanded }) {
  return (
    <span className="text-sm font-medium" style={{ color: C.accent }}>
      {expanded ? 'Hide details ▾' : 'Show details ▸'}
    </span>
  )
}

function RestoreButton({ onClick }) {
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      className="px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
      style={{
        color: C.accent,
        border: `1px solid ${C.accentSoftBorder}`,
        backgroundColor: C.accentSoft,
      }}
    >
      Restore
    </button>
  )
}

/** Row shown under an expanded row; holds a DetailPanel */
function ExpandedRow({ colSpan, children }) {
  return (
    <tr style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <td colSpan={colSpan} className="px-5 py-4">
        {children}
      </td>
    </tr>
  )
}

/** "Table · record label" cell with an optional sub-line */
function RecordCell({ table, label, note }) {
  return (
    <td className={TD} style={{ color: C.text }}>
      <div className="flex flex-wrap items-center gap-2">
        {table && <TableTag>{table}</TableTag>}
        {label && <span className="font-medium">{label}</span>}
        {!table && !label && '—'}
      </div>
      {note && (
        <div className="text-sm mt-0.5" style={{ color: C.textFaint }}>
          {note}
        </div>
      )}
    </td>
  )
}

/* ── Detail panels ───────────────────────────────────────────────────────── */

const HIDDEN_KEYS = ['id', 'user_id', 'created_by', 'updated_by', 'archived', 'archived_at', 'archived_by']
const TIMESTAMP_KEYS = ['created_at', 'updated_at']
const MONEY_HINT = /(price|cost|amount|total|fee|balance|revenue|sales)/i
const DATE_HINT = /(_at$|^date$|_date$)/i

const FIELD_LABELS = {
  product_code: 'Product Code',
  product_name: 'Product Name',
  shopee_stock: 'Shopee Stock',
  lazada_stock: 'Lazada Stock',
  tiktok_stock: 'TikTok Stock',
  reorder_point: 'Reorder Point',
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || humanLabel(key)
}

function isEmpty(v) {
  return v === null || v === undefined || v === ''
}

/** Format a value based on what the field looks like */
function renderFieldValue(key, v) {
  if (isEmpty(v)) {
    return <span style={{ color: C.textFaint, fontStyle: 'italic' }}>Not set</span>
  }
  if (typeof v === 'boolean') {
    return <StatusChip label={v ? 'Yes' : 'No'} tone={v ? 'success' : 'neutral'} />
  }
  if (typeof v === 'number') {
    if (MONEY_HINT.test(key)) return formatPeso(v)
    return v.toLocaleString()
  }
  if (typeof v === 'string' && DATE_HINT.test(key) && !Number.isNaN(Date.parse(v))) {
    return formatExact(v)
  }
  if (typeof v === 'object') {
    return (
      <pre
        className="text-xs rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap"
        style={{ backgroundColor: '#fff', border: `1px solid ${C.border}`, color: C.text }}
      >
        {formatValue(v)}
      </pre>
    )
  }
  return String(v)
}

function DetailPanel({ title, subtitle, tone = 'neutral', children }) {
  const bar = { success: C.success, danger: C.accent, warning: C.warning, neutral: C.borderStrong }[tone]
  return (
    <div
      className="rounded-lg overflow-hidden bg-white"
      style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${bar}` }}
    >
      {(title || subtitle) && (
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3"
          style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}` }}
        >
          <p className="text-sm font-semibold" style={{ color: C.text }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-xs" style={{ color: C.textFaint }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function DeltaBadge({ oldVal, newVal }) {
  const a = Number(oldVal)
  const b = Number(newVal)
  if (isEmpty(oldVal) || isEmpty(newVal) || Number.isNaN(a) || Number.isNaN(b) || a === b) return null
  const diff = b - a
  const up = diff > 0
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: up ? C.successSoft : C.accentSoft,
        color: up ? C.success : C.accent,
      }}
    >
      {up ? '+' : '−'}
      {Math.abs(diff).toLocaleString()}
    </span>
  )
}

/** "updated" logs shaped like { field: { old, new } } */
function ChangeDiffPanel({ detail }) {
  const entries = Object.entries(detail || {}).filter(([k]) => !HIDDEN_KEYS.includes(k))

  const diffs = entries.filter(
    ([, v]) => v && typeof v === 'object' && ('old' in v || 'new' in v) && v.old !== v.new
  )
  const extras = entries.filter(
    ([, v]) => !(v && typeof v === 'object' && ('old' in v || 'new' in v))
  )

  if (diffs.length === 0 && extras.length === 0) return null

  return (
    <DetailPanel
      tone="warning"
      title={`${diffs.length} ${diffs.length === 1 ? 'field' : 'fields'} changed`}
    >
      <div className="space-y-3">
        {diffs.map(([field, change]) => (
          <div
            key={field}
            className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-1 sm:gap-4 items-start"
          >
            <span className="text-sm font-medium pt-1" style={{ color: C.textMuted }}>
              {fieldLabel(field)}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className="px-2.5 py-1 rounded-md"
                style={{
                  backgroundColor: C.accentSoft,
                  color: C.accent,
                  textDecoration: isEmpty(change.old) ? 'none' : 'line-through',
                  textDecorationColor: C.accentSoftBorder,
                }}
              >
                {renderFieldValue(field, change.old)}
              </span>
              <span style={{ color: C.textFaint }}>→</span>
              <span
                className="px-2.5 py-1 rounded-md font-medium"
                style={{ backgroundColor: C.successSoft, color: C.success }}
              >
                {renderFieldValue(field, change.new)}
              </span>
              <DeltaBadge oldVal={change.old} newVal={change.new} />
            </div>
          </div>
        ))}

        {extras.length > 0 && (
          <div className="pt-3 space-y-2" style={{ borderTop: diffs.length ? `1px dashed ${C.border}` : 'none' }}>
            {extras.map(([field, value]) => (
              <div key={field} className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-1 sm:gap-4">
                <span className="text-sm" style={{ color: C.textMuted }}>
                  {fieldLabel(field)}
                </span>
                <span className="text-sm break-words" style={{ color: C.text }}>
                  {renderFieldValue(field, value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailPanel>
  )
}

/** create / delete / generic snapshots */
function RecordSnapshotPanel({ data, action, exclude = [] }) {
  if (!data || typeof data !== 'object') return null

  const keys = Object.keys(data).filter(
    (k) => !HIDDEN_KEYS.includes(k) && !exclude.includes(k) && !TIMESTAMP_KEYS.includes(k)
  )
  if (keys.length === 0) return null

  const preferred = [
    'product_code', 'product_name', 'category',
    'shopee_stock', 'lazada_stock', 'tiktok_stock', 'stock', 'reorder_point',
  ]
  const ordered = [
    ...preferred.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !preferred.includes(k)),
  ]

  const title =
    action === 'created' ? 'New record details'
    : action === 'deleted' ? 'Deleted record details'
    : 'Record details'
  const tone = action === 'created' ? 'success' : action === 'deleted' ? 'danger' : 'neutral'
  const stamp = data.updated_at || data.created_at

  return (
    <DetailPanel
      tone={tone}
      title={title}
      subtitle={stamp ? `Last modified ${formatExact(stamp)}` : undefined}
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {ordered.map((field) => {
          const v = data[field]
          const isObj = v && typeof v === 'object'
          const mono = field.includes('code') || field.endsWith('_id')
          return (
            <div key={field} className={isObj ? 'sm:col-span-2' : ''}>
              <dt
                className="text-xs font-medium uppercase tracking-wide mb-0.5"
                style={{ color: C.textFaint }}
              >
                {fieldLabel(field)}
              </dt>
              <dd
                className={`text-sm break-words ${mono ? 'font-mono' : ''}`}
                style={{ color: C.text }}
              >
                {renderFieldValue(field, v)}
              </dd>
            </div>
          )
        })}
      </dl>
    </DetailPanel>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

function Activity_logs() {
  const [activeTab, setActiveTab] = useState('logins')
  const [page, setPage] = useState(1)

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
            .limit(FETCH_LIMIT)
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
            .limit(FETCH_LIMIT)
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
            .limit(FETCH_LIMIT)
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
            .limit(FETCH_LIMIT)
          if (fromIso) q = q.gte('archived_at', fromIso)
          if (toIso) q = q.lte('archived_at', toIso)
          return q
        },
        setArchivedRecords,
        mode
      )

      loadSource(
        'archivedEntries',
        async () => {
          let q = supabase
            .from('ledger_entries')
            .select('id, date, detail, type, amount, archived_at, archived_by, ledger_categories ( name )')
            .eq('archived', true)
            .order('archived_at', { ascending: false })
            .limit(FETCH_LIMIT)
          if (fromIso) q = q.gte('archived_at', fromIso)
          if (toIso) q = q.lte('archived_at', toIso)

          const { data, error } = await q
          if (error) return { data: null, error }

          // Look up who archived each entry (no foreign key needed)
          const ids = [...new Set((data || []).map((r) => r.archived_by).filter(Boolean))]
          if (ids.length === 0) return { data, error: null }

          const { data: users, error: usersError } = await supabase
            .from(USERS_TABLE)
            .select('id, email')
            .in('id', ids)
          if (usersError) console.warn(`Couldn't load archiver emails from "${USERS_TABLE}":`, usersError.message)

          const emailById = Object.fromEntries((users || []).map((u) => [u.id, u.email]))
          return {
            data: data.map((r) => ({ ...r, archiver_email: emailById[r.archived_by] || null })),
            error: null,
          }
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
            pageLabel(r.table_name).toLowerCase().includes(q) ||
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

  // ── Pagination (client-side, shared by every tab) ──
  const pageCount = (n) => Math.max(1, Math.ceil(n / PAGE_SIZE))
  const currentPage = (n) => Math.min(page, pageCount(n))
  const pageSlice = (list) => {
    const p = currentPage(list.length)
    return list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
  }

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
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
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
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
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
                    onClick={() => {
                      setActiveTab(t.key)
                      setPage(1)
                    }}
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
              {search && (
                <button
                  onClick={() => {
                    setSearch('')
                    setPage(1)
                  }}
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
            <LogPanel
              error={errorMsg.logins}
              loading={loading.logins}
              noRows={filteredLogins.length === 0}
              emptyText="No login activity recorded yet."
              page={currentPage(filteredLogins.length)}
              total={filteredLogins.length}
              onPageChange={setPage}
            >
              <LogTable headers={['Status', 'User', 'Device', 'Date/Time']}>
                {pageSlice(filteredLogins).map((l) => (
                  <LogRow key={l.id}>
                    <td className={TD}>
                      <StatusChip label={l.status || 'unknown'} tone={loginTone(l.status)} />
                    </td>
                    <td className={TD} style={{ color: C.text }}>
                      {l.user_email || '—'}
                    </td>
                    <td className={`${TD} text-sm`} style={{ color: C.textMuted }} title={l.user_agent || ''}>
                      {parseDevice(l.user_agent)}
                    </td>
                    <DateCell value={l.created_at} />
                  </LogRow>
                ))}
              </LogTable>
            </LogPanel>
          )}

          {/* ── Data Changes ── */}
          {activeTab === 'changes' && (
            <LogPanel
              error={errorMsg.changes}
              loading={loading.changes}
              noRows={filteredChanges.length === 0}
              emptyText="No data changes recorded yet."
              page={currentPage(filteredChanges.length)}
              total={filteredChanges.length}
              onPageChange={setPage}
            >
              <LogTable headers={['Action', 'User', 'Record', 'Date/Time', '']}>
                {pageSlice(filteredChanges).map((c) => {
                  const detail = parseDetail(c.detail)
                  const isExpanded = expandedChange === c.id
                  const isUpdateWithDiff =
                    c.action === 'updated' &&
                    detail &&
                    Object.values(detail).some((v) => v && typeof v === 'object' && ('old' in v || 'new' in v))

                  return (
                    <React.Fragment key={c.id}>
                      <LogRow
                        expandable={!!detail}
                        expanded={isExpanded}
                        onToggle={() => setExpandedChange(isExpanded ? null : c.id)}
                      >
                        <td className={TD}>
                          <StatusChip label={c.action || 'changed'} tone={actionTone(c.action)} />
                        </td>
                        <td className={TD} style={{ color: C.text }}>
                          {c.user_email || '—'}
                        </td>
                        <RecordCell
                          table={c.table_name}
                          label={c.record_label}
                          note={c.detail && !detail ? c.detail : null}
                        />
                        <DateCell value={c.created_at} />
                        <ActionsCell>{detail && <DetailsToggle expanded={isExpanded} />}</ActionsCell>
                      </LogRow>

                      {isExpanded && detail && (
                        <ExpandedRow colSpan={5}>
                          {isUpdateWithDiff ? (
                            <ChangeDiffPanel detail={detail} />
                          ) : (
                            <RecordSnapshotPanel data={detail} action={c.action} />
                          )}
                        </ExpandedRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </LogTable>
            </LogPanel>
          )}

          {/* ── File Imports (original design, shared hover) ── */}
          {activeTab === 'imports' && (
            <LogPanel
              error={errorMsg.imports}
              loading={loading.imports}
              noRows={filteredImports.length === 0}
              emptyText="No file imports recorded yet."
              page={currentPage(filteredImports.length)}
              total={filteredImports.length}
              onPageChange={setPage}
            >
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
                    {pageSlice(filteredImports).map((i) => {
                      const hasDetail = (i.errors && i.errors.length > 0) || i.reject_reason
                      const isExpanded = expandedImport === i.id
                      return (
                        <React.Fragment key={i.id}>
                          <LogRow
                            expandable={!!hasDetail}
                            expanded={isExpanded}
                            onToggle={() => setExpandedImport(isExpanded ? null : i.id)}
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
                          </LogRow>

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
            </LogPanel>
          )}

          {/* ── Archive ── */}
          {activeTab === 'archive' && (
            <>
              <ErrorBanner message={actionError} />
              <LogPanel
                error={archiveError}
                loading={archiveLoading}
                noRows={filteredArchive.length === 0}
                emptyText="Nothing has been archived yet."
                page={currentPage(filteredArchive.length)}
                total={filteredArchive.length}
                onPageChange={setPage}
              >
                <LogTable headers={['Page', 'User', 'Item', 'Date/Time', '']}>
                  {pageSlice(filteredArchive).map((item) => {
                    if (item.kind === 'entry') {
                      const e = item.entry
                      return (
                        <LogRow key={item.key}>
                          <td className={TD}>
                            <StatusChip label="Cash Book" tone="neutral" />
                          </td>
                          <td className={TD} style={{ color: C.text }}>
                            {e.archiver_email || '—'}
                          </td>
                          <td className={TD} style={{ color: C.text }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{e.detail}</span>
                              {e.ledger_categories?.name && (
                                <span
                                  className="inline-block px-2 py-0.5 rounded-full text-sm font-medium"
                                  style={{ backgroundColor: C.surface, color: C.textMuted }}
                                >
                                  {e.ledger_categories.name}
                                </span>
                              )}
                            </div>
                            <div className="text-sm mt-0.5" style={{ color: C.textFaint }}>
                              Entry dated {e.date} ·{' '}
                              <span style={{ color: e.type === 'debit' ? C.success : C.accent }}>
                                {CASH_TYPE_LABEL[e.type] || e.type} {formatPeso(e.amount)}
                              </span>
                            </div>
                          </td>
                          <DateCell value={e.archived_at} />
                          <ActionsCell>
                            <RestoreButton onClick={() => setRestoreTarget({ kind: 'entry', entry: e })} />
                          </ActionsCell>
                        </LogRow>
                      )
                    }

                    const r = item.record
                    const data = r.data && typeof r.data === 'object' ? r.data : null
                    const isExpanded = expandedArchive === item.key
                    return (
                      <React.Fragment key={item.key}>
                        <LogRow
                          expandable={!!data}
                          expanded={isExpanded}
                          onToggle={() => setExpandedArchive(isExpanded ? null : item.key)}
                        >
                          <td className={TD}>
                            <StatusChip label={pageLabel(r.table_name)} tone="neutral" />
                          </td>
                          <td className={TD} style={{ color: C.text }}>
                            {r.archived_by_email || '—'}
                          </td>
                          <RecordCell label={r.record_label} />
                          <DateCell value={r.archived_at} />
                          <ActionsCell>
                            {data && <DetailsToggle expanded={isExpanded} />}
                            <RestoreButton onClick={() => setRestoreTarget({ kind: 'record', record: r })} />
                          </ActionsCell>
                        </LogRow>

                        {isExpanded && data && (
                          <ExpandedRow colSpan={5}>
                            <RecordSnapshotPanel data={data} action="deleted" />
                          </ExpandedRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </LogTable>
              </LogPanel>
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