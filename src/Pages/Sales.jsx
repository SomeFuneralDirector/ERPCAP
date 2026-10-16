//this is SALES TRANSACTION.
import React, { useState, useEffect, useCallback } from 'react'
import CSVImport from '../Components/Csvimport'
import { Search } from "lucide-react";
import { supabase } from "../api/supabase";

/* Same palette as Inventory */
const C = {
  accent: "#B3211B",
  accentSoft: "#FBEAE9",
  shopee: "#EE4D2D",
  lazada: "#0F146D",
  tiktok: "#101113",
}

const PLATFORM_DOT = { shopee: C.shopee, lazada: C.lazada, tiktok: C.tiktok }
const PLATFORM_LABEL = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' }

const SORT_OPTIONS = [
  { value: 'imported_at:desc', label: 'Newest Import' },
  { value: 'imported_at:asc',  label: 'Oldest Import' },
  { value: 'total_amount:desc',label: 'Highest Amount' },
  { value: 'total_amount:asc', label: 'Lowest Amount' },
  { value: 'created_at:desc',  label: 'Order Date (New)' },
  { value: 'created_at:asc',   label: 'Order Date (Old)' },
]

const focusOn  = (e) => { e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`; e.target.style.borderColor = C.accent }
const focusOff = (e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#D1D5DB' }

function Sales() {
  const [orders, setOrders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState('imported_at:desc')
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [page, setPage]               = useState(1)
  const [totalCount, setTotalCount]   = useState(0)
  const [rowProducts, setRowProducts] = useState({}) // `${platform}:${order_id}` -> [{product_name, sku, quantity}]

  const PAGE_SIZE = 15
  const COLUMN_COUNT = 8 // # + Order ID + Platform + SKU + Product + Qty + Total + Completed

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const [sortCol, sortDir] = sortBy.split(':')
    const from = (page - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('status', 'COMPLETED')
      .order(sortCol, { ascending: sortDir === 'asc' })
      .range(from, to)

    if (filterPlatform !== 'all') query = query.eq('platform', filterPlatform)

    // Tracking no. is not shown in the table but stays searchable
    if (search.trim()) {
      query = query.or(
        `order_id.ilike.%${search}%,recipient_name.ilike.%${search}%,tracking_no.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query

    if (error || !data) {
      setOrders([])
      setTotalCount(0)
      setRowProducts({})
      setLoading(false)
      return
    }

    setOrders(data)
    setTotalCount(count || 0)

    // Batch-fetch items (product, sku, qty) for every order on this page
    if (data.length > 0) {
      const idsByPlatform = {}
      data.forEach(o => {
        if (!o.platform || !o.order_id) return
        ;(idsByPlatform[o.platform] ||= []).push(o.order_id)
      })

      const productsMap = {}
      await Promise.all(
        Object.entries(idsByPlatform).map(async ([platform, orderIds]) => {
          const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select('order_id, product_name, sku, quantity')
            .eq('platform', platform)
            .in('order_id', orderIds)

          if (itemsErr) {
            console.error('Failed to load items for platform', platform, itemsErr)
            return
          }

          ;(items || []).forEach(item => {
            const key = `${platform}:${item.order_id}`
            ;(productsMap[key] ||= []).push(item)
          })
        })
      )

      setRowProducts(productsMap)
    } else {
      setRowProducts({})
    }

    setLoading(false)
  }, [search, sortBy, filterPlatform, page])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1) }, [search, sortBy, filterPlatform])

  // One line per item so SKU, Product and Qty stay aligned across columns
  const renderItems = (order, field) => {
    const items = rowProducts[`${order.platform}:${order.order_id}`]
    if (!items || items.length === 0) return '—'
    return items.map((item, i) => (
      <div key={i} className={i > 0 ? 'mt-1' : ''}>{item[field] ?? '—'}</div>
    ))
  }

  const totalAmount = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const totalPages  = Math.ceil(totalCount / PAGE_SIZE)
  const peso = (v) => (v / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })

  return (
    <div className="p-6 space-y-6">

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Sales - Transaction</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <CSVImport onImportComplete={fetchOrders} />
      </div>

      <div className="bg-white rounded-lg shadow p-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Completed Orders</h2>
            <p className="text-sm text-gray-400">{totalCount} total completed orders</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="px-4 py-2 bg-indigo-50 rounded-lg text-center">
              <p className="text-xs text-indigo-400">Showing</p>
              <p className="text-sm font-bold text-indigo-700">{orders.length} orders</p>
            </div>
            <div className="px-4 py-2 bg-green-50 rounded-lg text-center">
              <p className="text-xs text-green-400">Page Total</p>
              <p className="text-sm font-bold text-green-700">PHP {peso(totalAmount)}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Search size={16} /></span>
            <input
              type="text"
              placeholder="Search order ID, recipient, tracking no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none"
              onFocus={focusOn}
              onBlur={focusOff}
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer">×</button>
            )}
          </div>

          <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
            onFocus={focusOn} onBlur={focusOff}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none bg-white cursor-pointer">
            <option value="all">All Platforms</option>
            <option value="shopee">Shopee</option>
            <option value="lazada">Lazada</option>
            <option value="tiktok">TikTok Shop</option>
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            onFocus={focusOn} onBlur={focusOff}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none bg-white cursor-pointer">
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table — styled like Inventory */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-base border-collapse">
              <thead>
                <tr className="bg-red-900 text-white">
                  <th className="px-3 py-3 w-10" />
                  <th className="px-4 py-3 text-left text-sm font-semibold tracking-wide">ORDER ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold tracking-wide">PLATFORM</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold tracking-wide">SKU</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold tracking-wide min-w-[240px]">PRODUCT</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold tracking-wide">QTY</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold tracking-wide">TOTAL (PHP)</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold tracking-wide">COMPLETED</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {[...Array(COLUMN_COUNT)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-5 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMN_COUNT} className="px-4 py-14 text-center text-gray-400">
                      <p className="text-base font-medium text-gray-500">No completed orders found</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {search || filterPlatform !== 'all'
                          ? 'Try adjusting your search or filters'
                          : 'Import a CSV file above to get started'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  orders.map((order, idx) => {
                    const rowNum = (page - 1) * PAGE_SIZE + idx + 1
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top"
                        style={{ backgroundColor: idx % 2 === 1 ? '#FAFAFA' : undefined }}
                      >
                        <td className="px-3 py-3 text-center text-sm text-gray-400 w-10">{rowNum}</td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">{order.order_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                              style={{ backgroundColor: PLATFORM_DOT[order.platform] || '#9A9AA0' }} />
                            {PLATFORM_LABEL[order.platform] || order.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">{renderItems(order, 'sku')}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{renderItems(order, 'product_name')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-center whitespace-nowrap">{renderItems(order, 'quantity')}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">{peso(order.total_amount || 0)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {(order.completed_at || order.created_at || order.paid_time || '—').split(' ')[0]}
                        </td>
                      </tr>
                    )
                  })
                )}

                {!loading && orders.length > 0 && (
                  <tr className="border-t-2 font-semibold" style={{ borderTopColor: C.accent, backgroundColor: '#FAFAFA' }}>
                    <td className="px-3 py-3 text-center text-sm text-gray-400">—</td>
                    <td colSpan={4} className="px-4 py-3 text-sm text-gray-700">PAGE TOTAL ({orders.length})</td>
                    <td />
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{peso(totalAmount)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">Page {page} of {totalPages} · {totalCount} orders</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                ← Prev
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                const active = page === pageNum
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    className="px-3 py-1.5 border rounded-md text-sm transition-colors cursor-pointer"
                    style={active
                      ? { backgroundColor: C.accent, borderColor: C.accent, color: '#fff' }
                      : { backgroundColor: '#fff', borderColor: '#D1D5DB', color: '#4B5563' }}>
                    {pageNum}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Sales