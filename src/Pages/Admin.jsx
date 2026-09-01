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
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../api/supabase";

const PLATFORM_COLORS = { Shopee: "#EE4D2D", Lazada: "#7C3AED", TikTok: "#1f2937" };

const CAMPAIGN_STATUS_STYLES = {
  Upcoming: "bg-white text-red-600 border border-red-300",
  Active: "bg-red-500 text-white",
  Ended: "bg-gray-100 text-gray-600 border border-gray-300",
  Cancelled: "bg-gray-100 text-gray-400 border border-gray-300 line-through",
};

const WO_STATUS_STYLES = {
  Pending: "bg-white text-red-600 border border-red-300",
  "In Progress": "bg-red-500 text-white",
  Completed: "bg-gray-100 text-gray-600 border border-gray-300",
  Cancelled: "bg-gray-100 text-gray-400 border border-gray-300 line-through",
};

const MATERIAL_STATUS_STYLES = {
  "In Stock": "bg-green-100 text-green-700",
  "Low Stock": "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-red-100 text-red-700",
};

const PAGE_SIZE = 5;

const fmtPeso = (pesos) =>
  `₱${(pesos ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const total = stockValue(item.shopee_stock) + stockValue(item.lazada_stock) + stockValue(item.tiktok_stock);
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
  return Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey).slice(-8);
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

function startOfMonthISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
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
  const pageItems = items.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  return { page: currentPage, setPage, totalPages, pageItems };
}

function Skeleton({ className = "h-7 w-20" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse`} />;
}

function KpiCard({ label, value, sub, loading, tone = "gray" }) {
  const toneStyles = {
    gray: "text-gray-800",
    green: "text-green-600",
    red: "text-red-600",
    amber: "text-amber-600",
  };
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24 mt-1" />
      ) : (
        <p className={`text-2xl font-bold mt-1 ${toneStyles[tone]}`}>{value}</p>
      )}
      {sub && <p className="text-xs mt-1 text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, icon: Icon, onView, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Icon size={16} className="text-red-700" />
          {title}
        </h2>
        {onView && (
          <button
            onClick={onView}
            className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
          >
            View all <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function EmptyRow({ children }) {
  return <p className="text-xs text-gray-400 italic py-2">{children}</p>;
}

function PaginationBar({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 cursor-pointer"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="text-xs text-gray-400">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page === totalPages - 1}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 cursor-pointer"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}

function Admin({ onNavigate }) {
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

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
  

  const loadDashboard = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    setErrorMsg("");

    const sixMonthsAgo = new Date(new Date().setMonth(new Date().getMonth() - 6))
      .toISOString()
      .slice(0, 10);

    const [ledgerRes, productsRes, materialsRes, campaignsRes, ordersRes, workOrdersRes] =
      await Promise.all([
        supabase.from("ledger_entries").select("date, type, amount").gte("date", sixMonthsAgo),
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
          .select("id, wo_number, product_name, quantity, platform, status, due_date, completed_at, created_at"),
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
  }, []);

  useEffect(() => {
    loadDashboard(true);

    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, () => loadDashboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => loadDashboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_materials" }, () => loadDashboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => loadDashboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadDashboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => loadDashboard(false))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadDashboard]);

  const startOfMonth = useMemo(() => startOfMonthISO(), []);

  const financeMTD = useMemo(() => {
    const inRange = ledgerEntries.filter((e) => e.date >= startOfMonth);
    const debit = inRange
      .filter((e) => e.type === "debit")
      .reduce((s, e) => s + Math.max(0, toNumber(e.amount)), 0) / 100;
    const credit = inRange
      .filter((e) => e.type === "credit")
      .reduce((s, e) => s + Math.max(0, toNumber(e.amount)), 0) / 100;
    return { debit, credit, net: debit - credit };
  }, [ledgerEntries, startOfMonth]);

  const monthlyNet = useMemo(() => {
    const map = {};
    ledgerEntries.forEach((e) => {
      const key = e.date?.slice(0, 7);
      if (!key) return;
      if (!map[key]) map[key] = { month: key, debit: 0, credit: 0 };
      const amount = Math.max(0, toNumber(e.amount)) / 100;
      if (e.type === "debit") map[key].debit += amount;
      else if (e.type === "credit") map[key].credit += amount;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        net: m.debit - m.credit,
        label: new Date(`${m.month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" }),
      }));
  }, [ledgerEntries]);

  const productStats = useMemo(() => {
    const totalStock = products.reduce(
      (s, p) => s + stockValue(p.shopee_stock) + stockValue(p.lazada_stock) + stockValue(p.tiktok_stock),
      0
    );
    const low = products.filter(isLowStockProduct).sort((a, b) => {
      const ta = stockValue(a.shopee_stock) + stockValue(a.lazada_stock) + stockValue(a.tiktok_stock);
      const tb = stockValue(b.shopee_stock) + stockValue(b.lazada_stock) + stockValue(b.tiktok_stock);
      return ta - tb;
    });
    const platformTotals = ["Shopee", "Lazada", "TikTok"].map((platform) => ({
      platform,
      value:
        platform === "Shopee"
          ? products.reduce((s, p) => s + stockValue(p.shopee_stock), 0)
          : platform === "Lazada"
          ? products.reduce((s, p) => s + stockValue(p.lazada_stock), 0)
          : products.reduce((s, p) => s + stockValue(p.tiktok_stock), 0),
    }));
    return { count: products.length, totalStock, low, platformTotals };
  }, [products]);

  const materialStats = useMemo(() => {
    const low = materials.filter((m) => m.status === "Low Stock");
    const out = materials.filter((m) => m.status === "Out of Stock");
    const attention = [...out, ...low];
    return { count: materials.length, low, out, attention };
  }, [materials]);

  const lowStockAlertCount = productStats.low.length + materialStats.low.length + materialStats.out.length;

  const campaignStats = useMemo(() => {
    const withStatus = campaigns.map((c) => ({ ...c, _status: deriveCampaignStatus(c) }));
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
    const monthOrders = orders.filter((o) => {
      const d = orderDate(o);
      return d && d.slice(0, 10) >= startOfMonth;
    });
    const totalMTD = monthOrders.reduce((s, o) => s + centsToPesos(o.total_amount), 0);
    const avgOrder = monthOrders.length > 0 ? totalMTD / monthOrders.length : 0;

    const platformMap = {};
    monthOrders.forEach((o) => {
      const p = normalizePlatform(o.platform);
      platformMap[p] = (platformMap[p] || 0) + centsToPesos(o.total_amount);
    });
    const platformTotals = Object.entries(platformMap)
      .map(([platform, amount]) => ({ platform, amount, color: PLATFORM_COLORS[platform] ?? "#6b7280" }))
      .sort((a, b) => b.amount - a.amount);

    const trend = bucketWeeklySales(orders);

    return { totalMTD, avgOrder, ordersCount: monthOrders.length, platformTotals, trend };
  }, [orders, startOfMonth]);

  const productionStats = useMemo(() => {
    const active = workOrders.filter((wo) => wo.status === "Pending" || wo.status === "In Progress");
    const dueSoon = active
      .filter((wo) => wo.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 5);

    const completed = workOrders.filter((wo) => wo.status === "Completed");
    const completedMTD = completed.filter((wo) => {
      const d = wo.completed_at || wo.created_at;
      return d && d.slice(0, 10) >= startOfMonth;
    });
    const unitsFinishedMTD = completedMTD.reduce((s, wo) => s + (wo.quantity || 0), 0);
    const recentlyFinished = [...completedMTD]
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
      .slice(0, 5);

    return {
      activeCount: active.length,
      pendingCount: workOrders.filter((wo) => wo.status === "Pending").length,
      inProgressCount: workOrders.filter((wo) => wo.status === "In Progress").length,
      dueSoon,
      unitsFinishedMTD,
      finishedOrdersMTD: completedMTD.length,
      recentlyFinished,
    };
  }, [workOrders, startOfMonth]);

  const lowStockProductsPage = usePagination(productStats.low);
  const materialsAttentionPage = usePagination(materialStats.attention);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          
        </div>
        <button
          onClick={() => loadDashboard(false)}
          disabled={loading || refreshing}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer self-start md:self-auto"
        >
          {loading || refreshing ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="Sales (Month-to-Date)"
          value={fmtPeso(salesStats.totalMTD)}
          sub={`${salesStats.ordersCount} completed orders`}
          loading={loading}
        />
        <KpiCard
          icon={financeMTD.net >= 0 ? TrendingUp : TrendingDown}
          label="Net Finance (Month-to-Date)"
          value={fmtPeso(financeMTD.net)}
          sub={`${fmtPeso(financeMTD.debit)} debit · ${fmtPeso(financeMTD.credit)} credit`}
          loading={loading}
          tone={financeMTD.net >= 0 ? "green" : "red"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Low Stock Alerts"
          value={lowStockAlertCount}
          sub={`${productStats.low.length} products · ${materialStats.low.length + materialStats.out.length} materials`}
          loading={loading}
          tone={lowStockAlertCount > 0 ? "amber" : "gray"}
        />
        <KpiCard
          icon={Factory}
          label="Active Work Orders"
          value={productionStats.activeCount}
          sub={`${productionStats.pendingCount} pending · ${productionStats.inProgressCount} in progress`}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Finance - this month" icon={TrendingUp} onView={() => goTo("finance")}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400">Debit</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{fmtPeso(financeMTD.debit)}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Credit</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{fmtPeso(financeMTD.credit)}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Net</p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className={`text-lg font-bold ${financeMTD.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtPeso(financeMTD.net)}
                </p>
              )}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : monthlyNet.length === 0 ? (
            <EmptyRow>No ledger entries in the last 6 months.</EmptyRow>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyNet} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} />
<YAxis tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                <Tooltip formatter={(v) => fmtPeso(v)} labelFormatter={(l) => `Net — ${l}`} />
                <Bar dataKey="net" radius={[4, 4, 4, 4]}>
                  {monthlyNet.map((m, i) => (
                    <Cell key={i} fill={m.net >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Sales - finished products" icon={TrendingUp} onView={() => goTo("sales_db")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400">This month</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{fmtPeso(salesStats.totalMTD)}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Avg order value</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{fmtPeso(salesStats.avgOrder)}</p>}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : salesStats.trend.length === 0 ? (
            <EmptyRow>No completed orders yet.</EmptyRow>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={salesStats.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} />
<YAxis tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                <Tooltip formatter={(v) => fmtPeso(v)} />
                <Area type="monotone" dataKey="value" stroke="#b91c1c" strokeWidth={2} fill="url(#adminSalesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Inventory - finished products" icon={Package} onView={() => goTo("inventory")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400">Products</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{productStats.count}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Total stock (all platforms)</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{productStats.totalStock.toLocaleString()}</p>}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : productStats.low.length === 0 ? (
            <EmptyRow>Nothing is low on stock. 🎉</EmptyRow>
          ) : (
            <>
              <ul className="space-y-1.5">
                {lowStockProductsPage.pageItems.map((p) => {
                  const total = stockValue(p.shopee_stock) + stockValue(p.lazada_stock) + stockValue(p.tiktok_stock);
                  return (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate pr-2">{p.product_name}</span>
                      <span className="shrink-0 px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                        {total} left
                      </span>
                    </li>
                  );
                })}
              </ul>
              <PaginationBar
                page={lowStockProductsPage.page}
                totalPages={lowStockProductsPage.totalPages}
                onPrev={() => lowStockProductsPage.setPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  lowStockProductsPage.setPage((p) => Math.min(lowStockProductsPage.totalPages - 1, p + 1))
                }
              />
            </>
          )}
        </SectionCard>

        <SectionCard title="Inventory - raw materials" icon={Boxes} onView={() => goTo("production_rm")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400">Materials tracked</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{materialStats.count}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Needs attention</p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className="text-lg font-bold text-gray-800">{materialStats.low.length + materialStats.out.length}</p>
              )}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : materialStats.attention.length === 0 ? (
            <EmptyRow>All raw materials are in stock. 🎉</EmptyRow>
          ) : (
            <>
              <ul className="space-y-1.5">
                {materialsAttentionPage.pageItems.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate pr-2">{m.material_name}</span>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full font-semibold ${MATERIAL_STATUS_STYLES[m.status] || "bg-gray-100 text-gray-500"}`}
                    >
                      {m.current_stock} {m.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <PaginationBar
                page={materialsAttentionPage.page}
                totalPages={materialsAttentionPage.totalPages}
                onPrev={() => materialsAttentionPage.setPage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  materialsAttentionPage.setPage((p) => Math.min(materialsAttentionPage.totalPages - 1, p + 1))
                }
              />
            </>
          )}
        </SectionCard>

        <SectionCard title="Marketing campaigns" icon={Megaphone} onView={() => goTo("marketing")}>
          <div className="mb-4">
            <p className="text-xs text-gray-400">Active / upcoming</p>
            {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{campaignStats.activeCount}</p>}
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
                      {c.end_date ? ` · ends ${new Date(c.end_date).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full font-semibold ${CAMPAIGN_STATUS_STYLES[c._status] || ""}`}
                  >
                    {c._status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Production" icon={Factory} onView={() => goTo("production_wo")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400">Units finished (MTD)</p>
              {loading ? (
                <Skeleton />
              ) : (
                <p className="text-lg font-bold text-gray-800">{productionStats.unitsFinishedMTD.toLocaleString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">Work orders completed (MTD)</p>
              {loading ? <Skeleton /> : <p className="text-lg font-bold text-gray-800">{productionStats.finishedOrdersMTD}</p>}
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
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full font-semibold ${WO_STATUS_STYLES[wo.status] || ""}`}
                        >
                          {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-green-600" />
                  Recently finished
                </p>
                {productionStats.recentlyFinished.length === 0 ? (
                  <EmptyRow>Nothing completed yet this month.</EmptyRow>
                ) : (
                  <ul className="space-y-1.5">
                    {productionStats.recentlyFinished.map((wo) => (
                      <li key={wo.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate pr-2">
                          {wo.wo_number} · {wo.product_name}
                        </span>
                        <span className="shrink-0 text-gray-500 font-semibold">{wo.quantity} units</span>
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
  );
}

export default Admin;