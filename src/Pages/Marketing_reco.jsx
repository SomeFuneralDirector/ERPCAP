import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Megaphone,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  PackageX,
  BarChart3,
  Clock,
  Search,
} from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens — shared with Inventory / Sales / Marketing pages ───── */
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
};

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

// orders.created_at / completed_at are TEXT in two formats: "MM/DD/YYYY HH:mm"
// and ISO "YYYY-MM-DD HH:mm:ss". Parse the first explicitly.
const safeDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  const d = m ? new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0)) : new Date(v);
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

const fmtPHP = (n) => `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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
  slowMoverSellThrough: 0.15,
  slowMoverMinStock: 10,
  risingStarTrendPct: 50,
  decliningTrendPct: -40,
  minUnitsForTrend: 5,
  platformGapMinUnits: 10,
  deadStockDays: 60, // kept for messaging clarity; window itself is enforced by DATA_WINDOW_DAYS + last60 bucket
  campaignMinLiftPct: 10,     // lift below this = underperforming
  // Orders only land in this database once their marketplace status reaches
  // "completed" — there's no To Ship / Shipped stage tracked yet — and that
  // typically takes 1-2+ weeks after purchase. Judging a campaign before then
  // compares a mostly-empty "during" window against a full baseline and makes
  // it look artificially bad. 14 days gives completions time to land first.
  campaignMinElapsedDays: 14,
};

// How far back to pull order data. Must comfortably cover the 60-day
// sales-trend window plus the longest campaign baseline we'd compare against.
const DATA_WINDOW_DAYS = 180;

// Recommendation types use only the shared app palette (accent red, amber,
// green, plus the Men / Women / Unisex category colours and neutral gray).
const TONES = {
  warning: { color: C.warning, soft: C.warningSoft, border: C.warningBorder },
  success: { color: C.success, soft: C.successSoft, border: C.successBorder },
  accent: { color: C.accent, soft: C.accentSoft, border: C.accentSoftBorder },
  blue: { color: "#1D4E89", soft: "#EBF1F8", border: "#C9D8EA" },
  plum: { color: "#8b2976", soft: "#F7EBF4", border: "#E6C8DF" },
  slate: { color: "#475569", soft: "#F1F5F9", border: "#D5DDE6" },
  gray: { color: "#6B6B70", soft: "#F5F5F6", border: "#E4E4E7" },
};

const TYPE_META = {
  promo_candidate: { label: "Promo Candidate", icon: Megaphone, tone: TONES.warning },
  rising_star: { label: "Rising Star", icon: TrendingUp, tone: TONES.success },
  declining: { label: "Declining", icon: TrendingDown, tone: TONES.accent },
  platform_gap: { label: "Platform Gap", icon: ArrowLeftRight, tone: TONES.blue },
  dead_stock: { label: "Dead Stock", icon: PackageX, tone: TONES.gray },
  campaign_lift_low: { label: "Campaign Underperforming", icon: BarChart3, tone: TONES.plum },
  campaign_too_early: { label: "Awaiting Data", icon: Clock, tone: TONES.slate },
};

const SEVERITY_ORDER = {
  dead_stock: 0,
  campaign_lift_low: 1,
  declining: 2,
  promo_candidate: 3,
  platform_gap: 4,
  rising_star: 5,
  campaign_too_early: 6,
};

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
      if (elapsedDays < THRESHOLDS.campaignMinElapsedDays) {
        recs.push({
          type: "campaign_too_early",
          title: c.name,
          subtitle: `${c.platform} · ${elapsedDays} day(s) elapsed`,
          message: `Only ${elapsedDays} day(s) in — orders take time to reach "completed" status, so lift can't be judged reliably yet. Check back after day ${THRESHOLDS.campaignMinElapsedDays}.`,
          metrics: [
            { label: "Elapsed", value: `${elapsedDays}d` },
            { label: "Needs", value: `${THRESHOLDS.campaignMinElapsedDays}d` },
          ],
        });
        return;
      }

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
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: meta.tone.border, backgroundColor: meta.tone.soft }}
    >
      <div className="flex items-start gap-3">
        <div
          className="p-1.5 rounded-lg shrink-0"
          style={{ color: meta.tone.color, backgroundColor: "#fff" }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{rec.title}</p>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold border"
              style={{ color: meta.tone.color, backgroundColor: "#fff", borderColor: meta.tone.border }}
            >
              {meta.label}
            </span>
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

    const cutoff = Date.now() - DATA_WINDOW_DAYS * 86_400_000;

    // Single joined query (avoids a huge `order_uuid IN (...)` filter). The
    // recency window is applied below in JS: created_at is TEXT in mixed
    // formats, so a server-side .gte() compared strings and silently dropped
    // every "MM/DD/YYYY" row. Paged because PostgREST caps responses at 1000.
    const [itemsRes, inventoryRes, campaignsRes] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("order_items")
          .select("id, order_uuid, order_id, platform, product_name, sku, quantity, unit_price, orders!inner(completed_at, created_at, paid_time, status)")
          .eq("orders.status", "COMPLETED")
          .order("id")
      ),
      supabase.from("inventory").select("product_name, category, shopee_stock, lazada_stock, tiktok_stock"),
      supabase.from("campaigns").select("id, name, platform, discount_type, discount_value, start_date, end_date, status"),
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
          <h1 className="text-2xl font-semibold text-gray-800">Marketing - Recommendations</h1>
        </div>
      </div>

      {errorMsg && (
        <div
          className="rounded-lg border shadow p-4 text-sm"
          style={{ backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder, color: C.accent }}
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <button
          onClick={() => setTypeFilter("all")}
          className={`bg-white rounded-lg shadow p-3 text-left transition-all cursor-pointer ${
            typeFilter === "all" ? "ring-2 ring-[#B3211B]" : "hover:bg-gray-50"
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
              typeFilter === type ? "ring-2 ring-[#B3211B]" : "hover:bg-gray-50"
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
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
            onFocus={(e) => {
              e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
              e.target.style.borderColor = C.accent;
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = "none";
              e.target.style.borderColor = "#D1D5DB";
            }}
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