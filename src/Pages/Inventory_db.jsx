import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);

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

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

// ─── Custom tooltips ───────────────────────────────────────────

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
  const [totals, setTotals] = useState(null);
  const [cats, setCats] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [activity, setActivity] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [slowMovers, setSlowMovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // ── 1. Fetch inventory ──────────────────────────────────
    const { data: inv, error: invError } = await supabase
      .from("inventory")
      .select(
        "id, stock, shopee_stock, lazada_stock, tiktok_stock, " +
        "category, product_name, product_code, reorder_point, updated_at"
      );

    if (invError) {
      console.error("Error fetching inventory:", invError);
      setLoading(false);
      return;
    }

    if (inv && inv.length > 0) {
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
        const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
        catMap[c] = (catMap[c] || 0) + totalStock;
      });
      setCats(
        Object.entries(catMap).map(([name, qty]) => ({
          name,
          qty,
          color: CAT_COLORS[name] ?? "#6b7280",
        }))
      );

      // Low stock alerts: stock <= reorder_point
      const low = inv
        .filter((r) => {
          const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return totalStock <= (r.reorder_point ?? 10);
        })
        .sort((a, b) => {
          const aTotal = (a.shopee_stock || 0) + (a.lazada_stock || 0) + (a.tiktok_stock || 0);
          const bTotal = (b.shopee_stock || 0) + (b.lazada_stock || 0) + (b.tiktok_stock || 0);
          return aTotal - bTotal;
        })
        .slice(0, 8)
        .map((r) => {
          const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return {
            name: r.product_name || "Unknown",
            code: r.product_code || "N/A",
            qty: totalStock,
            reorder: r.reorder_point ?? 10,
          };
        });
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
        .filter((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return total > 0;
        })
        .sort((a, b) => {
          const aTotal = (a.shopee_stock || 0) + (a.lazada_stock || 0) + (a.tiktok_stock || 0);
          const bTotal = (b.shopee_stock || 0) + (b.lazada_stock || 0) + (b.tiktok_stock || 0);
          return bTotal - aTotal;
        })
        .slice(0, 6)
        .map((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return {
            name: r.product_name || "Unknown",
            platform: topPlatform(r),
            qty: total,
          };
        });
      setTopMovers(top);

      // Slow movers - low stock, not updated recently
      const now = Date.now();
      const slow = [...inv]
        .filter((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return total < 5 && total > 0;
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

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        fetchAll
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory_logs" },
        fetchAll
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // ── Derived chart data ─────────────────────────────────────

  const platformData = useMemo(() => {
    if (!totals) return [];
    return [
      { platform: "Shopee", qty: totals.shopee, color: PLATFORM_COLORS.Shopee },
      { platform: "Lazada", qty: totals.lazada, color: PLATFORM_COLORS.Lazada },
      { platform: "TikTok", qty: totals.tiktok, color: PLATFORM_COLORS.TikTok },
    ];
  }, [totals]);

  const fmt = (n) => (n ?? 0).toLocaleString();

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
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      </div>

      {/* Stock by category (pie) + Stock by platform (bar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Stock by category</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : cats.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={cats}
                  dataKey="qty"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {cats.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip content={<UnitsTooltip />} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Stock by platform</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : platformData.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={platformData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip content={<UnitsTooltip />} />
                <Bar dataKey="qty" name="Stock" radius={[6, 6, 0, 0]}>
                  {platformData.map((p) => (
                    <Cell key={p.platform} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Low stock + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Low stock alerts
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                {lowStock.length} items
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
      </div>

      {/* Top movers (chart) + Slow movers (list) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Top stocked items</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : topMovers.length === 0 ? (
            <p className="text-xs text-gray-400">No stock data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topMovers.length * 36)}>
              <BarChart
                data={topMovers}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
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
                <Bar dataKey="qty" name="Stock" radius={[0, 6, 6, 0]} barSize={16}>
                  {topMovers.map((m) => (
                    <Cell key={m.name} fill={PLATFORM_COLORS[m.platform] ?? "#b91c1c"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
    </div>
  );
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

export default Inventory_db;