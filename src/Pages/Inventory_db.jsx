import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { supabase } from "../api/supabase";

// ─── Colours ──────────────────────────────────────────────────

const CAT_COLORS = {
  Men: "#2563eb",
  Women: "#ec4899",
  Unisex: "#9b0aa0",
};

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#7C3AED",
  TikTok: "#1f2937",
};

// Raw-material categories are free text, so colours are assigned
// on the fly from this palette (cycled, stable per category name).
const MATERIAL_PALETTE = [
  "#0891b2", "#b45309", "#7c3aed", "#059669", "#be123c",
  "#4338ca", "#a16207", "#0f766e", "#c026d3", "#334155",
];

const STATUS_COLORS = {
  "In Stock": "#16a34a",
  "Low Stock": "#f59e0b",
  "Out of Stock": "#dc2626",
};

// ─── Helpers ──────────────────────────────────────────────────

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegative(value) {
  return Math.max(0, toNumber(value));
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function totalStock(row) {
  return nonNegative(row.shopee_stock) + nonNegative(row.lazada_stock) + nonNegative(row.tiktok_stock);
}

function formatLogTime(iso) {
  const d = safeDate(iso);
  if (!d) return "—";
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString();
}

function colorForCategory(name) {
  // Hash the category name so its colour remains stable when sorting changes.
  const hash = [...String(name || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return MATERIAL_PALETTE[hash % MATERIAL_PALETTE.length];
}

// ─── Skeleton

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

// ─── Custom tooltips
function UnitsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {(p.value ?? 0).toLocaleString()} {p.unit || "units"}
        </p>
      ))}
    </div>
  );
}

// ─── Section heading with a tiny divider, used to separate Products / Raw materials

function SectionHeading({ title, subtitle }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 whitespace-nowrap">
        {title}
      </h2>
      <div className="h-px bg-gray-200 flex-1" />
      {subtitle && <span className="text-xs text-gray-400 whitespace-nowrap">{subtitle}</span>}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

function Inventory_db() {
  const [rawInventory, setRawInventory] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [soldByPlatform, setSoldByPlatform] = useState({ shopee: 0, lazada: 0, tiktok: 0 });
  const [totals, setTotals] = useState(null);
  const [cats, setCats] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [activity, setActivity] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [slowMovers, setSlowMovers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [materialsErrorMsg, setMaterialsErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Drill-down state: which slice/bar was clicked
  const [breakdown, setBreakdown] = useState(null); // { type, label, products }

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");
    setMaterialsErrorMsg("");

    // ── 1. Fetch inventory + completed-order line items + raw materials ──
    const [invRes, ordersRes, materialsRes] = await Promise.all([
      supabase
        .from("inventory")
        .select(
          "id, stock, shopee_stock, lazada_stock, tiktok_stock, " +
          "category, product_name, product_code, reorder_point, updated_at"
        ),
      supabase.from("orders").select("order_id").eq("status", "COMPLETED"),
      supabase
        .from("raw_materials")
        .select(
          "id, material_name, category, unit, current_stock, supplier, unit_cost, status, updated_at"
        ),
    ]);

    const { data: inv, error: invError } = invRes;

    if (invError) {
      setErrorMsg(invError.message || "Couldn't load inventory data.");
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    if (ordersRes.error) {
      // Sold-by-platform is supplementary; don't block the page on it.
      console.error("Error fetching orders for platform chart:", ordersRes.error);
      setSoldByPlatform({ shopee: 0, lazada: 0, tiktok: 0 });
    } else {
      const orderIds = (ordersRes.data || []).map((o) => o.order_id).filter(Boolean);
      const soldTotals = { shopee: 0, lazada: 0, tiktok: 0 };

      if (orderIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select("platform, quantity")
          .in("order_id", orderIds);

        if (itemsError) {
          console.error("Error fetching order items for platform chart:", itemsError);
        } else {
          (items || []).forEach((r) => {
            const key = r.platform?.toLowerCase();
            if (key && soldTotals[key] !== undefined) {
              soldTotals[key] += nonNegative(r.quantity);
            }
          });
        }
      }

      setSoldByPlatform(soldTotals);
    }

    // Raw materials — supplementary too, so a failure here shouldn't block
    // the products half of the dashboard from rendering.
    if (materialsRes.error) {
      console.error("Error fetching raw materials:", materialsRes.error);
      setMaterialsErrorMsg(materialsRes.error.message || "Couldn't load raw materials data.");
      setRawMaterials([]);
    } else {
      setRawMaterials(materialsRes.data || []);
    }

    if (inv && inv.length > 0) {
      setRawInventory(inv);

      // Platform totals
      const totalsData = inv.reduce(
        (acc, r) => ({
          shopee: acc.shopee + nonNegative(r.shopee_stock),
          lazada: acc.lazada + nonNegative(r.lazada_stock),
          tiktok: acc.tiktok + nonNegative(r.tiktok_stock),
        }),
        { shopee: 0, lazada: 0, tiktok: 0 }
      );
      totalsData.total = totalsData.shopee + totalsData.lazada + totalsData.tiktok;
      setTotals(totalsData);

      // Stock by category
      const catMap = {};
      inv.forEach((r) => {
        const c = r.category || "Uncategorized";
        catMap[c] = (catMap[c] || 0) + totalStock(r);
      });
      setCats(
        Object.entries(catMap).map(([name, qty]) => ({
          name,
          qty: nonNegative(qty),
          color: CAT_COLORS[name] ?? "#6b7280",
        }))
      );

      // Out of stock count
      setOutOfStockCount(inv.filter((r) => totalStock(r) === 0).length);

      // Low stock alerts: stock <= reorder_point
      const low = inv
        .filter((r) => totalStock(r) <= nonNegative(r.reorder_point ?? 10))
        .sort((a, b) => totalStock(a) - totalStock(b))
        .slice(0, 8)
        .map((r) => ({
          name: r.product_name || "Unknown",
          code: r.product_code || "N/A",
          qty: totalStock(r),
          reorder: nonNegative(r.reorder_point ?? 10),
        }));
      setLowStock(low);

      // Top movers - products with highest total stock
      const topPlatform = (r) => {
        const s = nonNegative(r.shopee_stock);
        const l = nonNegative(r.lazada_stock);
        const t = nonNegative(r.tiktok_stock);
        if (s >= l && s >= t) return "Shopee";
        if (l >= s && l >= t) return "Lazada";
        return "TikTok";
      };

      const top = [...inv]
        .filter((r) => totalStock(r) > 0)
        .sort((a, b) => totalStock(b) - totalStock(a))
        .slice(0, 6)
        .map((r) => ({
          name: r.product_name || "Unknown",
          platform: topPlatform(r),
          qty: totalStock(r),
        }));
      setTopMovers(top);

      // Slow movers - low stock, not updated recently
      const now = Date.now();
      const slow = [...inv]
        .filter((r) => {
          const t = totalStock(r);
          return t < 5 && t > 0;
        })
        .sort((a, b) => (safeDate(a.updated_at)?.getTime() ?? Infinity) - (safeDate(b.updated_at)?.getTime() ?? Infinity))
        .slice(0, 5)
        .map((r) => ({
          name: r.product_name || "Unknown",
          days: Math.max(0, Math.floor((now - (safeDate(r.updated_at)?.getTime() ?? now)) / 86_400_000)),
        }))
        .filter((r) => r.days > 0);
      setSlowMovers(slow);

      setLastUpdated(new Date());
    } else {
      // No rows — reset to empty state instead of leaving stale data
      setRawInventory([]);
      setTotals({ shopee: 0, lazada: 0, tiktok: 0, total: 0 });
      setCats([]);
      setOutOfStockCount(0);
      setLowStock([]);
      setTopMovers([]);
      setSlowMovers([]);
    }

    // ── 2. Recent activity (inventory_logs) ───────────────
    const { data: logs, error: logsError } = await supabase
      .from("inventory_logs")
      .select("detail, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (logsError) {
      console.error("Error fetching logs:", logsError);
    } else if (logs) {
      setActivity(
        logs.map((l) => ({
          text: l.detail || "Activity recorded",
          time: formatLogTime(l.created_at),
        }))
      );
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll(true);

    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory_logs" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => fetchAll(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raw_materials" },
        () => fetchAll(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // ── Derived chart data — products ──────────────────────────

  const platformData = useMemo(() => {
    if (!totals) return [];
    return [
      { platform: "Shopee", qty: totals.shopee, sold: soldByPlatform.shopee, color: PLATFORM_COLORS.Shopee },
      { platform: "Lazada", qty: totals.lazada, sold: soldByPlatform.lazada, color: PLATFORM_COLORS.Lazada },
      { platform: "TikTok", qty: totals.tiktok, sold: soldByPlatform.tiktok, color: PLATFORM_COLORS.TikTok },
    ];
  }, [totals, soldByPlatform]);

  // ── Derived chart data — raw materials ─────────────────────

  const materialStats = useMemo(() => {
    const total = rawMaterials.length;
    const value = rawMaterials.reduce(
      (sum, m) => sum + nonNegative(m.current_stock) * nonNegative(m.unit_cost),
      0
    );
    const lowStockCount = rawMaterials.filter((m) => m.status === "Low Stock").length;
    const outOfStockCount = rawMaterials.filter((m) => m.status === "Out of Stock").length;
    return { total, value, lowStockCount, outOfStockCount };
  }, [rawMaterials]);

  const materialCategoryData = useMemo(() => {
    const map = {};
    rawMaterials.forEach((m) => {
      const c = m.category || "Uncategorized";
      if (!map[c]) map[c] = { name: c, count: 0, value: 0 };
      map[c].count += 1;
      map[c].value += nonNegative(m.current_stock) * nonNegative(m.unit_cost);
    });
    return Object.values(map)
      .sort((a, b) => b.value - a.value)
      .map((c) => ({ ...c, color: colorForCategory(c.name) }));
  }, [rawMaterials]);

  const materialStatusData = useMemo(() => {
    const map = { "In Stock": 0, "Low Stock": 0, "Out of Stock": 0 };
    rawMaterials.forEach((m) => {
      const s = m.status || "In Stock";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] }));
  }, [rawMaterials]);

  const materialLowStock = useMemo(() => {
    return [...rawMaterials]
      .filter((m) => m.status === "Low Stock" || m.status === "Out of Stock")
      .sort((a, b) => {
        if (a.status === b.status) return nonNegative(a.current_stock) - nonNegative(b.current_stock);
        return a.status === "Out of Stock" ? -1 : 1;
      })
      .slice(0, 8);
  }, [rawMaterials]);

  // ── Drill-down handlers — products ─────────────────────────

  function handleCategoryClick(entry) {
    const category = entry?.name;
    if (!category) return;
    const products = rawInventory
      .filter((r) => (r.category || "Uncategorized") === category)
      .map((r) => ({
        name: r.product_name || "Unknown",
        code: r.product_code || "N/A",
        qty: totalStock(r),
        shopee: nonNegative(r.shopee_stock),
        lazada: nonNegative(r.lazada_stock),
        tiktok: nonNegative(r.tiktok_stock),
      }))
      .sort((a, b) => b.qty - a.qty);

    setBreakdown({
      type: "category",
      label: category,
      color: CAT_COLORS[category] ?? "#6b7280",
      products,
    });
  }

  function handlePlatformClick(entry) {
    const platform = entry?.platform;
    if (!platform) return;
    const key = `${platform.toLowerCase()}_stock`;
    const products = rawInventory
      .filter((r) => nonNegative(r[key]) > 0)
      .map((r) => ({
        name: r.product_name || "Unknown",
        code: r.product_code || "N/A",
        qty: nonNegative(r[key]),
      }))
      .sort((a, b) => b.qty - a.qty);

    const sold = soldByPlatform[platform.toLowerCase()] ?? 0;

    setBreakdown({
      type: "platform",
      label: platform,
      products,
      color: PLATFORM_COLORS[platform],
      sold,
    });
  }

  function handleTopMoverClick(entry) {
    const name = entry?.name;
    if (!name) return;
    const row = rawInventory.find((r) => (r.product_name || "Unknown") === name);
    if (!row) return;

    setBreakdown({
      type: "product",
      label: name,
      color: CAT_COLORS[row.category] ?? "#6b7280",
      products: [
        {
          name,
          code: row.product_code || "N/A",
          qty: totalStock(row),
          shopee: row.shopee_stock || 0,
          lazada: row.lazada_stock || 0,
          tiktok: row.tiktok_stock || 0,
        },
      ],
    });
  }

  // ── Drill-down handlers — raw materials ────────────────────

  function handleMaterialCategoryClick(entry) {
    const category = entry?.name;
    if (!category) return;
    const materials = rawMaterials
      .filter((m) => (m.category || "Uncategorized") === category)
      .map((m) => ({
        name: m.material_name || "Unknown",
        code: m.supplier || "No supplier",
        qty: nonNegative(m.current_stock),
        unit: m.unit || "",
        status: m.status || "In Stock",
      }))
      .sort((a, b) => b.qty - a.qty);

    setBreakdown({
      type: "material-category",
      label: category,
      color: entry.color,
      products: materials,
    });
  }

  function handleMaterialStatusClick(entry) {
    const status = entry?.status;
    if (!status) return;
    const materials = rawMaterials
      .filter((m) => (m.status || "In Stock") === status)
      .map((m) => ({
        name: m.material_name || "Unknown",
        code: m.category || "Uncategorized",
        qty: nonNegative(m.current_stock),
        unit: m.unit || "",
        status,
      }))
      .sort((a, b) => a.qty - b.qty);

    setBreakdown({
      type: "material-status",
      label: status,
      color: STATUS_COLORS[status],
      products: materials,
    });
  }

  const fmt = (n) => (n ?? 0).toLocaleString();
  const fmtPeso = (n) =>
    `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const loading = initialLoading;

  if (errorMsg && !totals) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 border border-red-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Dashboard</h1>
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
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">

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

      {errorMsg && totals && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          Last refresh failed: {errorMsg}
        </div>
      )}
      {materialsErrorMsg && (
        <div className="bg-white border border-amber-300 text-amber-700 rounded-lg shadow p-3 text-xs">
          Raw materials couldn't be loaded: {materialsErrorMsg}
        </div>
      )}

      {/* ══════════════════════ PRODUCTS ══════════════════════ */}

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-gray-800">{fmt(totals?.total)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Units on hand</p>
        </div>

        {["Shopee", "Lazada", "TikTok"].map((platform) => {
          const key = platform.toLowerCase();
          const color = PLATFORM_COLORS[platform];
          return (
            <div key={platform} className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {platform}
              </p>
              {loading ? <Skeleton /> : (
                <p className="text-3xl font-bold mt-1" style={{ color }}>
                  {fmt(totals?.[key])}
                </p>
              )}
              <p className="text-xs mt-1 text-gray-400">Total units in stock</p>
            </div>
          );
        })}

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Out of stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-red-700">{fmt(outOfStockCount)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Products at zero</p>
        </div>
      </div>

      {/* Stock by platform (primary) + Stock by category (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-700">Stock by platform</h2>
            
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : platformData.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={platformData}
                    dataKey="qty"
                    nameKey="platform"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    onClick={handlePlatformClick}
                    cursor="pointer"
                  >
                    {platformData.map((p) => (
                      <Cell key={p.platform} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<UnitsTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div>
                <ul className="space-y-3">
                  {platformData.map((p) => (
                    <li key={p.platform} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          {p.platform}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-700">
                          {p.qty} in stock{' '}
                          <span className="text-gray-400 font-normal">
                            ({totals?.total > 0 ? ((p.qty / totals.total) * 100).toFixed(1) : 0}%)
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">{p.sold} sold</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                  <span className="text-sm font-semibold text-gray-500">Total Stock</span>
                  <span className="text-sm font-bold text-red-600">{fmt(totals?.total)} units</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-700">Stock by category</h2>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : cats.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={cats}
                    dataKey="qty"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                    onClick={handleCategoryClick}
                    cursor="pointer"
                  >
                    {cats.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<UnitsTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 mt-2">
                {cats.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-semibold text-gray-700">{c.qty.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Top stocked items (primary) + Low stock alerts (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">Top stocked items</h2>
            
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : topMovers.length === 0 ? (
            <p className="text-xs text-gray-400">No stock data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, topMovers.length * 44)}>
              <BarChart
                data={topMovers}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                barCategoryGap={12}
              >
                <defs>
                  {topMovers.map((m) => {
                    const c = PLATFORM_COLORS[m.platform] ?? "#b91c1c";
                    return (
                      <linearGradient key={m.name} id={`bar-${m.name.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={c} stopOpacity={1} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#000000" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<UnitsTooltip />} />
                <Bar
                  dataKey="qty"
                  name="Stock"
                  radius={[0, 6, 6, 0]}
                  barSize={22}
                  onClick={handleTopMoverClick}
                  cursor="pointer"
                >
                  {topMovers.map((m) => (
                    <Cell
                      key={m.name}
                      fill={`url(#bar-${m.name.replace(/[^a-zA-Z0-9]/g, "")})`}
                    />
                  ))}
                  <LabelList
                    dataKey="qty"
                    position="right"
                    style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Low stock alerts
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                {lowStock.length}
              </span>
            )}
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : lowStock.length === 0 ? (
            <p className="text-xs text-gray-400">All items are sufficiently stocked.</p>
          ) : (
            <div className="space-y-3">
              {lowStock.map((p) => {
                const isOut = p.qty === 0;
                const pct = isOut ? 0 : Math.round((p.qty / p.reorder) * 100);
                return (
                  <div key={p.code}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{p.name}</p>
                        <p className="text-xs font-mono text-gray-400">{p.code}</p>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded font-medium shrink-0 ${
                          isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isOut ? "Out" : `${p.qty} left`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: isOut ? "#b91c1c" : "#f59e0b" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity + Items needing attention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-xs text-gray-400">No recent activity.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-red-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-700 leading-snug">{a.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Items needing attention</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : slowMovers.length === 0 ? (
            <p className="text-xs text-gray-400">All items are recently updated.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {slowMovers.map((m) => (
                <div key={m.name} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-xs font-medium text-gray-700">{m.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Low stock for {m.days} day{m.days !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                    {m.days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════ RAW MATERIALS ══════════════════════ */}
      <div id="materials-section" className="scroll-mt-4">
        <SectionHeading title="Raw Materials" subtitle="Production inputs" />
      </div>

      {/* Materials summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total materials
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-gray-800">{fmt(materialStats.total)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Tracked SKUs</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Estimated value
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-emerald-700">{fmtPeso(materialStats.value)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Stock × unit cost</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Low stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-amber-600">{fmt(materialStats.lowStockCount)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Need reordering soon</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Out of stock
          </p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold mt-1 text-red-700">{fmt(materialStats.outOfStockCount)}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">Blocking production</p>
        </div>
      </div>

      {/* Value by category + Stock status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">Material value by category</h2>
            
          </div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : materialCategoryData.length === 0 ? (
            <p className="text-xs text-gray-400">No raw materials recorded yet.</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, materialCategoryData.length * 42)}
            >
              <BarChart
                data={materialCategoryData}
                layout="vertical"
                margin={{ top: 0, right: 50, left: 8, bottom: 0 }}
                barCategoryGap={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#000000" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#000000" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700 mb-1">{d.name}</p>
                        <p className="text-gray-600">{fmtPeso(d.value)} · {d.count} material{d.count !== 1 ? "s" : ""}</p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  name="Value"
                  radius={[0, 6, 6, 0]}
                  barSize={20}
                  onClick={handleMaterialCategoryClick}
                  cursor="pointer"
                >
                  {materialCategoryData.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(v) => fmtPeso(v)}
                    style={{ fontSize: 10, fill: "#374151", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-1">Stock status</h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : materialStatusData.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={materialStatusData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                    onClick={handleMaterialStatusClick}
                    cursor="pointer"
                  >
                    {materialStatusData.map((s) => (
                      <Cell key={s.status} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                          <p className="font-semibold" style={{ color: d.color }}>{d.status}</p>
                          <p className="text-gray-600">{d.count} material{d.count !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5 mt-2">
                {materialStatusData.map((s) => (
                  <li key={s.status} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
                      {s.status}
                    </span>
                    <span className="font-semibold text-gray-700">{s.count}</span>
                  </li>
                ))}
              </ul>
              
            </>
          )}
        </div>
      </div>

      {/* Materials low stock alerts */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">
          Materials needing reorder
          {!loading && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
              {materialLowStock.length}
            </span>
          )}
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : materialLowStock.length === 0 ? (
          <p className="text-xs text-gray-400">All raw materials are sufficiently stocked.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {materialLowStock.map((m) => {
              const isOut = m.status === "Out of Stock";
              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    isOut ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{m.material_name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {m.category || "Uncategorized"}{m.supplier ? ` · ${m.supplier}` : ""}
                    </p>
                  </div>
                  <span
                    className={`ml-3 shrink-0 px-1.5 py-0.5 text-xs rounded font-medium ${
                      isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {m.current_stock} {m.unit}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {breakdown && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setBreakdown(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: breakdown.color }}
                />
                <h2 className="text-lg font-bold text-gray-800">
                  {breakdown.label}
                </h2>
                <span className="text-xs text-gray-400">
                  ({breakdown.products.length} item{breakdown.products.length !== 1 ? "s" : ""})
                  {breakdown.type === "platform" && `, ${breakdown.sold} sold total`}
                </span>
              </div>
              <button
                onClick={() => setBreakdown(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-6 pt-4">
              {breakdown.products.length === 0 ? (
                <p className="text-xs text-gray-400">No items found.</p>
              ) : (
                <div className="space-y-3">
                  {breakdown.products.map((p) => (
                    <div key={p.code ?? p.name} className="border-b border-gray-50 pb-2 last:border-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{p.name}</p>
                          {p.code && <p className="text-xs font-mono text-gray-400">{p.code}</p>}
                        </div>
                        <span className="text-xs font-bold text-red-600 shrink-0">
                          {p.qty} {p.unit || "units"}
                        </span>
                      </div>
                      {(breakdown.type === "category" || breakdown.type === "product") && (
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.Shopee }}>
                            Shopee: {p.shopee}
                          </span>
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.Lazada }}>
                            Lazada: {p.lazada}
                          </span>
                          <span className="text-xs" style={{ color: PLATFORM_COLORS.TikTok }}>
                            TikTok: {p.tiktok}
                          </span>
                        </div>
                      )}
                      {(breakdown.type === "material-category" || breakdown.type === "material-status") && p.status && (
                        <span
                          className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: `${STATUS_COLORS[p.status]}1a`,
                            color: STATUS_COLORS[p.status],
                          }}
                        >
                          {p.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory_db;
