import React, { useState, useEffect } from "react";
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

function formatPeso(cents) {
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
          {p.name}: ₱{p.value.toLocaleString()}
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

  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [byCategory, setByCategory] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    loadFinanceData();
  }, [dateFrom, dateTo]);

  async function loadFinanceData() {
    setLoading(true);

    const sixMonthsAgo = new Date(new Date().setMonth(new Date().getMonth() - 6))
      .toISOString()
      .slice(0, 10);

    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        "date, detail, type, amount, ledger_categories ( name )"
      )
      .gte("date", sixMonthsAgo);

    if (error) {
      console.error("Error loading ledger entries:", error);
      setLoading(false);
      return;
    }

    const entries = data || [];
    const inRange = entries.filter(
      (e) => e.date >= dateFrom && e.date <= dateTo
    );

    const debitSum = inRange
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + e.amount, 0);
    const creditSum = inRange
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + e.amount, 0);

    setTotalDebit(debitSum);
    setTotalCredit(creditSum);

    const catMap = {};
    inRange.forEach((e) => {
      const name = e.ledger_categories?.name;
      if (!name) return;
      catMap[name] = (catMap[name] || 0) + e.amount;
    });
    setByCategory(
      Object.entries(catMap).map(([name, amount]) => ({
        name,
        amount: amount / 100,
      }))
    );

    const months = {};
    entries.forEach((e) => {
      const key = e.date?.slice(0, 7);
      if (!key) return;
      months[key] = months[key] || { month: key, debit: 0, credit: 0 };
      if (e.type === "debit") months[key].debit += e.amount / 100;
      else months[key].credit += e.amount / 100;
    });
    setMonthlyTrend(
      Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
    );

    setLoading(false);
  }

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">
            Total Debit
          </p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {loading ? "…" : formatPeso(totalDebit)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">
            Total Credit
          </p>
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
          Debit vs Credit (last 6 months)
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
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
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
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">
          By Category
        </h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-gray-400">
            No categorized entries in this range.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => `₱${v.toLocaleString()}`} />
              <Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default Finance;