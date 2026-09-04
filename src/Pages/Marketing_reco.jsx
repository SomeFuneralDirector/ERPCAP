import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  Megaphone,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  PackageX,
  BarChart3,
  Search,
} from "lucide-react";
import { supabase } from "../api/supabase";

// ══════════════════════════════════════════════════════════════
// Same conventions as Marketing.jsx / Marketing_io.jsx —
// duplicated here on purpose so this file has no cross-file deps.
// ══════════════════════════════════════════════════════════════
const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = p.toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return p;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const centsToPesos = (c) => Math.max(0, toNumber(c)) / 100;

const safeDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const orderDate = (o) => o.completed_at || o.created_at || o.paid_time;

const fmtPHP = (n) => `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Same status rule as Marketing_campaigns.jsx / Marketing.jsx
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

// ══════════════════════════════════════════════════════════════
// TUNABLE THRESHOLDS
// ══════════════════════════════════════════════════════════════
const THRESHOLDS = {
  restockUrgentDays: 7,
  restockWarningDays: 14,
  slowMoverSellThrough: 0.15,
  slowMoverMinStock: 10,
  risingStarTrendPct: 50,
  decliningTrendPct: -40,
  minUnitsForTrend: 5,
  platformGapMinUnits: 10,
  deadStockDays: 60,
  campaignMinLiftPct: 10,     // lift below this = underperforming
  campaignMinElapsedDays: 3,  // need at least this much data to judge
};

const TYPE_META = {
  restock_urgent: { label: "Restock — Urgent", icon: AlertTriangle, badge: "bg-red-100 text-red-700", card: "border-red-200 bg-red-50/40" },
  restock_warning: { label: "Restock — Soon", icon: AlertTriangle, badge: "bg-amber-100 text-amber-700", card: "border-amber-200 bg-amber-50/40" },
  promo_candidate: { label: "Promo Candidate", icon: Megaphone, badge: "bg-orange-100 text-orange-700", card: "border-orange-200 bg-orange-50/40" },
  rising_star: { label: "Rising Star", icon: TrendingUp, badge: "bg-emerald-100 text-emerald-700", card: "border-emerald-200 bg-emerald-50/40" },
  declining: { label: "Declining", icon: TrendingDown, badge: "bg-pink-100 text-pink-700", card: "border-pink-200 bg-pink-50/40" },
  platform_gap: { label: "Platform Gap", icon: ArrowLeftRight, badge: "bg-indigo-100 text-indigo-700", card: "border-indigo-200 bg-indigo-50/40" },
  dead_stock: { label: "Dead Stock", icon: PackageX, badge: "bg-gray-200 text-gray-700", card: "border-gray-300 bg-gray-50" },
  campaign_lift_low: { label: "Campaign Underperforming", icon: BarChart3, badge: "bg-purple-100 text-purple-700", card: "border-purple-200 bg-purple-50/40" },
};

const SEVERITY_ORDER = {
  restock_urgent: 0,
  dead_stock: 1,
  campaign_lift_low: 2,
  restock_warning: 3,
  declining: 4,
  promo_candidate: 5,
  platform_gap: 6,
  rising_star: 7,
};

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ══════════════════════════════════════════════════════════════
// Pure logic — metrics + rules
// ══════════════════════════════════════════════════════════════

function computeProductMetrics(inventoryRows, orderItems, orderDateById) {
  const now = Date.now();
  const DAY = 86_400_000;

  const salesMap = {}; // product_name -> aggregates

  orderItems.forEach((item) => {
    const date = orderDateById[item.order_uuid];
    if (!date) return;
    const ageDays = (now - date.getTime()) / DAY;

    const key = item.product_name || "Unnamed Product";
    if (!salesMap[key]) {
      salesMap[key] = {
        last30: 0,
        prev30: 0,
        last60: 0,
        revenueLast30: 0,
        byPlatformLast30: { Shopee: 0, Lazada: 0, TikTok: 0 },
      };
    }
    const qty = toNumber(item.quantity);
    const platform = normalizePlatform(item.platform);

    if (ageDays <= 60) salesMap[key].last60 += qty;
    if (ageDays <= 30) {
      salesMap[key].last30 += qty;
      salesMap[key].revenueLast30 += qty * centsToPesos(item.unit_price);
      if (salesMap[key].byPlatformLast30[platform] !== undefined) {
        salesMap[key].byPlatformLast30[platform] += qty;
      }
    } else if (ageDays <= 60) {
      salesMap[key].prev30 += qty;
    }
  });

  return inventoryRows.map((p) => {
    const s = salesMap[p.product_name] || {
      last30: 0,
      prev30: 0,
      last60: 0,
      revenueLast30: 0,
      byPlatformLast30: { Shopee: 0, Lazada: 0, TikTok: 0 },
    };
    const currentStock = toNumber(p.shopee_stock) + toNumber(p.lazada_stock) + toNumber(p.tiktok_stock);
    const avgDailySales = s.last30 / 30;
    const daysOfInventory = avgDailySales > 0 ? currentStock / avgDailySales : Infinity;
    const sellThroughRate = s.last30 + currentStock > 0 ? s.last30 / (s.last30 + currentStock) : 0;
    const trendPct = s.prev30 > 0 ? ((s.last30 - s.prev30) / s.prev30) * 100 : s.last30 > 0 ? 100 : 0;

    return {
      product_name: p.product_name,
      category: p.category,
      currentStock,
      platformStock: { Shopee: toNumber(p.shopee_stock), Lazada: toNumber(p.lazada_stock), TikTok: toNumber(p.tiktok_stock) },
      unitsSoldLast30: s.last30,
      unitsSoldPrev30: s.prev30,
      unitsSoldLast60: s.last60,
      revenueLast30: s.revenueLast30,
      byPlatformLast30: s.byPlatformLast30,
      daysOfInventory,
      sellThroughRate,
      trendPct,
    };
  });
}

function platformHasActiveCampaign(campaignsWithStatus, platform) {
  return campaignsWithStatus.some(
    (c) => c.derivedStatus === "Active" && (c.platform === platform || c.platform === "All Platforms")
  );
}

function generateProductRecommendations(products, campaignsWithStatus) {
  const recs = [];

  products.forEach((p) => {
    if (p.daysOfInventory !== Infinity && p.unitsSoldLast30 >= THRESHOLDS.minUnitsForTrend) {
      if (p.daysOfInventory <= THRESHOLDS.restockUrgentDays) {
        recs.push({
          type: "restock_urgent",
          title: p.product_name,
          subtitle: p.category || "",
          message: `Only ~${Math.max(0, Math.round(p.daysOfInventory))} day(s) of stock left (${p.currentStock} units, selling ${(p.unitsSoldLast30 / 30).toFixed(1)}/day). Reorder now.`,
          metrics: [
            { label: "Stock", value: p.currentStock },
            { label: "Sold (30d)", value: p.unitsSoldLast30 },
          ],
        });
      } else if (p.daysOfInventory <= THRESHOLDS.restockWarningDays) {
        recs.push({
          type: "restock_warning",
          title: p.product_name,
          subtitle: p.category || "",
          message: `~${Math.round(p.daysOfInventory)} days of stock left (${p.currentStock} units on hand). Plan a reorder soon.`,
          metrics: [
            { label: "Stock", value: p.currentStock },
            { label: "Sold (30d)", value: p.unitsSoldLast30 },
          ],
        });
      }
    }

    if (p.unitsSoldLast60 === 0 && p.currentStock > 0) {
      recs.push({
        type: "dead_stock",
        title: p.product_name,
        subtitle: p.category || "",
        message: `No sales in 60+ days with ${p.currentStock} units still in stock. Consider a clearance discount or bundling.`,
        metrics: [{ label: "Stock", value: p.currentStock }, { label: "Sold (60d)", value: 0 }],
      });
    } else if (
      p.currentStock >= THRESHOLDS.slowMoverMinStock &&
      p.sellThroughRate < THRESHOLDS.slowMoverSellThrough &&
      p.unitsSoldLast60 > 0
    ) {
      const strongPlatform = Object.entries(p.byPlatformLast30).sort((a, b) => b[1] - a[1])[0]?.[0];
      const alreadyPromoted = strongPlatform && platformHasActiveCampaign(campaignsWithStatus, strongPlatform);
      recs.push({
        type: "promo_candidate",
        title: p.product_name,
        subtitle: p.category || "",
        message: alreadyPromoted
          ? `Low sell-through (${(p.sellThroughRate * 100).toFixed(0)}%) with ${p.currentStock} units on hand — despite an active campaign on ${strongPlatform}. Consider a stronger offer or featuring it more prominently in that campaign.`
          : `Low sell-through (${(p.sellThroughRate * 100).toFixed(0)}%) with ${p.currentStock} units on hand. A promo or bundle could move this stock.`,
        metrics: [
          { label: "Sell-through", value: `${(p.sellThroughRate * 100).toFixed(0)}%` },
          { label: "Stock", value: p.currentStock },
        ],
      });
    }

    if (p.unitsSoldLast30 >= THRESHOLDS.minUnitsForTrend || p.unitsSoldPrev30 >= THRESHOLDS.minUnitsForTrend) {
      if (p.trendPct >= THRESHOLDS.risingStarTrendPct) {
        recs.push({
          type: "rising_star",
          title: p.product_name,
          subtitle: p.category || "",
          message: `Sales up ${p.trendPct.toFixed(0)}% vs. the prior 30 days (${p.unitsSoldPrev30} → ${p.unitsSoldLast30} units, ${fmtPHP(p.revenueLast30)}). Consider featuring it or increasing ad spend while it's hot.`,
          metrics: [{ label: "Trend", value: `+${p.trendPct.toFixed(0)}%` }, { label: "Revenue (30d)", value: fmtPHP(p.revenueLast30) }],
        });
      } else if (p.trendPct <= THRESHOLDS.decliningTrendPct) {
        recs.push({
          type: "declining",
          title: p.product_name,
          subtitle: p.category || "",
          message: `Sales down ${Math.abs(p.trendPct).toFixed(0)}% vs. the prior 30 days (${p.unitsSoldPrev30} → ${p.unitsSoldLast30} units). Worth investigating or running a win-back promo.`,
          metrics: [{ label: "Trend", value: `${p.trendPct.toFixed(0)}%` }, { label: "Sold (30d)", value: p.unitsSoldLast30 }],
        });
      }
    }

    const platforms = Object.entries(p.byPlatformLast30);
    const [strongPlatform, strongUnits] = platforms.reduce((best, cur) => (cur[1] > best[1] ? cur : best), ["", 0]);
    if (strongUnits >= THRESHOLDS.platformGapMinUnits) {
      platforms.forEach(([platform, units]) => {
        if (platform === strongPlatform) return;
        const stockThere = p.platformStock[platform] || 0;
        if (units === 0 && stockThere > 0) {
          recs.push({
            type: "platform_gap",
            title: p.product_name,
            subtitle: p.category || "",
            message: `Sells well on ${strongPlatform} (${strongUnits} units) but 0 sold on ${platform} despite ${stockThere} units in stock there. Check the listing or run a platform-specific promo.`,
            metrics: [{ label: strongPlatform, value: strongUnits }, { label: platform, value: 0 }],
          });
        }
      });
    }
  });

  return recs;
}

// Measures whether a campaign actually lifted sales on its platform,
// by comparing units sold during the campaign to an equal-length
// window immediately before it started.
function generateCampaignRecommendations(campaignsWithStatus, orderItems, orderDateById) {
  const recs = [];

  campaignsWithStatus
    .filter((c) => ["Active", "Ended"].includes(c.derivedStatus) && c.start_date && c.end_date)
    .forEach((c) => {
      const start = safeDate(c.start_date);
      const now = new Date();
      const nominalEnd = safeDate(c.end_date);
      const effectiveEnd = c.derivedStatus === "Active" ? now : nominalEnd;
      if (!start || !effectiveEnd) return;

      const elapsedDays = Math.floor((effectiveEnd - start) / 86_400_000) + 1;
      if (elapsedDays < THRESHOLDS.campaignMinElapsedDays) return;

      const baselineStart = new Date(start.getTime() - elapsedDays * 86_400_000);
      const baselineEnd = new Date(start.getTime() - 1);

      const unitsInWindow = (from, to) =>
        orderItems.reduce((sum, item) => {
          const date = orderDateById[item.order_uuid];
          if (!date || date < from || date > to) return sum;
          const platform = normalizePlatform(item.platform);
          if (c.platform !== "All Platforms" && platform !== c.platform) return sum;
          return sum + toNumber(item.quantity);
        }, 0);

      const campaignUnits = unitsInWindow(start, effectiveEnd);
      const baselineUnits = unitsInWindow(baselineStart, baselineEnd);
      const liftPct = baselineUnits > 0 ? ((campaignUnits - baselineUnits) / baselineUnits) * 100 : campaignUnits > 0 ? 100 : 0;

      if (liftPct < THRESHOLDS.campaignMinLiftPct) {
        recs.push({
          type: "campaign_lift_low",
          title: c.name,
          subtitle: `${c.platform} · ${elapsedDays} day(s) elapsed`,
          message: `${campaignUnits} units sold during the campaign vs. ${baselineUnits} in the equivalent period before it — a lift of only ${liftPct >= 0 ? "+" : ""}${liftPct.toFixed(0)}%. Consider revising the offer, creative, or targeting.`,
          metrics: [
            { label: "During campaign", value: campaignUnits },
            { label: "Baseline", value: baselineUnits },
            { label: "Lift", value: `${liftPct >= 0 ? "+" : ""}${liftPct.toFixed(0)}%` },
          ],
        });
      }
    });

  return recs;
}

// ══════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════

function RecommendationCard({ rec }) {
  const meta = TYPE_META[rec.type];
  const Icon = meta.icon;

  return (
    <div className={`rounded-lg border p-4 ${meta.card}`}>
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg ${meta.badge} shrink-0`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{rec.title}</p>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
          </div>
          {rec.subtitle && <p className="text-xs text-gray-400 mt-0.5">{rec.subtitle}</p>}
        </div>
      </div>

      <p className="text-sm text-gray-700 mt-3 leading-relaxed">{rec.message}</p>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-200/60 text-xs text-gray-500">
        {rec.metrics.map((m) => (
          <span key={m.label}>
            {m.label}: <b className="text-gray-700">{m.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Marketing_reco() {
  const [inventory, setInventory] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [orderDateById, setOrderDateById] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const { data: completedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_id, platform, completed_at, created_at, paid_time, status")
      .eq("status", "COMPLETED");

    if (ordersError) {
      setErrorMsg(ordersError.message);
      setLoading(false);
      return;
    }

    const validOrders = (completedOrders || []).filter((o) => safeDate(orderDate(o)));
    const dateMap = {};
    validOrders.forEach((o) => {
      dateMap[o.id] = safeDate(orderDate(o));
    });
    setOrderDateById(dateMap);

    const orderUuids = validOrders.map((o) => o.id).filter(Boolean);

    const [itemsRes, inventoryRes, campaignsRes] = await Promise.all([
      orderUuids.length > 0
        ? supabase
            .from("order_items")
            .select("order_uuid, order_id, platform, product_name, sku, quantity, unit_price")
            .in("order_uuid", orderUuids)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("inventory").select("product_name, category, shopee_stock, lazada_stock, tiktok_stock"),
      supabase.from("campaigns").select("id, name, platform, discount_type, discount_value, start_date, end_date, status"),
    ]);

    if (itemsRes.error) {
      setErrorMsg((prev) => prev || itemsRes.error.message);
    } else {
      setOrderItems((itemsRes.data || []).filter((i) => toNumber(i.quantity) > 0));
    }

    if (!inventoryRes.error) setInventory(inventoryRes.data || []);
    else console.error("inventory fetch error:", inventoryRes.error);

    if (!campaignsRes.error) setCampaigns((campaignsRes.data || []).filter((c) => c?.name));
    else console.error("campaigns fetch error:", campaignsRes.error);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const campaignsWithStatus = useMemo(
    () => campaigns.map((c) => ({ ...c, derivedStatus: deriveCampaignStatus(c) })),
    [campaigns]
  );

  const products = useMemo(
    () => computeProductMetrics(inventory, orderItems, orderDateById),
    [inventory, orderItems, orderDateById]
  );

  const recommendations = useMemo(() => {
    const productRecs = generateProductRecommendations(products, campaignsWithStatus);
    const campaignRecs = generateCampaignRecommendations(campaignsWithStatus, orderItems, orderDateById);
    return [...productRecs, ...campaignRecs].sort((a, b) => SEVERITY_ORDER[a.type] - SEVERITY_ORDER[b.type]);
  }, [products, campaignsWithStatus, orderItems, orderDateById]);

  const filtered = recommendations.filter((r) => {
    const matchType = typeFilter === "all" || r.type === typeFilter;
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const countsByType = useMemo(() => {
    const counts = {};
    recommendations.forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });
    return counts;
  }, [recommendations]);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Marketing — Recommendations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rule-based suggestions from sales velocity, sell-through, trend, stock, and campaign lift
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer self-start md:self-auto"
        >
          {loading ? "↻ Analyzing…" : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">{errorMsg}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <button
          onClick={() => setTypeFilter("all")}
          className={`bg-white rounded-lg shadow p-3 text-left transition-all cursor-pointer ${
            typeFilter === "all" ? "ring-2 ring-red-400" : ""
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">All</p>
          <p className="text-2xl font-bold mt-1 text-gray-800">{loading ? "…" : recommendations.length}</p>
        </button>
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`bg-white rounded-lg shadow p-3 text-left transition-all cursor-pointer ${
              typeFilter === type ? "ring-2 ring-red-400" : ""
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">{meta.label}</p>
            <p className="text-2xl font-bold mt-1 text-gray-800">{loading ? "…" : countsByType[type] || 0}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow px-4 py-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search product or campaign name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">
            Analyzing sales, inventory, and campaign data…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            <p className="font-medium text-gray-500">
              {recommendations.length === 0
                ? "No recommendations right now — nothing crossed a threshold."
                : "No recommendations match this filter."}
            </p>
          </div>
        ) : (
          filtered.map((rec, i) => <RecommendationCard key={`${rec.type}-${rec.title}-${i}`} rec={rec} />)
        )}
      </div>
    </div>
  );
}

export default Marketing_reco;