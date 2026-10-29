import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Package,
  Boxes,
  Megaphone,
  Factory,
  TrendingUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../api/supabase";
import Greetings from "../Components/Greetings";

/* ── Design tokens ─ */
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

const CAMPAIGN_STATUS_STYLES = {
  Upcoming: { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder },
  Active: { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder },
  Ended: { color: "#6B7280", backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  Cancelled: { color: "#9CA3AF", backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },
};

const WO_STATUS_STYLES = {
  Pending: { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder },
  "In Progress": { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder },
  Completed: { color: "#6B7280", backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  Cancelled: { color: "#9CA3AF", backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },
};

const MATERIAL_STATUS_STYLES = {
  "In Stock": { color: C.success, backgroundColor: C.successSoft },
  "Low Stock": { color: C.warning, backgroundColor: C.warningSoft },
  "Out of Stock": { color: C.accent, backgroundColor: C.accentSoft },
};

// Chart colors. Red stays reserved for alerts; everything else uses neutral or semantic colors.
const PLATFORM_COLORS = { Shopee: "#EE4D2D", Lazada: "#0F146D", TikTok: "#101113", Other: "#9CA3AF" };
const CATEGORY_COLORS = { Men: "#1D4E89", Women: "#8B2976", Unisex: "#475569" };
const STOCK_STATUS_HEX = { "In Stock": "#15803D", "Low Stock": "#D97706", "Out of Stock": "#B3211B" };
const CAMPAIGN_HEX = { Active: "#15803D", Upcoming: "#D97706", Ended: "#9CA3AF", Cancelled: "#D1D5DB" };
const WO_HEX = { Pending: "#D97706", "In Progress": "#2563EB", Completed: "#059669", Cancelled: "#9CA3AF" };
const SUPPLIER_COLORS = ["#0E7490", "#92400E", "#166534", "#9F1239", "#1E3A8A", "#57534E"];

const PAGE_SIZE = 5;
const FETCH_CHUNK = 1000; // Supabase returns at most 1000 rows per request

/* Fetch every row of a query, paging past the 1000-row cap.
   buildQuery must return a fresh query (with a stable order) on each call. */
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

function localDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstOfMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function focusDateInput(e) {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
}

function blurDateInput(e) {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
}

const fmtPeso = (pesos) =>
  `₱${(pesos ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;
const centsToPesos = (c) => Math.max(0, toNumber(c)) / 100;

const orderDate = (o) => o.completed_at || o.created_at || o.paid_time;

const isLowStockProduct = (item) => {
  const total =
    stockValue(item.shopee_stock) +
    stockValue(item.lazada_stock) +
    stockValue(item.tiktok_stock);
  return total <= 5;
};

function deriveCampaignStatus(campaign) {
  if (campaign.status === "Cancelled") return "Cancelled";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = toDate(campaign.start_date);
  const end = toDate(campaign.end_date);
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);
  if (end && today > end) return "Ended";
  if (start && today < start) return "Upcoming";
  return "Active";
}

function getStartOfWeek(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketWeeklySales(orders) {
  const buckets = {};
  orders.forEach((o) => {
    const date = toDate(orderDate(o));
    if (!date) return;
    const start = getStartOfWeek(date);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    if (!buckets[key]) {
      buckets[key] = {
        label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        sortKey: start.getTime(),
        value: 0,
      };
    }
    buckets[key].value += centsToPesos(o.total_amount);
  });
  return Object.values(buckets)
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-8);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stockValue(value) {
  return Math.max(0, toNumber(value));
}

// Same date-boundary helpers used by Sales Dashboard
const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

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

function platformName(value) {
  const key = String(value || "").toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return "Other";
}

function bucketWeeklyUnits(workOrders) {
  const buckets = {};
  workOrders.forEach((wo) => {
    const date = toDate(wo.completed_at || wo.created_at);
    if (!date) return;
    const start = getStartOfWeek(date);
    const key = start.getTime();
    if (!buckets[key]) {
      buckets[key] = {
        name: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        sortKey: key,
        value: 0,
        color: C.accent,
      };
    }
    buckets[key].value += toNumber(wo.quantity);
  });
  return Object.values(buckets)
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-6);
}

/* Small donut with a value legend. data: [{ name, value, color }] */
function DonutWithLegend({ data, height = 150, formatter = (v) => Number(v).toLocaleString(), inline = false }) {
  if (!data || data.length === 0) return <EmptyRow>No data.</EmptyRow>;
  return (
    <div className={inline ? "flex items-center gap-4" : ""}>
      <div className={inline ? "w-1/2 shrink-0" : ""}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={Math.round(height * 0.28)}
              outerRadius={Math.round(height * 0.44)}
              paddingAngle={3}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [formatter(v), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className={`space-y-1 ${inline ? "flex-1" : "mt-2"}`}>
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between text-sm gap-2">
            <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: entry.color }} />
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="font-medium text-gray-700 shrink-0">{formatter(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Small column chart (values show in the tooltip). data: [{ name, value, color }] */
function MiniBar({ data, height = 150, formatter = (v) => Number(v).toLocaleString() }) {
  if (!data || data.length === 0) return <EmptyRow>No data.</EmptyRow>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "#374151" }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis hide />
        <Tooltip formatter={(v) => formatter(v)} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={38}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color || C.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = items.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  return { page: currentPage, setPage, totalPages, pageItems };
}

function Skeleton({ className = "h-9 w-24" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, loading, tone = "gray" }) {
  const toneColor =
    tone === "green" ? C.success : tone === "red" ? C.accent : tone === "amber" ? C.warning : C.text;
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-3xl font-semibold mt-1" style={{ color: toneColor }}>
          {value}
        </p>
      )}
      {sub && <p className="text-sm mt-1 text-gray-400">{sub}</p>}
    </Card>
  );
}

function SectionCard({ title, icon: Icon, onView, children, wide }) {
  return (
    <Card className={`p-6 flex flex-col ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
          <Icon size={20} style={{ color: C.accent }} />
          {title}
        </h2>
        {onView && (
          <button
            onClick={onView}
            className="text-sm font-medium flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: C.accent }}
          >
            View all <ArrowRight size={17} />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </Card>
  );
}

function EmptyRow({ children }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>;
}

function PaginationBar({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
      >
        <ChevronLeft size={18} /> Prev
      </button>
      <span className="text-sm text-gray-400">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page === totalPages - 1}
        className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
      >
        Next <ChevronRight size={18} />
      </button>
    </div>
  );
}

function StatusChip({ label, style }) {
  return (
    <span className="shrink-0 px-2 py-0.5 rounded-md text-sm font-medium border" style={style}>
      {label}
    </span>
  );
}

function Admin() {
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [accountBalances, setAccountBalances] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  const [dateFrom, setDateFrom] = useState(firstOfMonthKey);
  const [dateTo, setDateTo] = useState(localDateKey);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  const goTo = useCallback((path) => navigate(`/${path}`), [navigate]);

  const loadDashboard = useCallback(
    async (isInitial = false) => {
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        setErrorMsg("Invalid date range.");
        setLoading(false);
        return;
      }

      if (isInitial) setLoading(true);
      setErrorMsg("");

      const [
        ledgerRes,
        productsRes,
        materialsRes,
        campaignsRes,
        ordersRes,
        workOrdersRes,
        balancesRes,
      ] = await Promise.all([
        // Paged: ledger entries can pass 1000 rows in a wide date range
        fetchAllPages(() =>
          supabase
            .from("ledger_entries")
            .select("date, type, amount, ledger_categories(name, classification)")
            .gte("date", dateFrom)
            .lte("date", dateTo)
            .eq("archived", false)
            .order("id", { ascending: true }) // stable order across pages
        ),
        supabase
          .from("inventory")
          .select("id, product_name, category, shopee_stock, lazada_stock, tiktok_stock, stock")
          .eq("archived", false),
        supabase
          .from("raw_materials")
          .select("id, material_name, category, current_stock, status, suppliers(name)"),
        supabase
          .from("campaigns")
          .select("id, name, platform, discount_type, discount_value, start_date, end_date, status"),
        // Paged: this was the bug. A plain query stops at 1000 rows.
        fetchAllPages(() =>
          supabase
            .from("orders")
            .select("id, platform, total_amount, completed_at, created_at, paid_time, status")
            .eq("status", "COMPLETED")
            .order("id", { ascending: true }) // stable order across pages
        ),
        // Paged: work orders have no filter, so they grow forever
        fetchAllPages(() =>
          supabase
            .from("work_orders")
            .select(
              "id, wo_number, product_name, quantity, platform, status, due_date, completed_at, created_at"
            )
            .order("id", { ascending: true }) // stable order across pages
        ),
        supabase.rpc("account_balances", { p_from: dateFrom, p_to: dateTo }),
      ]);

      const failures = [
        ["ledger", ledgerRes.error],
        ["inventory", productsRes.error],
        ["raw materials", materialsRes.error],
        ["campaigns", campaignsRes.error],
        ["orders", ordersRes.error],
        ["work orders", workOrdersRes.error],
        ["account balances", balancesRes.error],
      ].filter(([, err]) => err);

      if (failures.length > 0) {
        setErrorMsg(`Some data failed to load: ${failures.map(([name]) => name).join(", ")}.`);
      }

      setLedgerEntries((ledgerRes.data || []).filter((e) => e?.date));
      setAccountBalances(balancesRes.data || []);
      setProducts(productsRes.data || []);
      setMaterials(materialsRes.data || []);
      setCampaigns(campaignsRes.data || []);
      setOrders((ordersRes.data || []).filter((o) => toDate(orderDate(o))));
      setWorkOrders(workOrdersRes.data || []);

      setLoading(false);
    },
    [dateFrom, dateTo]
  );

  useEffect(() => {
    loadDashboard(true);

    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, () =>
        loadDashboard(false)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () =>
        loadDashboard(false)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_materials" }, () =>
        loadDashboard(false)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () =>
        loadDashboard(false)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        loadDashboard(false)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () =>
        loadDashboard(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadDashboard]);

  // True P&L (RPC returns cents → convert to pesos)
  const financeStats = useMemo(() => {
    const rows = (accountBalances || [])
      .filter((r) => r.name && r.classification)
      .map((r) => ({
        classification: String(r.classification).toLowerCase(),
        debit: toNumber(r.debit),
        credit: toNumber(r.credit),
      }));

    const revenue =
      rows
        .filter((r) => r.classification === "revenue")
        .reduce((sum, r) => sum + (r.debit - r.credit), 0) / 100;

    const expenses =
      rows
        .filter((r) => r.classification === "expense")
        .reduce((sum, r) => sum + (r.credit - r.debit), 0) / 100;

    return { revenue, expenses, net: revenue - expenses };
  }, [accountBalances]);

  // Monthly chart: only revenue & expense categories (cents → pesos)
  const monthlyNet = useMemo(() => {
    const map = {};
    ledgerEntries.forEach((e) => {
      const classification = e.ledger_categories?.classification?.toLowerCase();
      if (classification !== "revenue" && classification !== "expense") return;

      const key = e.date?.slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { month: key, expenses: 0, revenue: 0 };

      const amount = Math.max(0, toNumber(e.amount)) / 100;

      if (classification === "revenue") {
        map[key].revenue += e.type === "debit" ? amount : -amount;
      } else {
        map[key].expenses += e.type === "credit" ? amount : -amount;
      }
    });

    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        net: m.revenue - m.expenses,
        label: new Date(`${m.month}-01T00:00:00`).toLocaleDateString(undefined, {
          month: "short",
        }),
      }));
  }, [ledgerEntries]);

  const productStats = useMemo(() => {
    const totalStock = products.reduce(
      (s, p) =>
        s +
        stockValue(p.shopee_stock) +
        stockValue(p.lazada_stock) +
        stockValue(p.tiktok_stock),
      0
    );
    const low = products.filter(isLowStockProduct).sort((a, b) => {
      const ta =
        stockValue(a.shopee_stock) +
        stockValue(a.lazada_stock) +
        stockValue(a.tiktok_stock);
      const tb =
        stockValue(b.shopee_stock) +
        stockValue(b.lazada_stock) +
        stockValue(b.tiktok_stock);
      return ta - tb;
    });
    const productTotal = (p) =>
      stockValue(p.shopee_stock) + stockValue(p.lazada_stock) + stockValue(p.tiktok_stock);
    const platformStock = [
      { name: "Shopee", value: products.reduce((s, p) => s + stockValue(p.shopee_stock), 0), color: PLATFORM_COLORS.Shopee },
      { name: "Lazada", value: products.reduce((s, p) => s + stockValue(p.lazada_stock), 0), color: PLATFORM_COLORS.Lazada },
      { name: "TikTok", value: products.reduce((s, p) => s + stockValue(p.tiktok_stock), 0), color: PLATFORM_COLORS.TikTok },
    ].filter((x) => x.value > 0);
    const categoryMap = {};
    products.forEach((p) => {
      const c = p.category || "Uncategorized";
      categoryMap[c] = (categoryMap[c] || 0) + productTotal(p);
    });
    const categoryStock = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] || "#6B7280" }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    return { count: products.length, totalStock, low, platformStock, categoryStock };
  }, [products]);

  const materialStats = useMemo(() => {
    const low = materials.filter((m) => m.status === "Low Stock");
    const out = materials.filter((m) => m.status === "Out of Stock");
    const litres = materials.reduce((sum, m) => sum + stockValue(m.current_stock), 0);
    const statusData = ["In Stock", "Low Stock", "Out of Stock"]
      .map((name) => ({
        name,
        value: materials.filter((m) => (m.status || "In Stock") === name).length,
        color: STOCK_STATUS_HEX[name],
      }))
      .filter((x) => x.value > 0);
    const supplierMap = {};
    materials.forEach((m) => {
      const n = m.suppliers?.name || "No supplier";
      supplierMap[n] = (supplierMap[n] || 0) + stockValue(m.current_stock);
    });
    const supplierData = Object.entries(supplierMap)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
      .map((x, i) => ({ ...x, color: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length] }));
    return { count: materials.length, low, out, attention: [...out, ...low], litres, statusData, supplierData };
  }, [materials]);

  const lowStockAlertCount =
    productStats.low.length + materialStats.low.length + materialStats.out.length;

  const campaignStats = useMemo(() => {
    const withStatus = campaigns.map((c) => ({
      ...c,
      _status: deriveCampaignStatus(c),
    }));
    const active = withStatus
      .filter((c) => c._status === "Active" || c._status === "Upcoming")
      .sort((a, b) => {
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return new Date(a.end_date) - new Date(b.end_date);
      });
    const statusData = ["Active", "Upcoming", "Ended", "Cancelled"]
      .map((name) => ({
        name,
        value: withStatus.filter((c) => c._status === name).length,
        color: CAMPAIGN_HEX[name],
      }))
      .filter((x) => x.value > 0);
    return { activeCount: active.length, active: active.slice(0, 4), statusData };
  }, [campaigns]);

  // Sales: same date-boundary logic as Sales Dashboard
  const salesStats = useMemo(() => {
    const fromTime = localDateBoundary(dateFrom);
    const toTime = localDateBoundary(dateTo, true);

    const rangeOrders = orders.filter((o) => {
      const raw = orderDate(o);
      if (!raw) return false;
      const t = safeDate(raw)?.getTime();
      if (t == null) return false;
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t > toTime) return false;
      return true;
    });

    const total = rangeOrders.reduce((s, o) => s + centsToPesos(o.total_amount), 0);
    const avgOrder = rangeOrders.length > 0 ? total / rangeOrders.length : 0;
    const trend = bucketWeeklySales(rangeOrders);

    const platformMap = {};
    rangeOrders.forEach((o) => {
      const name = platformName(o.platform);
      platformMap[name] = (platformMap[name] || 0) + centsToPesos(o.total_amount);
    });
    const byPlatform = Object.entries(platformMap)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: PLATFORM_COLORS[name] }))
      .sort((a, b) => b.value - a.value);

    return {
      total,
      avgOrder,
      ordersCount: rangeOrders.length,
      trend,
      byPlatform,
    };
  }, [orders, dateFrom, dateTo]);

  const productionStats = useMemo(() => {
    const active = workOrders.filter(
      (wo) => wo.status === "Pending" || wo.status === "In Progress"
    );
    const dueSoon = active
      .filter((wo) => wo.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 5);

    const completed = workOrders.filter((wo) => wo.status === "Completed");
    const completedInRange = completed.filter((wo) => {
      const d = wo.completed_at || wo.created_at;
      const day = d && d.slice(0, 10);
      return day && day >= dateFrom && day <= dateTo;
    });
    const unitsFinished = completedInRange.reduce((s, wo) => s + (wo.quantity || 0), 0);
    const statusData = ["Pending", "In Progress", "Completed", "Cancelled"]
      .map((name) => ({
        name,
        value: workOrders.filter((wo) => wo.status === name).length,
        color: WO_HEX[name],
      }))
      .filter((x) => x.value > 0);
    const weeklyUnits = bucketWeeklyUnits(completedInRange);

    return {
      activeCount: active.length,
      pendingCount: workOrders.filter((wo) => wo.status === "Pending").length,
      inProgressCount: workOrders.filter((wo) => wo.status === "In Progress").length,
      dueSoon,
      unitsFinished,
      finishedOrdersCount: completedInRange.length,
      statusData,
      weeklyUnits,
    };
  }, [workOrders, dateFrom, dateTo]);

  const lowStockProductsPage = usePagination(productStats.low);
  const materialsAttentionPage = usePagination(materialStats.attention);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4">
        <Greetings/>
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusDateInput}
                onBlur={blurDateInput}
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusDateInput}
                onBlur={blurDateInput}
              />
            </div>
          </div>
        </Card>

        {errorMsg && (
          <div
            className="rounded-md border px-4 py-4 text-sm"
            style={{ backgroundColor: C.warningSoft, borderColor: C.warningBorder, color: C.warning }}
          >
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Sales"
            value={fmtPeso(salesStats.total)}
            sub={`${salesStats.ordersCount} completed orders`}
            loading={loading}
          />
          <KpiCard
            label={financeStats.net >= 0 ? "Net income" : "Net loss"}
            value={fmtPeso(Math.abs(financeStats.net))}
            sub={`${fmtPeso(financeStats.expenses)} expenses · ${fmtPeso(financeStats.revenue)} revenue`}
            loading={loading}
            tone={financeStats.net >= 0 ? "green" : "red"}
          />
          <KpiCard
            label="Low stock alerts"
            value={lowStockAlertCount.toLocaleString()}
            sub={`${productStats.low.length} products · ${materialStats.low.length + materialStats.out.length} materials`}
            loading={loading}
            tone={lowStockAlertCount > 0 ? "amber" : "gray"}
          />
          <KpiCard
            label="Active work orders"
            value={productionStats.activeCount.toLocaleString()}
            sub={`${productionStats.pendingCount} pending · ${productionStats.inProgressCount} in progress`}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Finance */}
          <SectionCard wide title="Finance" icon={TrendingUp} onView={() => goTo("finance")}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-sm text-gray-400">Expenses</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{fmtPeso(financeStats.expenses)}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-400">Revenue</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{fmtPeso(financeStats.revenue)}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-400">{financeStats.net >= 0 ? "Net income" : "Net loss"}</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-xl font-semibold" style={{ color: financeStats.net >= 0 ? C.success : C.accent }}>
                    {fmtPeso(Math.abs(financeStats.net))}
                  </p>
                )}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : monthlyNet.length === 0 ? (
              <EmptyRow>No ledger entries in the selected range.</EmptyRow>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyNet} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: "#000000" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: "#000000" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                  <Tooltip formatter={(v) => fmtPeso(v)} labelFormatter={(l) => `Net: ${l}`} />
                  <Bar dataKey="net" radius={[4, 4, 4, 4]}>
                    {monthlyNet.map((m, i) => (
                      <Cell key={i} fill={m.net >= 0 ? C.success : C.accent} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Sales */}
          <SectionCard title="Sales: finished products" icon={TrendingUp} onView={() => goTo("sales_db")}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-sm text-gray-400">In range</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{fmtPeso(salesStats.total)}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-400">Avg order value</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{fmtPeso(salesStats.avgOrder)}</p>}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : salesStats.trend.length === 0 ? (
              <EmptyRow>No completed orders in the selected range.</EmptyRow>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={salesStats.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: "#000000" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: "#000000" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                  <Tooltip formatter={(v) => fmtPeso(v)} />
                  <Area type="monotone" dataKey="value" stroke={C.accent} strokeWidth={2} fill="url(#adminSalesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {!loading && salesStats.byPlatform.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-500 mb-2">Sales by platform</p>
                <DonutWithLegend data={salesStats.byPlatform} formatter={fmtPeso} height={150} inline />
              </div>
            )}
          </SectionCard>

          {/* Inventory: products */}
          <SectionCard title="Inventory: finished products" icon={Package} onView={() => goTo("inventory")}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-sm text-gray-400">Products</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{productStats.count.toLocaleString()}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-400">Total stock (all platforms)</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{productStats.totalStock.toLocaleString()}</p>}
              </div>
            </div>
            {!loading && (productStats.platformStock.length > 0 || productStats.categoryStock.length > 0) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Stock by platform</p>
                  <DonutWithLegend data={productStats.platformStock} height={150} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Stock by category</p>
                  <MiniBar data={productStats.categoryStock} height={150} />
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : productStats.low.length === 0 ? (
              <EmptyRow>Nothing is low on stock.</EmptyRow>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {lowStockProductsPage.pageItems.map((p) => {
                    const total =
                      stockValue(p.shopee_stock) +
                      stockValue(p.lazada_stock) +
                      stockValue(p.tiktok_stock);
                    return (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate pr-2">{p.product_name}</span>
                        <StatusChip
                          label={`${total.toLocaleString()} left`}
                          style={{ color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }}
                        />
                      </li>
                    );
                  })}
                </ul>
                <PaginationBar
                  page={lowStockProductsPage.page}
                  totalPages={lowStockProductsPage.totalPages}
                  onPrev={() => lowStockProductsPage.setPage((p) => Math.max(0, p - 1))}
                  onNext={() =>
                    lowStockProductsPage.setPage((p) =>
                      Math.min(lowStockProductsPage.totalPages - 1, p + 1)
                    )
                  }
                />
              </>
            )}
          </SectionCard>

          {/* Inventory: materials */}
          <SectionCard title="Inventory: raw materials" icon={Boxes} onView={() => goTo("production_rm")}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-sm text-gray-400">Materials tracked</p>
                {loading ? <Skeleton /> : <p className="text-xl font-semibold text-gray-900">{materialStats.count.toLocaleString()}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-400">Total volume</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-xl font-semibold text-gray-900">
                    {materialStats.litres.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-400">Needs attention</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-xl font-semibold text-gray-900">
                    {(materialStats.low.length + materialStats.out.length).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {!loading && materialStats.count > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Stock status</p>
                  <DonutWithLegend data={materialStats.statusData} height={150} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Volume by supplier (L)</p>
                  <MiniBar
                    data={materialStats.supplierData}
                    height={150}
                    formatter={(v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })} L`}
                  />
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : materialStats.attention.length === 0 ? (
              <EmptyRow>All raw materials are in stock.</EmptyRow>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {materialsAttentionPage.pageItems.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate pr-2">{m.material_name}</span>
                      <StatusChip
                        label={`${Number(m.current_stock).toLocaleString(undefined, { maximumFractionDigits: 1 })} L`}
                        style={MATERIAL_STATUS_STYLES[m.status] || {}}
                      />
                    </li>
                  ))}
                </ul>
                <PaginationBar
                  page={materialsAttentionPage.page}
                  totalPages={materialsAttentionPage.totalPages}
                  onPrev={() => materialsAttentionPage.setPage((p) => Math.max(0, p - 1))}
                  onNext={() =>
                    materialsAttentionPage.setPage((p) =>
                      Math.min(materialsAttentionPage.totalPages - 1, p + 1)
                    )
                  }
                />
              </>
            )}
          </SectionCard>

          {/* Marketing */}
          <SectionCard title="Marketing campaigns" icon={Megaphone} onView={() => goTo("marketing")}>
            <div className="mb-4">
              <p className="text-sm text-gray-400">Active / upcoming</p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className="text-xl font-semibold text-gray-900">
                  {campaignStats.activeCount.toLocaleString()}
                </p>
              )}
            </div>
            {!loading && campaignStats.statusData.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-500 mb-1">Campaigns by status</p>
                <DonutWithLegend data={campaignStats.statusData} height={150} inline />
              </div>
            )}

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : campaignStats.active.length === 0 ? (
              <EmptyRow>No active or upcoming campaigns.</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {campaignStats.active.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <p className="text-gray-700 font-medium truncate">{c.name}</p>
                      <p className="text-gray-400">
                        {c.platform}
                        {c.end_date ? ` · ends ${new Date(c.end_date).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <StatusChip label={c._status} style={CAMPAIGN_STATUS_STYLES[c._status] || {}} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Production */}
          <SectionCard wide title="Production" icon={Factory} onView={() => goTo("production_wo")}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-sm text-gray-400">Units finished</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-xl font-semibold text-gray-900">
                    {productionStats.unitsFinished.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-400">Work orders completed</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-xl font-semibold text-gray-900">
                    {productionStats.finishedOrdersCount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {!loading && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Work orders by status</p>
                  <DonutWithLegend data={productionStats.statusData} height={150} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Units finished per week</p>
                  <MiniBar data={productionStats.weeklyUnits} height={150} />
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-1">Due soon</p>
                {productionStats.dueSoon.length === 0 ? (
                  <EmptyRow>No active work orders with a due date.</EmptyRow>
                ) : (
                  <ul className="space-y-1.5">
                    {productionStats.dueSoon.map((wo) => (
                      <li key={wo.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate pr-2">
                          {wo.wo_number} · {wo.product_name}
                        </span>
                        <StatusChip
                          label={wo.due_date ? new Date(wo.due_date).toLocaleDateString() : "No date"}
                          style={WO_STATUS_STYLES[wo.status] || {}}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default Admin;