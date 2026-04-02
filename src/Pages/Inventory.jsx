import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { LayoutDashboard, Package, ShoppingCart, Megaphone, Factory, Settings, ChevronRight, ChevronDown,ChevronLeft, Menu, X, Search, LogOut } from "lucide-react";


const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [editingStock, setEditingStock] = useState(null); 
  const [saving, setSaving] = useState(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("category", { ascending: true })
      .order("product_name", { ascending: true });

    if (!error && data) {
      setInventory(data);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const filtered = inventory.filter((item) => {
    const matchCat =
      filterCategory === "All" || item.category === filterCategory;
    const matchSearch =
      !search ||
      item.product_name.toLowerCase().includes(search.toLowerCase()) ||
      item.product_code.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totals = filtered.reduce(
    (acc, item) => ({
      stock: acc.stock + (item.stock || 0),
      sold: acc.sold + (item.total_sold || 0),
      shopee: acc.shopee + (item.shopee_sold || 0),
      lazada: acc.lazada + (item.lazada_sold || 0),
      tiktok: acc.tiktok + (item.tiktok_sold || 0),
    }),
    { stock: 0, sold: 0, shopee: 0, lazada: 0, tiktok: 0 },
  );

  const saveStock = async (id) => {
    if (!editingStock || editingStock.id !== id) return;
    const newStock = parseInt(editingStock.value);
    if (isNaN(newStock) || newStock < 0) {
      setEditingStock(null);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("inventory")
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setInventory((prev) =>
        prev.map((i) => (i.id === id ? { ...i, stock: newStock } : i)),
      );
    }
    setEditingStock(null);
    setSaving(false);
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter") saveStock(id);
    if (e.key === "Escape") setEditingStock(null);
  };

  const isLowStock = (item) => (item.stock ?? 0) <= 5;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live stock · Auto-deducts on completed orders
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                · {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchInventory}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          label="Stock on Hand"
          value={totals.stock}
          bg="bg-amber-400"
          text="text-amber-900"
        />
        <SummaryCard
          label="Total Sold"
          value={totals.sold}
          bg="bg-gray-700"
          text="text-white"
        />
        <SummaryCard
          label="Shopee Sold"
          value={totals.shopee}
          bg="bg-[#EE4D2D]"
          text="text-white"
        />
        <SummaryCard
          label="Lazada Sold"
          value={totals.lazada}
          bg="bg-violet-700"
          text="text-white"
        />
        <SummaryCard
          label="TikTok Sold"
          value={totals.tiktok}
          bg="bg-gray-900"
          text="text-white"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search product name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {["All", "Men", "Women"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                filterCategory === cat
                  ? cat === "Men"
                    ? "bg-blue-600 text-white"
                    : cat === "Women"
                      ? "bg-pink-500 text-white"
                      : "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-400 whitespace-nowrap">
          {filtered.length} products
        </p>
      </div>

      {/* Table — spreadsheet style matching the photo */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th
                  className="bg-gray-100 border border-gray-300 w-8"
                  rowSpan={2}
                />
                <th
                  className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700"
                  rowSpan={2}
                >
                  CODE
                </th>
                <th
                  className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700 min-w-[200px]"
                  rowSpan={2}
                >
                  PRODUCT NAME
                </th>
                <th className="bg-amber-400 text-amber-900 border border-amber-500 px-3 py-1.5 text-center text-xs font-bold">
                  STOCK
                </th>
                <th className=" bg-[#EE4D2D]  text-white border border-red-600 px-3 py-1.5 text-center text-xs font-bold">
                  SHOPEE
                </th>
                <th className="bg-violet-700 text-white border border-indigo-800 px-3 py-1.5 text-center text-xs font-bold">
                  LAZADA
                </th>
                <th className="bg-gray-800 text-white border border-gray-900 px-3 py-1.5 text-center text-xs font-bold">
                  TIKTOK
                </th>
                <th className="bg-gray-600 text-white border border-gray-700 px-3 py-1.5 text-center text-xs font-bold">
                  TOTAL SOLD
                </th>
              </tr>
              <tr>
                <th className="bg-amber-100 border border-amber-200 px-3 py-1 text-center text-xs font-semibold text-amber-800">
                  ON HAND
                </th>
                <th className="bg-red-100 border border-red-200 px-3 py-1 text-center text-xs font-semibold text-red-700">
                  QTY
                </th>
                <th className="bg-indigo-100 border border-indigo-200 px-3 py-1 text-center text-xs font-semibold text-indigo-700">
                  QTY
                </th>
                <th className="bg-gray-100 border border-gray-200 px-3 py-1 text-center text-xs font-semibold text-gray-700">
                  QTY
                </th>
                <th className="bg-gray-100 border border-gray-200 px-3 py-1 text-center text-xs font-semibold text-gray-700">
                  QTY
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    <p className="text-4xl mb-2">📦</p>
                    <p className="font-medium text-gray-500">
                      No products found
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
                  const rows = [];
                  let rowNum = 1;
                  let lastCat = null;

                  for (const item of filtered) {
                    if (item.category !== lastCat) {
                      rows.push(
                        <tr key={`cat-${item.category}`}>
                          <td
                            colSpan={8}
                            className={`px-3 py-1.5 text-xs font-bold text-white border ${
                              item.category === "Men"
                                ? "bg-blue-600 border-blue-700"
                                : "bg-pink-500 border-pink-600"
                            }`}
                          >
                            {item.category.toUpperCase()}
                          </td>
                        </tr>,
                      );
                      lastCat = item.category;
                    }

                    const low = isLowStock(item);
                    const hasSold = (item.total_sold || 0) > 0;
                    const rowBg = low
                      ? "bg-red-50"
                      : hasSold
                        ? "bg-green-50 hover:bg-green-100"
                        : rowNum % 2 === 0
                          ? "bg-gray-50 hover:bg-gray-100"
                          : "bg-white hover:bg-gray-50";

                    rows.push(
                      <tr
                        key={item.id}
                        className={`${rowBg} border-b border-gray-200 transition-colors`}
                      >
                        <td className="px-2 py-1.5 text-center text-xs text-gray-400 bg-gray-50 border-r border-gray-200 w-8">
                          {rowNum++}
                        </td>
                        <td className="px-3 py-1.5 text-xs font-mono text-gray-500 border-r border-gray-200 whitespace-nowrap">
                          {item.product_code}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border-r border-gray-200">
                          <div className="flex items-center gap-2">
                            {item.product_name}
                            {low && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded font-medium shrink-0">
                                Low
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stock — click to edit */}
                        <td className="px-3 py-1.5 text-center border-r border-amber-200">
                          {editingStock?.id === item.id ? (
                            <input
                              type="number"
                              min="0"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  id: item.id,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => saveStock(item.id)}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-16 text-center text-xs border border-amber-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          ) : (
                            <button
                              onClick={() =>
                                setEditingStock({
                                  id: item.id,
                                  value: String(item.stock ?? 0),
                                })
                              }
                              title="Click to edit stock"
                              className={`text-xs font-bold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all ${
                                low
                                  ? "text-red-700 bg-red-100"
                                  : "text-amber-800 bg-amber-100"
                              }`}
                            >
                              {item.stock ?? 0}
                            </button>
                          )}
                        </td>

                        <td
                          className={`px-3 py-1.5 text-center text-xs font-semibold border-r border-red-100 ${(item.shopee_sold || 0) > 0 ? "text-red-700" : "text-gray-300"}`}
                        >
                          {item.shopee_sold || 0}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-center text-xs font-semibold border-r border-indigo-100 ${(item.lazada_sold || 0) > 0 ? "text-indigo-700" : "text-gray-300"}`}
                        >
                          {item.lazada_sold || 0}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-center text-xs font-semibold border-r border-gray-200 ${(item.tiktok_sold || 0) > 0 ? "text-gray-800" : "text-gray-300"}`}
                        >
                          {item.tiktok_sold || 0}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-center text-xs font-bold ${(item.total_sold || 0) > 0 ? "text-gray-800" : "text-gray-300"}`}
                        >
                          {item.total_sold || 0}
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })()
              )}

              {/* Totals footer */}
              {!loading && filtered.length > 0 && (
                <tr className="bg-amber-400 border-t-2 border-amber-500 font-bold">
                  <td className="px-2 py-2 text-center text-xs text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td className="border-r border-amber-500" />
                  <td className="px-3 py-2 text-xs text-amber-900 border-r border-amber-500">
                    TOTAL ({filtered.length} products)
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-r border-amber-500">
                    {totals.stock.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-red-900 border-r border-amber-500">
                    {totals.shopee.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-indigo-900 border-r border-amber-500">
                    {totals.lazada.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-gray-900 border-r border-amber-500">
                    {totals.tiktok.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-gray-900">
                    {totals.sold.toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-gray-500 pb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-400 inline-block" />
          Has sales
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />
          Low stock (≤ 5)
        </span>
        <span className="text-gray-400">
          · Click stock number to edit · COMPLETED orders only
        </span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, bg, text }) {
  return (
    <div className={`rounded-lg shadow p-4 ${bg}`}>
      <p
        className={`text-xs font-semibold uppercase tracking-wide opacity-80 ${text}`}
      >
        {label}
      </p>
      <p className={`text-3xl font-bold mt-1 ${text}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default Inventory;
