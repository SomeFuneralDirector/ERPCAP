import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2, AlertCircle } from "lucide-react";

function formatPeso(cents) {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function BalanceSheet() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [netIncome, setNetIncome] = useState(0);

  useEffect(() => {
    loadBalanceSheet();
  }, [asOfDate]);

  async function loadBalanceSheet() {
    setLoading(true);

    const { data, error } = await supabase
      .from("ledger_entries")
      .select("date, type, amount, ledger_categories ( name, classification )")
      .lte("date", asOfDate);

    if (error) {
      console.error("Error loading balance sheet data:", error);
      setLoading(false);
      return;
    }

    const entries = data || [];

    // Group amounts by category name, tracking classification and the
    // debit/credit totals so we can apply the right "normal balance" rule.
    const byCategory = {};
    entries.forEach((e) => {
      const name = e.ledger_categories?.name;
      const classification = e.ledger_categories?.classification;
      if (!name || !classification) return;

      if (!byCategory[name]) {
        byCategory[name] = { name, classification, debit: 0, credit: 0 };
      }
      if (e.type === "debit") byCategory[name].debit += e.amount;
      else byCategory[name].credit += e.amount;
    });

    const rows = Object.values(byCategory);

    // Assets: normal debit balance (debit increases, credit decreases)
    const assetRows = rows
      .filter((r) => r.classification === "asset")
      .map((r) => ({ name: r.name, amount: r.debit - r.credit }));

    // Liabilities: normal credit balance
    const liabilityRows = rows
      .filter((r) => r.classification === "liability")
      .map((r) => ({ name: r.name, amount: r.credit - r.debit }));

    // Equity accounts entered directly (e.g. Owner's Equity): normal credit balance
    const equityRows = rows
      .filter((r) => r.classification === "equity")
      .map((r) => ({ name: r.name, amount: r.credit - r.debit }));

    // Net income rolls into equity: Revenue (credit-normal) minus Expenses (debit-normal)
    const revenueTotal = rows
      .filter((r) => r.classification === "revenue")
      .reduce((sum, r) => sum + (r.credit - r.debit), 0);
    const expenseTotal = rows
      .filter((r) => r.classification === "expense")
      .reduce((sum, r) => sum + (r.debit - r.credit), 0);

    setAssets(assetRows);
    setLiabilities(liabilityRows);
    setEquity(equityRows);
    setNetIncome(revenueTotal - expenseTotal);

    setLoading(false);
  }

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquityAccounts = equity.reduce((s, r) => s + r.amount, 0);
  const totalEquity = totalEquityAccounts + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const isBalanced = totalAssets === totalLiabilitiesAndEquity;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Balance Sheet</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">As of</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 flex items-center gap-2 text-gray-400 text-sm justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading balance sheet…
        </div>
      ) : (
        <>
          {!isBalanced && (
            <div className="flex items-start gap-2 rounded-lg p-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 mb-4">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Assets ({formatPeso(totalAssets)}) don't equal Liabilities +
                Equity ({formatPeso(totalLiabilitiesAndEquity)}). Since
                entries are single-sided (one Debit or Credit each), this can
                happen if entries were categorized inconsistently — check the
                Ledger for anything that looks miscategorized.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Assets */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
                Assets
              </h2>
              {assets.length === 0 ? (
                <p className="text-sm text-gray-400">No asset entries.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {assets.map((r) => (
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
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200">
                <span className="font-bold text-gray-800">Total Assets</span>
                <span className="font-bold text-gray-800">
                  {formatPeso(totalAssets)}
                </span>
              </div>
            </div>

            {/* Liabilities + Equity */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
                Liabilities
              </h2>
              {liabilities.length === 0 ? (
                <p className="text-sm text-gray-400">No liability entries.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {liabilities.map((r) => (
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
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200 mb-6">
                <span className="font-bold text-gray-800">
                  Total Liabilities
                </span>
                <span className="font-bold text-gray-800">
                  {formatPeso(totalLiabilities)}
                </span>
              </div>

              <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
                Equity
              </h2>
              {equity.length === 0 && netIncome === 0 ? (
                <p className="text-sm text-gray-400">No equity entries.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {equity.map((r) => (
                      <tr key={r.name} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">{r.name}</td>
                        <td className="py-2 text-right text-gray-900">
                          {formatPeso(r.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-900">
                        Net Income (Revenue − Expenses)
                      </td>
                      <td
                        className={`py-2 text-right ${
                          netIncome >= 0 ? "text-gray-900" : "text-red-600"
                        }`}
                      >
                        {formatPeso(netIncome)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200">
                <span className="font-bold text-gray-800">Total Equity</span>
                <span className="font-bold text-gray-800">
                  {formatPeso(totalEquity)}
                </span>
              </div>

              <div className="flex justify-between pt-3 mt-4 border-t-2 border-gray-300">
                <span className="font-bold text-gray-800">
                  Total Liabilities + Equity
                </span>
                <span className="font-bold text-gray-800">
                  {formatPeso(totalLiabilitiesAndEquity)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default BalanceSheet;