import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2 } from "lucide-react";

function formatPeso(cents) {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function IncomeStatement() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [revenue, setRevenue] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    loadIncomeStatement();
  }, [dateFrom, dateTo]);

  async function loadIncomeStatement() {
    setLoading(true);

    const { data, error } = await supabase
      .from("ledger_entries")
      .select("date, type, amount, ledger_categories ( name, classification )")
      .gte("date", dateFrom)
      .lte("date", dateTo);

    if (error) {
      console.error("Error loading income statement data:", error);
      setLoading(false);
      return;
    }

    const entries = data || [];

    // Group amounts by category name, tracking debit/credit totals so
    // we can apply the right normal-balance rule per classification.
    const byCategory = {};
    entries.forEach((e) => {
      const name = e.ledger_categories?.name;
      const classification = e.ledger_categories?.classification;
      if (!name || !classification) return;
      if (classification !== "revenue" && classification !== "expense")
        return;

      if (!byCategory[name]) {
        byCategory[name] = { name, classification, debit: 0, credit: 0 };
      }
      if (e.type === "debit") byCategory[name].debit += e.amount;
      else byCategory[name].credit += e.amount;
    });

    const rows = Object.values(byCategory);

    // Revenue: normal credit balance
    const revenueRows = rows
      .filter((r) => r.classification === "revenue")
      .map((r) => ({ name: r.name, amount: r.credit - r.debit }))
      .sort((a, b) => b.amount - a.amount);

    // Expenses: normal debit balance
    const expenseRows = rows
      .filter((r) => r.classification === "expense")
      .map((r) => ({ name: r.name, amount: r.debit - r.credit }))
      .sort((a, b) => b.amount - a.amount);

    setRevenue(revenueRows);
    setExpenses(expenseRows);
    setLoading(false);
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Income Statement</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 flex items-center gap-2 text-gray-400 text-sm justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading income statement…
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          {/* Revenue */}
          <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
            Revenue
          </h2>
          {revenue.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">
              No revenue in this period.
            </p>
          ) : (
            <table className="w-full text-sm mb-2">
              <tbody>
                {revenue.map((r) => (
                  <tr key={r.name} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900">{r.name}</td>
                    <td className="py-2 text-right text-gray-900">
                      {formatPeso(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between pt-3 mb-8 border-t border-gray-200">
            <span className="font-bold text-gray-800">Total Revenue</span>
            <span className="font-bold text-gray-800">
              {formatPeso(totalRevenue)}
            </span>
          </div>

          {/* Expenses */}
          <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
            Expenses
          </h2>
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">
              No expenses in this period.
            </p>
          ) : (
            <table className="w-full text-sm mb-2">
              <tbody>
                {expenses.map((r) => (
                  <tr key={r.name} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900">{r.name}</td>
                    <td className="py-2 text-right text-gray-900">
                      {formatPeso(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between pt-3 border-t border-gray-200">
            <span className="font-bold text-gray-800">Total Expenses</span>
            <span className="font-bold text-gray-800">
              {formatPeso(totalExpenses)}
            </span>
          </div>

          {/* Net Income / Net Loss */}
          <div className="flex justify-between pt-4 mt-6 border-t-2 border-gray-300">
            <span className="text-lg font-bold text-gray-800">
              {netIncome >= 0 ? "Net Income" : "Net Loss"}
            </span>
            <span
              className={`text-lg font-bold ${
                netIncome >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPeso(Math.abs(netIncome))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncomeStatement;