import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { Loader2, Download } from "lucide-react";
import { toNumber, formatPeso, localDateKey, firstOfMonthKey } from "../lib/Finance";
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

function StatementRows({ rows }) {
  return (
    <table className="w-full text-base mb-2">
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

function exportIncomeStatementPdf({ dateFrom, dateTo, revenue, expenses, totalRevenue, totalExpenses, netIncome }) {
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
  doc.text("Income Statement", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(107, 107, 112);
  doc.text(`Period: ${dateFrom}  to  ${dateTo}`, margin, y);
  y += 10;

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(1);
  doc.line(margin, y + 6, pageWidth - margin, y + 6);
  y += 28;

  // Revenue section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(107, 107, 112);
  doc.text("REVENUE", margin, y);
  y += 8;

  const revenueBody =
    revenue.length === 0
      ? [["No revenue in this period.", ""]]
      : revenue.map((r) => [r.name, fmt(r.amount)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [],
    body: revenueBody,
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
  doc.text("Total Revenue", margin, y + 14);
  doc.text(fmt(totalRevenue), pageWidth - margin, y + 14, { align: "right" });
  y += 36;

  // Expenses section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(107, 107, 112);
  doc.text("EXPENSES", margin, y);
  y += 8;

  const expenseBody =
    expenses.length === 0
      ? [["No expenses in this period.", ""]]
      : expenses.map((r) => [r.name, fmt(r.amount)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [],
    body: expenseBody,
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
  doc.text("Total Expenses", margin, y + 14);
  doc.text(fmt(totalExpenses), pageWidth - margin, y + 14, { align: "right" });
  y += 32;

  // Net line
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  const label = netIncome >= 0 ? "Net Income" : "Net Loss";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  if (netIncome >= 0) {
    doc.setTextColor(21, 128, 61);
  } else {
    doc.setTextColor(179, 33, 27);
  }
  doc.text(label, margin, y);
  doc.text(fmt(netIncome), pageWidth - margin, y, { align: "right" });

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

  doc.save(`income-statement_${dateFrom}_to_${dateTo}.pdf`);
}

function IncomeStatement() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstOfMonthKey());
  const [dateTo, setDateTo] = useState(localDateKey());
  const [revenue, setRevenue] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = () => {
    setExporting(true);
    try {
      exportIncomeStatementPdf({
        dateFrom,
        dateTo,
        revenue,
        expenses,
        totalRevenue,
        totalExpenses,
        netIncome,
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
            Income Statement
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-700 cursor-pointer focus:outline-none"
              style={{ borderColor: C.borderStrong, color: C.text }}
              onFocus={focusDateInput}
              onBlur={blurDateInput}
            />
            <span className="text-sm" style={{ color: C.textFaint }}>
              to
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
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
            Loading income statement…
          </div>
        ) : (
          <div
            className="bg-white rounded-lg shadow-sm p-6"
            style={{ border: `1px solid ${C.border}` }}
          >
            <h2
              className="text-base font-extrabold uppercase mb-4"
              style={{ color: C.textMuted }}
            >
              Revenue
            </h2>
            {revenue.length === 0 ? (
              <p className="text-base mb-4" style={{ color: C.textFaint }}>
                No revenue in this period.
              </p>
            ) : (
              <StatementRows rows={revenue} />
            )}
            <div
              className="flex justify-between pt-3 mb-8"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <span className="font-bold" style={{ color: C.text }}>
                Total Revenue
              </span>
              <span className="font-bold tabular-nums" style={{ color: C.text }}>
                {formatPeso(totalRevenue)}
              </span>
            </div>

            <h2
              className="text-base font-extrabold uppercase mb-4"
              style={{ color: C.textMuted }}
            >
              Expenses
            </h2>
            {expenses.length === 0 ? (
              <p className="text-base mb-4" style={{ color: C.textFaint }}>
                No expenses in this period.
              </p>
            ) : (
              <StatementRows rows={expenses} />
            )}
            <div className="flex justify-between pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="font-bold" style={{ color: C.text }}>
                Total Expenses
              </span>
              <span className="font-bold tabular-nums" style={{ color: C.text }}>
                {formatPeso(totalExpenses)}
              </span>
            </div>

            <div
              className="flex justify-between pt-4 mt-6"
              style={{ borderTop: `2px solid ${C.borderStrong}` }}
            >
              <span className="text-xl font-bold" style={{ color: C.text }}>
                {netIncome >= 0 ? "Net Income" : "Net Loss"}
              </span>
              <span
                className="text-xl font-bold tabular-nums"
                style={{ color: netIncome >= 0 ? C.success : C.accent }}
              >
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