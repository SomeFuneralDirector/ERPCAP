import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);


const cats = [
  { name: "Men",   qty: 2460, color: "#2563eb" },
  { name: "Women", qty: 3180, color: "#ec4899" },
  { name: "Unisex", qty: 1250, color: "#10b981" },
];

const lowStock = [
  { name: "Classic Polo Shirt",  code: "MN-0041", qty: 3, reorder: 10 },
  { name: "Slim Fit Chinos",     code: "MN-0088", qty: 5, reorder: 10 },
  { name: "Floral Sundress",     code: "WM-0022", qty: 2, reorder: 8  },
  { name: "High-Waist Jeans",    code: "WM-0057", qty: 0, reorder: 12 },
  { name: "Linen Button-Down",   code: "MN-0103", qty: 4, reorder: 10 },
];

const activity = [
  { text: "Received 50 pcs Classic Polo Shirt from supplier", time: "10:15 AM"  },
  { text: "Stock adjusted: Slim Fit Chinos (-2) — damaged",   time: "9:42 AM"   },
  { text: "Issued 8 units Floral Sundress to Shopee orders",  time: "9:10 AM"   },
  { text: "High-Waist Jeans marked out of stock",             time: "8:55 AM"   },
  { text: "New SKU added: Oversized Tee Crop (WM-0091)",      time: "Yesterday" },
];

const topMovers = [
  { name: "Floral Sundress",    platform: "Shopee", mv: 380, bar: 100 },
  { name: "Classic Polo Shirt", platform: "TikTok", mv: 245, bar: 64  },
  { name: "High-Waist Jeans",   platform: "Lazada", mv: 188, bar: 49  },
  { name: "Oversized Crop Tee", platform: "Shopee", mv: 140, bar: 37  },
];

const slowMovers = [
  { name: "Formal Blazer",      days: 42 },
  { name: "Wool Cardigan",      days: 38 },
  { name: "Pleated Midi Skirt", days: 31 },
  { name: "Linen Trousers",     days: 28 },
];


function DonutChart() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx   = canvas.getContext("2d");
    const total = cats.reduce((a, c) => a + c.qty, 0);
    let angle   = -Math.PI / 2;
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
  }, []);

  return <canvas ref={ref} width={100} height={100} className="shrink-0" />;
}

function Inventory_db() {
  const [totals, setTotals]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchTotals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("stock, shopee_sold, lazada_sold, tiktok_sold, total_sold");

    if (!error && data) {
      setTotals(
        data.reduce(
          (acc, r) => ({
            stock:  acc.stock  + (r.stock       || 0),
            shopee: acc.shopee + (r.shopee_sold  || 0),
            lazada: acc.lazada + (r.lazada_sold  || 0),
            tiktok: acc.tiktok + (r.tiktok_sold  || 0),
            sold:   acc.sold   + (r.total_sold   || 0),
          }),
          { stock: 0, shopee: 0, lazada: 0, tiktok: 0, sold: 0 },
        ),
      );
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  const fmt = (n) => (n ?? 0).toLocaleString();

  const Skeleton = () => (
    <div className="h-8 w-16 bg-gray-100 rounded animate-pulse mt-1" />
  );

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Inventory overview · Live stock summary
            {lastUpdated && (
              <span className="ml-2 text-gray-400">· {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchTotals}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total stock</p>
          {loading ? <Skeleton /> : <p className="text-3xl font-bold mt-1 text-gray-800">{fmt(totals?.stock)}</p>}
          <p className="text-xs mt-1 text-gray-400">Units on hand</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EE4D2D] inline-block" /> Shopee sold
          </p>
          {loading ? <Skeleton /> : <p className="text-3xl font-bold mt-1 text-[#EE4D2D]">{fmt(totals?.shopee)}</p>}
          <p className="text-xs mt-1 text-gray-400">Total units sold</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-700 inline-block" /> Lazada sold
          </p>
          {loading ? <Skeleton /> : <p className="text-3xl font-bold mt-1 text-violet-700">{fmt(totals?.lazada)}</p>}
          <p className="text-xs mt-1 text-gray-400">Total units sold</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-800 inline-block" /> TikTok sold
          </p>
          {loading ? <Skeleton /> : <p className="text-3xl font-bold mt-1 text-gray-800">{fmt(totals?.tiktok)}</p>}
          <p className="text-xs mt-1 text-gray-400">Total units sold</p>
        </div>
      </div>

      {/* Row: Donut */}
      <div className="grid grid-cols-1 gap-4">
        {/* Stock by category */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Stock by category</h2>
          <div className="flex items-center gap-6">
            <DonutChart />
            <div className="flex flex-col gap-3 flex-1">
              {cats.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  {c.name}
                  <span className="ml-auto font-semibold text-gray-700">{c.qty.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row: Low stock + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Low stock alerts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Low stock alerts
            <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
              {lowStock.length} items
            </span>
          </h2>
          <div className="space-y-3">
            {lowStock.map((p) => {
              const isOut = p.qty === 0;
              const pct   = isOut ? 0 : Math.round((p.qty / p.reorder) * 100);
              return (
                <div key={p.code}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{p.name}</p>
                      <p className="text-xs font-mono text-gray-400">{p.code}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 text-xs rounded font-medium shrink-0 ${isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
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
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
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
        </div>
      </div>

      {/* Row: Top movers + Slow movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top movers */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Top moving items</h2>
          <div className="divide-y divide-gray-100">
            {topMovers.map((m) => (
              <div key={m.name} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-700 truncate">{m.name}</p>
                    <span className="text-xs font-bold text-gray-800 ml-2 shrink-0">{m.mv}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-red-600" style={{ width: `${m.bar}%` }} />
                  </div>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded shrink-0">
                  {m.platform}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Slow movers */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Slow moving items</h2>
          <div className="divide-y divide-gray-100">
            {slowMovers.map((m) => (
              <div key={m.name} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-700">{m.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">No movement for {m.days} days</p>
                </div>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                  {m.days}d
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

export default Inventory_db;