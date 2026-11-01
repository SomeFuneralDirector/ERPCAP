import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { toNumber, formatPeso, localDateKey } from "../lib/Finance";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

function focusDateInput(e) {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
}

function blurDateInput(e) {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = C.borderStrong;
}

function BalanceRows({ rows, emptyText }) {
  if (rows.length === 0) {
    return (
      <p className="text-base" style={{ color: C.textFaint }}>
        {emptyText}
      </p>
    );
  }
  return (
    <table className="w-full text-base">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="py-3" style={{ color: C.text }}>
              {r.name}
            </td>
            <td className="py-3 text-right" style={{ color: C.text }}>
              {formatPeso(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function exportBalanceSheetPdf({
  asOfDate,
  assets,
  liabilities,
  equity,
  netIncome,
  totalAssets,
  totalLiabilities,
  totalEquity,
  totalLiabilitiesAndEquity,
  isBalanced,
  difference,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 52;

  const fmt = (cents) =>
    `PHP ${(Math.abs(cents) / 100).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(28, 28, 31);
  doc.text("Balance Sheet", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(107, 107, 112);
  doc.text(`As of ${asOfDate}`, margin, y);
  y += 10;

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(1);
  doc.line(margin, y + 6, pageWidth - margin, y + 6);
  y += 24;

  if (!isBalanced) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(161, 92, 7);
    const warn = `Warning: Assets (${fmt(totalAssets)}) do not equal Liabilities + Equity (${fmt(
      totalLiabilitiesAndEquity
    )}). Difference: ${fmt(Math.abs(difference))}.`;
    const lines = doc.splitTextToSize(warn, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 12;
  }

  // Assets
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(107, 107, 112);
  doc.text("ASSETS", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body:
      assets.length === 0
        ? [["No asset entries.", ""]]
        : assets.map((r) => [r.name, fmt(r.amount)]),
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 5, textColor: [28, 28, 31] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 120 },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 31);
  doc.text("Total Assets", margin, y + 14);
  doc.text(fmt(totalAssets), pageWidth - margin, y + 14, { align: "right" });
  y += 36;

  // Liabilities
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(107, 107, 112);
  doc.text("LIABILITIES", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body:
      liabilities.length === 0
        ? [["No liability entries.", ""]]
        : liabilities.map((r) => [r.name, fmt(r.amount)]),
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 5, textColor: [28, 28, 31] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 120 },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 31);
  doc.text("Total Liabilities", margin, y + 14);
  doc.text(fmt(totalLiabilities), pageWidth - margin, y + 14, { align: "right" });
  y += 36;

  // Equity
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(107, 107, 112);
  doc.text("EQUITY", margin, y);
  y += 8;

  const equityBody = [
    ...equity.map((r) => [r.name, fmt(r.amount)]),
    ["Net Income (Revenue − Expenses)", fmt(netIncome)],
  ];
  if (equity.length === 0 && netIncome === 0) {
    equityBody.length = 0;
    equityBody.push(["No equity entries.", ""]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: equityBody,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 5, textColor: [28, 28, 31] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 120 },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 31);
  doc.text("Total Equity", margin, y + 14);
  doc.text(fmt(totalEquity), pageWidth - margin, y + 14, { align: "right" });
  y += 28;

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(28, 28, 31);
  doc.text("Total Liabilities + Equity", margin, y);
  doc.text(fmt(totalLiabilitiesAndEquity), pageWidth - margin, y, { align: "right" });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(154, 154, 160);
    doc.text(
      `Generated ${new Date().toLocaleString()}  ·  Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 28,
      { align: "center" }
    );
  }

  doc.save(`balance-sheet_as-of_${asOfDate}.pdf`);
}

function BalanceSheet() {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(localDateKey());
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [equity, setEquity] = useState([]);
  const [netIncome, setNetIncome] = useState(0);
  const [exporting, setExporting] = useState(false);

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
        [{ name: "Cash", amount: cash }, ...otherAssets].filter((row) => row.amount !== 0)
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
  const totalLiabilities = liabilities.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalEquityAccounts = equity.reduce((s, r) => s + toNumber(r.amount), 0);
  const totalEquity = totalEquityAccounts + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;
  const isBalanced = Math.abs(difference) < 1;

  const handleExport = () => {
    setExporting(true);
    try {
      exportBalanceSheetPdf({
        asOfDate,
        assets,
        liabilities,
        equity,
        netIncome,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalLiabilitiesAndEquity,
        isBalanced,
        difference,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.surface }}>
      <div className="p-6 space-y-4">
        <div
          className="bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h1 className="text-3xl font-semibold" style={{ color: C.text }}>
            Balance Sheet
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm" style={{ color: C.textMuted }}>
              As of
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
              style={{ borderColor: C.borderStrong, color: C.text }}
              onFocus={focusDateInput}
              onBlur={blurDateInput}
            />
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: C.accent }}
              onMouseEnter={(e) => {
                if (!loading && !exporting) e.currentTarget.style.backgroundColor = C.accentHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = C.accent;
              }}
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export PDF
            </button>
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
                style={{
                  backgroundColor: C.warningSoft,
                  color: C.warning,
                  border: `1px solid ${C.warningBorder}`,
                }}
              >
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span>
                  Assets ({formatPeso(totalAssets)}) don’t equal Liabilities + Equity (
                  {formatPeso(totalLiabilitiesAndEquity)}). Difference:{" "}
                  {formatPeso(Math.abs(difference))}. Check the Cash Book for uncategorized or
                  non-cash entries.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                className="bg-white rounded-lg shadow-sm p-6"
                style={{ border: `1px solid ${C.border}` }}
              >
                <h2
                  className="text-base font-extrabold uppercase mb-4"
                  style={{ color: C.textMuted }}
                >
                  Assets
                </h2>
                <BalanceRows rows={assets} emptyText="No asset entries." />
                <div
                  className="flex justify-between pt-3 mt-2"
                  style={{ borderTop: `1px solid ${C.border}` }}
                >
                  <span className="font-bold" style={{ color: C.text }}>
                    Total Assets
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: C.text }}>
                    {formatPeso(totalAssets)}
                  </span>
                </div>
              </div>

              <div
                className="bg-white rounded-lg shadow-sm p-6"
                style={{ border: `1px solid ${C.border}` }}
              >
                <h2
                  className="text-base font-extrabold uppercase mb-4"
                  style={{ color: C.textMuted }}
                >
                  Liabilities
                </h2>
                <BalanceRows rows={liabilities} emptyText="No liability entries." />
                <div
                  className="flex justify-between pt-3 mt-2 mb-6"
                  style={{ borderTop: `1px solid ${C.border}` }}
                >
                  <span className="font-bold" style={{ color: C.text }}>
                    Total Liabilities
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: C.text }}>
                    {formatPeso(totalLiabilities)}
                  </span>
                </div>

                <h2
                  className="text-base font-extrabold uppercase mb-4"
                  style={{ color: C.textMuted }}
                >
                  Equity
                </h2>
                {equity.length === 0 && netIncome === 0 ? (
                  <p className="text-base" style={{ color: C.textFaint }}>
                    No equity entries.
                  </p>
                ) : (
                  <table className="w-full text-base">
                    <tbody>
                      {equity.map((r) => (
                        <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-3" style={{ color: C.text }}>
                            {r.name}
                          </td>
                          <td className="py-3 text-right" style={{ color: C.text }}>
                            {formatPeso(r.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="py-3" style={{ color: C.text }}>
                          Net Income (Revenue − Expenses)
                        </td>
                        <td
                          className="py-2 text-right"
                          style={{ color: netIncome >= 0 ? C.text : C.accent }}
                        >
                          {formatPeso(netIncome)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <div
                  className="flex justify-between pt-3 mt-2"
                  style={{ borderTop: `1px solid ${C.border}` }}
                >
                  <span className="font-bold" style={{ color: C.text }}>
                    Total Equity
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: C.text }}>
                    {formatPeso(totalEquity)}
                  </span>
                </div>

                <div
                  className="flex justify-between pt-3 mt-4"
                  style={{ borderTop: `2px solid ${C.borderStrong}` }}
                >
                  <span className="font-bold" style={{ color: C.text }}>
                    Total Liabilities + Equity
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: C.text }}>
                    {formatPeso(totalLiabilitiesAndEquity)}
                  </span>
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