import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { supabase } from '../api/supabase'

const PLATFORM_COLORS = {
  Shopee: '#f97316',
  Lazada: '#3b82f6',
  TikTok: '#111827',
}

const LOW_PERFORMER_THRESHOLD = 5 // total units sold at/below this count

function Marketing_io() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchInventory()
  }, [])

  async function fetchInventory() {
    setLoading(true)
    setErrorMsg('')
    const { data, error } = await supabase
      .from('inventory')
      .select('*')

    if (error) {
      setErrorMsg(error.message)
    } else {
      setInventory(data || [])
    }
    setLoading(false)
  }

  // Normalize each product's sales across platforms
  const products = useMemo(() => {
    return inventory.map((item) => {
      const shopee = Number(item.shopee_sold) || 0
      const lazada = Number(item.lazada_sold) || 0
      const tiktok = Number(item.tiktok_sold) || 0
      const total = shopee + lazada + tiktok
      return {
        id: item.id,
        name: item.product_name || item.name || 'Unnamed Product',
        category: item.category || '—',
        shopee,
        lazada,
        tiktok,
        total,
      }
    })
  }, [inventory])

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [products])

  const lowProducts = useMemo(() => {
    return [...products]
      .filter((p) => p.total <= LOW_PERFORMER_THRESHOLD)
      .sort((a, b) => a.total - b.total)
      .slice(0, 5)
  }, [products])

  const platformBreakdown = useMemo(() => {
    const totals = { Shopee: 0, Lazada: 0, TikTok: 0 }
    products.forEach((p) => {
      totals.Shopee += p.shopee
      totals.Lazada += p.lazada
      totals.TikTok += p.tiktok
    })
    return Object.entries(totals).map(([platform, sold]) => ({
      platform,
      sold,
    }))
  }, [products])

  const totalSold = platformBreakdown.reduce((sum, p) => sum + p.sold, 0)

  const sortedProductTable = useMemo(() => {
    return [...products].sort((a, b) => b.total - a.total)
  }, [products])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4 bg-white rounded-lg shadow p-6">
        Marketing - Inventory Overview
      </h1>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-sm">Loading inventory data...</p>
        </div>
      ) : (
        <>
          {/* Top Sellers & Low Performers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Top Selling Products */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Top Selling Products
              </h2>
              {topProducts.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No sales data yet.</p>
              ) : (
                <ul className="space-y-3">
                  {topProducts.map((p, idx) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">
                            {p.name}
                          </p>
                          <p className="text-xs text-gray-400">{p.category}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-600">
                        {p.total} sold
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Low Performing Products */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Low Performing Products
              </h2>
              {lowProducts.length === 0 ? (
                <p className="text-gray-400 text-sm italic">
                  No low-performing products found.
                </p>
              ) : (
                <ul className="space-y-3">
                  {lowProducts.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">
                          {p.name}
                        </p>
                        <p className="text-xs text-gray-400">{p.category}</p>
                      </div>
                      <span className="text-sm font-bold text-gray-500 bg-gray-100 border border-gray-300 px-2 py-1 rounded-full">
                        {p.total} sold
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Sales per Product Chart */}
          <div className="bg-white rounded-lg shadow p-6 mb-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Sales per Product
            </h2>
            {products.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No products found.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={sortedProductTable}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="shopee" stackId="a" name="Shopee" fill={PLATFORM_COLORS.Shopee} />
                  <Bar dataKey="lazada" stackId="a" name="Lazada" fill={PLATFORM_COLORS.Lazada} />
                  <Bar dataKey="tiktok" stackId="a" name="TikTok" fill={PLATFORM_COLORS.TikTok} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Platform Totals (chart + breakdown combined) */}
          <div className="bg-white rounded-lg shadow p-6 mb-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Platform Totals
            </h2>
            {totalSold === 0 ? (
              <p className="text-gray-400 text-sm italic">No sales recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={platformBreakdown}
                      dataKey="sold"
                      nameKey="platform"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ platform, percent }) =>
                        `${platform} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {platformBreakdown.map((entry) => (
                        <Cell
                          key={entry.platform}
                          fill={PLATFORM_COLORS[entry.platform]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>

                <div>
                  <ul className="space-y-3">
                    {platformBreakdown.map((p) => (
                      <li key={p.platform} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: PLATFORM_COLORS[p.platform] }}
                          />
                          <span className="text-sm font-semibold text-gray-700">
                            {p.platform}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-700">
                          {p.sold} units{' '}
                          <span className="text-gray-400 font-normal">
                            ({totalSold > 0 ? ((p.sold / totalSold) * 100).toFixed(1) : 0}%)
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                    <span className="text-sm font-semibold text-gray-500">Total Sold</span>
                    <span className="text-sm font-bold text-red-600">{totalSold} units</span>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                    <th className="py-2 pr-4">Total</th>
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

export default Marketing_io;