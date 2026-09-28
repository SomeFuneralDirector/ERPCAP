import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2, AlertCircle } from "lucide-react";
import { toNumber, formatPeso, localDateKey } from "../lib/Finance";

// Ledger convention (cash view):
//   Debit  = cash IN
//   Credit = cash OUT
//
// Cash is the other side of every entry, so it is calculated from all
// entries (total debits minus total credits) instead of being a category.
// Do not keep a "Cash" category in ledger_categories or it will show twice.
//
// Non-cash assets = bought with cash        -> credit - debit
// Liabilities     = borrowed minus repaid   -> debit - credit
// Equity          = put in minus withdrawn  -> debit - credit
// Revenue         = cash in minus refunded  -> debit - credit
// Expenses        = cash out minus recovered -> credit - debit

function BalanceRows({ rows, emptyText }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">{emptyText}</p>;
  }
  return (
    <table className="w-full text-sm">
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

function BalanceSheet() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(localDateKey());

  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [netIncome, setNetIncome] = useState(0);

  useEffect(() => {
    // Ignore responses from an earlier request if the date changed again.
    let ignore = false;

    async function loadBalanceSheet() {
      setLoading(true);

      const { data, error } = await supabase.rpc("account_balances", {
        p_from: "1900-01-01",
        p_to: asOfDate,
      });

      if (ignore) return;

      if (error) {
        console.error("Error loading balance sheet data:", error);
        setAssets([]);
        setLiabilities([]);
        setEquity([]);
        setNetIncome(0);
        setLoading(false);
        return;
      }

      const rows = (data || []).map((r) => ({
        name: r.name,
        classification: r.classification
          ? r.classification.toLowerCase()
          : null,
        debit: toNumber(r.debit),
        credit: toNumber(r.credit),
      }));

      // Cash counts every entry, including any without a category.
      const cash = rows.reduce((s, r) => s + r.debit - r.credit, 0);

      const categorized = rows
        .filter((r) => r.name && r.classification)
        .sort((a, b) => a.name.localeCompare(b.name));

      const otherAssets = categorized
        .filter((r) => r.classification === "asset")
        .map((r) => ({ name: r.name, amount: r.credit - r.debit }));

      const liabilityRows = categorized
        .filter((r) => r.classification === "liability")
        .map((r) => ({ name: r.name, amount: r.debit - r.credit }));

      const equityRows = categorized
        .filter((r) => r.classification === "equity")
        .map((r) => ({ name: r.name, amount: r.debit - r.credit }));

      const revenueTotal = categorized
        .filter((r) => r.classification === "revenue")
        .reduce((sum, r) => sum + (r.debit - r.credit), 0);
      const expenseTotal = categorized
        .filter((r) => r.classification === "expense")
        .reduce((sum, r) => sum + (r.credit - r.debit), 0);

      setAssets(
        [{ name: "Cash", amount: cash }, ...otherAssets].filter(
          (row) => row.amount !== 0
        )
      );
      setLiabilities(liabilityRows.filter((row) => row.amount !== 0));
      setEquity(equityRows.filter((row) => row.amount !== 0));
      setNetIncome(revenueTotal - expenseTotal);
      setLoading(false);
    }

    loadBalanceSheet();

    return () => {
      ignore = true;
    };
  }, [asOfDate]);

  const totalAssets = assets.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalLiabilities = liabilities.reduce(
    (s, r) => s + toNumber(r.amount),
    0
  );
  const totalEquityAccounts = equity.reduce(
    (s, r) => s + toNumber(r.amount),
    0
  );
  const totalEquity = totalEquityAccounts + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  // Values are stored in cents, so exact integer comparison is appropriate.
  const difference = totalAssets - totalLiabilitiesAndEquity;
  const isBalanced = difference === 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Balance Sheet</h1>
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
          Loading balance sheet...
        </div>
      ) : (
        <>
          {!isBalanced && (
            <div className="flex items-start gap-2 rounded-lg p-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 mb-4">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Assets ({formatPeso(totalAssets)}) don't equal Liabilities +
                Equity ({formatPeso(totalLiabilitiesAndEquity)}). The
                difference is {formatPeso(Math.abs(difference))}. This usually
                means an entry has no category, or a non-cash transaction
                (like unpaid salaries) was recorded as a debit or credit.
                Check the Ledger for entries like that.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Assets */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-sm font-extrabold text-gray-700 uppercase mb-4">
                Assets
              </h2>
              <BalanceRows rows={assets} emptyText="No asset entries." />
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
              <BalanceRows
                rows={liabilities}
                emptyText="No liability entries."
              />
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
                        Net Income (Revenue - Expenses)
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