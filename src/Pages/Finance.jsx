import React, { useState, useEffect, useMemo } from "react";
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

function formatPeso(cents = 0) {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

const fmtAxis = (v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
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
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadFinanceData() {
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        setEntries([]);
        setError("Invalid date range.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      // Query exactly the selected range. The previous implementation loaded
      // six months but calculated cards/categories from a different range.
      const { data, error: queryError } = await supabase
        .from("ledger_entries")
        .select("date, detail, type, amount, ledger_categories(name)")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      if (!isMounted) return;

      if (queryError) {
        console.error("Error loading ledger entries:", queryError);
        setEntries([]);
        setError("Unable to load finance data.");
      } else {
        setEntries(data || []);
      }
      setLoading(false);
    }

    loadFinanceData();
    return () => {
      isMounted = false;
    };
  }, [dateFrom, dateTo]);

  const analytics = useMemo(() => {
    const result = {
      totalDebit: 0,
      totalCredit: 0,
      byCategory: {},
      byMonth: {},
    };

    entries.forEach((entry) => {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount < 0) return;

      const type = entry.type === "credit" ? "credit" : entry.type === "debit" ? "debit" : null;
      if (!type) return;

      result[type === "debit" ? "totalDebit" : "totalCredit"] += amount;

      const category = entry.ledger_categories?.name || "Uncategorized";
      result.byCategory[category] ||= { name: category, amount: 0 };
      result.byCategory[category].amount += amount / 100;

      const month = entry.date?.slice(0, 7);
      if (month) {
        result.byMonth[month] ||= { month, debit: 0, credit: 0 };
        result.byMonth[month][type] += amount / 100;
      }
    });

    return {
      totalDebit: result.totalDebit,
      totalCredit: result.totalCredit,
      byCategory: Object.values(result.byCategory).sort((a, b) => b.amount - a.amount),
      monthlyTrend: Object.values(result.byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }, [entries]);

  const { totalDebit, totalCredit, byCategory, monthlyTrend } = analytics;
  const net = totalDebit - totalCredit;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Finance</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm cursor-pointer"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm cursor-pointer"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">Total Debit</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {loading ? "…" : formatPeso(totalDebit)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">Total Credit</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {loading ? "…" : formatPeso(totalCredit)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">Net</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              net >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {loading ? "…" : formatPeso(net)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-4">
          Debit vs Credit
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="debitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="creditFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#080808" }}
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
              dataKey="debit"
              name="Debit"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#debitFill)"
              dot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Area
              type="monotone"
              dataKey="credit"
              name="Credit"
              stroke="#dc2626"
              strokeWidth={2}
              fill="url(#creditFill)"
              dot={{ r: 3, fill: "#dc2626", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">By Category</h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-gray-400">No categorized entries in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" fontSize={12} tick={{ fill: "#000000" }} />
              <YAxis fontSize={12} tick={{ fill: "#000000" }} />
              <Tooltip formatter={(v) => `₱${Number(v || 0).toLocaleString()}`} />
              <Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default Finance;
