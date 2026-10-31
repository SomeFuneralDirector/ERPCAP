import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Megaphone,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Search,
  AlertTriangle,
  Package,
  Filter,
} from "lucide-react";
import { supabase } from "../api/supabase";

/* Design tokens – shared with Inventory / Sales / Marketing pages */
const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  success: "#15803D",
  successSoft: "#EEF6EF",
  successBorder: "#CDE7D2",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
  blue: "#1D4E89",
  blueSoft: "#EBF1F8",
  blueBorder: "#C9D8EA",
  gray: "#6B7280",
};

const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = String(p).toLowerCase();
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

// orders.created_at / completed_at are TEXT in two formats: "MM/DD/YYYY HH:mm"
// and ISO "YYYY-MM-DD HH:mm:ss". Parse the first explicitly.
const safeDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = String(v).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/
  );
  const d = m
    ? new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0))
    : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// PostgREST caps a single response at 1000 rows; page through everything.
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

const fmtPHP = (n) =>
  `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtPct = (n, digits = 0) => `${Number(n).toFixed(digits)}%`;

// Cap displayed trend so 1200% doesn't look insane
const cappedTrendPct = (pct) => Math.min(100, Math.max(-100, pct));

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
  // Promo Candidate (slow mover)
  slowMoverSellThrough: 0.18,
  slowMoverMinStock: 8,
  slowMoverMinHistory: 3,

  // Trends
  risingStarTrendPct: 45,
  decliningTrendPct: -35,
  minUnitsForTrend: 4,

  // Platform Gap
  platformGapMinUnits: 8,
  platformGapStockMin: 3,

  // Priority scoring weights
  priority: {
    declining: 100,
    promo_candidate: 70,
    platform_gap: 55,
    rising_star: 40,
  },
};

// How far back to pull order data. Must cover the 60-day sales-trend window.
const DATA_WINDOW_DAYS = 180;

const TONES = {
  warning: { color: C.warning, soft: C.warningSoft, border: C.warningBorder },
  success: { color: C.success, soft: C.successSoft, border: C.successBorder },
  accent: { color: C.accent, soft: C.accentSoft, border: C.accentSoftBorder },
  blue: { color: C.blue, soft: C.blueSoft, border: C.blueBorder },
};

const TYPE_META = {
  declining: {
    label: "Declining",
    icon: TrendingDown,
    tone: TONES.accent,
    description: "Sales are falling – act fast",
  },
  promo_candidate: {
    label: "Promo Candidate",
    icon: Megaphone,
    tone: TONES.warning,
    description: "Slow mover with excess stock",
  },
  platform_gap: {
    label: "Platform Gap",
    icon: ArrowLeftRight,
    tone: TONES.blue,
    description: "Strong on one platform, weak on another",
  },
  rising_star: {
    label: "Rising",
    icon: TrendingUp,
    tone: TONES.success,
    description: "Sales are accelerating",
  },
};

// ══════════════════════════════════════════════════════════════
// Pure logic: metrics + rules
// ══════════════════════════════════════════════════════════════

function computeProductMetrics(inventoryRows, orderItems, orderDateById) {
  const now = Date.now();
  const DAY = 86_400_000;

  const salesMap = {};

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
        lastSaleAt: null,
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
      if (!salesMap[key].lastSaleAt || date > salesMap[key].lastSaleAt) {
        salesMap[key].lastSaleAt = date;
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
      lastSaleAt: null,
    };

    const currentStock =
      toNumber(p.shopee_stock) +
      toNumber(p.lazada_stock) +
      toNumber(p.tiktok_stock);

    const sellThroughRate =
      s.last30 + currentStock > 0 ? s.last30 / (s.last30 + currentStock) : 0;

    let trendPct = 0;
    if (s.prev30 > 0) {
      trendPct = ((s.last30 - s.prev30) / s.prev30) * 100;
    } else if (s.last30 > 0) {
      trendPct = 100;
    }

    const dailyRate = s.last30 / 30;
    const daysOfStock =
      dailyRate > 0 ? Math.round(currentStock / dailyRate) : currentStock > 0 ? 999 : 0;

    return {
      product_name: p.product_name,
      category: p.category || "",
      currentStock,
      platformStock: {
        Shopee: toNumber(p.shopee_stock),
        Lazada: toNumber(p.lazada_stock),
        TikTok: toNumber(p.tiktok_stock),
      },
      unitsSoldLast30: s.last30,
      unitsSoldPrev30: s.prev30,
      unitsSoldLast60: s.last60,
      revenueLast30: s.revenueLast30,
      byPlatformLast30: s.byPlatformLast30,
      sellThroughRate,
      trendPct,
      daysOfStock,
      lastSaleAt: s.lastSaleAt,
    };
  });
}

function platformHasActiveCampaign(campaignsWithStatus, platform) {
  return campaignsWithStatus.some(
    (c) =>
      c.derivedStatus === "Active" &&
      (c.platform === platform || c.platform === "All Platforms")
  );
}

function generateProductRecommendations(products, campaignsWithStatus) {
  const recs = [];

  products.forEach((p) => {
    // ── 1. Promo Candidate (slow mover) ────────────────────────
    if (
      p.currentStock >= THRESHOLDS.slowMoverMinStock &&
      p.sellThroughRate < THRESHOLDS.slowMoverSellThrough &&
      p.unitsSoldLast60 >= THRESHOLDS.slowMoverMinHistory
    ) {
      const strongPlatform = Object.entries(p.byPlatformLast30).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];

      const alreadyPromoted =
        strongPlatform &&
        platformHasActiveCampaign(campaignsWithStatus, strongPlatform);

      const severityBoost =
        p.sellThroughRate < 0.08 ? 25 : p.sellThroughRate < 0.12 ? 15 : 0;

      recs.push({
        type: "promo_candidate",
        title: p.product_name,
        subtitle: p.category,
        priority:
          THRESHOLDS.priority.promo_candidate +
          severityBoost +
          Math.min(20, Math.floor(p.currentStock / 10)),
        message: alreadyPromoted
          ? `Only ${fmtPct(p.sellThroughRate * 100)} of stock sold in 30 days with ${p.currentStock} units left. An active campaign already exists on ${strongPlatform}, but it’s not moving the needle. Try a deeper discount, bundle, or featured placement.`
          : `Only ${fmtPct(p.sellThroughRate * 100)} of stock sold in 30 days with ${p.currentStock} units left (~${p.daysOfStock} days of cover). A targeted promo or bundle can clear inventory.`,
        metrics: [
          { label: "Stock Sold", value: fmtPct(p.sellThroughRate * 100) },
          { label: "Stock", value: p.currentStock },
          { label: "Sold (30d)", value: p.unitsSoldLast30 },
        ],
        product: p,
      });
    }

    // ── 2. Rising Star / Declining ─────────────────────────────
    const hasEnoughVolume =
      p.unitsSoldLast30 >= THRESHOLDS.minUnitsForTrend ||
      p.unitsSoldPrev30 >= THRESHOLDS.minUnitsForTrend;

    if (hasEnoughVolume) {
      const displayTrend = cappedTrendPct(p.trendPct);

      if (p.trendPct >= THRESHOLDS.risingStarTrendPct) {
        recs.push({
          type: "rising_star",
          title: p.product_name,
          subtitle: p.category,
          priority:
            THRESHOLDS.priority.rising_star +
            Math.min(30, Math.floor(Math.min(p.trendPct, 200) / 5)),
          message: `Sales jumped ${fmtPct(displayTrend)} vs the previous 30 days (${p.unitsSoldPrev30} → ${p.unitsSoldLast30} units, ${fmtPHP(p.revenueLast30)}). Feature it, increase ad spend, or expand stock while momentum is high.`,
          metrics: [
            { label: "Trend", value: `+${fmtPct(displayTrend)}` },
            { label: "Revenue (30d)", value: fmtPHP(p.revenueLast30) },
            { label: "Units (30d)", value: p.unitsSoldLast30 },
          ],
          product: p,
        });
      } else if (p.trendPct <= THRESHOLDS.decliningTrendPct) {
        const dropSeverity =
          p.trendPct <= -60 ? 30 : p.trendPct <= -45 ? 15 : 0;

        recs.push({
          type: "declining",
          title: p.product_name,
          subtitle: p.category,
          priority: THRESHOLDS.priority.declining + dropSeverity,
          message: `Sales dropped ${fmtPct(Math.abs(displayTrend))} vs the previous 30 days (${p.unitsSoldPrev30} → ${p.unitsSoldLast30} units). Investigate pricing, competition, or listing quality — or run a recovery promo.`,
          metrics: [
            { label: "Trend", value: fmtPct(displayTrend) },
            { label: "Sold (30d)", value: p.unitsSoldLast30 },
            { label: "Revenue (30d)", value: fmtPHP(p.revenueLast30) },
          ],
          product: p,
        });
      }
    }

    // ── 3. Platform Gap ────────────────────────────────────────
    const platforms = Object.entries(p.byPlatformLast30);
    const [strongPlatform, strongUnits] = platforms.reduce(
      (best, cur) => (cur[1] > best[1] ? cur : best),
      ["", 0]
    );

    if (strongUnits >= THRESHOLDS.platformGapMinUnits) {
      platforms.forEach(([platform, units]) => {
        if (platform === strongPlatform) return;
        const stockThere = p.platformStock[platform] || 0;

        if (units === 0 && stockThere >= THRESHOLDS.platformGapStockMin) {
          recs.push({
            type: "platform_gap",
            title: p.product_name,
            subtitle: p.category,
            priority:
              THRESHOLDS.priority.platform_gap +
              Math.min(20, Math.floor(strongUnits / 5)),
            message: `Strong on ${strongPlatform} (${strongUnits} units sold) but zero sales on ${platform} despite ${stockThere} units in stock. Check the listing, price, or run a platform-specific promo.`,
            metrics: [
              { label: strongPlatform, value: strongUnits },
              { label: platform, value: 0 },
              { label: "Stock on " + platform, value: stockThere },
            ],
            product: p,
          });
        }
      });
    }
  });

  return recs.sort((a, b) => b.priority - a.priority);
}

// ══════════════════════════════════════════════════════════════
// UI Components
// ══════════════════════════════════════════════════════════════

function RecommendationCard({ rec }) {
  const meta = TYPE_META[rec.type];
  const Icon = meta.icon;

  return (
    <div
      className="group rounded-xl border p-4 transition-all duration-200 hover:shadow-md"
      style={{
        borderColor: meta.tone.border,
        backgroundColor: meta.tone.soft,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg shrink-0 shadow-sm"
          style={{ color: meta.tone.color, backgroundColor: "#fff" }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {rec.title}
            </p>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold border tracking-wide"
              style={{
                color: meta.tone.color,
                backgroundColor: "#fff",
                borderColor: meta.tone.border,
              }}
            >
              {meta.label}
            </span>
          </div>

          {rec.subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{rec.subtitle}</p>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-700 mt-3 leading-relaxed">
        {rec.message}
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3.5 pt-3 border-t border-black/5 text-xs text-gray-500">
        {rec.metrics.map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1">
            <span className="text-gray-400">{m.label}:</span>
            <b className="text-gray-800 font-semibold">{m.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-3 bg-gray-50 rounded w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-gray-50 rounded w-full" />
        <div className="h-3 bg-gray-50 rounded w-5/6" />
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

    const cutoff = Date.now() - DATA_WINDOW_DAYS * 86_400_000;

    const [itemsRes, inventoryRes, campaignsRes] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("order_items")
          .select(
            "id, order_uuid, order_id, platform, product_name, sku, quantity, unit_price, orders!inner(completed_at, created_at, paid_time, status)"
          )
          .eq("orders.status", "COMPLETED")
          .order("id")
      ),
      supabase
        .from("inventory")
        .select(
          "product_name, category, shopee_stock, lazada_stock, tiktok_stock"
        ),
      supabase
        .from("campaigns")
        .select(
          "id, name, platform, discount_type, discount_value, start_date, end_date, status"
        ),
    ]);

    if (itemsRes.error) {
      setErrorMsg(itemsRes.error.message);
      setLoading(false);
      return;
    }

    const dateMap = {};
    const validItems = [];
    (itemsRes.data || []).forEach((item) => {
      const o = item.orders;
      const date = safeDate(o?.completed_at || o?.created_at || o?.paid_time);
      if (!date || date.getTime() < cutoff) return;
      dateMap[item.order_uuid] = date;
      if (toNumber(item.quantity) > 0) validItems.push(item);
    });

    setOrderDateById(dateMap);
    setOrderItems(validItems);

    if (!inventoryRes.error) setInventory(inventoryRes.data || []);
    else console.error("inventory fetch error:", inventoryRes.error);

    if (!campaignsRes.error)
      setCampaigns((campaignsRes.data || []).filter((c) => c?.name));
    else console.error("campaigns fetch error:", campaignsRes.error);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const campaignsWithStatus = useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        derivedStatus: deriveCampaignStatus(c),
      })),
    [campaigns]
  );

  const products = useMemo(
    () => computeProductMetrics(inventory, orderItems, orderDateById),
    [inventory, orderItems, orderDateById]
  );

  const recommendations = useMemo(() => {
    return generateProductRecommendations(products, campaignsWithStatus);
  }, [products, campaignsWithStatus]);

  const filtered = useMemo(() => {
    return recommendations.filter((r) => {
      const matchType = typeFilter === "all" || r.type === typeFilter;
      const matchSearch =
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        (r.subtitle &&
          r.subtitle.toLowerCase().includes(search.toLowerCase()));
      return matchType && matchSearch;
    });
  }, [recommendations, typeFilter, search]);

  const countsByType = useMemo(() => {
    const counts = { all: recommendations.length };
    recommendations.forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });
    return counts;
  }, [recommendations]);

  const highPriorityCount = useMemo(
    () => recommendations.filter((r) => r.priority >= 90).length,
    [recommendations]
  );

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Marketing - Recommendations
          </h1>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          className="rounded-xl border p-4 text-sm flex items-start gap-3"
          style={{
            backgroundColor: C.accentSoft,
            borderColor: C.accentSoftBorder,
            color: C.accent,
          }}
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load data</p>
            <p className="mt-0.5 opacity-90">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Summary strip */}
      {!loading && recommendations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Total Alerts</p>
            <p className="text-2xl font-semibold mt-1 text-gray-900 tabular-nums">
              {recommendations.length}
            </p>
            <p className="text-xs mt-1 text-gray-400">recommendations</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">High Priority</p>
            <p
              className="text-2xl font-semibold mt-1 tabular-nums"
              style={{ color: C.accent }}
            >
              {highPriorityCount}
            </p>
            <p className="text-xs mt-1 text-gray-400">need attention first</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Declining</p>
            <p
              className="text-2xl font-semibold mt-1 tabular-nums"
              style={{ color: C.accent }}
            >
              {countsByType.declining || 0}
            </p>
            <p className="text-xs mt-1 text-gray-400">sales falling</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">Promo Ready</p>
            <p
              className="text-2xl font-semibold mt-1 tabular-nums"
              style={{ color: C.warning }}
            >
              {countsByType.promo_candidate || 0}
            </p>
            <p className="text-xs mt-1 text-gray-400">slow movers with excess stock</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <Filter size={13} />
          Filter
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
              typeFilter === "all"
                ? "bg-[#B3211B] text-white border-[#B3211B] shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            All
            <span className="ml-1.5 opacity-70">{countsByType.all || 0}</span>
          </button>

          {Object.entries(TYPE_META).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border inline-flex items-center gap-1.5 ${
                typeFilter === type
                  ? "text-white shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
              style={
                typeFilter === type
                  ? {
                      backgroundColor: meta.tone.color,
                      borderColor: meta.tone.color,
                    }
                  : undefined
              }
            >
              <meta.icon size={14} />
              {meta.label}
              <span className="opacity-70">{countsByType[type] || 0}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search product or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#B3211B]/20 focus:border-[#B3211B] transition"
          />
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-4">
              <Package size={22} className="text-gray-400" />
            </div>
            <p className="font-medium text-gray-700">
              {recommendations.length === 0
                ? "No recommendations right now"
                : "No matches for this filter"}
            </p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
              {recommendations.length === 0
                ? "Nothing crossed the current thresholds. Check back after more sales data comes in, or lower the thresholds if needed."
                : "Try clearing the search or selecting a different type."}
            </p>
          </div>
        ) : (
          filtered.map((rec, i) => (
            <RecommendationCard
              key={`${rec.type}-${rec.title}-${i}`}
              rec={rec}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default Marketing_reco;