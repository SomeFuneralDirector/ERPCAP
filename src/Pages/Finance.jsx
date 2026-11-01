import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../api/supabase";
import { formatPeso, localDateKey, firstOfMonthKey, toNumber } from "../lib/Finance";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

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

const TRACK_COLOR = "#F3F4F6";
const FETCH_CHUNK = 1000;

const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;

function focusDateInput(e) {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
}

function blurDateInput(e) {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
}

/* Fetch every non-archived entry in range, paging past the 1000-row cap. */
async function fetchAllEntries(dateFrom, dateTo) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("id, date, detail, type, amount, ledger_categories(name, classification)")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .eq("archived", false)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + FETCH_CHUNK - 1);

    if (error) return { data: null, error };

    all = all.concat(data || []);
    if (!data || data.length < FETCH_CHUNK) break;
    from += FETCH_CHUNK;
  }

  return { data: all, error: null };
}

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

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xl px-3.5 py-2.5 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tabular-nums" style={{ color: p.stroke }}>
          {p.name}: ₱{Number(p.value || 0).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

/** Progress-style ranking bars for category breakdown */
function RankingBars({ data, valueKey = "amount", color = C.accent, formatter = (v) => `₱${Number(v).toLocaleString()}` }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);

  return (
    <div className="space-y-3">
      {data.map((row, i) => {
        const value = row[valueKey] || 0;
        const pct = Math.round((value / max) * 100);
        return (
          <div key={row.name}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: i < 3 ? color : "#9CA3AF" }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-gray-700 truncate" title={row.name}>
                  {row.name}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                {formatter(value)}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: TRACK_COLOR }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  opacity: 1 - i * 0.05,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Finance() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstOfMonthKey());
  const [dateTo, setDateTo] = useState(localDateKey());

  const [entries, setEntries] = useState([]);
  const [accountBalances, setAccountBalances] = useState([]);
  const [error, setError] = useState("");

  const loadFinanceData = useCallback(
    async (isInitial = false) => {
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        setEntries([]);
        setAccountBalances([]);
        setError("Invalid date range.");
        setLoading(false);
        return;
      }

      if (isInitial) setLoading(true);
      setError("");

      const [entriesRes, balancesRes] = await Promise.all([
        fetchAllEntries(dateFrom, dateTo),
        supabase.rpc("account_balances", { p_from: dateFrom, p_to: dateTo }),
      ]);

      if (entriesRes.error || balancesRes.error) {
        console.error("Error loading finance data:", entriesRes.error || balancesRes.error);
        setEntries([]);
        setAccountBalances([]);
        setError("Unable to load finance data.");
      } else {
        setEntries(entriesRes.data || []);
        setAccountBalances(balancesRes.data || []);
      }

      setLoading(false);
    },
    [dateFrom, dateTo]
  );

  useEffect(() => {
    loadFinanceData(true);
  }, [loadFinanceData]);

  // True P&L. Amounts stay in cents here: formatPeso() already divides by 100.
  const { totalRevenue, totalExpenses, net, isProfit } = useMemo(() => {
    const rows = (accountBalances || [])
      .filter((r) => r.name && r.classification)
      .map((r) => ({
        classification: String(r.classification).toLowerCase(),
        debit: toNumber(r.debit),
        credit: toNumber(r.credit),
      }));

    const revenue = rows
      .filter((r) => r.classification === "revenue")
      .reduce((sum, r) => sum + (r.debit - r.credit), 0);

    const expenses = rows
      .filter((r) => r.classification === "expense")
      .reduce((sum, r) => sum + (r.credit - r.debit), 0);

    const netValue = revenue - expenses;
    return {
      totalRevenue: revenue,
      totalExpenses: expenses,
      net: netValue,
      isProfit: netValue >= 0,
    };
  }, [accountBalances]);

  // Charts – only revenue & expense categories.
  // Charts format with toLocaleString (not formatPeso), so they convert to pesos here.
  const analytics = useMemo(() => {
    const result = { byCategory: {}, byMonth: {} };

    entries.forEach((entry) => {
      const amountCents = Number(entry.amount);
      if (!Number.isFinite(amountCents) || amountCents < 0) return;

      const classification = entry.ledger_categories?.classification?.toLowerCase();
      if (classification !== "revenue" && classification !== "expense") return;

      const amount = amountCents / 100;
      const category = entry.ledger_categories?.name || "Uncategorized";

      result.byCategory[category] ||= { name: category, amount: 0 };
      result.byCategory[category].amount += amount;

      const month = entry.date?.slice(0, 7);
      if (month) {
        result.byMonth[month] ||= { month, expenses: 0, revenue: 0 };
        if (classification === "revenue") {
          result.byMonth[month].revenue += entry.type === "debit" ? amount : -amount;
        } else {
          result.byMonth[month].expenses += entry.type === "credit" ? amount : -amount;
        }
      }
    });

    return {
      byCategory: Object.values(result.byCategory).sort((a, b) => b.amount - a.amount),
      monthlyTrend: Object.values(result.byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }, [entries]);

  const { byCategory, monthlyTrend } = analytics;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4">
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Finance</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-base text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusDateInput}
                onBlur={blurDateInput}
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-base text-gray-700 cursor-pointer focus:outline-none"
                onFocus={focusDateInput}
                onBlur={blurDateInput}
              />
            </div>
          </div>
        </Card>

        {error && (
          <div
            className="rounded-md border px-4 py-3 text-sm"
            style={{
              backgroundColor: C.accentSoft,
              borderColor: C.accentSoftBorder,
              color: C.accent,
            }}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total expenses</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-3xl font-semibold mt-1 text-gray-900 tabular-nums">
                {formatPeso(totalExpenses)}
              </p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total revenue</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-3xl font-semibold mt-1 text-gray-900 tabular-nums">
                {formatPeso(totalRevenue)}
              </p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">{isProfit ? "Net income" : "Net loss"}</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p
                className="text-3xl font-semibold mt-1 tabular-nums"
                style={{ color: isProfit ? C.success : C.accent }}
              >
                {formatPeso(Math.abs(net))}
              </p>
            )}
          </Card>
        </div>

        {/* Revenue vs expenses trend */}
        <Card className="p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-1">Revenue vs expenses</h2>
          <p className="text-sm text-gray-400 mb-4">Monthly comparison across the selected range.</p>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : monthlyTrend.length === 0 ? (
            <p className="text-sm text-gray-400">No data for current filters.</p>
          ) : (
            <ResponsiveContainer width="100%" height={330}>
              <AreaChart data={monthlyTrend} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.success} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtAxis}
                />
                <Tooltip content={<TrendTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 13, paddingBottom: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={C.success}
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                  dot={{ r: 4, fill: C.success, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: C.success, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke={C.accent}
                  strokeWidth={2.5}
                  fill="url(#expensesFill)"
                  dot={{ r: 4, fill: C.accent, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: C.accent, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Money by category — ranking bars */}
        <Card className="p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-1">Utilized money by category</h2>
          <p className="text-sm text-gray-400 mb-5">
            How spending and income break down across ledger categories.
          </p>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-gray-400">No categorized entries in this range.</p>
          ) : (
            <RankingBars data={byCategory} valueKey="amount" color={C.accent} />
          )}
        </Card>
      </div>
    </div>
  );
}

export default Finance;