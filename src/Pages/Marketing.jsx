import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { supabase } from '../api/supabase'

const PLATFORM_COLORS = {
  Shopee: '#EE4D2D',
  Lazada: '#7C3AED',
  TikTok: '#1f2937',
}

const LOW_PERFORMER_THRESHOLD = 5
const CAMPAIGN_ENDING_SOON_DAYS = 7

// How many top sellers to surface in the hover tooltip
const TOP_N_IN_TOOLTIP = 3

// Trend chart colors — matches the red/gray palette used across the rest
// of this dashboard (bar charts, rank badges, active-campaign pills, etc.)
const TREND_LINE_COLOR = '#b91c1c' // red-700, same family as the rank badges
const TREND_PEAK_COLOR = '#dc2626' // red-600
const TREND_GRID_COLOR = '#f3f4f6' // gray-100, same as other charts' CartesianGrid
const TREND_AXIS_COLOR = '#9ca3af' // gray-400, same as other charts' axis ticks

const normalizePlatform = (p) => {
  if (!p) return 'Unknown'
  const key = p.toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return p
}

const centsToPesos = (c) => (c || 0) / 100

const fmtCurrency = (n) =>
  `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const orderDate = (o) => o.completed_at || o.created_at || o.paid_time

const monthKey = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthLabel = (key) => {
  if (!key) return ''
  const [year, month] = key.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// Same rule as Marketing_campaigns.jsx — Cancelled is the only manual override,
// everything else is derived from dates.
function deriveCampaignStatus(c) {
  if (c.status === 'Cancelled') return 'Cancelled'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = c.start_date ? new Date(c.start_date) : null
  const end = c.end_date ? new Date(c.end_date) : null
  if (end && today > end) return 'Ended'
  if (start && today < start) return 'Upcoming'
  return 'Active'
}

function Skeleton({ className = 'h-8 w-16' }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />
}

// Custom dot for the trend line: small red dot normally, a larger dot with a
// value callout on months that are a local peak.
function TrendDot(props) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  const isPeak = payload.isPeak

  return (
    <g>
      <circle cx={cx} cy={cy} r={isPeak ? 6 : 4} fill={isPeak ? TREND_PEAK_COLOR : TREND_LINE_COLOR} />
      {isPeak && (
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fill={TREND_PEAK_COLOR}
          fontSize={13}
          fontWeight={600}
        >
          {payload.total.toLocaleString()}
        </text>
      )}
    </g>
  )
}

// Hovering a point shows that month's total plus its top 3 sellers, each
// with units sold and % share of that month's volume, and any campaigns that
// were active during that month.
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  const topSellers = row.topSellers || []
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[190px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-gray-500 mb-2">{row.total.toLocaleString()} units sold</p>
      {topSellers.length > 0 && (
        <div className="space-y-1">
          <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: '10px' }}>
            Top {topSellers.length} sellers
          </p>
          {topSellers.map((p, idx) => {
            const pct = row.total > 0 ? ((p.qty / row.total) * 100).toFixed(1) : '0.0'
            return (
              <div key={p.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-gray-700 truncate">
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">
                    {idx + 1}
                  </span>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-gray-500 shrink-0">{p.qty} · {pct}%</span>
              </div>
            )
          })}
        </div>
      )}
      {row.activeCampaigns && row.activeCampaigns.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: '10px' }}>
            Campaigns this month
          </p>
          {row.activeCampaigns.map((c) => (
            <p key={c} className="text-red-600 truncate">{c}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function Marketing() {
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(null)

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }
    setErrorMsg('')

    // Select `id` too — this is the FK order_items.order_uuid points to,
    // and it's the only globally-unique key across platforms.
    const { data: completedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_id, platform, total_amount, completed_at, created_at, paid_time, status')
      .eq('status', 'COMPLETED')

    if (ordersError) {
      setErrorMsg(ordersError.message)
      setInitialLoading(false)
      setRefreshing(false)
      return
    }

    setOrders(completedOrders || [])
    const orderUuids = (completedOrders || []).map((o) => o.id).filter(Boolean)

    const [itemsRes, campaignsRes] = await Promise.all([
      orderUuids.length > 0
        ? supabase
            .from('order_items')
            .select('order_uuid, order_id, platform, product_name, quantity, unit_price')
            .in('order_uuid', orderUuids)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('campaigns')
        .select('id, name, platform, discount_type, discount_value, start_date, end_date, status'),
    ])

    if (itemsRes.error) {
      console.error('Error fetching order items:', itemsRes.error)
      setOrderItems([])
    } else {
      setOrderItems(itemsRes.data || [])
    }

    if (campaignsRes.error) {
      console.error('Error fetching campaigns:', campaignsRes.error)
      setCampaigns([])
    } else {
      setCampaigns(campaignsRes.data || [])
    }

    setInitialLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchAll(true)

    const channel = supabase
      .channel('marketing-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAll(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchAll(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, () => fetchAll(false))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  // ── Derived data ───────────────────────────────────────────

  const totalSales = useMemo(
    () => orders.reduce((sum, o) => sum + centsToPesos(o.total_amount), 0),
    [orders]
  )

  const platformSales = useMemo(() => {
    const map = {}
    orders.forEach((o) => {
      const p = normalizePlatform(o.platform)
      map[p] = (map[p] || 0) + centsToPesos(o.total_amount)
    })
    return Object.entries(map)
      .map(([platform, amount]) => ({ platform, amount, color: PLATFORM_COLORS[platform] ?? '#6b7280' }))
      .sort((a, b) => b.amount - a.amount)
  }, [orders])

  const topPlatform = platformSales[0] || null

  const products = useMemo(() => {
    const map = {}
    orderItems.forEach((row) => {
      const name = row.product_name || 'Unnamed Product'
      if (!map[name]) map[name] = { name, qty: 0, sales: 0 }
      const qty = Number(row.quantity) || 0
      map[name].qty += qty
      map[name].sales += qty * centsToPesos(row.unit_price)
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty)
  }, [orderItems])

  const lowPerformers = useMemo(
    () => products.filter((p) => p.qty <= LOW_PERFORMER_THRESHOLD),
    [products]
  )

  // ── Sales trend by product, across months ───────────────────

  // Keyed by order_uuid now (matches order_items.order_uuid), not order_id.
  const orderDateById = useMemo(() => {
    const map = {}
    orders.forEach((o) => {
      const d = orderDate(o)
      if (d) map[o.id] = d
    })
    return map
  }, [orders])

  // Full qty-per-product-per-month totals so the trend chart and month
  // picker can look up any product's quantity in any month.
  const monthlyProductTotals = useMemo(() => {
    const months = {}
    orderItems.forEach((row) => {
      const date = orderDateById[row.order_uuid]
      if (!date) return
      const key = monthKey(date)
      if (!months[key]) months[key] = {}
      const name = row.product_name || 'Unnamed Product'
      const qty = Number(row.quantity) || 0
      months[key][name] = (months[key][name] || 0) + qty
    })
    return months
  }, [orderItems, orderDateById])

  const availableMonths = useMemo(
    () => Object.keys(monthlyProductTotals).sort((a, b) => (a < b ? 1 : -1)),
    [monthlyProductTotals]
  )

  useEffect(() => {
    if (availableMonths.length === 0) return
    if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0])
    }
  }, [availableMonths, selectedMonth])

  // Top products for whichever month is currently selected (defaults to most recent)
  const selectedMonthProducts = useMemo(() => {
    const key = selectedMonth && availableMonths.includes(selectedMonth) ? selectedMonth : availableMonths[0]
    if (!key || !monthlyProductTotals[key]) return []
    return Object.entries(monthlyProductTotals[key])
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
  }, [selectedMonth, availableMonths, monthlyProductTotals])

  const campaignsWithStatus = useMemo(
    () => campaigns.map((c) => ({ ...c, derivedStatus: deriveCampaignStatus(c) })),
    [campaigns]
  )

  // Which campaign names were active at any point during a given month key ("YYYY-MM")
  const campaignsActiveInMonth = useCallback(
    (key) => {
      if (!key) return []
      const [year, month] = key.split('-').map(Number)
      const monthStart = new Date(year, month - 1, 1)
      const monthEnd = new Date(year, month, 0)
      return campaigns
        .filter((c) => c.status !== 'Cancelled')
        .filter((c) => {
          const start = c.start_date ? new Date(c.start_date) : monthStart
          const end = c.end_date ? new Date(c.end_date) : monthEnd
          return start <= monthEnd && end >= monthStart
        })
        .map((c) => c.name)
    },
    [campaigns]
  )

  // Total units sold per month, with that month's top 3 products attached
  // (for the hover tooltip), which campaigns overlapped that month, and
  // whether the month is a local peak (higher than both neighbors).
  const monthlyTrend = useMemo(() => {
    const monthsAscending = [...availableMonths].reverse()
    const distinctYears = new Set(monthsAscending.map((k) => k.split('-')[0]))

    const rows = monthsAscending.map((key) => {
      const totals = monthlyProductTotals[key] || {}
      const sorted = Object.entries(totals)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
      const total = sorted.reduce((sum, p) => sum + p.qty, 0)
      const topSellers = sorted.slice(0, TOP_N_IN_TOOLTIP)
      const [year, month] = key.split('-')
      const d = new Date(Number(year), Number(month) - 1, 1)
      const label = d.toLocaleDateString(undefined, {
        month: 'short',
        ...(distinctYears.size > 1 ? { year: '2-digit' } : {}),
      })

      return {
        monthKey: key,
        month: label,
        total,
        topSellers,
        topSellerName: topSellers[0]?.name || '',
        activeCampaigns: campaignsActiveInMonth(key),
      }
    })

    rows.forEach((row, i) => {
      const prev = rows[i - 1]
      const next = rows[i + 1]
      row.isPeak = (!prev || row.total > prev.total) && (!next || row.total > next.total)
    })

    return rows
  }, [availableMonths, monthlyProductTotals, campaignsActiveInMonth])

  const activeCampaigns = campaignsWithStatus.filter((c) =>
    ['Active', 'Upcoming'].includes(c.derivedStatus)
  )

  const endingSoonCampaigns = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() + CAMPAIGN_ENDING_SOON_DAYS)

    return campaignsWithStatus.filter((c) => {
      if (c.derivedStatus !== 'Active' || !c.end_date) return false
      const end = new Date(c.end_date)
      return end >= now && end <= cutoff
    })
  }, [campaignsWithStatus])

  const loading = initialLoading

  if (errorMsg && orders.length === 0 && !loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 border border-red-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Marketing</h1>
          <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
          <button
            onClick={() => fetchAll(true)}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            ↻ Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Marketing</h1>
        </div>
        <button
          onClick={() => fetchAll(false)}
          disabled={loading || refreshing}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading || refreshing ? '↻ Loading…' : '↻ Refresh'}
        </button>
      </div>

      {errorMsg && orders.length > 0 && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          Last refresh failed: {errorMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total Sales
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-gray-800">{fmtCurrency(totalSales)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">{orders.length} completed orders</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Top Platform
          </p>
          {loading ? <Skeleton /> : (
            <p
              className="text-3xl font-bold mt-1"
              style={{ color: topPlatform ? PLATFORM_COLORS[topPlatform.platform] : '#374151' }}
            >
              {topPlatform ? topPlatform.platform : '—'}
            </p>
          )}
          <p className="text-xs mt-1 text-gray-400">by sales</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Active Campaigns
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-red-700">{activeCampaigns.length}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">
            {endingSoonCampaigns.length > 0
              ? `${endingSoonCampaigns.length} ending soon`
              : 'running or upcoming'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Low Performers
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-amber-600">{lowPerformers.length}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">≤ {LOW_PERFORMER_THRESHOLD} units sold</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sales by platform */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Sales by platform</h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : platformSales.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={platformSales} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtCurrency(v)} />
                <Bar dataKey="amount" name="Sales" radius={[6, 6, 0, 0]}>
                  {platformSales.map((p) => (
                    <Cell key={p.platform} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Top products</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : products.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {products.slice(0, 5).map((p, idx) => (
                <li key={p.name} className="flex items-center justify-between py-2 first:pt-0">
                  <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-gray-500 text-xs shrink-0 ml-2">{p.qty} sold</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Seasonal trend: units sold per month; hover a point for that month's top 3 sellers */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-700 mb-1">Trend</h2>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : monthlyTrend.length === 0 ? (
          <p className="text-xs text-gray-400">No sales data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrend} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={TREND_GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: TREND_AXIS_COLOR }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: TREND_AXIS_COLOR }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: TREND_GRID_COLOR }} />
              <Line
                type="monotone"
                dataKey="total"
                stroke={TREND_LINE_COLOR}
                strokeWidth={2}
                dot={<TrendDot />}
                activeDot={{ r: 6, fill: TREND_LINE_COLOR }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top products for a specific month */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-gray-700">Top products by month</h2>
          {!loading && availableMonths.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {availableMonths.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedMonth(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    (selectedMonth || availableMonths[0]) === key
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {monthLabel(key)}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : availableMonths.length === 0 ? (
          <p className="text-xs text-gray-400">No sales data yet.</p>
        ) : selectedMonthProducts.length === 0 ? (
          <p className="text-xs text-gray-400">
            No sales recorded for {monthLabel(selectedMonth || availableMonths[0])}.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selectedMonthProducts.map((p, idx) => (
              <li key={p.name} className="flex items-center justify-between py-2 first:pt-0">
                <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-gray-500 text-xs shrink-0 ml-2">{p.qty} sold</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active campaigns snapshot */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Active &amp; upcoming campaigns</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : activeCampaigns.length === 0 ? (
          <p className="text-xs text-gray-400">No active or upcoming campaigns.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-700">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.platform}
                    {c.end_date && ` · ends ${new Date(c.end_date).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.derivedStatus === 'Active'
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-red-600 border border-red-300'
                  }`}
                >
                  {c.derivedStatus}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Marketing