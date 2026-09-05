import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, PackageMinus } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
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

const PLATFORM_BADGE = {
  shopee: "bg-red-100 text-red-700",
  lazada: "bg-indigo-100 text-indigo-700",
  tiktok: "bg-gray-100 text-gray-700",
};

const PLATFORM_HEX = {
  shopee: "#dc2626",
  lazada: "#4f46e5",
  tiktok: "#4b5563",
};

const WO_STATUS_HEX = {
  Pending: "#f59e0b",
  "In Progress": "#dc2626",
  Completed: "#9ca3af",
  Cancelled: "#d1d5db",
};

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

// Build a YYYY-MM-DD key from a Date's LOCAL calendar fields.
// Never use toISOString() for this — it converts to UTC first, which
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
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 capitalize">{d.name}</p>
      <p className="text-gray-600">{d.value}</p>
    </div>
  );
}

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function StatCard({ label, value, sub, color = "text-gray-800", loading }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {loading ? <Skeleton /> : <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>}
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

  // Filters for the "Ready to Ship by platform" chart specifically
  const [rtsPlatform, setRtsPlatform] = useState("all");
  const [rtsDateRange, setRtsDateRange] = useState("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

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
      // Finished goods stock — shared with Inventory's Products page. Same
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

    if (woRes.error) setErrorMsg(woRes.error.message);
    else setWorkOrders(woRes.data || []);

    if (!outputRes.error) setOutput(outputRes.data || []);
    else console.error("production_output fetch error:", outputRes.error);

    if (!usageRes.error) setUsage(usageRes.data || []);
    else console.error("raw_material_usage fetch error:", usageRes.error);

    if (!materialsRes.error) setMaterials(materialsRes.data || []);
    else console.error("raw_materials fetch error:", materialsRes.error);

    if (!finishedGoodsRes.error) setFinishedGoods(finishedGoodsRes.data || []);
    else console.error("inventory (finished goods) fetch error:", finishedGoodsRes.error);

    if (readyRes.error) {
      console.error("production_orders (ready) fetch error:", readyRes.error);
      setErrorMsg((prev) => prev || `Ready to Ship data: ${readyRes.error.message}`);
    } else {
      setReadyToShip(readyRes.data || []);
    }

    if (shippedRes.error) {
      console.error("production_orders (shipped) fetch error:", shippedRes.error);
    } else {
      setShippedTodayCount(shippedRes.count || 0);
    }

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

  const todayKey = localDateKey(new Date());
  const todayOutputQty = output
    .filter((o) => o.production_date === todayKey)
    .reduce((sum, o) => sum + Number(o.quantity), 0);

  const readyToShipValue = readyToShip.reduce((sum, o) => sum + (o.total_amount || 0), 0) / 100;

  // ── Ready to Ship chart: filtered by platform + date range ──────────
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

  // ── Output by day, last 7 days (fixed: local date keys, not UTC) ────
  const outputChartData = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      const qty = output
        .filter((o) => o.production_date === key)
        .reduce((sum, o) => sum + Number(o.quantity), 0);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), qty });
    }
    return days;
  }, [output]);

  // ── Material usage by day, last 7 days ───────────────────────────────
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

  // ── Top produced products, last 30 days ──────────────────────────────
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

  // ── Materials needing reorder, as a chart ────────────────────────────
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
          color: m.status === "Out of Stock" ? "#dc2626" : "#f59e0b",
        })),
    [lowMaterials]
  );

  // ── Recent activity feed ─────────────────────────────────────────────
  const activity = useMemo(() => {
    const items = [
      ...output.map((o) => ({
        id: `out-${o.id}`,
        time: o.created_at,
        text: `Produced ${o.quantity} × ${o.product_name} (batch ${o.batch_number})`,
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

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Production</h1>
          <p className="text-sm text-gray-500 mt-1">
            Work orders → output → finished goods, with raw material usage tracked throughout
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer self-start md:self-auto"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          sub={`${pendingOutput.length} batch(es) → Finished Goods`}
          color="text-amber-600"
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
          sub="from Inventory · reorder point"
          color="text-red-700"
          loading={loading}
        />
      </div>

      {/* Cross-module alert: Inventory tells Production which finished
          products need a new work order, using the same reorder_point
          threshold the Products page displays. */}
      {!loading && finishedGoodsLow.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PackageMinus size={18} className="text-red-600" />
            <h2 className="text-sm font-bold text-gray-700">
              Finished goods running low — from Inventory
            </h2>
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
              {finishedGoodsLow.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {finishedGoodsLow.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{p.product_name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {p.product_code} {p.category ? `· ${p.category}` : ""}
                  </p>
                </div>
                <span className="ml-3 shrink-0 px-1.5 py-0.5 text-xs rounded font-medium bg-red-100 text-red-700">
                  {p.totalStock} / {p.threshold} left
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Consider logging a new Work Order for these products.
          </p>
        </div>
      )}

      {/* Ready to Ship by platform + Work order status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-bold text-gray-700">Ready to Ship by platform</h2>
            <div className="flex gap-2 flex-wrap">
              <div className="flex gap-1">
                {["all", "shopee", "lazada", "tiktok"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setRtsPlatform(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                      rtsPlatform === p
                        ? "bg-red-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p === "all" ? "All" : p}
                  </button>
                ))}
              </div>
              <select
                value={rtsDateRange}
                onChange={(e) => setRtsDateRange(e.target.value)}
                className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white cursor-pointer"
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
                    <span className="text-sm font-bold text-gray-700">{p.value} orders</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Shipped today</span>
                  <span className="text-sm font-bold text-emerald-700">{shippedTodayCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Filtered value</span>
                  <span className="text-sm font-bold text-indigo-700">
                    PHP {filteredReadyValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-1">Work order status</h2>
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

      {/* Output last 7 days + Materials needing reorder (now a chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Output — last 7 days</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={outputChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{label}</p>
                        <p className="text-gray-600">{payload[0].value} units produced</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="qty" fill="#b91c1c" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Materials needing reorder
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
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
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Material usage — last 7 days</h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={usageChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{label}</p>
                        <p className="text-gray-600">{payload[0].value} units used</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="qty"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Top produced products — last 30 days</h2>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11, fill: "#374151" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="qty" fill="#059669" radius={[0, 6, 6, 0]} barSize={20}>
                  <LabelList dataKey="qty" position="right" style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
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