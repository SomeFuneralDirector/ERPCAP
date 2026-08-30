import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import { supabase } from "../api/supabase";

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#7C3AED",
  TikTok: "#1f2937",
};

const fmtPHP = (n) =>
  `₱${(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;

const centsToPesos = (c) => (c || 0) / 100;
const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = p.toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return p;
};
const orderDate = (o) => o.completed_at || o.created_at || o.paid_time;

function getStartOfWeek(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}

function timeAgo(date) {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bucketSales(orders, mode) {
  const buckets = {};

  orders.forEach((o) => {
    const raw = orderDate(o);
    if (!raw) return;
    const d = new Date(raw);
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

    if (!buckets[key]) buckets[key] = { label, sortKey, value: 0, orders: 0 };
    buckets[key].value += centsToPesos(o.total_amount);
    buckets[key].orders += 1;
  });

  return Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey);
}

function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = null;
    let raf;
    const from = value;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setValue(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function CurrencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {fmtPHP(p.value)}
        </p>
      ))}
    </div>
  );
}

function ChangeBadge({ current, previous }) {
  if (previous === null || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
        isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function EmptyState({ onImport }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">📭</div>
      <p className="font-medium text-gray-600">No sales yet</p>
      <p className="text-sm text-gray-400 mt-1 mb-4">Import your first CSV to see data here</p>
      {onImport && (
        <button
          onClick={onImport}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 cursor-pointer"
        >
          Go to Import
        </button>
      )}
    </div>
  );
}

function Sales_db({ onGoToImport }) {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [itemsWarning, setItemsWarning] = useState("");
  const [trendMode, setTrendMode] = useState("weekly");
  const [productSort, setProductSort] = useState("qty");
  const [lastSynced, setLastSynced] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [lastImportLog, setLastImportLog] = useState(null);

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");
    setItemsWarning("");

    const { data: completedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_id, platform, total_amount, completed_at, created_at, paid_time, status")
      .eq("status", "COMPLETED");

    if (ordersError) {
      setErrorMsg(ordersError.message || "Couldn't load orders.");
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    setOrders(completedOrders || []);

    const orderUuids = (completedOrders || []).map((o) => o.id).filter(Boolean);

    if (orderUuids.length === 0) {
      setOrderItems([]);
    } else {
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("order_uuid, order_id, platform, product_name, sku, quantity, unit_price")
        .in("order_uuid", orderUuids);

      if (itemsError) {
        console.error("Error fetching order items:", itemsError);
        setOrderItems([]);
        setItemsWarning(
          `Order items failed to load: ${itemsError.message}. Item/product totals shown may be incomplete.`
        );
      } else {
        setOrderItems(items || []);
      }
    }

    setLastSynced(new Date());
    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  const fetchLastImportLog = useCallback(async () => {
    const { data } = await supabase
      .from("import_logs")
      .select("platform, filename, inserted, skipped, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) setLastImportLog(data);
  }, []);

  useEffect(() => {
    fetchAll(true);
    fetchLastImportLog();

    const channel = supabase
      .channel("sales-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchAll(false);
          fetchLastImportLog();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => fetchAll(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll, fetchLastImportLog]);

  const clearDateRange = () => {
    setDateFrom("");
    setDateTo("");
  };

  const filteredOrders = useMemo(() => {
    let result = orders;

    if (platformFilter !== "all") {
      result = result.filter((o) => normalizePlatform(o.platform) === platformFilter);
    }

    if (!dateFrom && !dateTo) return result;
    const fromTime = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
    const toTime = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
    return result.filter((o) => {
      const raw = orderDate(o);
      if (!raw) return false;
      const t = new Date(raw).getTime();
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t > toTime) return false;
      return true;
    });
  }, [orders, platformFilter, dateFrom, dateTo]);

  const filteredOrderUuids = useMemo(
    () => new Set(filteredOrders.map((o) => o.id)),
    [filteredOrders]
  );

  const filteredOrderItems = useMemo(
    () => orderItems.filter((i) => filteredOrderUuids.has(i.order_uuid)),
    [orderItems, filteredOrderUuids]
  );

  const totalSales = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + centsToPesos(o.total_amount), 0),
    [filteredOrders]
  );

  const totalItemsSold = useMemo(
    () => filteredOrderItems.reduce((sum, i) => sum + (i.quantity || 0), 0),
    [filteredOrderItems]
  );

  const avgOrderValue = filteredOrders.length > 0 ? totalSales / filteredOrders.length : 0;

  const platformTotals = useMemo(() => {
    const map = {};
    filteredOrders.forEach((o) => {
      const p = normalizePlatform(o.platform);
      map[p] = (map[p] || 0) + centsToPesos(o.total_amount);
    });
    return Object.entries(map)
      .map(([platform, amount]) => ({
        platform,
        amount,
        color: PLATFORM_COLORS[platform] ?? "#6b7280",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredOrders]);

  const topProducts = useMemo(() => {
    const map = {};
    filteredOrderItems.forEach((item) => {
      const name = item.product_name || "Unknown";
      if (!map[name]) map[name] = { name, qty: 0, amount: 0 };
      map[name].qty += item.quantity || 0;
      map[name].amount += (item.quantity || 0) * centsToPesos(item.unit_price);
    });
    return Object.values(map)
      .sort((a, b) => b[productSort] - a[productSort])
      .slice(0, 6);
  }, [filteredOrderItems, productSort]);

  const trendPoints = useMemo(() => bucketSales(filteredOrders, trendMode), [filteredOrders, trendMode]);

  const trendChange = useMemo(() => {
    if (trendPoints.length < 2) return null;
    const current = trendPoints[trendPoints.length - 1].value;
    const previous = trendPoints[trendPoints.length - 2].value;
    return { current, previous };
  }, [trendPoints]);

  const periodComparison = useMemo(() => {
    if (trendPoints.length < 2) return { totalPrev: null, avgPrev: null };
    const mid = Math.ceil(trendPoints.length / 2);
    const prevBuckets = trendPoints.slice(0, mid);
    const currBuckets = trendPoints.slice(mid);
    const prevTotal = prevBuckets.reduce((s, b) => s + b.value, 0);
    const prevOrders = prevBuckets.reduce((s, b) => s + b.orders, 0);
    const currTotal = currBuckets.reduce((s, b) => s + b.value, 0);
    const currOrders = currBuckets.reduce((s, b) => s + b.orders, 0);
    return {
      totalPrev: prevTotal,
      totalCurr: currTotal,
      avgPrev: prevOrders > 0 ? prevTotal / prevOrders : null,
      avgCurr: currOrders > 0 ? currTotal / currOrders : null,
    };
  }, [trendPoints]);

  const loading = initialLoading;

  const animatedTotalSales = useCountUp(totalSales);
  const animatedAvgOrder = useCountUp(avgOrderValue);
  const animatedItemsSold = useCountUp(totalItemsSold);

  if (errorMsg && orders.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 border border-red-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Sales Dashboard</h1>
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
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Sales Dashboard</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {["all", "Shopee", "Lazada", "TikTok"].map((p) => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  platformFilter === p ? "bg-red-700 text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {p === "all" ? "All" : p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm cursor-pointer"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm cursor-pointer"
            />
            {(dateFrom || dateTo) && (
              <button onClick={clearDateRange} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => fetchAll(false)}
            disabled={loading || refreshing}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading || refreshing ? "↻ Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {errorMsg && orders.length > 0 && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          Last refresh failed: {errorMsg}
        </div>
      )}
      {itemsWarning && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          {itemsWarning}
        </div>
      )}
      {lastImportLog && (
        <div
          className={`rounded-lg shadow p-3 text-xs flex items-center justify-between ${
            lastImportLog.status === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          <span>
            Last import ({normalizePlatform(lastImportLog.platform)}): {lastImportLog.inserted} inserted,{" "}
            {lastImportLog.skipped} skipped — {lastImportLog.filename}
          </span>
          <span className="text-gray-400">{timeAgo(new Date(lastImportLog.created_at))}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Sales</p>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-3xl font-bold text-gray-800">{fmtPHP(animatedTotalSales)}</p>
              {periodComparison.totalPrev != null && (
                <ChangeBadge current={periodComparison.totalCurr} previous={periodComparison.totalPrev} />
              )}
            </div>
          )}
          <p className="text-xs mt-1 text-gray-400">{filteredOrders.length} completed orders</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg Order Value</p>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-3xl font-bold text-gray-800">{fmtPHP(animatedAvgOrder)}</p>
              {periodComparison.avgPrev != null && (
                <ChangeBadge current={periodComparison.avgCurr} previous={periodComparison.avgPrev} />
              )}
            </div>
          )}
          <p className="text-xs mt-1 text-gray-400">per completed order</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Items Sold</p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-gray-800">{Math.round(animatedItemsSold).toLocaleString()}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">units across all orders</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Latest Period</p>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-3xl font-bold text-gray-800">
                {trendChange ? fmtPHP(trendChange.current) : "—"}
              </p>
              {trendChange && <ChangeBadge current={trendChange.current} previous={trendChange.previous} />}
            </div>
          )}
          <p className="text-xs mt-1 text-gray-400">vs previous {trendMode.slice(0, -2) || trendMode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["Shopee", "Lazada", "TikTok"].map((platform) => {
          const entry = platformTotals.find((p) => p.platform === platform);
          const color = PLATFORM_COLORS[platform];
          const share = totalSales > 0 ? ((entry?.amount || 0) / totalSales) * 100 : 0;
          return (
            <div key={platform} className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {platform}
              </p>
              {loading ? <Skeleton /> : (
                <p className="text-3xl font-bold mt-1" style={{ color }}>
                  {fmtPHP(entry?.amount)}
                </p>
              )}
              <p className="text-xs mt-1 text-gray-400">{share.toFixed(0)}% of total sales</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700">Sales trend</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {["weekly", "monthly", "yearly"].map((mode) => (
              <button
                key={mode}
                onClick={() => setTrendMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  trendMode === mode ? "bg-red-700 text-white" : "text-gray-500 hover:text-gray-700"
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
          <EmptyState onImport={onGoToImport} />
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
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                      <p style={{ color: "#b91c1c" }}>
                        {trendMode.charAt(0).toUpperCase() + trendMode.slice(1)} sales: {fmtPHP(point.value)}
                      </p>
                      <p className="text-gray-500">{point.orders} order{point.orders !== 1 ? "s" : ""}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={`${trendMode.charAt(0).toUpperCase() + trendMode.slice(1)} Sales`}
                stroke="#b91c1c"
                strokeWidth={2}
                fill="url(#salesFill)"
                dot={{ r: 3, fill: "#b91c1c", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Legend verticalAlign="top" height={28} iconType="line" wrapperStyle={{ fontSize: 12 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Sales per platform</h2>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : platformTotals.length === 0 ? (
          <EmptyState onImport={onGoToImport} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={platformTotals} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
              <Tooltip content={<CurrencyTooltip />} />
              <Bar dataKey="amount" name="Sales" radius={[6, 6, 0, 0]}>
                {platformTotals.map((p) => (
                  <Cell key={p.platform} fill={p.color} />
                ))}
                <LabelList dataKey="amount" position="top" formatter={fmtAxis} style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700">Top products sold</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "qty", label: "Units" },
              { key: "amount", label: "Revenue" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setProductSort(opt.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  productSort === opt.key ? "bg-red-700 text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : topProducts.length === 0 ? (
          <EmptyState onImport={onGoToImport} />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, topProducts.length * 40)}>
            <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value, name) =>
                  name === "amount" ? [fmtPHP(value), "Revenue"] : [`${value} sold`, "Quantity"]
                }
              />
              <Bar dataKey={productSort} name={productSort} radius={[0, 6, 6, 0]} barSize={18}>
                {topProducts.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#b91c1c" : "#f3a6a0"} />
                ))}
                <LabelList
                  dataKey={productSort}
                  position="right"
                  formatter={(v) => (productSort === "amount" ? fmtAxis(v) : v)}
                  style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default Sales_db;