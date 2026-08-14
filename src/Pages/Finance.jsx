import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Check, Banknote, Loader2 } from "lucide-react";
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

  const [revenue, setRevenue] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseByCategory, setExpenseByCategory] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [actionableExpenses, setActionableExpenses] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    loadFinanceData();
  }, [dateFrom, dateTo]);

  async function loadFinanceData() {
    setLoading(true);

    // Revenue: sum of completed orders in range
    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select("total_amount, completed_at, platform")
      .eq("status", "completed")
      .gte("completed_at", dateFrom)
      .lte("completed_at", dateTo);

    if (orderErr) console.error("Error loading orders:", orderErr);

    const totalRevenue = (orders || []).reduce(
      (sum, o) => sum + (o.total_amount || 0),
      0
    );
    setRevenue(totalRevenue);

    // Expenses: joined with category name
    const { data: expenses, error: expErr } = await supabase
      .from("expenses")
      .select("id, amount, date, status, expense_categories(name)")
      .gte("date", dateFrom)
      .lte("date", dateTo);

    if (expErr) console.error("Error loading expenses:", expErr);

    const paidExpenses = (expenses || []).filter((e) => e.status === "paid");
    const totalExpenses = paidExpenses.reduce((sum, e) => sum + e.amount, 0);
    setExpenseTotal(totalExpenses);

    const byCategory = {};
    paidExpenses.forEach((e) => {
      const name = e.expense_categories?.name || "Uncategorized";
      byCategory[name] = (byCategory[name] || 0) + e.amount;
    });
    setExpenseByCategory(
      Object.entries(byCategory).map(([name, amount]) => ({
        name,
        amount: amount / 100,
      }))
    );

    setActionableExpenses(
      (expenses || [])
        .filter((e) => e.status === "pending" || e.status === "approved")
        .sort((a, b) => a.date.localeCompare(b.date))
    );

    // Monthly trend: revenue vs expenses, last 6 months
    const { data: trendOrders } = await supabase
      .from("orders")
      .select("total_amount, completed_at")
      .eq("status", "completed")
      .gte(
        "completed_at",
        new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString()
      );

    const { data: trendExpenses } = await supabase
      .from("expenses")
      .select("amount, date")
      .eq("status", "paid")
      .gte(
        "date",
        new Date(new Date().setMonth(new Date().getMonth() - 6))
          .toISOString()
          .slice(0, 10)
      );

    const months = {};
    (trendOrders || []).forEach((o) => {
      const key = o.completed_at?.slice(0, 7);
      if (!key) return;
      months[key] = months[key] || { month: key, revenue: 0, expenses: 0 };
      months[key].revenue += o.total_amount / 100;
    });
    (trendExpenses || []).forEach((e) => {
      const key = e.date?.slice(0, 7);
      if (!key) return;
      months[key] = months[key] || { month: key, revenue: 0, expenses: 0 };
      months[key].expenses += e.amount / 100;
    });
    setMonthlyTrend(
      Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
    );

    setLoading(false);
  }

  const netProfit = revenue - expenseTotal;

  async function updateExpenseStatus(id, newStatus) {
    setUpdatingId(id);

    const { error } = await supabase
      .from("expenses")
      .update({ status: newStatus })
      .eq("id", id);

    setUpdatingId(null);

    if (error) {
      console.error(`Error updating expense to ${newStatus}:`, error);
      return;
    }

    loadFinanceData();
  }

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
          <p className="text-xs font-bold text-gray-500 uppercase">Revenue</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {loading ? "…" : formatPeso(revenue)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">Expenses</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {loading ? "…" : formatPeso(expenseTotal)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-xs font-bold text-gray-500 uppercase">
            Net Profit
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${
              netProfit >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {loading ? "…" : formatPeso(netProfit)}
          </p>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">
          Revenue vs Expenses (last 6 months)
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
              dataKey="revenue"
              stroke="#dc2626"
              strokeWidth={2}
              name="Revenue"
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="#9ca3af"
              strokeWidth={2}
              name="Expenses"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Expenses by category */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">
          Expenses by Category
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={expenseByCategory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => `₱${v.toLocaleString()}`} />
            <Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Expenses awaiting action */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-4">
          Awaiting Action ({actionableExpenses.length})
        </h2>
        {actionableExpenses.length === 0 ? (
          <p className="text-sm text-gray-400">
            No expenses pending approval or payment.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                <th className="py-2">Date</th>
                <th className="py-2">Category</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {actionableExpenses.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-2">{e.date}</td>
                  <td className="py-2">
                    {e.expense_categories?.name || "Uncategorized"}
                  </td>
                  <td className="py-2">{formatPeso(e.amount)}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        e.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {e.status === "pending" && (
                      <button
                        onClick={() => updateExpenseStatus(e.id, "approved")}
                        disabled={updatingId === e.id}
                        className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {updatingId === e.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        {updatingId === e.id ? "Approving…" : "Approve"}
                      </button>
                    )}
                    {e.status === "approved" && (
                      <button
                        onClick={() => updateExpenseStatus(e.id, "paid")}
                        disabled={updatingId === e.id}
                        className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {updatingId === e.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Banknote size={12} />
                        )}
                        {updatingId === e.id ? "Marking…" : "Mark Paid"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Finance;