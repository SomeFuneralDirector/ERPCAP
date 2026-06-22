import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);

// ─── DonutChart ──────────────────────────────────────────────

function DonutChart({ cats }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !cats.length) return;
    const ctx = canvas.getContext("2d");
    const total = cats.reduce((a, c) => a + c.qty, 0);
    if (total === 0) return;
    let angle = -Math.PI / 2;
    ctx.clearRect(0, 0, 100, 100);
    cats.forEach((c) => {
      const slice = (c.qty / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(50, 50);
      ctx.arc(50, 50, 44, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = c.color;
      ctx.fill();
      angle += slice;
    });
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(50, 50, 28, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }, [cats]);

  return <canvas ref={ref} width={100} height={100} className="shrink-0" />;
}

// ─── Category colours ────────────────────────────────────────

const CAT_COLORS = {
  Men: "#2563eb",
  Women: "#ec4899",
  Unisex: "#9b0aa0",
};

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

// ─── Main component ──────────────────────────────────────────

function Inventory_db() {
  const [totals, setTotals] = useState(null);
  const [cats, setCats] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [activity, setActivity] = useState([]);
  const [topMovers, setTopMovers] = useState([]);
  const [slowMovers, setSlowMovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // ── 1. Fetch inventory ──────────────────────────────────
    const { data: inv, error: invError } = await supabase
      .from("inventory")
      .select(
        "id, stock, shopee_stock, lazada_stock, tiktok_stock, " +
        "category, product_name, product_code, reorder_point, updated_at"
      );

    if (invError) {
      console.error("Error fetching inventory:", invError);
      setLoading(false);
      return;
    }

    if (inv && inv.length > 0) {
      // Summary cards - calculate total stock as sum of all platforms
      setTotals(
        inv.reduce(
          (acc, r) => ({
            shopee: acc.shopee + (r.shopee_stock || 0),
            lazada: acc.lazada + (r.lazada_stock || 0),
            tiktok: acc.tiktok + (r.tiktok_stock || 0),
          }),
          { shopee: 0, lazada: 0, tiktok: 0 }
        )
      );

      // Add total as sum of all platforms
      const totalsData = inv.reduce(
        (acc, r) => ({
          shopee: acc.shopee + (r.shopee_stock || 0),
          lazada: acc.lazada + (r.lazada_stock || 0),
          tiktok: acc.tiktok + (r.tiktok_stock || 0),
        }),
        { shopee: 0, lazada: 0, tiktok: 0 }
      );
      
      totalsData.total = totalsData.shopee + totalsData.lazada + totalsData.tiktok;
      setTotals(totalsData);

      // Stock by category (donut) - use total stock (sum of all platforms)
      const catMap = {};
      inv.forEach((r) => {
        const c = r.category || "Uncategorized";
        const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
        catMap[c] = (catMap[c] || 0) + totalStock;
      });
      setCats(
        Object.entries(catMap).map(([name, qty]) => ({
          name,
          qty,
          color: CAT_COLORS[name] ?? "#6b7280",
        }))
      );

      // Low stock alerts: stock <= reorder_point
      const low = inv
        .filter((r) => {
          const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return totalStock <= (r.reorder_point ?? 10);
        })
        .sort((a, b) => {
          const aTotal = (a.shopee_stock || 0) + (a.lazada_stock || 0) + (a.tiktok_stock || 0);
          const bTotal = (b.shopee_stock || 0) + (b.lazada_stock || 0) + (b.tiktok_stock || 0);
          return aTotal - bTotal;
        })
        .slice(0, 8)
        .map((r) => {
          const totalStock = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return {
            name: r.product_name || "Unknown",
            code: r.product_code || "N/A",
            qty: totalStock,
            reorder: r.reorder_point ?? 10,
          };
        });
      setLowStock(low);

      // Top movers - products with highest total stock
      const maxStock = Math.max(
        ...inv.map((r) => (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0)),
        1
      );
      
      const topPlatform = (r) => {
        const s = r.shopee_stock || 0;
        const l = r.lazada_stock || 0;
        const t = r.tiktok_stock || 0;
        if (s >= l && s >= t) return "Shopee";
        if (l >= s && l >= t) return "Lazada";
        return "TikTok";
      };
      
      const top = [...inv]
        .filter((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return total > 0;
        })
        .sort((a, b) => {
          const aTotal = (a.shopee_stock || 0) + (a.lazada_stock || 0) + (a.tiktok_stock || 0);
          const bTotal = (b.shopee_stock || 0) + (b.lazada_stock || 0) + (b.tiktok_stock || 0);
          return bTotal - aTotal;
        })
        .slice(0, 5)
        .map((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return {
            name: r.product_name || "Unknown",
            platform: topPlatform(r),
            mv: total,
            bar: Math.round((total / maxStock) * 100),
          };
        });
      setTopMovers(top);

      // Slow movers - products with low total stock that haven't been updated recently
      const now = Date.now();
      const slow = [...inv]
        .filter((r) => {
          const total = (r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0);
          return total < 5 && total > 0;
        })
        .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
        .slice(0, 5)
        .map((r) => ({
          name: r.product_name || "Unknown",
          days: Math.floor((now - new Date(r.updated_at).getTime()) / 86_400_000),
        }))
        .filter((r) => r.days > 0);
      setSlowMovers(slow);

      setLastUpdated(new Date());
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

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();

    // Real-time: refresh when inventory or logs change
    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        fetchAll
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory_logs" },
        fetchAll
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  const fmt = (n) => (n ?? 0).toLocaleString();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Inventory overview · Live stock summary
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                · {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Total stock
          </p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-gray-800">
              {fmt(totals?.total)}
            </p>
          )}
          <p className="text-xs mt-1 text-gray-400">Units on hand</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EE4D2D] inline-block" /> Shopee
          </p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-[#EE4D2D]">
              {fmt(totals?.shopee)}
            </p>
          )}
          <p className="text-xs mt-1 text-gray-400">Total units in stock</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-700 inline-block" /> Lazada
          </p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-violet-700">
              {fmt(totals?.lazada)}
            </p>
          )}
          <p className="text-xs mt-1 text-gray-400">Total units in stock</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-800 inline-block" /> TikTok
          </p>
          {loading ? (
            <Skeleton />
          ) : (
            <p className="text-3xl font-bold mt-1 text-gray-800">
              {fmt(totals?.tiktok)}
            </p>
          )}
          <p className="text-xs mt-1 text-gray-400">Total units in stock</p>
        </div>
      </div>

      {/* Stock by category */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">
          Stock by category
        </h2>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex items-center gap-6">
            <DonutChart cats={cats} />
            <div className="flex flex-col gap-3 flex-1">
              {cats.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-sm text-gray-500">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: c.color }}
                  />
                  {c.name}
                  <span className="ml-auto font-semibold text-gray-700">
                    {c.qty.toLocaleString()}
                  </span>
                </div>
              ))}
              {cats.length === 0 && <p className="text-xs text-gray-400">No data</p>}
            </div>
          </div>
        )}
      </div>

      {/* Low stock + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Low stock alerts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Low stock alerts
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                {lowStock.length} items
              </span>
            )}
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
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
                          isOut
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isOut ? "Out" : `${p.qty} left`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: isOut ? "#b91c1c" : "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
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
      </div>

      {/* Top movers + Slow movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top movers - products with highest stock */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Top stocked items
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : topMovers.length === 0 ? (
            <p className="text-xs text-gray-400">No stock data available.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {topMovers.map((m) => (
                <div key={m.name} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {m.name}
                      </p>
                      <span className="text-xs font-bold text-gray-800 ml-2 shrink-0">
                        {m.mv}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-600"
                        style={{ width: `${m.bar}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded shrink-0">
                    {m.platform}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slow movers - low stock items not updated recently */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Items needing attention
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : slowMovers.length === 0 ? (
            <p className="text-xs text-gray-400">All items are recently updated.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {slowMovers.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between py-2.5"
                >
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
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatLogTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffD === 1) return "Yesterday";
  return d.toLocaleDateString();
}

export default Inventory_db;