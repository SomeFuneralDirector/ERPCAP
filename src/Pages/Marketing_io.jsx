import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../api/supabase'

const PLATFORM_COLORS = {
  Shopee: '#f97316',
  Lazada: '#3b82f6',
  TikTok: '#111827',
}

const LOW_PERFORMER_THRESHOLD = 5 // total units sold at/below this count

const normalizePlatform = (p) => {
  if (!p) return 'Unknown'
  const key = p.toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return p
}

const centsToPesos = (c) => (c || 0) / 100

function Marketing_io() {
  const [orderItems, setOrderItems] = useState([])
  const [inventory, setInventory] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }
    setErrorMsg('')

    // ── 1. Completed orders → gives us the set of order_ids to trust ──
    const { data: completedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('order_id')
      .eq('status', 'COMPLETED')

    if (ordersError) {
      setErrorMsg(ordersError.message)
      setInitialLoading(false)
      setRefreshing(false)
      return
    }

    const orderIds = (completedOrders || []).map((o) => o.order_id).filter(Boolean)

    // ── 2. Line items for those completed orders + inventory context, in parallel ──
    const [itemsRes, inventoryRes] = await Promise.all([
      orderIds.length > 0
        ? supabase
            .from('order_items')
            .select('order_id, platform, product_name, sku, quantity, unit_price')
            .in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('inventory')
        .select('product_name, category, shopee_stock, lazada_stock, tiktok_stock'),
    ])

    if (itemsRes.error) {
      setErrorMsg(itemsRes.error.message)
    } else {
      setOrderItems(itemsRes.data || [])
    }

    if (inventoryRes.error) {
      // Inventory context is a nice-to-have here; don't block the page on it.
      console.error('Error fetching inventory context:', inventoryRes.error)
    } else {
      setInventory(inventoryRes.data || [])
    }

    setInitialLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchData(true)

    const channel = supabase
      .channel('marketing-io-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchData(false)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => fetchData(false)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => fetchData(false)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchData])

  // Lookup: product_name -> { category, stock }
  const inventoryByName = useMemo(() => {
    const map = {}
    inventory.forEach((item) => {
      const stock =
        (Number(item.shopee_stock) || 0) +
        (Number(item.lazada_stock) || 0) +
        (Number(item.tiktok_stock) || 0)
      map[item.product_name] = {
        category: item.category || '—',
        stock,
      }
    })
    return map
  }, [inventory])

  // Aggregate order items into per-product totals, split by platform,
  // then attach inventory context (category, current stock) where it matches.
  const products = useMemo(() => {
    const map = {}
    orderItems.forEach((row) => {
      const name = row.product_name || 'Unnamed Product'
      if (!map[name]) {
        map[name] = {
          id: name,
          name,
          shopee: 0,
          lazada: 0,
          tiktok: 0,
          revenue: 0,
          total: 0,
        }
      }
      const qty = Number(row.quantity) || 0
      const platform = normalizePlatform(row.platform)
      const platformKey = platform === 'TikTok' ? 'tiktok' : platform.toLowerCase()
      if (map[name][platformKey] !== undefined) {
        map[name][platformKey] += qty
      }
      map[name].revenue += qty * centsToPesos(row.unit_price)
      map[name].total += qty
    })

    return Object.values(map).map((p) => ({
      ...p,
      category: inventoryByName[p.name]?.category ?? '—',
      stock: inventoryByName[p.name]?.stock ?? null,
    }))
  }, [orderItems, inventoryByName])

  const sortedProductTable = useMemo(() => {
    return [...products].sort((a, b) => b.total - a.total)
  }, [products])

  const loading = initialLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Marketing - Inventory Overview
          {refreshing && <span className="ml-2 text-xs font-normal text-gray-400">syncing…</span>}
        </h1>
        <button
          onClick={() => fetchData(false)}
          disabled={loading || refreshing}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          {loading || refreshing ? '↻ Loading…' : '↻ Refresh'}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-sm">Loading data...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-400 text-sm italic">
            No completed orders yet. Once orders come in through the Sales page,
            product sales data will show up here.
          </p>
        </div>
      ) : (
        <>
          {/* Full Product Sales Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              All Products - Sales Detail
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Shopee</th>
                    <th className="py-2 pr-4">Lazada</th>
                    <th className="py-2 pr-4">TikTok</th>
                    <th className="py-2 pr-4">Total Sold</th>
                    <th className="py-2 pr-4">In Stock</th>
                    <th className="py-2 pr-4">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProductTable.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-100 hover:bg-red-50/40"
                    >
                      <td className="py-2 pr-4 font-medium text-gray-700">{p.name}</td>
                      <td className="py-2 pr-4 text-gray-500">{p.category}</td>
                      <td className="py-2 pr-4">{p.shopee}</td>
                      <td className="py-2 pr-4">{p.lazada}</td>
                      <td className="py-2 pr-4">{p.tiktok}</td>
                      <td className="py-2 pr-4 font-bold text-red-600">{p.total}</td>
                      <td className="py-2 pr-4 text-gray-500">
                        {p.stock !== null ? p.stock : '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        ₱{p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Marketing_io