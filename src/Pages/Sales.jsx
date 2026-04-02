import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import CSVImport from '../Components/Csvimport'
import { LayoutDashboard, Package, ShoppingCart, Megaphone, Factory, Settings, ChevronRight, ChevronDown,ChevronLeft, Menu, X, Search, LogOut } from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

const PLATFORM_BADGE = {
  shopee: 'bg-red-100 text-red-700',
  lazada: 'bg-indigo-100 text-indigo-700',
  tiktok: 'bg-gray-100 text-gray-700',
}

const SORT_OPTIONS = [
  { value: 'imported_at:desc', label: 'Newest Import' },
  { value: 'imported_at:asc',  label: 'Oldest Import' },
  { value: 'total_amount:desc',label: 'Highest Amount' },
  { value: 'total_amount:asc', label: 'Lowest Amount' },
  { value: 'created_at:desc',  label: 'Order Date (New)' },
  { value: 'created_at:asc',   label: 'Order Date (Old)' },
]

function Sales() {
  const [orders, setOrders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState('imported_at:desc')
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [page, setPage]               = useState(1)
  const [totalCount, setTotalCount]   = useState(0)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [orderItems, setOrderItems]   = useState({})

  const PAGE_SIZE = 10

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

    if (search.trim()) {
      query = query.or(
        `order_id.ilike.%${search}%,recipient_name.ilike.%${search}%,tracking_no.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (!error) {
      setOrders(data || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [search, sortBy, filterPlatform, page])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1) }, [search, sortBy, filterPlatform])

  const fetchItems = async (orderId, platform) => {
    if (orderItems[orderId]) return
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .eq('platform', platform)
    if (data) setOrderItems(prev => ({ ...prev, [orderId]: data }))
  }

  const toggleExpand = (order) => {
    if (expandedOrder === order.order_id) {
      setExpandedOrder(null)
    } else {
      setExpandedOrder(order.order_id)
      fetchItems(order.order_id, order.platform)
    }
  }

  const totalAmount = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const totalPages  = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-6 space-y-6">

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Sales</h1>
        <p className="text-sm text-gray-500 mt-1">Import and manage completed orders from all platforms</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <CSVImport onImportComplete={fetchOrders} />
      </div>

      <div className="bg-white rounded-lg shadow p-6">

        {/* Table header */}
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
              <p className="text-sm font-bold text-green-700">
                PHP {(totalAmount / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"> <Search size={18} /></span>
            <input
              type="text"
              placeholder="Search order ID, recipient, tracking no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent "
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            )}
          </div>

          <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white cursor-pointer">
            <option value="all">All Platforms</option>
            <option value="shopee">Shopee</option>
            <option value="lazada">Lazada</option>
            <option value="tiktok">TikTok Shop</option>
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white cursor-pointer">
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 w-8" />
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Order ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Platform</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Recipient</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Total (PHP)</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Completed</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tracking No.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="font-medium text-gray-500">No completed orders found</p>
                    <p className="text-sm mt-1">
                      {search || filterPlatform !== 'all'
                        ? 'Try adjusting your search or filters'
                        : 'Import a CSV file above to get started'}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <React.Fragment key={order.id}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${expandedOrder === order.order_id ? 'bg-indigo-50' : ''}`}
                      onClick={() => toggleExpand(order)}
                    >
                      <td className="px-4 py-3 text-gray-400 text-center">
                        <span className="text-xs">{expandedOrder === order.order_id ? <ChevronDown size={16} /> :  <ChevronRight size={16} />}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.order_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${PLATFORM_BADGE[order.platform] || 'bg-gray-100 text-gray-600'}`}>
                          {order.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{order.recipient_name || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {((order.total_amount || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(order.completed_at || order.created_at || order.paid_time || '—').split(' ')[0]}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {order.tracking_no || '—'}
                      </td>
                    </tr>

                    {expandedOrder === order.order_id && (
                      <tr className="bg-indigo-50 border-b border-indigo-100">
                        <td colSpan={7} className="px-8 py-4">
                          <p className="text-xs font-semibold text-indigo-600 mb-3 uppercase tracking-wide">Order Items</p>
                          {!orderItems[order.order_id] ? (
                            <p className="text-sm text-gray-400">Loading items…</p>
                          ) : orderItems[order.order_id].length === 0 ? (
                            <p className="text-sm text-gray-400">No items found</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-indigo-200">
                              <table className="w-full text-xs">
                                <thead className="bg-indigo-100">
                                  <tr>
                                    {['Product', 'SKU', 'Variation', 'Qty', 'Unit Price', 'Subtotal'].map(h => (
                                      <th key={h} className="px-3 py-2 text-left font-semibold text-indigo-700">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="bg-white">
                                  {orderItems[order.order_id].map((item, i) => (
                                    <tr key={i} className="border-t border-indigo-100">
                                      <td className="px-3 py-2 text-gray-700 font-medium">{item.product_name}</td>
                                      <td className="px-3 py-2 font-mono text-gray-500">{item.sku || '—'}</td>
                                      <td className="px-3 py-2 text-gray-500">{item.variation || '—'}</td>
                                      <td className="px-3 py-2 text-gray-700">{item.quantity}</td>
                                      <td className="px-3 py-2 text-gray-700">PHP {((item.unit_price || 0) / 100).toFixed(2)}</td>
                                      <td className="px-3 py-2 font-semibold text-gray-800">
                                        PHP {(((item.unit_price || 0) * item.quantity) / 100).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                            {order.address        && <span>📍 {order.address}</span>}
                            {order.phone          && <span>📞 {order.phone}</span>}
                            {order.payment_method && <span>💳 {order.payment_method}</span>}
                            {order.shipping_option && <span>🚚 {order.shipping_option}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">Page {page} of {totalPages} · {totalCount} orders</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ← Prev
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${
                      page === pageNum ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {pageNum}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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