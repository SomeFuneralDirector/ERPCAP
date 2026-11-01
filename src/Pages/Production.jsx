// PRODUCTION DASHBOARD
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PackageMinus, TimerReset } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { supabase } from "../api/supabase";
import Greetings from "../Components/Greetings";

/* ---------------------------------------------------------------------
 * Design tokens (ISONFAM ERP) - shared conventions with Sales_db.jsx.
 * ------------------------------------------------------------------- */
const ACCENT = "#9A1B1B";
const ACCENT_HOVER = "#7F1616";
const TRACK_COLOR = "#F3F4F6";

const PLATFORM_BADGE = {
  shopee: "bg-orange-50 text-orange-700",
  lazada: "bg-indigo-50 text-indigo-700",
  tiktok: "bg-gray-100 text-gray-800",
};

const PLATFORM_HEX = {
  shopee: "#EE4D2D",
  lazada: "#0F146D",
  tiktok: "#101113",
};

const WO_STATUS_HEX = {
  Pending: "#D97706",
  "In Progress": "#2563EB",
  Completed: "#059669",
  Cancelled: "#9CA3AF",
};

function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function withinRange(value, start, end) {
  if (!start && !end) return true;
  const t = new Date(value);
  if (isNaN(t)) return false;
  if (start && t < start) return false;
  if (end && t > end) return false;
  return true;
}

const fmtKey = (k) =>
  keyToDate(k).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const FINISHED_GOODS_PAGE_SIZE = 6;
const POLL_INTERVAL_MS = 30000;
const FETCH_CHUNK = 1000;

async function fetchAllPages(buildQuery) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + FETCH_CHUNK - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < FETCH_CHUNK) break;
    from += FETCH_CHUNK;
  }

  return { data: all, error: null };
}

const CARD = "bg-white rounded-md border border-gray-200 shadow-sm";
const SEGMENT_WRAP = "flex gap-0.5 bg-gray-100 rounded-md p-0.5";
const SEGMENT_BTN = (active) =>
  `px-2.5 py-1 text-sm font-medium rounded transition-colors cursor-pointer ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`;
const PRIMARY_BTN =
  "px-3.5 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer";

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

function isDelivery(u) {
  return String(u.notes || "").startsWith("[Delivery]");
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xl px-3.5 py-2.5 text-sm min-w-[120px]">
      <p className="font-semibold text-gray-800 capitalize">{d.name}</p>
      <p className="text-gray-600 tabular-nums">{d.value}</p>
    </div>
  );
}

function Skeleton({ className = "h-7 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function StatCard({ label, value, sub, color = "text-gray-900", loading }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {loading ? (
        <Skeleton />
      ) : (
        <p className={`text-2xl font-semibold mt-1 tabular-nums ${color}`}>{value}</p>
      )}
      {sub && <p className="text-sm mt-1 text-gray-400">{sub}</p>}
    </div>
  );
}

/** Progress-style ranking bars */
function RankingBars({
  data,
  valueKey = "qty",
  nameKey = "name",
  color = ACCENT,
  formatter = (v) => Number(v).toLocaleString(),
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);

  return (
    <div className="space-y-3">
      {data.map((row, i) => {
        const value = row[valueKey] || 0;
        const pct = Math.round((value / max) * 100);
        const label = row[nameKey];
        return (
          <div key={label}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: i < 3 ? row.color || color : "#9CA3AF",
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-gray-700 truncate" title={label}>
                  {label}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                {formatter(value)}
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: TRACK_COLOR }}
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: row.color || color,
                  opacity: 1 - i * 0.05,
                }}
              />
            </div>
          </div>
        );
      })}
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

  const [dateFrom, setDateFrom] = useState(() => localDateKey(addDays(new Date(), -29)));
  const [dateTo, setDateTo] = useState(() => localDateKey(new Date()));

  const [rtsPlatform, setRtsPlatform] = useState("all");
  const [finishedGoodsPage, setFinishedGoodsPage] = useState(0);

  const prevWorkOrdersJsonRef = useRef("");
  const prevOutputJsonRef = useRef("");
  const prevUsageJsonRef = useRef("");
  const prevMaterialsJsonRef = useRef("");
  const prevFinishedGoodsJsonRef = useRef("");
  const prevReadyJsonRef = useRef("");
  const prevShippedCountRef = useRef(-1);
  const inFlightRef = useRef(false);

  const fetchAll = useCallback(async (mode = "poll") => {
    const isInitial = mode === "initial";

    if (!isInitial && inFlightRef.current) return;
    inFlightRef.current = true;

    if (isInitial) setLoading(true);
    setErrorMsg("");
    setSoftErrors([]);

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [woRes, outputRes, usageRes, materialsRes, finishedGoodsRes, readyRes, shippedRes] =
        await Promise.all([
          fetchAllPages(() =>
            supabase
              .from("work_orders")
              .select("id, status, product_name, quantity, due_date, completed_at, created_at")
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
          ),
          supabase
            .from("production_output")
            .select(
              "id, product_name, batch_number, quantity, allocated, production_date, created_at"
            )
            .order("production_date", { ascending: false })
            .limit(300),
          supabase
            .from("raw_material_usage")
            .select("id, material_name, quantity_used, notes, wo_number, usage_date, created_at")
            .order("usage_date", { ascending: false })
            .limit(300),
          supabase
            .from("raw_materials")
            .select("id, material_name, category, status, current_stock, suppliers(name)"),
          supabase
            .from("inventory")
            .select(
              "id, product_code, product_name, category, shopee_stock, lazada_stock, tiktok_stock, reorder_point"
            ),
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

      const softIssues = [];

      if (woRes.error) {
        setErrorMsg(woRes.error.message || "Couldn't load work orders.");
      } else {
        const fresh = woRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevWorkOrdersJsonRef.current) {
          prevWorkOrdersJsonRef.current = freshJson;
          setWorkOrders(fresh);
        }
      }

      if (!outputRes.error) {
        const fresh = outputRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevOutputJsonRef.current) {
          prevOutputJsonRef.current = freshJson;
          setOutput(fresh);
        }
      } else {
        console.error("production_output fetch error:", outputRes.error);
        softIssues.push("Production output couldn't be loaded.");
      }

      if (!usageRes.error) {
        const fresh = usageRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevUsageJsonRef.current) {
          prevUsageJsonRef.current = freshJson;
          setUsage(fresh);
        }
      } else {
        console.error("raw_material_usage fetch error:", usageRes.error);
        softIssues.push("Material usage couldn't be loaded.");
      }

      if (!materialsRes.error) {
        const fresh = materialsRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevMaterialsJsonRef.current) {
          prevMaterialsJsonRef.current = freshJson;
          setMaterials(fresh);
        }
      } else {
        console.error("raw_materials fetch error:", materialsRes.error);
        softIssues.push("Raw materials couldn't be loaded.");
      }

      if (!finishedGoodsRes.error) {
        const fresh = finishedGoodsRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevFinishedGoodsJsonRef.current) {
          prevFinishedGoodsJsonRef.current = freshJson;
          setFinishedGoods(fresh);
        }
      } else {
        console.error("inventory (finished goods) fetch error:", finishedGoodsRes.error);
        softIssues.push("Finished goods stock couldn't be loaded.");
      }

      if (readyRes.error) {
        console.error("production_orders (ready) fetch error:", readyRes.error);
        softIssues.push("Ready to Ship data couldn't be loaded.");
      } else {
        const fresh = readyRes.data || [];
        const freshJson = JSON.stringify(fresh);
        if (freshJson !== prevReadyJsonRef.current) {
          prevReadyJsonRef.current = freshJson;
          setReadyToShip(fresh);
        }
      }

      if (shippedRes.error) {
        console.error("production_orders (shipped) fetch error:", shippedRes.error);
        softIssues.push("Today's shipped count couldn't be loaded.");
      } else {
        const freshCount = shippedRes.count || 0;
        if (freshCount !== prevShippedCountRef.current) {
          prevShippedCountRef.current = freshCount;
          setShippedTodayCount(freshCount);
        }
      }

      setSoftErrors(softIssues);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll("initial");

    let intervalId = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        fetchAll("poll");
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchAll("poll");
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchAll]);

  const rangeStartDate = useMemo(
    () => (dateFrom ? keyToDate(dateFrom) : null),
    [dateFrom]
  );
  const rangeEndDate = useMemo(() => {
    if (!dateTo) return null;
    const d = keyToDate(dateTo);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [dateTo]);

  const rangeLabel =
    !dateFrom && !dateTo
      ? "all time"
      : dateFrom && dateTo
        ? dateFrom === dateTo
          ? fmtKey(dateFrom)
          : `${fmtKey(dateFrom)} – ${fmtKey(dateTo)}`
        : dateFrom
          ? `since ${fmtKey(dateFrom)}`
          : `up to ${fmtKey(dateTo)}`;

  const woInRange = useMemo(
    () => workOrders.filter((w) => withinRange(w.created_at, rangeStartDate, rangeEndDate)),
    [workOrders, rangeStartDate, rangeEndDate]
  );

  const activeWOs = workOrders.filter((w) => ["Pending", "In Progress"].includes(w.status));
  const inProgressWOs = workOrders.filter((w) => w.status === "In Progress");
  const pendingOutput = output.filter((o) => !o.allocated);
  const pendingOutputQty = pendingOutput.reduce((sum, o) => sum + Number(o.quantity), 0);
  const lowMaterials = materials.filter((m) => m.status !== "In Stock");
  const lowMaterialCount = materials.filter((m) => m.status === "Low Stock").length;
  const outMaterialCount = materials.filter((m) => m.status === "Out of Stock").length;

  const materialLitres = useMemo(() => {
    const litresOf = (category) =>
      materials
        .filter((m) => m.category === category)
        .reduce((sum, m) => sum + toNum(m.current_stock), 0);
    return { oil: litresOf("Oil"), alcohol: litresOf("Alcohol") };
  }, [materials]);

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

  const finishedGoodsPageCount = Math.max(
    1,
    Math.ceil(finishedGoodsLow.length / FINISHED_GOODS_PAGE_SIZE)
  );

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

  const filteredReadyToShip = useMemo(() => {
    return readyToShip.filter((o) => rtsPlatform === "all" || o.platform === rtsPlatform);
  }, [readyToShip, rtsPlatform]);

  const filteredReadyValue =
    filteredReadyToShip.reduce((sum, o) => sum + (o.total_amount || 0), 0) / 100;

  const readyPlatformChartData = useMemo(() => {
    const map = {
      shopee: { count: 0, value: 0 },
      lazada: { count: 0, value: 0 },
      tiktok: { count: 0, value: 0 },
    };
    filteredReadyToShip.forEach((o) => {
      if (map[o.platform]) {
        map[o.platform].count += 1;
        map[o.platform].value += (o.total_amount || 0) / 100;
      }
    });
    return Object.entries(map)
      .filter(([, v]) => v.count > 0)
      .map(([platform, v]) => ({
        name: platform,
        value: v.count,
        pesoValue: Math.round(v.value),
        color: PLATFORM_HEX[platform],
      }));
  }, [filteredReadyToShip]);

  const woStatusChartData = useMemo(() => {
    const map = { Pending: 0, "In Progress": 0, Completed: 0, Cancelled: 0 };
    woInRange.forEach((w) => {
      if (map[w.status] !== undefined) map[w.status] += 1;
    });
    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: status,
        value: count,
        color: WO_STATUS_HEX[status],
      }));
  }, [woInRange]);

  const woTimeliness = useMemo(() => {
    const now = new Date();
    let onTime = 0;
    let late = 0;
    let overdue = 0;
    woInRange.forEach((w) => {
      if (w.status === "Completed") {
        if (!w.due_date || !w.completed_at) return;
        const due = new Date(w.due_date);
        const done = new Date(w.completed_at);
        if (done <= due) onTime++;
        else late++;
      } else if (["Pending", "In Progress"].includes(w.status)) {
        if (w.due_date && new Date(w.due_date) < now) overdue++;
      }
    });
    const completedWithDueDate = onTime + late;
    const onTimeRate =
      completedWithDueDate > 0 ? Math.round((onTime / completedWithDueDate) * 100) : null;
    return { onTime, late, overdue, onTimeRate };
  }, [woInRange]);

  const woTimelinessChartData = useMemo(
    () =>
      [
        { name: "Completed on time", value: woTimeliness.onTime, color: "#059669" },
        { name: "Completed late", value: woTimeliness.late, color: "#B42318" },
        { name: "Still open, overdue", value: woTimeliness.overdue, color: "#D97706" },
      ].filter((d) => d.value > 0),
    [woTimeliness]
  );

  const topProductsChartData = useMemo(() => {
    const map = {};
    woInRange.forEach((w) => {
      if (w.status === "Cancelled") return;
      map[w.product_name] = (map[w.product_name] || 0) + toNum(w.quantity);
    });
    return Object.entries(map)
      .map(([name, qty]) => ({ name, qty, color: "#059669" }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [woInRange]);

  const materialsChartData = useMemo(
    () =>
      lowMaterials
        .slice()
        .sort((a, b) => a.current_stock - b.current_stock)
        .slice(0, 8)
        .map((m) => ({
          name: m.material_name,
          qty: m.current_stock,
          unit: "L",
          color: m.status === "Out of Stock" ? "#B42318" : "#D97706",
        })),
    [lowMaterials]
  );

  const activity = useMemo(() => {
    const items = [
      ...output.map((o) => ({
        id: `out-${o.id}`,
        time: o.created_at,
        text: `Produced ${o.quantity} x ${o.product_name} (batch ${o.batch_number})`,
        type: "output",
      })),
      ...usage.map((u) => {
        const qty = Math.abs(toNum(u.quantity_used));
        let type = "usage";
        let text;
        if (isDelivery(u)) {
          type = "delivery";
          text = `Received ${qty} L of ${u.material_name}`;
        } else if (u.wo_number) {
          text = `Used ${qty} L of ${u.material_name} for ${u.wo_number}`;
        } else if (toNum(u.quantity_used) < 0) {
          text = `Deducted ${qty} L of ${u.material_name}`;
        } else {
          text = `Added ${qty} L of ${u.material_name}`;
        }
        return { id: `use-${u.id}`, time: u.created_at, text, type };
      }),
    ];
    return items
      .filter((a) => withinRange(a.time, rangeStartDate, rangeEndDate))
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 8);
  }, [output, usage, rangeStartDate, rangeEndDate]);

  if (errorMsg && workOrders.length === 0) {
    return (
      <div className="p-6">
        <div className={`${CARD} p-6 border-red-200`}>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Production - Dashboard</h1>
          <p className="text-sm text-red-700 mb-4">{errorMsg}</p>
          <button
            onClick={() => fetchAll("initial")}
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
      <Greetings />

      <div className={`${CARD} p-5 flex items-center justify-between gap-3`}>
        <h1 className="text-lg font-semibold text-gray-900">Production - Dashboard</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
            className="px-2.5 py-1.5 border border-gray-200 rounded-md text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white cursor-pointer"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
            className="px-2.5 py-1.5 border border-gray-200 rounded-md text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white cursor-pointer"
          />

        </div>
      </div>

      {softErrors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm space-y-0.5">
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
          label="On-time completion"
          value={woTimeliness.onTimeRate !== null ? `${woTimeliness.onTimeRate}%` : "-"}
          sub={
            woTimeliness.overdue > 0
              ? `${woTimeliness.overdue} open order(s) overdue`
              : "no overdue open orders"
          }
          color={
            woTimeliness.onTimeRate !== null && woTimeliness.onTimeRate < 80
              ? "text-red-700"
              : "text-emerald-700"
          }
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

      {/* Raw material stock */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Oils on hand"
          value={`${materialLitres.oil.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`}
          loading={loading}
        />
        <StatCard
          label="Alcohol on hand"
          value={`${materialLitres.alcohol.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })} L`}
          loading={loading}
        />
        <StatCard
          label="Materials low"
          value={lowMaterialCount}
          color="text-amber-700"
          loading={loading}
        />
        <StatCard
          label="Materials out"
          value={outMaterialCount}
          color="text-red-700"
          loading={loading}
        />
      </div>

      {/* Ready to Ship by platform + Work order status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-gray-800">Ready to Ship by platform</h2>
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
          </div>

          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : readyPlatformChartData.length === 0 ? (
            <p className="text-sm text-gray-400">No orders match this filter.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={readyPlatformChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={90}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {readyPlatformChartData.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-xl px-3.5 py-2.5 text-sm">
                          <p className="font-semibold text-gray-800 capitalize">{d.name}</p>
                          <p className="text-gray-600 tabular-nums">{d.value} order(s)</p>
                          <p className="text-gray-600 tabular-nums">
                            PHP {d.pesoValue.toLocaleString("en-PH")}
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {readyPlatformChartData.map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium capitalize ${PLATFORM_BADGE[p.name]}`}
                    >
                      {p.name}
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-gray-700 tabular-nums">
                        {p.value} orders
                      </span>
                      <span className="block text-sm text-gray-400 tabular-nums">
                        PHP {p.pesoValue.toLocaleString("en-PH")}
                      </span>
                    </span>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-500">Shipped today</span>
                  <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                    {shippedTodayCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-500">Filtered value</span>
                  <span className="text-sm font-semibold text-indigo-700 tabular-nums">
                    PHP{" "}
                    {filteredReadyValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`lg:col-span-1 ${CARD} p-5`}>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Work order status</h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : woStatusChartData.length === 0 ? (
            <p className="text-sm text-gray-400">No work orders for {rangeLabel}.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={woStatusChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={64}
                    paddingAngle={4}
                    stroke="none"
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
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ background: s.color }}
                      />
                      {s.name}
                    </span>
                    <span className="font-semibold text-gray-700 tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Timeliness + Materials + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2 mb-1">
            <TimerReset size={16} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-800">Work order timeliness</h2>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : woTimelinessChartData.length === 0 ? (
            <p className="text-sm text-gray-400">Not enough due-date data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={woTimelinessChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {woTimelinessChartData.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 mt-2">
                {woTimelinessChartData.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ background: s.color }}
                      />
                      {s.name}
                    </span>
                    <span className="font-semibold text-gray-700 tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={`${CARD} p-5`}>
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Materials needing reorder
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-700 text-sm rounded font-medium">
                {lowMaterials.length}
              </span>
            )}
          </h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : materialsChartData.length === 0 ? (
            <p className="text-sm text-gray-400">All materials sufficiently stocked.</p>
          ) : (
            <RankingBars
              data={materialsChartData}
              valueKey="qty"
              formatter={(v) => `${Number(v).toLocaleString()} L`}
            />
          )}
        </div>

        <div className={`${CARD} p-5`}>
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Top products (work orders)
          </h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : topProductsChartData.length === 0 ? (
            <p className="text-sm text-gray-400">No work orders for {rangeLabel}.</p>
          ) : (
            <RankingBars
              data={topProductsChartData}
              valueKey="qty"
              color="#059669"
              formatter={(v) => `${Number(v).toLocaleString()} units`}
            />
          )}
        </div>
      </div>

      {/* Finished goods low */}
      {!loading && finishedGoodsLow.length > 0 && (
        <div className={`${CARD} border-red-200 p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <PackageMinus size={18} className="text-red-700" />
            <h2 className="text-base font-semibold text-gray-800">
              Finished goods running low, from Inventory
            </h2>
            <span className="px-2 py-0.5 bg-red-50 text-red-700 text-sm rounded font-medium">
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
                  <p className="text-sm font-medium text-gray-700 truncate">{p.product_name}</p>
                  <p className="text-sm text-gray-400 font-mono truncate">
                    {p.product_code} {p.category ? `, ${p.category}` : ""}
                  </p>
                </div>
                <span className="ml-3 shrink-0 px-1.5 py-0.5 text-sm rounded font-medium bg-red-50 text-red-700 tabular-nums">
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
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-gray-400">
                Page {finishedGoodsPage + 1} of {finishedGoodsPageCount}
              </span>
              <button
                onClick={() =>
                  setFinishedGoodsPage((p) => Math.min(finishedGoodsPageCount - 1, p + 1))
                }
                disabled={finishedGoodsPage >= finishedGoodsPageCount - 1}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                style={{
                  background:
                    finishedGoodsPage >= finishedGoodsPageCount - 1 ? undefined : ACCENT,
                }}
              >
                Next
              </button>
            </div>
          )}

          <p className="text-sm text-gray-400 mt-3">
            Consider logging a new Work Order for these products.
          </p>
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <h2 className="text-base font-semibold text-gray-800 mb-4">Recent activity</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-gray-400">No production activity for {rangeLabel}.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    a.type === "output"
                      ? "bg-emerald-600"
                      : a.type === "delivery"
                        ? "bg-indigo-500"
                        : "bg-amber-500"
                  }`}
                />
                <div>
                  <p className="text-sm text-gray-700 leading-snug">{a.text}</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(a.time).toLocaleString()}
                  </p>
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