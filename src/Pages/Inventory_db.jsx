import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { supabase } from "../api/supabase";

// ─── Colours ──────────────────────────────────────────────────

const CAT_COLORS = {
  Men: "#2563eb",
  Women: "#ec4899",
  Unisex: "#9b0aa0",
};

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#7C3AED",
  TikTok: "#1f2937",
};

// ─── Helpers ──────────────────────────────────────────────────

function totalStock(row) {
  return (row.shopee_stock || 0) + (row.lazada_stock || 0) + (row.tiktok_stock || 0);
}

function formatLogTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString();
}

// ─── Skeleton

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

// ─── Custom tooltips
function UnitsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {(p.value ?? 0).toLocaleString()} units
        </p>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

function Inventory_db() {
  const [rawInventory, setRawInventory] = useState([]);
  const [soldByPlatform, setSoldByPlatform] = useState({ shopee: 0, lazada: 0, tiktok: 0 });
  const [totals, setTotals] = useState(null);
  const [cats, setCats] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [activity, setActivity] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [slowMovers, setSlowMovers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Drill-down state: which slice/bar was clicked
  const [breakdown, setBreakdown] = useState(null); // { type: 'category'|'platform', label, products }

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");

    // ── 1. Fetch inventory + sales (sales feeds the "sold" side of the platform chart) ──
    const [invRes, salesRes] = await Promise.all([
      supabase
        .from("inventory")
        .select(
          "id, stock, shopee_stock, lazada_stock, tiktok_stock, " +
          "category, product_name, product_code, reorder_point, updated_at"
        ),
      supabase.from("sales").select("platform, quantity"),
    ]);

    const { data: inv, error: invError } = invRes;

    if (invError) {
      setErrorMsg(invError.message || "Couldn't load inventory data.");
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    if (salesRes.error) {
      // Sold-by-platform is supplementary; don't block the page on it.
      console.error("Error fetching sales for platform chart:", salesRes.error);
      setSoldByPlatform({ shopee: 0, lazada: 0, tiktok: 0 });
    } else {
      const soldTotals = { shopee: 0, lazada: 0, tiktok: 0 };
      (salesRes.data || []).forEach((r) => {
        const key = r.platform === "TikTok" ? "tiktok" : r.platform?.toLowerCase();
        if (key && soldTotals[key] !== undefined) {
          soldTotals[key] += Number(r.quantity) || 0;
        }
      });
      setSoldByPlatform(soldTotals);
    }

    if (inv && inv.length > 0) {
      setRawInventory(inv);

      // Platform totals
      const totalsData = inv.reduce(
        (acc, r) => ({
          shopee: acc.shopee + (r.shopee_stock || 0),
          lazada: acc.lazada + (r.lazada_stock || 0),
          tiktok: acc.tiktok + (r.tiktok_stock || 0),
        }),
        { shopee: 0, lazada: 0, tiktok: 0 }
      );
      totalsData.total = totalsData.shopee + totalsData.lazada + totalsData.tiktok;
      setTotals(totalsData);

      // Stock by category
      const catMap = {};
      inv.forEach((r) => {
        const c = r.category || "Uncategorized";
        catMap[c] = (catMap[c] || 0) + totalStock(r);
      });
      setCats(
        Object.entries(catMap).map(([name, qty]) => ({
          name,
          qty,
          color: CAT_COLORS[name] ?? "#6b7280",
        }))
      );

      // Out of stock count
      setOutOfStockCount(inv.filter((r) => totalStock(r) === 0).length);

      // Low stock alerts: stock <= reorder_point
      const low = inv
        .filter((r) => totalStock(r) <= (r.reorder_point ?? 10))
        .sort((a, b) => totalStock(a) - totalStock(b))
        .slice(0, 8)
        .map((r) => ({
          name: r.product_name || "Unknown",
          code: r.product_code || "N/A",
          qty: totalStock(r),
          reorder: r.reorder_point ?? 10,
        }));
      setLowStock(low);

      // Top movers - products with highest total stock
      const topPlatform = (r) => {
        const s = r.shopee_stock || 0;
        const l = r.lazada_stock || 0;
        const t = r.tiktok_stock || 0;
        if (s >= l && s >= t) return "Shopee";
        if (l >= s && l >= t) return "Lazada";
        return "TikTok";
      };

      const top = [...inv]
        .filter((r) => totalStock(r) > 0)
        .sort((a, b) => totalStock(b) - totalStock(a))
        .slice(0, 6)
        .map((r) => ({
          name: r.product_name || "Unknown",
          platform: topPlatform(r),
          qty: totalStock(r),
        }));
      setTopMovers(top);

      // Slow movers - low stock, not updated recently
      const now = Date.now();
      const slow = [...inv]
        .filter((r) => {
          const t = totalStock(r);
          return t < 5 && t > 0;
        })
        .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
        .slice(0, 5)
        .map((r) => ({
          name: r.product_name || "Unknown",
          days: Math.floor((now - new Date(r.updated_at).getTime()) / 86_400_000),
        }))
        .filter((r) => r.days > 0);
      setSlowMovers(slow);

      setLastUpdated(new Date());
    } else {
      // No rows — reset to empty state instead of leaving stale data
      setRawInventory([]);
      setTotals({ shopee: 0, lazada: 0, tiktok: 0, total: 0 });
      setCats([]);
      setOutOfStockCount(0);
      setLowStock([]);
      setTopMovers([]);
      setSlowMovers([]);
    }

    // ── 2. Recent activity (inventory_logs) ───────────────
    const { data: logs, error: logsError } = await supabase
      .from("inventory_logs")
      .select("detail, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (logsError) {
      console.error("Error fetching logs:", logsError);
    } else if (logs) {
      setActivity(
        logs.map((l) => ({
          text: l.detail || "Activity recorded",
          time: formatLogTime(l.created_at),
        }))
      );
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll(true);

    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory_logs" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => fetchAll(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // ── Derived chart data ─────────────────────────────────────

  const platformData = useMemo(() => {
    if (!totals) return [];
    return [
      { platform: "Shopee", qty: totals.shopee, sold: soldByPlatform.shopee, color: PLATFORM_COLORS.Shopee },
      { platform: "Lazada", qty: totals.lazada, sold: soldByPlatform.lazada, color: PLATFORM_COLORS.Lazada },
      { platform: "TikTok", qty: totals.tiktok, sold: soldByPlatform.tiktok, color: PLATFORM_COLORS.TikTok },
    ];
  }, [totals, soldByPlatform]);

  // ── Drill-down handlers ────────────────────────────────────

  function handleCategoryClick(entry) {
    const category = entry?.name;
    if (!category) return;
    const products = rawInventory
      .filter((r) => (r.category || "Uncategorized") === category)
      .map((r) => ({
        name: r.product_name || "Unknown",
        code: r.product_code || "N/A",
        qty: totalStock(r),
        shopee: r.shopee_stock || 0,
        lazada: r.lazada_stock || 0,
        tiktok: r.tiktok_stock || 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    setBreakdown({
      type: "category",
      label: category,
      color: CAT_COLORS[category] ?? "#6b7280",
      products,
    });
  }

  function handlePlatformClick(entry) {
    const platform = entry?.platform;
    if (!platform) return;
    const key = `${platform.toLowerCase()}_stock`;
    const products = rawInventory
      .filter((r) => (r[key] || 0) > 0)
      .map((r) => ({
        name: r.product_name || "Unknown",
        code: r.product_code || "N/A",
        qty: r[key] || 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    const sold = soldByPlatform[platform.toLowerCase()] ?? 0;

    setBreakdown({
      type: "platform",
      label: platform,
      products,
      color: PLATFORM_COLORS[platform],
      sold,
    });
  }

  function handleTopMoverClick(entry) {
    const name = entry?.name;
    if (!name) return;
    const row = rawInventory.find((r) => (r.product_name || "Unknown") === name);
    if (!row) return;

    setBreakdown({
      type: "product",
      label: name,
      color: CAT_COLORS[row.category] ?? "#6b7280",
      products: [
        {
          name,
          code: row.product_code || "N/A",
          qty: totalStock(row),
          shopee: row.shopee_stock || 0,
          lazada: row.lazada_stock || 0,
          tiktok: row.tiktok_stock || 0,
        },
      ],
    });
  }

  const fmt = (n) => (n ?? 0).toLocaleString();
  const loading = initialLoading;

  if (errorMsg && !totals) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 border border-red-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Dashboard</h1>
          <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
          <button
            onClick={() => fetchAll(true)}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            ↻ Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Inventory overview · Live stock summary
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                · {lastUpdated.toLocaleTimeString()}
                {refreshing && " · syncing…"}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchAll(false)}
          disabled={loading || refreshing}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading || refreshing ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && totals && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          Last refresh failed: {errorMsg}
        </div>
      )}

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-gray-800">{fmt(totals?.total)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Units on hand</p>
        </div>

        {["Shopee", "Lazada", "TikTok"].map((platform) => {
          const key = platform.toLowerCase();
          const color = PLATFORM_COLORS[platform];
          return (
            <div key={platform} className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {platform}
              </p>
              {loading ? <Skeleton /> : (
                <p className="text-3xl font-bold mt-1" style={{ color }}>
                  {fmt(totals?.[key])}
                </p>
              )}
              <p className="text-xs mt-1 text-gray-400">Total units in stock</p>
            </div>
          );
        })}

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Out of stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-red-700">{fmt(outOfStockCount)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Products at zero</p>
        </div>
      </div>

      {/* Stock by platform (primary) + Stock by category (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-700">Stock by platform</h2>
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : platformData.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={platformData}
                    dataKey="qty"
                    nameKey="platform"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ percent }) =>
                      `${(percent * 100).toFixed(0)}%`
                    }
                    onClick={handlePlatformClick}
                    cursor="pointer"
                  >
                    {platformData.map((p) => (
                      <Cell key={p.platform} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<UnitsTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div>
                <ul className="space-y-3">
                  {platformData.map((p) => (
                    <li key={p.platform} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          {p.platform}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-700">
                          {p.qty} in stock{' '}
                          <span className="text-gray-400 font-normal">
                            ({totals?.total > 0 ? ((p.qty / totals.total) * 100).toFixed(1) : 0}%)
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">{p.sold} sold</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                  <span className="text-sm font-semibold text-gray-500">Total Stock</span>
                  <span className="text-sm font-bold text-red-600">{fmt(totals?.total)} units</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-700">Stock by category</h2>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : cats.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={cats}
                    dataKey="qty"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                    onClick={handleCategoryClick}
                    cursor="pointer"
                  >
                    {cats.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<UnitsTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 mt-2">
                {cats.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-semibold text-gray-700">{c.qty.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Top stocked items (primary) + Low stock alerts (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">Top stocked items</h2>
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : topMovers.length === 0 ? (
            <p className="text-xs text-gray-400">No stock data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, topMovers.length * 44)}>
              <BarChart
                data={topMovers}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                barCategoryGap={12}
              >
                <defs>
                  {topMovers.map((m) => {
                    const c = PLATFORM_COLORS[m.platform] ?? "#b91c1c";
                    return (
                      <linearGradient key={m.name} id={`bar-${m.name.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={c} stopOpacity={1} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#374151" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<UnitsTooltip />} />
                <Bar
                  dataKey="qty"
                  name="Stock"
                  radius={[0, 6, 6, 0]}
                  barSize={22}
                  onClick={handleTopMoverClick}
                  cursor="pointer"
                >
                  {topMovers.map((m) => (
                    <Cell
                      key={m.name}
                      fill={`url(#bar-${m.name.replace(/[^a-zA-Z0-9]/g, "")})`}
                    />
                  ))}
                  <LabelList
                    dataKey="qty"
                    position="right"
                    style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Low stock alerts
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                {lowStock.length}
              </span>
            )}
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : lowStock.length === 0 ? (
            <p className="text-xs text-gray-400">All items are sufficiently stocked.</p>
          ) : (
            <div className="space-y-3">
              {lowStock.map((p) => {
                const isOut = p.qty === 0;
                const pct = isOut ? 0 : Math.round((p.qty / p.reorder) * 100);
                return (
                  <div key={p.code}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{p.name}</p>
                        <p className="text-xs font-mono text-gray-400">{p.code}</p>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded font-medium shrink-0 ${
                          isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isOut ? "Out" : `${p.qty} left`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: isOut ? "#b91c1c" : "#f59e0b" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity + Items needing attention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-xs text-gray-400">No recent activity.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-red-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-700 leading-snug">{a.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Items needing attention</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : slowMovers.length === 0 ? (
            <p className="text-xs text-gray-400">All items are recently updated.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {slowMovers.map((m) => (
                <div key={m.name} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-xs font-medium text-gray-700">{m.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Low stock for {m.days} day{m.days !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                    {m.days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drill-down modal */}
      {breakdown && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setBreakdown(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: breakdown.color }}
                />
                <h2 className="text-lg font-bold text-gray-800">
                  {breakdown.label}
                </h2>
                <span className="text-xs text-gray-400">
                  ({breakdown.products.length} product{breakdown.products.length !== 1 ? "s" : ""})
                  {breakdown.type === "platform" && `, ${breakdown.sold} sold total`}
                </span>
              </div>
              <button
                onClick={() => setBreakdown(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-6 pt-4">
              {breakdown.products.length === 0 ? (
                <p className="text-xs text-gray-400">No products found.</p>
              ) : (
                <div className="space-y-3">
                  {breakdown.products.map((p) => (
                    <div key={p.code ?? p.name} className="border-b border-gray-50 pb-2 last:border-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{p.name}</p>
                          {p.code && <p className="text-xs font-mono text-gray-400">{p.code}</p>}
                        </div>
                        <span className="text-xs font-bold text-red-600 shrink-0">
                          {p.qty} units
                        </span>
                      </div>
                      {(breakdown.type === "category" || breakdown.type === "product") && (
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.Shopee }}>
                            Shopee: {p.shopee}
                          </span>
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.Lazada }}>
                            Lazada: {p.lazada}
                          </span>
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.TikTok }}>
                            TikTok: {p.tiktok}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory_db;