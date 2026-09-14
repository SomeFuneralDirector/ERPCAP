import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { supabase } from "../api/supabase";

/* ── Design tokens — shared with Inventory / Sales dashboards ─────────── */
const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  textMuted: "#6B6B70",
  border: "#E4E4E7",
  success: "#15803D",
  successSoft: "#EEF6EF",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
};

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#0F146D",
  TikTok: "#101113",
};

const LOW_PERFORMER_THRESHOLD = 5;
const CAMPAIGN_ENDING_SOON_DAYS = 7;
const TOP_N_IN_TOOLTIP = 3;

const TREND_LINE_COLOR = C.accent;
const TREND_PEAK_COLOR = "#dc2626";
const TREND_GRID_COLOR = "#f3f4f6";

const SEGMENT_WRAP = "flex gap-0.5 bg-gray-100 rounded-md p-0.5";
const SEGMENT_BTN = (active) =>
  `px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`;

// ─── Helpers ──────────────────────────────────────────────────

const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = p.toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return p;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const centsToPesos = (c) => Math.max(0, toNumber(c)) / 100;

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Local midnight / end-of-day boundaries for date-string filters (YYYY-MM-DD). */
const localDateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  return date.getTime();
};

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtCurrency = (n) =>
  `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const orderDate = (o) => o.completed_at || o.created_at || o.paid_time;

const monthKey = (date) => {
  const d = safeDate(date);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  if (!key) return "";
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

function deriveCampaignStatus(c) {
  if (c.status === "Cancelled") return "Cancelled";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = safeDate(c.start_date);
  const end = safeDate(c.end_date);
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);
  if (end && today > end) return "Ended";
  if (start && today < start) return "Upcoming";
  return "Active";
}

// ─── Primitives ─────────────────────────────────────────────

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${className}`}
      style={{ backgroundColor: C.accent }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.accentHover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.accent)}
    >
      {children}
    </button>
  );
}

function TrendDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const isPeak = payload.isPeak;

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={isPeak ? 6 : 4}
        fill={isPeak ? TREND_PEAK_COLOR : TREND_LINE_COLOR}
      />
      {isPeak && (
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fill={TREND_PEAK_COLOR}
          fontSize={13}
          fontWeight={600}
        >
          {fmt(payload.total)}
        </text>
      )}
    </g>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const topSellers = row.topSellers || [];
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs min-w-[190px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-gray-500 mb-2">{fmt(row.total)} units sold</p>
      {topSellers.length > 0 && (
        <div className="space-y-1">
          <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: "10px" }}>
            Top {topSellers.length} sellers
          </p>
          {topSellers.map((p, idx) => {
            const pct = row.total > 0 ? ((p.qty / row.total) * 100).toFixed(1) : "0.0";
            return (
              <div key={p.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-gray-700 truncate">
                  <span
                    className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full text-white text-[10px] font-bold"
                    style={{ backgroundColor: C.accent }}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-gray-500 shrink-0">
                  {fmt(p.qty)} · {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
      {row.activeCampaigns && row.activeCampaigns.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: "10px" }}>
            Campaigns this month
          </p>
          {row.activeCampaigns.map((c) => (
            <p key={c} className="truncate" style={{ color: C.accent }}>
              {c}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Marketing() {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Filters (same pattern as Sales dashboard)
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");

    const { data: completedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_id, platform, total_amount, completed_at, created_at, paid_time, status")
      .eq("status", "COMPLETED");

    if (ordersError) {
      setErrorMsg(ordersError.message);
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    const validOrders = (completedOrders || []).filter((o) => safeDate(orderDate(o)));
    setOrders(validOrders);
    const orderUuids = validOrders.map((o) => o.id).filter(Boolean);

    const ORDER_ITEMS_CHUNK_SIZE = 150;
    const orderUuidChunks = [];
    for (let i = 0; i < orderUuids.length; i += ORDER_ITEMS_CHUNK_SIZE) {
      orderUuidChunks.push(orderUuids.slice(i, i + ORDER_ITEMS_CHUNK_SIZE));
    }

    const [itemsChunkResults, campaignsRes] = await Promise.all([
      orderUuidChunks.length > 0
        ? Promise.all(
            orderUuidChunks.map((chunk) =>
              supabase
                .from("order_items")
                .select("order_uuid, order_id, platform, product_name, quantity, unit_price")
                .in("order_uuid", chunk)
            )
          )
        : Promise.resolve([]),
      supabase
        .from("campaigns")
        .select("id, name, platform, discount_type, discount_value, start_date, end_date, status"),
    ]);

    const firstItemsError = itemsChunkResults.find((r) => r.error)?.error || null;
    const itemsRes = {
      data: firstItemsError ? [] : itemsChunkResults.flatMap((r) => r.data || []),
      error: firstItemsError,
    };

    if (itemsRes.error) {
      console.error("Error fetching order items:", itemsRes.error);
      setOrderItems([]);
    } else {
      setOrderItems((itemsRes.data || []).filter((item) => toNumber(item.quantity) > 0));
    }

    if (campaignsRes.error) {
      console.error("Error fetching campaigns:", campaignsRes.error);
      setCampaigns([]);
    } else {
      setCampaigns((campaignsRes.data || []).filter((campaign) => campaign?.name));
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll(true);

    const channel = supabase
      .channel("marketing-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => fetchAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => fetchAll(false))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // ── Filtered data (platform + date range) ─────────────────

  const filteredOrders = useMemo(() => {
    let result = orders;

    if (platformFilter !== "all") {
      result = result.filter((o) => normalizePlatform(o.platform) === platformFilter);
    }

    if (!dateFrom && !dateTo) return result;

    const fromTime = localDateBoundary(dateFrom);
    const toTime = localDateBoundary(dateTo, true);

    return result.filter((o) => {
      const raw = orderDate(o);
      if (!raw) return false;
      const t = safeDate(raw)?.getTime();
      if (t == null) return false;
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

  // ── Derived metrics (all based on filtered data) ──────────

  const totalSales = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + centsToPesos(o.total_amount), 0),
    [filteredOrders]
  );

  const platformSales = useMemo(() => {
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

  const topPlatform = platformSales[0] || null;

  const products = useMemo(() => {
    const map = {};
    filteredOrderItems.forEach((row) => {
      const name = row.product_name || "Unnamed Product";
      if (!map[name]) map[name] = { name, qty: 0, sales: 0 };
      const qty = Math.max(0, toNumber(row.quantity));
      map[name].qty += qty;
      map[name].sales += qty * centsToPesos(row.unit_price);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filteredOrderItems]);

  const lowPerformers = useMemo(
    () => products.filter((p) => p.qty <= LOW_PERFORMER_THRESHOLD),
    [products]
  );

  const orderDateById = useMemo(() => {
    const map = {};
    filteredOrders.forEach((o) => {
      const d = orderDate(o);
      if (d) map[o.id] = d;
    });
    return map;
  }, [filteredOrders]);

  const monthlyProductTotals = useMemo(() => {
    const months = {};
    filteredOrderItems.forEach((row) => {
      const date = orderDateById[row.order_uuid];
      if (!date) return;
      const key = monthKey(date);
      if (!key) return;
      if (!months[key]) months[key] = {};
      const name = row.product_name || "Unnamed Product";
      const qty = Math.max(0, toNumber(row.quantity));
      months[key][name] = (months[key][name] || 0) + qty;
    });
    return months;
  }, [filteredOrderItems, orderDateById]);

  const availableMonths = useMemo(
    () => Object.keys(monthlyProductTotals).sort((a, b) => (a < b ? 1 : -1)),
    [monthlyProductTotals]
  );

  useEffect(() => {
    if (availableMonths.length === 0) return;
    if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const selectedMonthProducts = useMemo(() => {
    const key =
      selectedMonth && availableMonths.includes(selectedMonth)
        ? selectedMonth
        : availableMonths[0];
    if (!key || !monthlyProductTotals[key]) return [];
    return Object.entries(monthlyProductTotals[key])
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [selectedMonth, availableMonths, monthlyProductTotals]);

  const campaignsWithStatus = useMemo(
    () => campaigns.map((c) => ({ ...c, derivedStatus: deriveCampaignStatus(c) })),
    [campaigns]
  );

  const campaignsActiveInMonth = useCallback(
    (key) => {
      if (!key) return [];
      const [year, month] = key.split("-").map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      return campaigns
        .filter((c) => c.status !== "Cancelled")
        .filter((c) => {
          // Optional: also respect platform filter for campaign list in tooltip
          if (platformFilter !== "all" && normalizePlatform(c.platform) !== platformFilter) {
            return false;
          }
          const start = safeDate(c.start_date) || monthStart;
          const end = safeDate(c.end_date) || monthEnd;
          end.setHours(23, 59, 59, 999);
          return start <= monthEnd && end >= monthStart;
        })
        .map((c) => c.name);
    },
    [campaigns, platformFilter]
  );

  const monthlyTrend = useMemo(() => {
    const monthsAscending = [...availableMonths].reverse();
    const distinctYears = new Set(monthsAscending.map((k) => k.split("-")[0]));

    const rows = monthsAscending.map((key) => {
      const totals = monthlyProductTotals[key] || {};
      const sorted = Object.entries(totals)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);
      const total = sorted.reduce((sum, p) => sum + p.qty, 0);
      const topSellers = sorted.slice(0, TOP_N_IN_TOOLTIP);
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1, 1);
      const label = d.toLocaleDateString(undefined, {
        month: "short",
        ...(distinctYears.size > 1 ? { year: "2-digit" } : {}),
      });

      return {
        monthKey: key,
        month: label,
        total,
        topSellers,
        topSellerName: topSellers[0]?.name || "",
        activeCampaigns: campaignsActiveInMonth(key),
      };
    });

    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      const next = rows[i + 1];
      row.isPeak = (!prev || row.total > prev.total) && (!next || row.total > next.total);
    });

    return rows;
  }, [availableMonths, monthlyProductTotals, campaignsActiveInMonth]);

  const activeCampaigns = campaignsWithStatus.filter((c) => {
    if (!["Active", "Upcoming"].includes(c.derivedStatus)) return false;
    if (platformFilter !== "all" && normalizePlatform(c.platform) !== platformFilter) return false;
    return true;
  });

  const endingSoonCampaigns = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + CAMPAIGN_ENDING_SOON_DAYS);

    return campaignsWithStatus.filter((c) => {
      if (c.derivedStatus !== "Active" || !c.end_date) return false;
      if (platformFilter !== "all" && normalizePlatform(c.platform) !== platformFilter) return false;
      const end = safeDate(c.end_date);
      if (!end) return false;
      end.setHours(23, 59, 59, 999);
      return end >= now && end <= cutoff;
    });
  }, [campaignsWithStatus, platformFilter]);

  const loading = initialLoading;

  if (errorMsg && orders.length === 0 && !loading) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: "#F6F6F7" }}>
        <Card className="p-6 max-w-[1400px] mx-auto" style={{ borderColor: C.accentSoftBorder }}>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Marketing - Dashboard</h1>
          <p className="text-sm mb-4" style={{ color: C.accent }}>
            {errorMsg}
          </p>
          <PrimaryButton onClick={() => fetchAll(true)}>Retry</PrimaryButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header + filters */}
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Marketing - Dashboard</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {/* Platform filter */}
            <div className={SEGMENT_WRAP}>
              {["all", "Shopee", "Lazada", "TikTok"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={SEGMENT_BTN(platformFilter === p)}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            <PrimaryButton onClick={() => fetchAll(false)} disabled={loading || refreshing}>
              {loading || refreshing ? "Loading…" : "Refresh"}
            </PrimaryButton>
          </div>
        </Card>

        {errorMsg && orders.length > 0 && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.warningSoft,
              borderColor: C.warningBorder,
              color: C.warning,
            }}
          >
            Last refresh failed: {errorMsg}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-gray-500">Total Sales</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-2xl font-semibold mt-1 text-gray-900">{fmtCurrency(totalSales)}</p>
            )}
            <p className="text-xs mt-1 text-gray-400">{fmt(filteredOrders.length)} completed orders</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-gray-500">Top Platform</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p
                className="text-2xl font-semibold mt-1"
                style={{
                  color: topPlatform ? PLATFORM_COLORS[topPlatform.platform] : "#374151",
                }}
              >
                {topPlatform ? topPlatform.platform : "—"}
              </p>
            )}
            <p className="text-xs mt-1 text-gray-400">by sales</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-gray-500">Active Campaigns</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-2xl font-semibold mt-1" style={{ color: C.accent }}>
                {fmt(activeCampaigns.length)}
              </p>
            )}
            <p className="text-xs mt-1 text-gray-400">
              {endingSoonCampaigns.length > 0
                ? `${fmt(endingSoonCampaigns.length)} ending soon`
                : "running or upcoming"}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-gray-500">Low Performers</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-2xl font-semibold mt-1" style={{ color: C.warning }}>
                {fmt(lowPerformers.length)}
              </p>
            )}
            <p className="text-xs mt-1 text-gray-400">≤ {LOW_PERFORMER_THRESHOLD} units sold</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Sales by platform */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Sales by platform</h2>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : platformSales.length === 0 ? (
              <p className="text-xs text-gray-400">No sales data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={platformSales} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="platform"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmt(v)}
                  />
                  <Tooltip formatter={(v) => fmtCurrency(v)} />
                  <Bar dataKey="amount" name="Sales" radius={[6, 6, 0, 0]}>
                    {platformSales.map((p) => (
                      <Cell key={p.platform} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Top products */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Top products</h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <p className="text-xs text-gray-400">No sales data yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {products.slice(0, 5).map((p, idx) => (
                  <li key={p.name} className="flex items-center justify-between py-2 first:pt-0">
                    <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
                      <span
                        className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-white text-xs font-bold"
                        style={{ backgroundColor: C.accent }}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-gray-500 text-xs shrink-0 ml-2">{fmt(p.qty)} sold</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Seasonal trend */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Trend</h2>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : monthlyTrend.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyTrend} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TREND_LINE_COLOR} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TREND_LINE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={TREND_GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmt(v)}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: TREND_GRID_COLOR }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={TREND_LINE_COLOR}
                  strokeWidth={2}
                  fill="url(#trendFill)"
                  dot={<TrendDot />}
                  activeDot={{ r: 6, fill: TREND_LINE_COLOR }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top products for a specific month */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Top products by month</h2>
            {!loading && availableMonths.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {availableMonths.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedMonth(key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      (selectedMonth || availableMonths[0]) === key
                        ? "text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    style={
                      (selectedMonth || availableMonths[0]) === key
                        ? { backgroundColor: C.accent }
                        : undefined
                    }
                  >
                    {monthLabel(key)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
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
                    <span
                      className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-white text-xs font-bold"
                      style={{ backgroundColor: C.accent }}
                    >
                      {idx + 1}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-gray-500 text-xs shrink-0 ml-2">{fmt(p.qty)} sold</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Active campaigns snapshot */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Active &amp; upcoming campaigns</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
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
                    className="px-2 py-0.5 rounded-md text-xs font-medium border"
                    style={
                      c.derivedStatus === "Active"
                        ? {
                            color: C.accent,
                            backgroundColor: C.accentSoft,
                            borderColor: C.accentSoftBorder,
                          }
                        : {
                            color: C.warning,
                            backgroundColor: C.warningSoft,
                            borderColor: C.warningBorder,
                          }
                    }
                  >
                    {c.derivedStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default Marketing;