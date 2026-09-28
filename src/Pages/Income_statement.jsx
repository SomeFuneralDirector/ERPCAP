import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2 } from "lucide-react";
import {
  toNumber,
  formatPeso,
  localDateKey,
  firstOfMonthKey,
} from "../lib/Finance";

// Ledger convention (cash view):
//   Debit  = cash IN
//   Credit = cash OUT
//
// Revenue  = cash in minus cash refunded   -> debit - credit
// Expenses = cash out minus cash recovered -> credit - debit

function StatementRows({ rows }) {
  return (
    <table className="w-full text-sm mb-2">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-gray-100">
            <td className="py-2 text-gray-900">{r.name}</td>
            <td className="py-2 text-right text-gray-900">
              {formatPeso(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IncomeStatement() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstOfMonthKey());
  const [dateTo, setDateTo] = useState(localDateKey());

  const [revenue, setRevenue] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    // Ignore responses from an earlier request if the dates changed again.
    let ignore = false;

    async function loadIncomeStatement() {
      setLoading(true);

      const { data, error } = await supabase.rpc("account_balances", {
        p_from: dateFrom,
        p_to: dateTo,
      });

      if (ignore) return;

      if (error) {
        console.error("Error loading income statement data:", error);
        setRevenue([]);
        setExpenses([]);
        setLoading(false);
        return;
      }

      const rows = (data || [])
        .filter((r) => r.name && r.classification)
        .map((r) => ({
          name: r.name,
          classification: r.classification.toLowerCase(),
          debit: toNumber(r.debit),
          credit: toNumber(r.credit),
        }));

      const revenueRows = rows
        .filter((r) => r.classification === "revenue")
        .map((r) => ({ name: r.name, amount: r.debit - r.credit }))
        .filter((r) => r.amount !== 0)
        .sort((a, b) => b.amount - a.amount);

      const expenseRows = rows
        .filter((r) => r.classification === "expense")
        .map((r) => ({ name: r.name, amount: r.credit - r.debit }))
        .filter((r) => r.amount !== 0)
        .sort((a, b) => b.amount - a.amount);

      setRevenue(revenueRows);
      setExpenses(expenseRows);
      setLoading(false);
    }

    loadIncomeStatement();

    return () => {
      ignore = true;
    };
  }, [dateFrom, dateTo]);

  const totalRevenue = revenue.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalExpenses = expenses.reduce((s, r) => s + toNumber(r.amount), 0);
  const netIncome = totalRevenue - totalExpenses;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">
          Income Statement
        </h1>
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
          Loading income statement...
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
            <StatementRows rows={revenue} />
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
            <StatementRows rows={expenses} />
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