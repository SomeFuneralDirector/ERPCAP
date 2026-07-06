import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);

// ─── Platform colours ────────────────────────────────────────

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#7C3AED",
  TikTok: "#1f2937",
};

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

// ─── Custom tooltip ──────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: ₱{(p.value ?? 0).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Date bucket helpers ─────────────────────────────────────

function getStartOfWeek(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketSales(rows, mode) {
  const buckets = {};

  rows.forEach((r) => {
    const d = new Date(r.created_at);
    let key, label, sortKey;

    if (mode === "weekly") {
      const start = getStartOfWeek(d);
      key = start.toISOString();
      label = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      sortKey = start.getTime();
    } else if (mode === "monthly") {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    } else {
      key = `${d.getFullYear()}`;
      label = `${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), 0, 1).getTime();
    }

    if (!buckets[key]) buckets[key] = { label, sortKey, value: 0 };
    buckets[key].value += r.amount || 0;
  });

  return Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey);
}

// ─── Main component ──────────────────────────────────────────

function Sales_db() {
  const [rawSales, setRawSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState("weekly"); // 'weekly' | 'monthly' | 'yearly'

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // NOTE: adjust table/column names below to match your actual
    // Supabase schema if different.
    const { data, error } = await supabase
      .from("sales")
      .select("id, product_name, platform, quantity, amount, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching sales:", error);
      setLoading(false);
      return;
    }

    setRawSales(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("sales-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        fetchAll
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // ── Derived data ───────────────────────────────────────────

  const totalSales = useMemo(
    () => rawSales.reduce((sum, r) => sum + (r.amount || 0), 0),
    [rawSales]
  );

  const platformTotals = useMemo(() => {
    const map = {};
    rawSales.forEach((r) => {
      const p = r.platform || "Unknown";
      map[p] = (map[p] || 0) + (r.amount || 0);
    });
    return Object.entries(map)
      .map(([platform, amount]) => ({
        platform,
        amount,
        color: PLATFORM_COLORS[platform] ?? "#6b7280",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [rawSales]);

  const topProducts = useMemo(() => {
    const map = {};
    rawSales.forEach((r) => {
      const name = r.product_name || "Unknown";
      if (!map[name]) map[name] = { name, qty: 0, amount: 0 };
      map[name].qty += r.quantity || 0;
      map[name].amount += r.amount || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [rawSales]);

  const trendPoints = useMemo(() => bucketSales(rawSales, trendMode), [rawSales, trendMode]);

  const fmtCurrency = (n) => `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Dashboard</h1>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Total sales + per-platform cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total Sales
          </p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-gray-800">
              {fmtCurrency(totalSales)}
            </p>
          )}
        </div>

        {["Shopee", "Lazada", "TikTok"].map((platform) => {
          const entry = platformTotals.find((p) => p.platform === platform);
          const color = PLATFORM_COLORS[platform];
          return (
            <div key={platform} className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: color }}
                />
                {platform}
              </p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className="text-3xl font-bold mt-1" style={{ color }}>
                  {fmtCurrency(entry?.amount)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Sales trend chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700">Sales trend</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {["weekly", "monthly", "yearly"].map((mode) => (
              <button
                key={mode}
                onClick={() => setTrendMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  trendMode === mode
                    ? "bg-red-700 text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : trendPoints.length === 0 ? (
          <p className="text-xs text-gray-400">No sales data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                name="Sales"
                stroke="#b91c1c"
                strokeWidth={2}
                fill="url(#salesFill)"
                dot={{ r: 3, fill: "#b91c1c", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Sales per platform + Platform share */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sales per platform (bar chart) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Sales per platform</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : platformTotals.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={platformTotals} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="amount" name="Sales" radius={[6, 6, 0, 0]}>
                  {platformTotals.map((p) => (
                    <Cell key={p.platform} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Platform share (pie chart) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Platform share</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : platformTotals.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={platformTotals}
                  dataKey="amount"
                  nameKey="platform"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {platformTotals.map((p) => (
                    <Cell key={p.platform} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip content={<CurrencyTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top products sold (horizontal bar chart) */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Top products sold</h2>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : topProducts.length === 0 ? (
          <p className="text-xs text-gray-400">No sales data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, topProducts.length * 40)}>
            <BarChart
              data={topProducts}
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
              <Tooltip
                formatter={(value, name) =>
                  name === "qty" ? [`${value} sold`, "Quantity"] : [`₱${value.toLocaleString()}`, "Revenue"]
                }
              />
              <Bar dataKey="qty" name="qty" fill="#b91c1c" radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default Sales_db;