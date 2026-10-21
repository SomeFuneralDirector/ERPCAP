import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2, AlertCircle } from "lucide-react";
import { toNumber, formatPeso, localDateKey } from "../lib/Finance";

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
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
  surface: "#F6F6F7",
};

function BalanceRows({ rows, emptyText }) {
  if (rows.length === 0) {
    return <p className="text-base" style={{ color: C.textFaint }}>{emptyText}</p>;
  }
  return (
    <table className="w-full text-base">
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

function BalanceSheet() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(localDateKey());
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [netIncome, setNetIncome] = useState(0);

  useEffect(() => {
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
        classification: r.classification ? r.classification.toLowerCase() : null,
        debit: toNumber(r.debit),
        credit: toNumber(r.credit),
      }));

      // Everything from RPC is in cents → convert to pesos
      const cash = rows.reduce((s, r) => s + r.debit - r.credit, 0) / 100;

      const categorized = rows
        .filter((r) => r.name && r.classification)
        .sort((a, b) => a.name.localeCompare(b.name));

      const otherAssets = categorized
        .filter((r) => r.classification === "asset")
        .map((r) => ({ name: r.name, amount: (r.credit - r.debit) / 100 }));

      const liabilityRows = categorized
        .filter((r) => r.classification === "liability")
        .map((r) => ({ name: r.name, amount: (r.debit - r.credit) / 100 }));

      const equityRows = categorized
        .filter((r) => r.classification === "equity")
        .map((r) => ({ name: r.name, amount: (r.debit - r.credit) / 100 }));

      const revenueTotal =
        categorized
          .filter((r) => r.classification === "revenue")
          .reduce((sum, r) => sum + (r.debit - r.credit), 0) / 100;

      const expenseTotal =
        categorized
          .filter((r) => r.classification === "expense")
          .reduce((sum, r) => sum + (r.credit - r.debit), 0) / 100;

      setAssets(
        [{ name: "Cash", amount: cash }, ...otherAssets].filter((row) => row.amount !== 0)
      );
      setLiabilities(liabilityRows.filter((row) => row.amount !== 0));
      setEquity(equityRows.filter((row) => row.amount !== 0));
      setNetIncome(revenueTotal - expenseTotal);
      setLoading(false);
    }

    loadBalanceSheet();
    return () => { ignore = true; };
  }, [asOfDate]);

  const totalAssets = assets.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalEquityAccounts = equity.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalEquity = totalEquityAccounts + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;
  const isBalanced = Math.abs(difference) < 0.01; // allow tiny floating-point noise

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.surface }}>
      <div className="p-6 space-y-4">
        <div
          className="bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h1 className="text-3xl font-semibold" style={{ color: C.text }}>Balance Sheet</h1>
          <div className="flex items-center gap-2">
            <span className="text-base" style={{ color: C.textMuted }}>As of</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
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
            Loading balance sheet…
          </div>
        ) : (
          <>
            {!isBalanced && (
              <div
                className="flex items-start gap-2 rounded-lg p-3 text-base"
                style={{ backgroundColor: C.warningSoft, color: C.warning, border: `1px solid ${C.warningBorder}` }}
              >
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span>
                  Assets ({formatPeso(totalAssets)}) don’t equal Liabilities + Equity (
                  {formatPeso(totalLiabilitiesAndEquity)}). Difference: {formatPeso(Math.abs(difference))}.
                  Check the Cash Book for uncategorized or non-cash entries.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg shadow-sm p-6" style={{ border: `1px solid ${C.border}` }}>
                <h2 className="text-base font-extrabold uppercase mb-4" style={{ color: C.textMuted }}>Assets</h2>
                <BalanceRows rows={assets} emptyText="No asset entries." />
                <div className="flex justify-between pt-3 mt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span className="font-bold" style={{ color: C.text }}>Total Assets</span>
                  <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalAssets)}</span>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6" style={{ border: `1px solid ${C.border}` }}>
                <h2 className="text-base font-extrabold uppercase mb-4" style={{ color: C.textMuted }}>Liabilities</h2>
                <BalanceRows rows={liabilities} emptyText="No liability entries." />
                <div className="flex justify-between pt-3 mt-2 mb-6" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span className="font-bold" style={{ color: C.text }}>Total Liabilities</span>
                  <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalLiabilities)}</span>
                </div>

                <h2 className="text-base font-extrabold uppercase mb-4" style={{ color: C.textMuted }}>Equity</h2>
                {equity.length === 0 && netIncome === 0 ? (
                  <p className="text-base" style={{ color: C.textFaint }}>No equity entries.</p>
                ) : (
                  <table className="w-full text-base">
                    <tbody>
                      {equity.map((r) => (
                        <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-3" style={{ color: C.text }}>{r.name}</td>
                          <td className="py-3 text-right" style={{ color: C.text }}>{formatPeso(r.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="py-3" style={{ color: C.text }}>Net Income (Revenue − Expenses)</td>
                        <td className="py-2 text-right" style={{ color: netIncome >= 0 ? C.text : C.accent }}>
                          {formatPeso(netIncome)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <div className="flex justify-between pt-3 mt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span className="font-bold" style={{ color: C.text }}>Total Equity</span>
                  <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalEquity)}</span>
                </div>

                <div className="flex justify-between pt-3 mt-4" style={{ borderTop: `2px solid ${C.borderStrong}` }}>
                  <span className="font-bold" style={{ color: C.text }}>Total Liabilities + Equity</span>
                  <span className="font-bold" style={{ color: C.text }}>{formatPeso(totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default BalanceSheet;