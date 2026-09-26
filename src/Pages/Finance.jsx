import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../api/supabase";
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
  Legend,
} from "recharts";

/* ── Design tokens — shared with Inventory / Sales / Marketing ──────────── */
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

function formatPeso(cents = 0) {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;

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

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: ₱{Number(p.value || 0).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function Finance() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadFinanceData = useCallback(
    async (isInitial = false) => {
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        setEntries([]);
        setError("Invalid date range.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setError("");

      const { data, error: queryError } = await supabase
        .from("ledger_entries")
        .select("date, detail, type, amount, ledger_categories(name)")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      if (queryError) {
        console.error("Error loading ledger entries:", queryError);
        setEntries([]);
        setError("Unable to load finance data.");
      } else {
        setEntries(data || []);
        setLastUpdated(new Date());
      }
      setLoading(false);
      setRefreshing(false);
    },
    [dateFrom, dateTo]
  );

  useEffect(() => {
    loadFinanceData(true);
  }, [loadFinanceData]);

  const analytics = useMemo(() => {
    const result = {
      totalExpenses: 0,
      totalRevenue: 0,
      byCategory: {},
      byMonth: {},
    };

    entries.forEach((entry) => {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount < 0) return;

      // Ledger convention: debit entries are revenue, credit entries are expenses.
      const flow =
        entry.type === "debit"
          ? "revenue"
          : entry.type === "credit"
            ? "expenses"
            : null;
      if (!flow) return;

      result[flow === "expenses" ? "totalExpenses" : "totalRevenue"] += amount;

      const category = entry.ledger_categories?.name || "Uncategorized";
      result.byCategory[category] ||= { name: category, amount: 0 };
      result.byCategory[category].amount += amount / 100;

      const month = entry.date?.slice(0, 7);
      if (month) {
        result.byMonth[month] ||= { month, expenses: 0, revenue: 0 };
        result.byMonth[month][flow] += amount / 100;
      }
    });

    return {
      totalExpenses: result.totalExpenses,
      totalRevenue: result.totalRevenue,
      byCategory: Object.values(result.byCategory).sort(
        (a, b) => b.amount - a.amount
      ),
      monthlyTrend: Object.values(result.byMonth).sort((a, b) =>
        a.month.localeCompare(b.month)
      ),
    };
  }, [entries]);

  const { totalExpenses, totalRevenue, byCategory, monthlyTrend } = analytics;

  // P&L: revenue − expenses
  const net = totalRevenue - totalExpenses;
  const isProfit = net >= 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header + date filters */}
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Finance</h1>
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
              onClick={() => loadFinanceData(false)}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? "Loading…" : "Refresh"}
            </PrimaryButton>
          </div>
        </Card>

        {error && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.accentSoft,
              borderColor: C.accentSoftBorder,
              color: C.accent,
            }}
          >
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-gray-500">Total expenses</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-2xl font-semibold mt-1 text-gray-900">
                {formatPeso(totalExpenses)}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-xs text-gray-500">Total revenue</p>
            {loading ? (
              <Skeleton />
            ) : (
              <p className="text-2xl font-semibold mt-1 text-gray-900">
                {formatPeso(totalRevenue)}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-xs text-gray-500">
              {isProfit ? "Net income" : "Net loss"}
            </p>
            {loading ? (
              <Skeleton />
            ) : (
              <p
                className="text-2xl font-semibold mt-1"
                style={{ color: isProfit ? C.success : C.accent }}
              >
                {formatPeso(Math.abs(net))}
              </p>
            )}
          </Card>
        </div>

        {/* Trend */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Revenue vs expenses
          </h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : monthlyTrend.length === 0 ? (
            <p className="text-xs text-gray-400">No data for current filters.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={monthlyTrend}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.success} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f3f4f6"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
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
                <Tooltip content={<TrendTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="line"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={C.success}
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  dot={{ r: 3, fill: C.success, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke={C.accent}
                  strokeWidth={2}
                  fill="url(#expensesFill)"
                  dot={{ r: 3, fill: C.accent, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* By category */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
           Utilized Money By Category
          </h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : byCategory.length === 0 ? (
            <p className="text-xs text-gray-400">
              No categorized entries in this range.
            </p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(220, byCategory.length * 42)}
            >
              <BarChart
                data={byCategory}
                layout="vertical"
                margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
                barCategoryGap={12}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f3f4f6"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#000000" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₱${Number(v).toLocaleString()}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#000000" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => `₱${Number(v || 0).toLocaleString()}`}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: C.border,
                  }}
                />
                <Bar
                  dataKey="amount"
                  name="Amount"
                  fill={C.accent}
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

export default Finance;