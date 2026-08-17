import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

    // Pull everything needed for the 6-month trend in one query, then
    // filter down to the selected date range for the KPI cards/chart.
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

    // Group by category (using the real joined ledger_categories name)
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

    // Monthly trend: debit vs credit totals, last 6 months
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
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* KPI cards */}
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

      {/* Monthly trend */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">
          Debit vs Credit (last 6 months)
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => `₱${v.toLocaleString()}`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="debit"
              stroke="#16a34a"
              strokeWidth={2}
              name="Debit"
            />
            <Line
              type="monotone"
              dataKey="credit"
              stroke="#dc2626"
              strokeWidth={2}
              name="Credit"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* By category */}
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