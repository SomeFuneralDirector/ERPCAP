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
} from "recharts";
import {
  Package,
  Boxes,
  Megaphone,
  Factory,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens — shared with Inventory / Sales / Marketing / Finance ─ */
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

const CAMPAIGN_STATUS_STYLES = {
  Upcoming: {
    color: C.warning,
    backgroundColor: C.warningSoft,
    borderColor: C.warningBorder,
  },
  Active: {
    color: C.accent,
    backgroundColor: C.accentSoft,
    borderColor: C.accentSoftBorder,
  },
  Ended: {
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  Cancelled: {
    color: "#9CA3AF",
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
};

const WO_STATUS_STYLES = {
  Pending: {
    color: C.warning,
    backgroundColor: C.warningSoft,
    borderColor: C.warningBorder,
  },
  "In Progress": {
    color: C.accent,
    backgroundColor: C.accentSoft,
    borderColor: C.accentSoftBorder,
  },
  Completed: {
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  Cancelled: {
    color: "#9CA3AF",
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
};

const MATERIAL_STATUS_STYLES = {
  "In Stock": {
    color: C.success,
    backgroundColor: C.successSoft,
  },
  "Low Stock": {
    color: C.warning,
    backgroundColor: C.warningSoft,
  },
  "Out of Stock": {
    color: C.accent,
    backgroundColor: C.accentSoft,
  },
};

const PAGE_SIZE = 5;

const fmtPeso = (pesos) =>
  `₱${(pesos ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;
const centsToPesos = (c) => Math.max(0, toNumber(c)) / 100;

const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = p.toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return p;
};

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

function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = items.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );
  return { page: currentPage, setPage, totalPages, pageItems };
}

function Skeleton({ className = "h-7 w-20" }) {
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
      onMouseEnter={(e) => {
        if (!props.disabled) e.currentTarget.style.backgroundColor = C.accentHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = C.accent;
      }}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value, sub, loading, tone = "gray" }) {
  const toneColor =
    tone === "green"
      ? C.success
      : tone === "red"
        ? C.accent
        : tone === "amber"
          ? C.warning
          : C.text;
  return (
    <Card className="p-4">
      <p className="text-xs text-gray-500">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-semibold mt-1" style={{ color: toneColor }}>
          {value}
        </p>
      )}
      {sub && <p className="text-xs mt-1 text-gray-400">{sub}</p>}
    </Card>
  );
}

function SectionCard({ title, icon: Icon, onView, children }) {
  return (
    <Card className="p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Icon size={16} style={{ color: C.accent }} />
          {title}
        </h2>
        {onView && (
          <button
            onClick={onView}
            className="text-xs font-medium flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: C.accent }}
          >
            View all <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </Card>
  );
}

function EmptyRow({ children }) {
  return <p className="text-xs text-gray-400 py-2">{children}</p>;
}

function PaginationBar({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="text-xs text-gray-400">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page === totalPages - 1}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}

function StatusChip({ label, style }) {
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border"
      style={style}
    >
      {label}
    </span>
  );
}

function Admin() {
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  // Date range — same pattern as the Finance and Ledger pages, so every
  // period-based figure on this dashboard moves together with those pages.
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const navigate = useNavigate();

  const goTo = useCallback(
    (path) => {
      navigate(`/${path}`);
    },
    [navigate]
  );

  const loadDashboard = useCallback(
    async (isInitial = false) => {
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        setErrorMsg("Invalid date range.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setErrorMsg("");

      const [ledgerRes, productsRes, materialsRes, campaignsRes, ordersRes, workOrdersRes] =
        await Promise.all([
          supabase
            .from("ledger_entries")
            .select("date, type, amount")
            .gte("date", dateFrom)
            .lte("date", dateTo),
          supabase
            .from("inventory")
            .select("id, product_name, category, shopee_stock, lazada_stock, tiktok_stock, stock"),
          supabase
            .from("raw_materials")
            .select("id, material_name, category, current_stock, unit, status"),
          supabase
            .from("campaigns")
            .select("id, name, platform, discount_type, discount_value, start_date, end_date, status"),
          supabase
            .from("orders")
            .select("id, platform, total_amount, completed_at, created_at, paid_time, status")
            .eq("status", "COMPLETED"),
          supabase
            .from("work_orders")
            .select(
              "id, wo_number, product_name, quantity, platform, status, due_date, completed_at, created_at"
            ),
        ]);

      const failures = [
        ["ledger", ledgerRes.error],
        ["inventory", productsRes.error],
        ["raw materials", materialsRes.error],
        ["campaigns", campaignsRes.error],
        ["orders", ordersRes.error],
        ["work orders", workOrdersRes.error],
      ].filter(([, err]) => err);

      if (failures.length > 0) {
        setErrorMsg(
          `Some data failed to load: ${failures.map(([name]) => name).join(", ")}.`
        );
      }

      setLedgerEntries((ledgerRes.data || []).filter((e) => e?.date));
      setProducts(productsRes.data || []);
      setMaterials(materialsRes.data || []);
      setCampaigns(campaignsRes.data || []);
      setOrders((ordersRes.data || []).filter((o) => toDate(orderDate(o))));
      setWorkOrders(workOrdersRes.data || []);

      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
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

  // Ledger convention — matches the Finance page: debit entries are
  // revenue, credit entries are expenses.
  const financeStats = useMemo(() => {
    const expenses =
      ledgerEntries
        .filter((e) => e.type === "credit")
        .reduce((s, e) => s + Math.max(0, toNumber(e.amount)), 0) / 100;
    const revenue =
      ledgerEntries
        .filter((e) => e.type === "debit")
        .reduce((s, e) => s + Math.max(0, toNumber(e.amount)), 0) / 100;
    return { expenses, revenue, net: revenue - expenses };
  }, [ledgerEntries]);

  const monthlyNet = useMemo(() => {
    const map = {};
    ledgerEntries.forEach((e) => {
      const key = e.date?.slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { month: key, expenses: 0, revenue: 0 };
      const amount = Math.max(0, toNumber(e.amount)) / 100;
      if (e.type === "credit") map[key].expenses += amount;
      else if (e.type === "debit") map[key].revenue += amount;
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
    return { count: products.length, totalStock, low };
  }, [products]);

  const materialStats = useMemo(() => {
    const low = materials.filter((m) => m.status === "Low Stock");
    const out = materials.filter((m) => m.status === "Out of Stock");
    const attention = [...out, ...low];
    return { count: materials.length, low, out, attention };
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
    return { activeCount: active.length, active: active.slice(0, 4) };
  }, [campaigns]);

  const salesStats = useMemo(() => {
    const rangeOrders = orders.filter((o) => {
      const d = orderDate(o);
      const day = d && d.slice(0, 10);
      return day && day >= dateFrom && day <= dateTo;
    });
    const total = rangeOrders.reduce((s, o) => s + centsToPesos(o.total_amount), 0);
    const avgOrder = rangeOrders.length > 0 ? total / rangeOrders.length : 0;
    const trend = bucketWeeklySales(rangeOrders);
    return { total, avgOrder, ordersCount: rangeOrders.length, trend };
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
    const recentlyFinished = [...completedInRange]
      .sort(
        (a, b) =>
          new Date(b.completed_at || b.created_at) -
          new Date(a.completed_at || a.created_at)
      )
      .slice(0, 5);

    return {
      activeCount: active.length,
      pendingCount: workOrders.filter((wo) => wo.status === "Pending").length,
      inProgressCount: workOrders.filter((wo) => wo.status === "In Progress").length,
      dueSoon,
      unitsFinished,
      finishedOrdersCount: completedInRange.length,
      recentlyFinished,
    };
  }, [workOrders, dateFrom, dateTo]);

  const lowStockProductsPage = usePagination(productStats.low);
  const materialsAttentionPage = usePagination(materialStats.attention);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
            {lastUpdated && !loading && (
              <p className="text-xs text-gray-400 mt-0.5">
                Updated{" "}
                {lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
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
            <PrimaryButton
              onClick={() => loadDashboard(false)}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? "Loading…" : "Refresh"}
            </PrimaryButton>
          </div>
        </Card>

        {errorMsg && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.warningSoft,
              borderColor: C.warningBorder,
              color: C.warning,
            }}
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
          <SectionCard title="Finance" icon={TrendingUp} onView={() => goTo("finance")}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">Expenses</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {fmtPeso(financeStats.expenses)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">Revenue</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {fmtPeso(financeStats.revenue)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">
                  {financeStats.net >= 0 ? "Net income" : "Net loss"}
                </p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p
                    className="text-lg font-semibold"
                    style={{ color: financeStats.net >= 0 ? C.success : C.accent }}
                  >
                    {fmtPeso(Math.abs(financeStats.net))}
                  </p>
                )}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : monthlyNet.length === 0 ? (
              <EmptyRow>No ledger entries in the selected range.</EmptyRow>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyNet} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#000000" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#000000" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtAxis}
                  />
                  <Tooltip formatter={(v) => fmtPeso(v)} labelFormatter={(l) => `Net — ${l}`} />
                  <Bar dataKey="net" radius={[4, 4, 4, 4]}>
                    {monthlyNet.map((m, i) => (
                      <Cell key={i} fill={m.net >= 0 ? C.success : C.accent} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard
            title="Sales — finished products"
            icon={TrendingUp}
            onView={() => goTo("sales_db")}
          >
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">In range</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {fmtPeso(salesStats.total)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">Avg order value</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {fmtPeso(salesStats.avgOrder)}
                  </p>
                )}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : salesStats.trend.length === 0 ? (
              <EmptyRow>No completed orders in the selected range.</EmptyRow>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart
                  data={salesStats.trend}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="adminSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#000000" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#000000" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtAxis}
                  />
                  <Tooltip formatter={(v) => fmtPeso(v)} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={C.accent}
                    strokeWidth={2}
                    fill="url(#adminSalesFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard
            title="Inventory — finished products"
            icon={Package}
            onView={() => goTo("inventory")}
          >
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">Products</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {productStats.count.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">Total stock (all platforms)</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {productStats.totalStock.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
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
                      <li key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate pr-2">{p.product_name}</span>
                        <StatusChip
                          label={`${total.toLocaleString()} left`}
                          style={{
                            color: C.accent,
                            backgroundColor: C.accentSoft,
                            borderColor: C.accentSoftBorder,
                          }}
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

          <SectionCard
            title="Inventory — raw materials"
            icon={Boxes}
            onView={() => goTo("production_rm")}
          >
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">Materials tracked</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {materialStats.count.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">Needs attention</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {(materialStats.low.length + materialStats.out.length).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : materialStats.attention.length === 0 ? (
              <EmptyRow>All raw materials are in stock.</EmptyRow>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {materialsAttentionPage.pageItems.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate pr-2">{m.material_name}</span>
                      <StatusChip
                        label={`${Number(m.current_stock).toLocaleString()} ${m.unit}`}
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

          <SectionCard
            title="Marketing campaigns"
            icon={Megaphone}
            onView={() => goTo("marketing")}
          >
            <div className="mb-4">
              <p className="text-xs text-gray-400">Active / upcoming</p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className="text-lg font-semibold text-gray-900">
                  {campaignStats.activeCount.toLocaleString()}
                </p>
              )}
            </div>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : campaignStats.active.length === 0 ? (
              <EmptyRow>No active or upcoming campaigns.</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {campaignStats.active.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-xs gap-2">
                    <div className="min-w-0">
                      <p className="text-gray-700 font-medium truncate">{c.name}</p>
                      <p className="text-gray-400">
                        {c.platform}
                        {c.end_date
                          ? ` · ends ${new Date(c.end_date).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <StatusChip
                      label={c._status}
                      style={CAMPAIGN_STATUS_STYLES[c._status] || {}}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Production" icon={Factory} onView={() => goTo("production_wo")}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">Units finished</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {productionStats.unitsFinished.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400">Work orders completed</p>
                {loading ? (
                  <Skeleton />
                ) : (
                  <p className="text-lg font-semibold text-gray-900">
                    {productionStats.finishedOrdersCount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Due soon</p>
                  {productionStats.dueSoon.length === 0 ? (
                    <EmptyRow>No active work orders with a due date.</EmptyRow>
                  ) : (
                    <ul className="space-y-1.5">
                      {productionStats.dueSoon.map((wo) => (
                        <li key={wo.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 truncate pr-2">
                            {wo.wo_number} · {wo.product_name}
                          </span>
                          <StatusChip
                            label={
                              wo.due_date
                                ? new Date(wo.due_date).toLocaleDateString()
                                : "—"
                            }
                            style={WO_STATUS_STYLES[wo.status] || {}}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                    <CheckCircle2 size={12} style={{ color: C.success }} />
                    Recently finished
                  </p>
                  {productionStats.recentlyFinished.length === 0 ? (
                    <EmptyRow>Nothing completed in the selected range.</EmptyRow>
                  ) : (
                    <ul className="space-y-1.5">
                      {productionStats.recentlyFinished.map((wo) => (
                        <li key={wo.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 truncate pr-2">
                            {wo.wo_number} · {wo.product_name}
                          </span>
                          <span className="shrink-0 text-gray-500 font-medium">
                            {Number(wo.quantity).toLocaleString()} units
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default Admin;