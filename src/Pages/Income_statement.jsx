import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2 } from "lucide-react";
import { toNumber, formatPeso, localDateKey, firstOfMonthKey } from "../lib/Finance";

const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  textMuted: "#6B6B70",
  textFaint: "#9A9AA0",
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  success: "#15803D",
  surface: "#F6F6F7",
};

function StatementRows({ rows }) {
  return (
    <table className="w-full text-base mb-2">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="py-3" style={{ color: C.text }}>{r.name}</td>
            <td className="py-3 text-right" style={{ color: C.text }}>{formatPeso(r.amount)}</td>
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

      // RPC returns cents → convert to pesos
      const revenueRows = rows
        .filter((r) => r.classification === "revenue")
        .map((r) => ({ name: r.name, amount: (r.debit - r.credit) / 100 }))
        .filter((r) => r.amount !== 0)
        .sort((a, b) => b.amount - a.amount);

      const expenseRows = rows
        .filter((r) => r.classification === "expense")
        .map((r) => ({ name: r.name, amount: (r.credit - r.debit) / 100 }))
        .filter((r) => r.amount !== 0)
        .sort((a, b) => b.amount - a.amount);

      setRevenue(revenueRows);
      setExpenses(expenseRows);
      setLoading(false);
    }

    loadIncomeStatement();
    return () => { ignore = true; };
  }, [dateFrom, dateTo]);

  const totalRevenue = revenue.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalExpenses = expenses.reduce((s, r) => s + toNumber(r.amount), 0);
  const netIncome = totalRevenue - totalExpenses;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.surface }}>
      <div className="p-6 space-y-4">
        <div
          className="bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h1 className="text-3xl font-semibold" style={{ color: C.text }}>Income Statement</h1>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
              style={{ borderColor: C.borderStrong, color: C.text }}
            />
            <span className="text-base" style={{ color: C.textFaint }}>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
              style={{ borderColor: C.borderStrong, color: C.text }}
            />
          </div>
        </div>

        {loading ? (
          <div
            className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-2 text-base justify-center"
            style={{ border: `1px solid ${C.border}`, color: C.textFaint }}
          >
            <Loader2 size={20} className="animate-spin" />
            Loading income statement…
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6" style={{ border: `1px solid ${C.border}` }}>
            <h2 className="text-base font-extrabold uppercase mb-4" style={{ color: C.textMuted }}>Revenue</h2>
            {revenue.length === 0 ? (
              <p className="text-base mb-4" style={{ color: C.textFaint }}>No revenue in this period.</p>
            ) : (
              <StatementRows rows={revenue} />
            )}
            <div className="flex justify-between pt-3 mb-8" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="font-bold" style={{ color: C.text }}>Total Revenue</span>
              <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalRevenue)}</span>
            </div>

            <h2 className="text-base font-extrabold uppercase mb-4" style={{ color: C.textMuted }}>Expenses</h2>
            {expenses.length === 0 ? (
              <p className="text-base mb-4" style={{ color: C.textFaint }}>No expenses in this period.</p>
            ) : (
              <StatementRows rows={expenses} />
            )}
            <div className="flex justify-between pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="font-bold" style={{ color: C.text }}>Total Expenses</span>
              <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalExpenses)}</span>
            </div>

            <div className="flex justify-between pt-4 mt-6" style={{ borderTop: `2px solid ${C.borderStrong}` }}>
              <span className="text-xl font-bold" style={{ color: C.text }}>
                {netIncome >= 0 ? "Net Income" : "Net Loss"}
              </span>
              <span className="text-xl font-bold" style={{ color: netIncome >= 0 ? C.success : C.accent }}>
                {formatPeso(Math.abs(netIncome))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeStatement;