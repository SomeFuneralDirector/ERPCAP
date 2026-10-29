import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
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

const CATEGORY_COLORS = {
  Men: "#1D4E89",
  Women: "#8b2976",
  Unisex: "#475569",
};

const LINE_COLORS = [C.accent, "#1D4E89", "#0E7490"];
const STOCK_BAR_COLOR = "#9CA3AF";

const CAMPAIGN_ENDING_SOON_DAYS = 7;
const TOP_N_IN_TOOLTIP = 3;
const TOP_PRODUCTS_SHOWN = 8;
const LOW_PRODUCTS_SHOWN = 8;
const POLL_INTERVAL_MS = 5000;

const TREND_LINE_COLOR = C.accent;
const TREND_PEAK_COLOR = "#dc2626";
const TREND_GRID_COLOR = "#f3f4f6";

function focusRing(e) {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
}

function blurRing(e) {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
}

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

// orders.created_at / completed_at are TEXT columns holding two formats:
// "MM/DD/YYYY HH:mm" (spreadsheet imports) and ISO "YYYY-MM-DD HH:mm:ss".
// Parse the first one explicitly instead of relying on new Date() guessing.
const safeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  const date = m
    ? new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// PostgREST returns at most 1000 rows per request, so a plain .select()
// silently truncates once there are more orders than that. Page through all.
const PAGE_SIZE = 1000;
async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

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

// Short month name for chart axes ("Jan", or "Jan 25" when data spans years).
const shortMonth = (key, withYear) => {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  });
};

const shortName = (name) => (name.length > 24 ? `${name.slice(0, 23)}…` : name);

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

function ChartTitle({ title, subtitle, badge }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        {title}
        {badge}
      </h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
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

// Tooltip for the "units sold" product bar charts.
function ProductBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{d.name}</p>
      <p className="text-gray-600">{fmt(d.qty)} units sold</p>
      {d.orders != null && (
        <p className="text-gray-500">
          {fmt(d.orders)} {d.orders === 1 ? "order" : "orders"}
        </p>
      )}
      {d.sales != null && <p className="text-gray-500">{fmtCurrency(d.sales)} in sales</p>}
    </div>
  );
}

// Tooltip for the low performing chart (sold vs left in stock).
function LowPerformerTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{d.name}</p>
      <p style={{ color: C.warning }}>{fmt(d.sold)} units sold</p>
      <p className="text-gray-500">{fmt(d.stock)} left in stock</p>
    </div>
  );
}

// Horizontal bars of units sold per product (used for Top products charts).
function ProductBars({ data, color = C.accent }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 44)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
        barCategoryGap={12}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#6B7280" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => fmt(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fontSize: 11, fill: "#374151" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={shortName}
        />
        <Tooltip content={<ProductBarTooltip />} cursor={{ fill: "#f9fafb" }} />
        <Bar dataKey="qty" name="Units sold" radius={[0, 4, 4, 0]} barSize={20} fill={color}>
          <LabelList
            dataKey="qty"
            position="right"
            formatter={(v) => fmt(v)}
            style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Marketing() {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Filters (same pattern as Sales dashboard)
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Newest order `created_at` we've already pulled — background polls only
  // ask for rows newer than this instead of re-fetching the whole table.
  const lastOrderSyncAtRef = useRef(null);
  // Last campaigns / inventory payloads actually applied to state, so
  // identical polls can skip the setState (and the re-renders it would cause).
  const prevCampaignsJsonRef = useRef("");
  const prevInventoryJsonRef = useRef("");

  /**
   * mode: "initial" | "manual" | "poll"
   * - "initial" and "manual" always do a full resync.
   * - "poll" (the background interval) only asks for orders newer than the
   *   last sync point, and skips setState entirely when nothing's new.
   */
  const fetchAll = useCallback(async (mode = "poll") => {
    const isInitial = mode === "initial";
    const fullResync = mode !== "poll";

    if (isInitial) {
      setInitialLoading(true);
    } else if (mode === "manual") {
      setRefreshing(true);
    }
    setErrorMsg("");

    // Cursor is imported_at (a real timestamptz). created_at is TEXT in mixed
    // formats, so ".gt('created_at', ...)" compared strings and missed rows.
    const { data: fetchedOrders, error: ordersError } = await fetchAllRows(() => {
      let q = supabase
        .from("orders")
        .select("id, order_id, platform, total_amount, completed_at, created_at, paid_time, status, imported_at")
        .eq("status", "COMPLETED")
        .order("id");
      if (!fullResync && lastOrderSyncAtRef.current) {
        q = q.gt("imported_at", lastOrderSyncAtRef.current);
      }
      return q;
    });

    if (ordersError) {
      setErrorMsg(ordersError.message);
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    const newOrders = (fetchedOrders || []).filter((o) => safeDate(orderDate(o)));

    if (newOrders.length > 0) {
      const newestCreatedAt = newOrders.reduce(
        (max, o) => (o.imported_at && o.imported_at > max ? o.imported_at : max),
        lastOrderSyncAtRef.current || ""
      );
      lastOrderSyncAtRef.current = newestCreatedAt;

      setOrders((prev) => {
        if (fullResync) return newOrders;
        const byId = new Map(prev.map((o) => [o.id, o]));
        newOrders.forEach((o) => byId.set(o.id, o));
        return Array.from(byId.values());
      });
    } else if (fullResync) {
      setOrders([]);
    }
    // If this was a poll with zero new orders, `orders` state is left
    // untouched — nothing changed, so no re-render for this slice.

    const idsNeedingItems = newOrders.map((o) => o.id).filter(Boolean);

    if (idsNeedingItems.length > 0) {
      const ORDER_ITEMS_CHUNK_SIZE = 150;
      const chunks = [];
      for (let i = 0; i < idsNeedingItems.length; i += ORDER_ITEMS_CHUNK_SIZE) {
        chunks.push(idsNeedingItems.slice(i, i + ORDER_ITEMS_CHUNK_SIZE));
      }

      const itemsChunkResults = await Promise.all(
        chunks.map((chunk) =>
          fetchAllRows(() =>
            supabase
              .from("order_items")
              .select("id, order_uuid, order_id, platform, product_name, sku, quantity, unit_price")
              .in("order_uuid", chunk)
              .order("id")
          )
        )
      );

      const firstItemsError = itemsChunkResults.find((r) => r.error)?.error || null;
      if (firstItemsError) {
        console.error("Error fetching order items:", firstItemsError);
      } else {
        const newItems = itemsChunkResults
          .flatMap((r) => r.data || [])
          .filter((item) => toNumber(item.quantity) > 0);

        setOrderItems((prev) => (fullResync ? newItems : [...prev, ...newItems]));
      }
    } else if (fullResync) {
      setOrderItems([]);
    }

    // Campaigns is a small table and statuses can change on existing rows
    // (e.g. Cancelled), so it's always pulled in full — but the state update
    // is skipped unless the payload actually differs from last time.
    const campaignsRes = await supabase
      .from("campaigns")
      .select("id, name, platform, discount_type, discount_value, start_date, end_date, status");

    if (campaignsRes.error) {
      console.error("Error fetching campaigns:", campaignsRes.error);
      if (fullResync) setCampaigns([]);
    } else {
      const fresh = (campaignsRes.data || []).filter((c) => c?.name);
      const freshJson = JSON.stringify(fresh);
      if (freshJson !== prevCampaignsJsonRef.current) {
        prevCampaignsJsonRef.current = freshJson;
        setCampaigns(fresh);
      }
    }

    // Inventory (also small, so also pulled in full and diffed). Used to find
    // products with low sales, including ones that have not sold at all.
    // Archived products are left out.
    const inventoryRes = await supabase
      .from("inventory")
      .select("product_code, product_name, category, shopee_stock, lazada_stock, tiktok_stock")
      .eq("archived", false);

    if (inventoryRes.error) {
      console.error("Error fetching inventory:", inventoryRes.error);
      if (fullResync) setInventory([]);
    } else {
      const freshInv = inventoryRes.data || [];
      const freshInvJson = JSON.stringify(freshInv);
      if (freshInvJson !== prevInventoryJsonRef.current) {
        prevInventoryJsonRef.current = freshInvJson;
        setInventory(freshInv);
      }
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  // Polling: refetches on an interval, but only while the tab is visible —
  // paused in background tabs, with an immediate catch-up fetch the moment
  // the tab becomes visible again.
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

  // Only products that exist in the main Inventory are counted in the product
  // charts. A sold item is matched to Inventory by its SKU (TikTok SKUs start
  // with "TT", so that is removed), then by name. It is then renamed to the
  // Inventory product name, so the same product sold on different platforms
  // (with different listing names) is counted as one product.
  const inventoryLookup = useMemo(() => {
    const byCode = new Map();
    const byName = new Map();
    inventory.forEach((item) => {
      if (item.product_code) {
        byCode.set(String(item.product_code).trim().toUpperCase(), item);
      }
      if (item.product_name) {
        byName.set(item.product_name.trim().toLowerCase(), item);
      }
    });
    return { byCode, byName };
  }, [inventory]);

  const inventoryItems = useMemo(() => {
    const { byCode, byName } = inventoryLookup;
    const matched = [];
    filteredOrderItems.forEach((row) => {
      const code = String(row.sku || "").trim().toUpperCase();
      const inv =
        byCode.get(code) ||
        byCode.get(code.replace(/^TT/, "")) ||
        byName.get(String(row.product_name || "").trim().toLowerCase());
      if (!inv) return;
      matched.push({ ...row, product_name: inv.product_name, category: inv.category });
    });
    return matched;
  }, [filteredOrderItems, inventoryLookup]);

  const products = useMemo(() => {
    const map = {};
    inventoryItems.forEach((row) => {
      const name = row.product_name || "Unnamed Product";
      if (!map[name]) map[name] = { name, qty: 0, sales: 0, orderSet: new Set() };
      const qty = Math.max(0, toNumber(row.quantity));
      map[name].qty += qty;
      map[name].sales += qty * centsToPesos(row.unit_price);
      map[name].orderSet.add(row.order_uuid);
    });
    // Ties are common (e.g. three products on 15 units): break them by sales,
    // then name, so the #1 slot is stable instead of "whichever came first".
    return Object.values(map)
      .map(({ orderSet, ...p }) => ({ ...p, orders: orderSet.size }))
      .sort((a, b) => b.qty - a.qty || b.sales - a.sales || a.name.localeCompare(b.name));
  }, [inventoryItems]);

  // ── Inventory-based product performance (same idea as the
  //    "Low Performing" filter on Marketing - Inventory Overview) ─────────

  const inventoryByName = useMemo(() => {
    const map = {};
    inventory.forEach((item) => {
      map[item.product_name] = {
        category: item.category || "—",
        stock:
          toNumber(item.shopee_stock) +
          toNumber(item.lazada_stock) +
          toNumber(item.tiktok_stock),
      };
    });
    return map;
  }, [inventory]);

  // Every inventory product (even with zero sales) plus any sold product.
  const performance = useMemo(() => {
    const map = {};
    inventory.forEach((item) => {
      const name = item.product_name;
      if (!name || map[name]) return;
      map[name] = {
        name,
        category: inventoryByName[name]?.category ?? "—",
        stock: inventoryByName[name]?.stock ?? null,
        qty: 0,
        sales: 0,
        orders: 0,
      };
    });
    products.forEach((p) => {
      if (!map[p.name]) return; // only products in the main Inventory
      map[p.name].qty = p.qty;
      map[p.name].sales = p.sales;
      map[p.name].orders = p.orders;
    });
    return Object.values(map);
  }, [inventory, products, inventoryByName]);

  // Average units sold per product. Below this = low performing.
  const avgSold = useMemo(() => {
    if (performance.length === 0) return 0;
    return performance.reduce((sum, p) => sum + p.qty, 0) / performance.length;
  }, [performance]);

  const lowPerformers = useMemo(
    () =>
      performance
        .filter((p) => p.qty < avgSold)
        .sort(
          (a, b) =>
            a.qty - b.qty ||
            (b.stock ?? 0) - (a.stock ?? 0) ||
            a.name.localeCompare(b.name)
        ),
    [performance, avgSold]
  );

  const lowPerformerChart = useMemo(
    () =>
      lowPerformers.slice(0, LOW_PRODUCTS_SHOWN).map((p) => ({
        name: p.name,
        sold: p.qty,
        stock: p.stock ?? 0,
      })),
    [lowPerformers]
  );

  // Sales (pesos) per category: Men / Women / ...
  const categorySales = useMemo(() => {
    const map = {};
    inventoryItems.forEach((row) => {
      const cat = row.category || "Other";
      map[cat] =
        (map[cat] || 0) +
        Math.max(0, toNumber(row.quantity)) * centsToPesos(row.unit_price);
    });
    return Object.entries(map)
      .map(([name, amount]) => ({
        name,
        amount,
        color: CATEGORY_COLORS[name] ?? "#6b7280",
      }))
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [inventoryItems]);

  const categoryTotal = categorySales.reduce((sum, c) => sum + c.amount, 0);

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
    inventoryItems.forEach((row) => {
      const date = orderDateById[row.order_uuid];
      if (!date) return;
      const key = monthKey(date);
      if (!key) return;
      if (!months[key]) months[key] = {};
      const name = row.product_name || "Unnamed Product";
      const qty = Math.max(0, toNumber(row.quantity));
      const cell = months[key][name] || { qty: 0, orderSet: new Set() };
      cell.qty += qty;
      cell.orderSet.add(row.order_uuid);
      months[key][name] = cell;
    });
    return months;
  }, [inventoryItems, orderDateById]);

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
      .map(([name, c]) => ({ name, qty: c.qty, orders: c.orderSet.size }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
      .slice(0, TOP_PRODUCTS_SHOWN);
  }, [selectedMonth, availableMonths, monthlyProductTotals]);

  // The 3 best sellers overall, followed month by month.
  const topThree = useMemo(() => products.slice(0, 3), [products]);

  const topThreeTrend = useMemo(() => {
    const keys = [...availableMonths].reverse();
    const withYear = new Set(keys.map((k) => k.split("-")[0])).size > 1;
    return keys.map((key) => {
      const row = { month: shortMonth(key, withYear) };
      topThree.forEach((p, i) => {
        row[`p${i}`] = monthlyProductTotals[key]?.[p.name]?.qty || 0;
      });
      return row;
    });
  }, [availableMonths, monthlyProductTotals, topThree]);

  // Sales (pesos) each month, split by platform.
  const monthlyPlatformSales = useMemo(() => {
    const months = {};
    filteredOrders.forEach((o) => {
      const key = monthKey(orderDate(o));
      if (!key) return;
      const p = normalizePlatform(o.platform);
      if (!PLATFORM_COLORS[p]) return;
      if (!months[key]) months[key] = { Shopee: 0, Lazada: 0, TikTok: 0 };
      months[key][p] += centsToPesos(o.total_amount);
    });
    const keys = Object.keys(months).sort();
    const withYear = new Set(keys.map((k) => k.split("-")[0])).size > 1;
    return keys.map((key) => ({ month: shortMonth(key, withYear), ...months[key] }));
  }, [filteredOrders]);

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
        .map(([name, c]) => ({ name, qty: c.qty }))
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
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
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Marketing - Dashboard</h1>
          <p className="text-sm mb-4" style={{ color: C.accent }}>
            {errorMsg}
          </p>
          <PrimaryButton onClick={() => fetchAll("initial")}>Retry</PrimaryButton>
        </Card>
      </div>
    );
  }

  const topProductsChart = products.slice(0, TOP_PRODUCTS_SHOWN);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header + filters */}
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Marketing - Dashboard</h1>
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
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusRing}
                onBlur={blurRing}
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusRing}
                onBlur={blurRing}
              />
            </div>
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
            <p className="text-xs mt-1 text-gray-400">sold less than average</p>
          </Card>
        </div>

        {/* Sales by platform + Sales by category */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-6">
            <ChartTitle title="Sales by platform" subtitle="How much each platform sold, in pesos." />
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : platformSales.length === 0 ? (
              <p className="text-xs text-gray-400">No sales data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
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
                  <Tooltip formatter={(v) => fmtCurrency(v)} cursor={{ fill: "#f9fafb" }} />
                  <Bar dataKey="amount" name="Sales" radius={[6, 6, 0, 0]}>
                    {platformSales.map((p) => (
                      <Cell key={p.platform} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-6">
            <ChartTitle title="Sales by category" subtitle="Men and Women share of all sales." />
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : categorySales.length === 0 ? (
              <p className="text-xs text-gray-400">No sales data yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categorySales}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {categorySales.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-2">
                  {categorySales.map((c) => (
                    <li key={c.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                      <span className="text-right">
                        <span className="font-semibold text-gray-700">{fmtCurrency(c.amount)}</span>
                        <span className="text-gray-400">
                          {" "}
                          ({categoryTotal > 0 ? ((c.amount / categoryTotal) * 100).toFixed(0) : 0}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* Seasonal trend */}
        <Card className="p-6">
          <ChartTitle
            title="Trend"
            subtitle="Units sold each month. Hover a point to see the best sellers and campaigns."
          />
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

        {/* Sales each month, by platform */}
        <Card className="p-6">
          <ChartTitle
            title="Sales each month by platform"
            subtitle="Each bar is one month. The colors show how much each platform sold."
          />
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : monthlyPlatformSales.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={monthlyPlatformSales}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
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
                <Tooltip formatter={(v) => fmtCurrency(v)} cursor={{ fill: "#f9fafb" }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Shopee" stackId="sales" fill={PLATFORM_COLORS.Shopee} />
                <Bar dataKey="Lazada" stackId="sales" fill={PLATFORM_COLORS.Lazada} />
                <Bar
                  dataKey="TikTok"
                  stackId="sales"
                  fill={PLATFORM_COLORS.TikTok}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top products chart */}
        <Card className="p-6">
          <ChartTitle
            title="Top products"
            subtitle={`The ${TOP_PRODUCTS_SHOWN} products that sold the most units.`}
          />
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : topProductsChart.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : (
            <ProductBars data={topProductsChart} color={C.accent} />
          )}
        </Card>

        {/* Top products by month */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
            <ChartTitle
              title="Top products by month"
              subtitle="Pick a month to see its best sellers."
            />
            {!loading && availableMonths.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {availableMonths.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedMonth(key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      (selectedMonth || availableMonths[0]) === key
                        ? "text-white hover:brightness-90"
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
            <Skeleton className="h-56 w-full" />
          ) : availableMonths.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : selectedMonthProducts.length === 0 ? (
            <p className="text-xs text-gray-400">
              No sales recorded for {monthLabel(selectedMonth || availableMonths[0])}.
            </p>
          ) : (
            <ProductBars data={selectedMonthProducts} color="#1D4E89" />
          )}
        </Card>

        {/* Top 3 products, month by month */}
        <Card className="p-6">
          <ChartTitle
            title="Top 3 products month by month"
            subtitle="Follow the 3 best sellers to see when they go up or down."
          />
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : topThree.length === 0 ? (
            <p className="text-xs text-gray-400">No sales data yet.</p>
          ) : topThreeTrend.length < 2 ? (
            <p className="text-xs text-gray-400">
              This chart needs sales from at least 2 months.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={topThreeTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
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
                <Tooltip formatter={(v) => `${fmt(v)} units`} />
                <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
                {topThree.map((p, i) => (
                  <Line
                    key={p.name}
                    type="monotone"
                    dataKey={`p${i}`}
                    name={shortName(p.name)}
                    stroke={LINE_COLORS[i]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Low performing products (based on Inventory Overview) */}
        <Card className="p-6">
          <ChartTitle
            title="Low performing products"
            badge={
              !loading && (
                <span
                  className="px-2 py-0.5 text-xs rounded-md font-medium border"
                  style={{
                    color: C.warning,
                    backgroundColor: C.warningSoft,
                    borderColor: C.warningBorder,
                  }}
                >
                  {fmt(lowPerformers.length)}
                </span>
              )
            }
          />
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : performance.length === 0 ? (
            <p className="text-xs text-gray-400">No product data yet.</p>
          ) : lowPerformerChart.length === 0 ? (
            <p className="text-xs text-gray-400">
              All products sold at or above the average. Good job!
            </p>
          ) : (
            <>
              <ResponsiveContainer
                width="100%"
                height={Math.max(240, lowPerformerChart.length * 56)}
              >
                <BarChart
                  data={lowPerformerChart}
                  layout="vertical"
                  margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
                  barCategoryGap={14}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmt(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 11, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={shortName}
                  />
                  <Tooltip content={<LowPerformerTooltip />} cursor={{ fill: "#f9fafb" }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sold" name="Units sold" fill={C.warning} radius={[0, 4, 4, 0]} barSize={14}>
                    <LabelList
                      dataKey="sold"
                      position="right"
                      formatter={(v) => fmt(v)}
                      style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                    />
                  </Bar>
                  <Bar
                    dataKey="stock"
                    name="Left in stock"
                    fill={STOCK_BAR_COLOR}
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  >
                    <LabelList
                      dataKey="stock"
                      position="right"
                      formatter={(v) => fmt(v)}
                      style={{ fontSize: 11, fill: "#6B7280" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {lowPerformers.length > lowPerformerChart.length && (
                <p className="text-xs text-gray-400 mt-2">
                  Showing the {lowPerformerChart.length} lowest. {fmt(
                    lowPerformers.length - lowPerformerChart.length
                  )}{" "}
                  more are on Marketing - Inventory Overview (Low Performing).
                </p>
              )}
            </>
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