//PRODUCTION DASHBOARD!!!!
import { useState, useEffect, useCallback, useMemo } from "react";
import { PackageMinus } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { supabase } from "../api/supabase";

/* ---------------------------------------------------------------------
 * Design tokens (ISONFAM ERP) — shared conventions with Sales_db.jsx.
 * Red is reserved for the primary action and true alerts (low/out of
 * stock); status and platform colors use their own semantic palette
 * so red keeps its meaning as "needs attention".
 * ------------------------------------------------------------------- */
const ACCENT = "#9A1B1B";
const ACCENT_HOVER = "#7F1616";

const PLATFORM_BADGE = {
  shopee: "bg-orange-50 text-orange-700",
  lazada: "bg-indigo-50 text-indigo-700",
  tiktok: "bg-gray-100 text-gray-800",
};

const PLATFORM_HEX = {
  shopee: "#E1571F",
  lazada: "#5B4B93",
  tiktok: "#111827",
};

const WO_STATUS_HEX = {
  Pending: "#D97706",
  "In Progress": "#2563EB",
  Completed: "#059669",
  Cancelled: "#9CA3AF",
};

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const FINISHED_GOODS_PAGE_SIZE = 6;

const CARD = "bg-white rounded-md border border-gray-200 shadow-sm";
const SEGMENT_WRAP = "flex gap-0.5 bg-gray-100 rounded-md p-0.5";
const SEGMENT_BTN = (active) =>
  `px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`;
const PRIMARY_BTN =
  "px-3.5 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer";

// Build a YYYY-MM-DD key from a Date's LOCAL calendar fields.
// Never use toISOString() for this: it converts to UTC first, which
// shifts the date backward for any local time before UTC catches up
// (e.g. before 8am in Manila, UTC+8), silently breaking day-bucket
// matches against date-only DB columns like `production_date`.
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function localDateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 capitalize">{d.name}</p>
      <p className="text-gray-600">{d.value}</p>
    </div>
  );
}

function Skeleton({ className = "h-7 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function StatCard({ label, value, sub, color = "text-gray-900", loading }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {loading ? <Skeleton /> : <p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p>}
      {sub && <p className="text-xs mt-1 text-gray-400">{sub}</p>}
    </div>
  );
}

function Production() {
  const [workOrders, setWorkOrders] = useState([]);
  const [output, setOutput] = useState([]);
  const [usage, setUsage] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [readyToShip, setReadyToShip] = useState([]);
  const [shippedTodayCount, setShippedTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [softErrors, setSoftErrors] = useState([]);

  // Filters for the "Ready to Ship by platform" chart specifically
  const [rtsPlatform, setRtsPlatform] = useState("all");
  const [rtsDateRange, setRtsDateRange] = useState("all");

  // Pagination for the "Finished goods running low" list
  const [finishedGoodsPage, setFinishedGoodsPage] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    setSoftErrors([]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [woRes, outputRes, usageRes, materialsRes, finishedGoodsRes, readyRes, shippedRes] = await Promise.all([
      supabase.from("work_orders").select("*").order("created_at", { ascending: false }),
      supabase
        .from("production_output")
        .select("*")
        .order("production_date", { ascending: false })
        .limit(300),
      supabase
        .from("raw_material_usage")
        .select("*")
        .order("usage_date", { ascending: false })
        .limit(300),
      supabase.from("raw_materials").select("id, material_name, status, current_stock, unit"),
      // Finished goods stock: shared with Inventory's Products page. Same
      // `reorder_point` column that page's threshold is based on, so a
      // product flagged low here is flagged low there too.
      supabase
        .from("inventory")
        .select("id, product_code, product_name, category, shopee_stock, lazada_stock, tiktok_stock, reorder_point"),
      supabase
        .from("production_orders")
        .select("order_id, platform, total_amount, created_at")
        .eq("status", "READY_TO_SHIP"),
      supabase
        .from("production_orders")
        .select("order_id", { count: "exact", head: true })
        .eq("status", "SHIPPED")
        .gte("shipped_at", startOfToday.toISOString()),
    ]);

    // work_orders is the one dataset the whole page depends on. If it
    // fails, block with a full-page error + retry, same as Inventory_db
    // does for its primary `inventory` fetch. Everything else below is
    // supplementary: a failure there is surfaced as a small amber notice
    // and doesn't stop the rest of the dashboard from rendering.
    const softIssues = [];

    if (woRes.error) setErrorMsg(woRes.error.message || "Couldn't load work orders.");
    else setWorkOrders(woRes.data || []);

    if (!outputRes.error) setOutput(outputRes.data || []);
    else {
      console.error("production_output fetch error:", outputRes.error);
      softIssues.push("Production output couldn't be loaded.");
    }

    if (!usageRes.error) setUsage(usageRes.data || []);
    else {
      console.error("raw_material_usage fetch error:", usageRes.error);
      softIssues.push("Material usage couldn't be loaded.");
    }

    if (!materialsRes.error) setMaterials(materialsRes.data || []);
    else {
      console.error("raw_materials fetch error:", materialsRes.error);
      softIssues.push("Raw materials couldn't be loaded.");
    }

    if (!finishedGoodsRes.error) setFinishedGoods(finishedGoodsRes.data || []);
    else {
      console.error("inventory (finished goods) fetch error:", finishedGoodsRes.error);
      softIssues.push("Finished goods stock couldn't be loaded.");
    }

    if (readyRes.error) {
      console.error("production_orders (ready) fetch error:", readyRes.error);
      softIssues.push("Ready to Ship data couldn't be loaded.");
    } else {
      setReadyToShip(readyRes.data || []);
    }

    if (shippedRes.error) {
      console.error("production_orders (shipped) fetch error:", shippedRes.error);
      softIssues.push("Today's shipped count couldn't be loaded.");
    } else {
      setShippedTodayCount(shippedRes.count || 0);
    }

    setSoftErrors(softIssues);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const activeWOs = workOrders.filter((w) => ["Pending", "In Progress"].includes(w.status));
  const inProgressWOs = workOrders.filter((w) => w.status === "In Progress");
  const pendingOutput = output.filter((o) => !o.allocated);
  const pendingOutputQty = pendingOutput.reduce((sum, o) => sum + Number(o.quantity), 0);
  const lowMaterials = materials.filter((m) => m.status !== "In Stock");

  // Same rule as Inventory's Products page: total stock across platforms
  // at or below the product's reorder_point (default 5 if unset).
  const finishedGoodsLow = useMemo(
    () =>
      finishedGoods
        .map((p) => ({
          ...p,
          totalStock: toNum(p.shopee_stock) + toNum(p.lazada_stock) + toNum(p.tiktok_stock),
          threshold: p.reorder_point ?? 5,
        }))
        .filter((p) => p.totalStock <= p.threshold)
        .sort((a, b) => a.totalStock - b.totalStock),
    [finishedGoods]
  );

  const finishedGoodsPageCount = Math.max(1, Math.ceil(finishedGoodsLow.length / FINISHED_GOODS_PAGE_SIZE));

  // Keep the current page in range if the underlying list shrinks (e.g.
  // after a refresh resolves some low-stock items).
  useEffect(() => {
    if (finishedGoodsPage > finishedGoodsPageCount - 1) {
      setFinishedGoodsPage(Math.max(0, finishedGoodsPageCount - 1));
    }
  }, [finishedGoodsPageCount, finishedGoodsPage]);

  const finishedGoodsLowPage = useMemo(() => {
    const start = finishedGoodsPage * FINISHED_GOODS_PAGE_SIZE;
    return finishedGoodsLow.slice(start, start + FINISHED_GOODS_PAGE_SIZE);
  }, [finishedGoodsLow, finishedGoodsPage]);

  const todayKey = localDateKey(new Date());
  const todayOutputQty = output
    .filter((o) => o.production_date === todayKey)
    .reduce((sum, o) => sum + Number(o.quantity), 0);

  const readyToShipValue = readyToShip.reduce((sum, o) => sum + (o.total_amount || 0), 0) / 100;

  // Ready to Ship chart: filtered by platform + date range
  const filteredReadyToShip = useMemo(() => {
    return readyToShip.filter((o) => {
      if (rtsPlatform !== "all" && o.platform !== rtsPlatform) return false;
      if (rtsDateRange === "all") return true;
      if (!o.created_at) return false;
      const days = rtsDateRange === "today" ? 1 : rtsDateRange === "7d" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return new Date(o.created_at) >= cutoff;
    });
  }, [readyToShip, rtsPlatform, rtsDateRange]);

  const filteredReadyValue = filteredReadyToShip.reduce((sum, o) => sum + (o.total_amount || 0), 0) / 100;

  const readyPlatformChartData = useMemo(() => {
    const map = { shopee: 0, lazada: 0, tiktok: 0 };
    filteredReadyToShip.forEach((o) => {
      if (map[o.platform] !== undefined) map[o.platform] += 1;
    });
    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .map(([platform, count]) => ({ name: platform, value: count, color: PLATFORM_HEX[platform] }));
  }, [filteredReadyToShip]);

  const woStatusChartData = useMemo(() => {
    const map = { Pending: 0, "In Progress": 0, Completed: 0, Cancelled: 0 };
    workOrders.forEach((w) => {
      if (map[w.status] !== undefined) map[w.status] += 1;
    });
    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({ name: status, value: count, color: WO_STATUS_HEX[status] }));
  }, [workOrders]);

  // Output trend, last 30 days (local date keys, not UTC). Replaces the
  // old 7-day bar chart with a line/area trend, mirroring the Sales
  // dashboard's "Sales trend" chart so production and sales read the
  // same way at a glance.
  const outputTrendData = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      const qty = output
        .filter((o) => o.production_date === key)
        .reduce((sum, o) => sum + Number(o.quantity), 0);
      days.push({ label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), qty });
    }
    return days;
  }, [output]);

  // Material usage by day, last 7 days
  const usageChartData = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      const qty = usage
        .filter((u) => u.usage_date === key)
        .reduce((sum, u) => sum + Number(u.quantity_used), 0);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), qty });
    }
    return days;
  }, [usage]);

  // Top produced products, last 30 days
  const topProductsChartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const map = {};
    output.forEach((o) => {
      if (new Date(o.production_date) < cutoff) return;
      map[o.product_name] = (map[o.product_name] || 0) + Number(o.quantity);
    });
    return Object.entries(map)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [output]);

  // Materials needing reorder, as a chart
  const materialsChartData = useMemo(
    () =>
      lowMaterials
        .slice()
        .sort((a, b) => a.current_stock - b.current_stock)
        .slice(0, 8)
        .map((m) => ({
          name: m.material_name,
          qty: m.current_stock,
          unit: m.unit,
          color: m.status === "Out of Stock" ? "#B42318" : "#D97706",
        })),
    [lowMaterials]
  );

  // Recent activity feed
  const activity = useMemo(() => {
    const items = [
      ...output.map((o) => ({
        id: `out-${o.id}`,
        time: o.created_at,
        text: `Produced ${o.quantity} x ${o.product_name} (batch ${o.batch_number})`,
        type: "output",
      })),
      ...usage.map((u) => ({
        id: `use-${u.id}`,
        time: u.created_at,
        text: `Used ${u.quantity_used} ${u.unit} of ${u.material_name}${
          u.wo_number ? ` for ${u.wo_number}` : ""
        }`,
        type: "usage",
      })),
    ];
    return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
  }, [output, usage]);

  // Blocking error state: same pattern as Inventory_db, replace the page
  // with a single card + retry when the primary dataset failed to load.
  if (errorMsg && workOrders.length === 0) {
    return (
      <div className="p-6">
        <div className={`${CARD} p-6 border-red-200`}>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Production — Dashboard</h1>
          <p className="text-sm text-red-700 mb-4">{errorMsg}</p>
          <button
            onClick={fetchAll}
            className={PRIMARY_BTN}
            style={{ background: ACCENT }}
            onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className={`${CARD} p-5 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Production — Dashboard</h1>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className={`${PRIMARY_BTN} self-start md:self-auto`}
          style={{ background: ACCENT }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.background = ACCENT_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {softErrors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-xs space-y-0.5">
          {softErrors.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard
          label="Active work orders"
          value={activeWOs.length}
          sub={`${inProgressWOs.length} in progress`}
          loading={loading}
        />
        <StatCard
          label="Produced today"
          value={todayOutputQty.toLocaleString()}
          sub="units logged"
          color="text-emerald-700"
          loading={loading}
        />
        <StatCard
          label="Pending allocation"
          value={pendingOutputQty.toLocaleString()}
          sub={`${pendingOutput.length} batch(es) to Finished Goods`}
          color="text-amber-700"
          loading={loading}
        />
        <StatCard
          label="Ready to ship"
          value={readyToShip.length}
          sub={`PHP ${readyToShipValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
          color="text-indigo-700"
          loading={loading}
        />
        <StatCard
          label="Materials needing attention"
          value={lowMaterials.length}
          sub="low / out of stock"
          color="text-red-700"
          loading={loading}
        />
        <StatCard
          label="Finished goods low"
          value={finishedGoodsLow.length}
          sub="from Inventory, reorder point"
          color="text-red-700"
          loading={loading}
        />
      </div>

      {/* Ready to Ship by platform + Work order status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Ready to Ship by platform</h2>
            <div className="flex gap-2 flex-wrap">
              <div className={SEGMENT_WRAP}>
                {["all", "shopee", "lazada", "tiktok"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setRtsPlatform(p)}
                    className={`${SEGMENT_BTN(rtsPlatform === p)} capitalize`}
                  >
                    {p === "all" ? "All" : p}
                  </button>
                ))}
              </div>
              <select
                value={rtsDateRange}
                onChange={(e) => setRtsDateRange(e.target.value)}
                className="px-2.5 py-1 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white cursor-pointer"
              >
                {DATE_RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : readyPlatformChartData.length === 0 ? (
            <p className="text-xs text-gray-400">No orders match this filter.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={readyPlatformChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {readyPlatformChartData.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {readyPlatformChartData.map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLATFORM_BADGE[p.name]}`}
                    >
                      {p.name}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{p.value} orders</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Shipped today</span>
                  <span className="text-sm font-semibold text-emerald-700">{shippedTodayCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Filtered value</span>
                  <span className="text-sm font-semibold text-indigo-700">
                    PHP {filteredReadyValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`lg:col-span-1 ${CARD} p-5`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Work order status</h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : woStatusChartData.length === 0 ? (
            <p className="text-xs text-gray-400">No work orders yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={woStatusChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                  >
                    {woStatusChartData.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 mt-2">
                {woStatusChartData.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="font-semibold text-gray-700">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Output trend (30 days) + Materials needing reorder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Production output trend, last 30 days</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={outputTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="outputFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f1" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{label}</p>
                        <p style={{ color: ACCENT }}>{payload[0].value} units produced</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="qty"
                  name="Units produced"
                  stroke={ACCENT}
                  strokeWidth={2}
                  fill="url(#outputFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={`lg:col-span-1 ${CARD} p-5`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">
            Materials needing reorder
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded font-medium">
                {lowMaterials.length}
              </span>
            )}
          </h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : materialsChartData.length === 0 ? (
            <p className="text-xs text-gray-400">All materials sufficiently stocked.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, materialsChartData.length * 30)}>
              <BarChart
                data={materialsChartData}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 8, bottom: 0 }}
                barCategoryGap={8}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f1" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 10, fill: "#374151" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{d.name}</p>
                        <p className="text-gray-600">
                          {d.qty} {d.unit} left
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={14}>
                  {materialsChartData.map((m) => (
                    <Cell key={m.name} fill={m.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Material usage trend + Top produced products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Material usage, last 7 days</h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={usageChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f1" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{label}</p>
                        <p className="text-gray-600">{payload[0].value} units used</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="qty"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#D97706" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={`${CARD} p-5`}>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Top produced products, last 30 days</h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : topProductsChartData.length === 0 ? (
            <p className="text-xs text-gray-400">No output logged in the last 30 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topProductsChartData.length * 34)}>
              <BarChart
                data={topProductsChartData}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                barCategoryGap={10}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f1" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11, fill: "#374151" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="qty" fill="#059669" radius={[0, 4, 4, 0]} barSize={20}>
                  <LabelList dataKey="qty" position="right" style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cross-module alert: Inventory tells Production which finished
          products need a new work order, using the same reorder_point
          threshold the Products page displays. Paginated since this list
          can grow past what's comfortable to scan in one grid. */}
      {!loading && finishedGoodsLow.length > 0 && (
        <div className={`${CARD} border-red-200 p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <PackageMinus size={18} className="text-red-700" />
            <h2 className="text-sm font-semibold text-gray-800">
              Finished goods running low, from Inventory
            </h2>
            <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded font-medium">
              {finishedGoodsLow.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {finishedGoodsLowPage.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-red-200 bg-red-50/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{p.product_name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {p.product_code} {p.category ? `, ${p.category}` : ""}
                  </p>
                </div>
                <span className="ml-3 shrink-0 px-1.5 py-0.5 text-xs rounded font-medium bg-red-50 text-red-700">
                  {p.totalStock} / {p.threshold} left
                </span>
              </div>
            ))}
          </div>

          {finishedGoodsPageCount > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => setFinishedGoodsPage((p) => Math.max(0, p - 1))}
                disabled={finishedGoodsPage === 0}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Prev
              </button>
              <span className="text-xs text-gray-400">
                Page {finishedGoodsPage + 1} of {finishedGoodsPageCount}
              </span>
              <button
                onClick={() => setFinishedGoodsPage((p) => Math.min(finishedGoodsPageCount - 1, p + 1))}
                disabled={finishedGoodsPage >= finishedGoodsPageCount - 1}
                className={`px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors`}
                style={{ background: finishedGoodsPage >= finishedGoodsPageCount - 1 ? undefined : ACCENT }}
              >
                Next
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Consider logging a new Work Order for these products.
          </p>
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Recent activity</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-xs text-gray-400">No recent production activity.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    a.type === "output" ? "bg-emerald-600" : "bg-amber-500"
                  }`}
                />
                <div>
                  <p className="text-xs text-gray-700 leading-snug">{a.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(a.time).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Production;