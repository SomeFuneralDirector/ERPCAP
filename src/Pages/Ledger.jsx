// Cash Book (formerly Ledger)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { Loader2, Plus, Trash2, X, AlertCircle, Archive } from "lucide-react";
import { formatPeso, localDateKey, firstOfMonthKey } from "../lib/Finance";

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
  successSoft: "#EEF6EF",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
  surface: "#F6F6F7",
};

const TYPE_LABEL = { debit: "Cash In", credit: "Cash Out" };

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 5000;
const FETCH_CHUNK = 1000;
const SALES_CATEGORY = "Sales Revenue";

function getWeekInfo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt) =>
    dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  return {
    key: localDateKey(monday),
    label: `Week of ${fmt(monday)} to ${fmt(sunday)}`,
  };
}

function normalType(classification) {
  return classification === "asset" || classification === "expense"
    ? "credit"
    : "debit";
}

function newRow() {
  return {
    _rowId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `row-${Date.now()}-${Math.random()}`,
    date: localDateKey(),
    detail: "",
    category_id: "",
    type: "debit",
    amount: "",
  };
}

async function fetchOtherEntries(dateFrom, dateTo) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        "id, date, detail, type, amount, archived, ledger_categories!inner ( name, classification )"
      )
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .eq("archived", false)
      .neq("ledger_categories.name", SALES_CATEGORY)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + FETCH_CHUNK - 1);

    if (error) return { data: null, error };

    all = all.concat(data || []);
    if (!data || data.length < FETCH_CHUNK) break;
    from += FETCH_CHUNK;
  }

  return { data: all, error: null };
}

/* In-range Sales Revenue only, then grouped by week.
   Matches account_balances, so Cash Book sales = Income Statement sales. */
async function fetchWeeklySales(dateFrom, dateTo) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        "id, date, type, amount, ledger_categories!inner ( name, classification )"
      )
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .eq("archived", false)
      .eq("ledger_categories.name", SALES_CATEGORY)
      .order("id", { ascending: true })
      .range(from, from + FETCH_CHUNK - 1);

    if (error) return { data: null, error };

    all = all.concat(data || []);
    if (!data || data.length < FETCH_CHUNK) break;
    from += FETCH_CHUNK;
  }

  const groups = new Map();

  for (const row of all) {
    const { key, label } = getWeekInfo(row.date);
    const type = row.type === "credit" ? "credit" : "debit";
    const gkey = `${key}|${type}`;

    if (!groups.has(gkey)) {
      groups.set(gkey, {
        id: `sales-week-${key}-${type}`,
        date: key < dateFrom ? dateFrom : key,
        detail: label,
        type,
        amount: 0,
        ledger_categories: { name: SALES_CATEGORY, classification: "revenue" },
        isSalesWeek: true,
      });
    }

    groups.get(gkey).amount += Number(row.amount) || 0;
  }

  return { data: [...groups.values()], error: null };
}

function Ledger() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstOfMonthKey());
  const [dateTo, setDateTo] = useState(localDateKey());
  const [otherEntries, setOtherEntries] = useState([]);
  const [salesWeeks, setSalesWeeks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [pageError, setPageError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState("edit");
  const [rows, setRows] = useState([newRow()]);
  const [rowErrors, setRowErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const requestIdRef = useRef(0);
  const prevJsonRef = useRef("");

  const loadLedger = useCallback(
    async (mode = "poll") => {
      const requestId = ++requestIdRef.current;
      if (mode === "initial") setLoading(true);

      const [othersRes, salesRes] = await Promise.all([
        fetchOtherEntries(dateFrom, dateTo),
        fetchWeeklySales(dateFrom, dateTo),
      ]);

      if (requestId !== requestIdRef.current) return;

      const error = othersRes.error || salesRes.error;
      if (error) {
        console.error("Error loading ledger:", error);
        if (mode === "initial") {
          setPageError(error.message || "Couldn't load the cash book.");
          setLoading(false);
        }
        return;
      }

      setPageError("");
      const freshOthers = othersRes.data || [];
      const freshSales = salesRes.data || [];
      const freshJson = JSON.stringify([freshOthers, freshSales]);

      if (mode === "initial" || freshJson !== prevJsonRef.current) {
        prevJsonRef.current = freshJson;
        setOtherEntries(freshOthers);
        setSalesWeeks(freshSales);
      }
      setLoading(false);
    },
    [dateFrom, dateTo]
  );

  useEffect(() => {
    loadLedger("initial");

    let intervalId = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        loadLedger("poll");
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadLedger("poll");
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadLedger]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data, error } = await supabase
      .from("ledger_categories")
      .select("id, name, classification")
      .order("name");
    if (error) {
      console.error("Error loading categories:", error);
      return;
    }
    setCategories(data || []);
  }

  const displayRows = [...salesWeeks, ...otherEntries].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = displayRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  async function handleArchiveConfirm() {
    if (!archiveTarget || archiveTarget.isSalesWeek) return;
    setArchiving(true);
    setPageError("");

    const { error } = await supabase
      .from("ledger_entries")
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user?.id ?? null,
      })
      .eq("id", archiveTarget.id);

    setArchiving(false);

    if (error) {
      console.error("Error archiving entry:", error);
      setPageError("Couldn't archive that entry. " + (error.message || ""));
      setArchiveTarget(null);
      return;
    }

    setArchiveTarget(null);
    loadLedger("initial");
  }

  function openModal() {
    setRows([newRow()]);
    setRowErrors({});
    setBanner(null);
    setStep("edit");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setStep("edit");
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(rowId) {
    setRows((prev) => prev.filter((r) => r._rowId !== rowId));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  function duplicateLastRow() {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [...prev, newRow()];
      return [...prev, { ...last, _rowId: newRow()._rowId, amount: "" }];
    });
  }

  function handleRowChange(rowId, field, value) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._rowId !== rowId) return r;
        const updated = { ...r, [field]: value };
        if (field === "category_id") {
          const cat = categories.find((c) => c.id === value);
          if (cat) updated.type = normalType(cat.classification);
        }
        return updated;
      })
    );
    setRowErrors((prev) => {
      if (!prev[rowId]?.[field]) return prev;
      return { ...prev, [rowId]: { ...prev[rowId], [field]: null } };
    });
  }

  function validateRows() {
    const errors = {};
    rows.forEach((r) => {
      const rowErr = {};
      if (!r.date) rowErr.date = "Required";
      if (!r.detail.trim()) rowErr.detail = "Required";
      if (!r.category_id) rowErr.category_id = "Required";
      const amountNum = parseFloat(r.amount);
      if (!r.amount || isNaN(amountNum) || amountNum <= 0) {
        rowErr.amount = "Invalid";
      }
      if (Object.keys(rowErr).length > 0) errors[r._rowId] = rowErr;
    });
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleReview(e) {
    e.preventDefault();
    if (rows.length === 0) return;
    if (!validateRows()) {
      setBanner({
        type: "error",
        message: "Please fix the highlighted fields before saving.",
      });
      return;
    }
    setBanner(null);
    setStep("confirm");
  }

  async function handleConfirmSave() {
    setSaving(true);
    setBanner(null);

    const payload = rows.map((r) => ({
      date: r.date,
      detail: r.detail.trim(),
      category_id: r.category_id,
      type: r.type,
      amount: Math.round(parseFloat(r.amount) * 100),
      created_by: user?.id,
    }));

    const { error } = await supabase.from("ledger_entries").insert(payload);

    setSaving(false);

    if (error) {
      console.error("Error saving ledger entries:", error);
      setBanner({ type: "error", message: "Failed to save entries." });
      setStep("edit");
      return;
    }

    setShowModal(false);
    setStep("edit");
    loadLedger("initial");
  }

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name || "-";
  }

  const dateInputStyle = {
    borderColor: C.borderStrong,
    color: C.text,
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.surface }}>
      <div className="p-6 space-y-4">
        <div
          className="bg-white rounded-lg shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h1 className="text-3xl font-semibold" style={{ color: C.text }}>
            Cash Book
          </h1>
          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
                style={dateInputStyle}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
                  e.target.style.borderColor = C.accent;
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = "none";
                  e.target.style.borderColor = C.borderStrong;
                }}
              />
              <span className="text-base" style={{ color: C.textFaint }}>
                to
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded-md px-3 py-2 text-base cursor-pointer focus:outline-none"
                style={dateInputStyle}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
                  e.target.style.borderColor = C.accent;
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = "none";
                  e.target.style.borderColor = C.borderStrong;
                }}
              />
            </div>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-base font-semibold text-white cursor-pointer transition-colors"
              style={{ backgroundColor: C.accent }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = C.accentHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = C.accent)
              }
            >
              <Plus size={16} />
              Add Entry
            </button>
          </div>
        </div>

        <div
          className="bg-white rounded-lg shadow-sm p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          {pageError && (
            <div
              className="flex items-start gap-2 rounded-lg p-3 text-sm mb-4"
              style={{
                backgroundColor: C.accentSoft,
                color: C.accent,
                border: `1px solid ${C.accentSoftBorder}`,
              }}
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{pageError}</span>
            </div>
          )}

          {loading ? (
            <div
              className="flex items-center gap-2 text-sm py-10 justify-center"
              style={{ color: C.textFaint }}
            >
              <Loader2 size={16} className="animate-spin" />
              Loading cash book…
            </div>
          ) : displayRows.length === 0 ? (
            <p className="text-base py-10 text-center" style={{ color: C.textFaint }}>
              No entries in this date range.
            </p>
          ) : (
            <div
              className="overflow-x-auto rounded-lg"
              style={{ border: `1px solid ${C.border}` }}
            >
              <table className="w-full text-base">
                <thead
                  style={{
                    backgroundColor: C.surface,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: C.textMuted }}>No</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: C.textMuted }}>Date</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: C.textMuted }}>Detail</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: C.textMuted }}>{TYPE_LABEL.debit}</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: C.textMuted }}>{TYPE_LABEL.credit}</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: C.textMuted }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((e, i) => (
                    <tr
                      key={e.id}
                      className="transition-colors"
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        backgroundColor: i % 2 === 1 ? C.surface : "#fff",
                      }}
                      onMouseEnter={(ev) =>
                        (ev.currentTarget.style.backgroundColor = C.accentSoft)
                      }
                      onMouseLeave={(ev) =>
                        (ev.currentTarget.style.backgroundColor =
                          i % 2 === 1 ? C.surface : "#fff")
                      }
                    >
                      <td className="py-3 px-4" style={{ color: C.textFaint }}>
                        {(currentPage - 1) * PAGE_SIZE + i + 1}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium" style={{ color: C.text }}>
                        {e.date}
                      </td>
                      <td className="py-3 px-4" style={{ color: C.text }}>
                        {e.detail}
                        {e.ledger_categories?.name && (
                          <span
                            className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: C.surface, color: C.textMuted }}
                          >
                            {e.ledger_categories.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        {e.type === "debit" ? (
                          <span style={{ color: C.success }}>{formatPeso(e.amount)}</span>
                        ) : (
                          <span style={{ color: C.textFaint }}>—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        {e.type === "credit" ? (
                          <span style={{ color: C.accent }}>{formatPeso(e.amount)}</span>
                        ) : (
                          <span style={{ color: C.textFaint }}>—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {e.isSalesWeek ? (
                          <span className="text-xs" style={{ color: C.textFaint }} title="Weekly sales totals come from automatic sale postings">
                            Auto
                          </span>
                        ) : (
                          <button
                            onClick={() => setArchiveTarget(e)}
                            className="inline-flex items-center gap-1 text-sm font-semibold cursor-pointer transition-colors"
                            style={{ color: C.textMuted }}
                            onMouseEnter={(ev) => (ev.currentTarget.style.color = C.accent)}
                            onMouseLeave={(ev) => (ev.currentTarget.style.color = C.textMuted)}
                          >
                            <Archive size={14} />
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && displayRows.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm" style={{ color: C.textMuted }}>
                Page {currentPage} of {totalPages} | {displayRows.length} rows
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  style={{ borderColor: C.border, color: C.textMuted }}
                >
                  ← Prev
                </button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pageNum = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                  const active = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className="px-3 py-1.5 border rounded-lg text-sm transition-colors cursor-pointer"
                      style={
                        active
                          ? { backgroundColor: C.accent, borderColor: C.accent, color: "#fff" }
                          : { borderColor: C.border, color: C.textMuted }
                      }
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  style={{ borderColor: C.border, color: C.textMuted }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-semibold" style={{ color: C.text }}>Archive entry?</h2>
              <button type="button" onClick={() => setArchiveTarget(null)} className="cursor-pointer" style={{ color: C.textFaint }}>
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
                <p className="font-medium" style={{ color: C.text }}>{archiveTarget.detail}</p>
                <p className="text-sm mt-0.5" style={{ color: C.textMuted }}>
                  {archiveTarget.date} · {TYPE_LABEL[archiveTarget.type]} · {formatPeso(archiveTarget.amount)}
                </p>
              </div>
              <p className="text-sm" style={{ color: C.textMuted }}>
                This entry is removed from the Cash Book and stops counting in reports. You can restore it later from{" "}
                <strong style={{ color: C.text }}>Activity Logs → Archive</strong>.
              </p>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 rounded-md text-base font-medium cursor-pointer"
                style={{ color: C.textMuted, backgroundColor: C.surface }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveConfirm}
                disabled={archiving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-base font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: C.accent }}
              >
                {archiving && <Loader2 size={16} className="animate-spin" />}
                {archiving ? "Archiving…" : "Yes, Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleReview}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold" style={{ color: C.text }}>
                {step === "edit" ? "Add Entries" : "Confirm Entries"}
              </h2>
              <button type="button" onClick={closeModal} className="cursor-pointer" style={{ color: C.textFaint }}>
                <X size={20} />
              </button>
            </div>

            {step === "edit" ? (
              <>
                <p className="text-sm mb-4" style={{ color: C.textMuted }}>
                  Add as many rows as you need, then review before saving. Money coming in is{" "}
                  <strong style={{ color: C.text }}>Cash In</strong>. Money going out is{" "}
                  <strong style={{ color: C.text }}>Cash Out</strong>.
                </p>
                {banner && (
                  <div className="flex items-start gap-2 rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: C.accentSoft, color: C.accent, border: `1px solid ${C.accentSoftBorder}` }}>
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{banner.message}</span>
                  </div>
                )}
                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase" style={{ color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                        <th className="py-2 pr-2">Date</th>
                        <th className="py-2 pr-2">Detail</th>
                        <th className="py-2 pr-2">Category</th>
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">Amount (₱)</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const err = rowErrors[r._rowId] || {};
                        return (
                          <tr key={r._rowId} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td className="py-2 pr-2 align-top">
                              <input type="date" value={r.date} onChange={(e) => handleRowChange(r._rowId, "date", e.target.value)} className="w-36 border rounded px-2 py-1.5 text-sm" style={{ borderColor: err.date ? C.accent : C.borderStrong, color: C.text }} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <input type="text" value={r.detail} onChange={(e) => handleRowChange(r._rowId, "detail", e.target.value)} placeholder="e.g. Staff salaries, Aug 1-15" className="w-48 border rounded px-2 py-1.5 text-sm" style={{ borderColor: err.detail ? C.accent : C.borderStrong, color: C.text }} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <select value={r.category_id} onChange={(e) => handleRowChange(r._rowId, "category_id", e.target.value)} className="w-40 border rounded px-2 py-1.5 text-sm cursor-pointer" style={{ borderColor: err.category_id ? C.accent : C.borderStrong, color: C.text }}>
                                <option value="">Select</option>
                                {["asset", "liability", "equity", "revenue", "expense"].map((cls) => {
                                  const inClass = categories.filter((c) => c.classification === cls);
                                  if (inClass.length === 0) return null;
                                  return (
                                    <optgroup key={cls} label={cls.charAt(0).toUpperCase() + cls.slice(1)}>
                                      {inClass.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <div className="flex gap-1">
                                <button type="button" onClick={() => handleRowChange(r._rowId, "type", "debit")} className="px-2 py-1.5 rounded text-xs font-semibold border cursor-pointer" style={r.type === "debit" ? { backgroundColor: C.success, color: "#fff", borderColor: C.success } : { borderColor: C.borderStrong, color: C.textMuted }}>{TYPE_LABEL.debit}</button>
                                <button type="button" onClick={() => handleRowChange(r._rowId, "type", "credit")} className="px-2 py-1.5 rounded text-xs font-semibold border cursor-pointer" style={r.type === "credit" ? { backgroundColor: C.accent, color: "#fff", borderColor: C.accent } : { borderColor: C.borderStrong, color: C.textMuted }}>{TYPE_LABEL.credit}</button>
                              </div>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <input type="number" step="0.01" min="0" value={r.amount} onChange={(e) => handleRowChange(r._rowId, "amount", e.target.value)} placeholder="0.00" className="w-28 border rounded px-2 py-1.5 text-sm" style={{ borderColor: err.amount ? C.accent : C.borderStrong, color: C.text }} />
                            </td>
                            <td className="py-2 align-top">
                              <button type="button" onClick={() => removeRow(r._rowId)} disabled={rows.length === 1} className="p-1.5 disabled:opacity-30 cursor-pointer" style={{ color: C.textFaint }}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <div className="flex gap-3">
                    <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer" style={{ color: C.accent }}>
                      <Plus size={14} /> Add Row
                    </button>
                    <button type="button" onClick={duplicateLastRow} className="text-sm font-semibold cursor-pointer" style={{ color: C.textFaint }}>
                      Duplicate Last
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer" style={{ color: C.textMuted, backgroundColor: C.surface }}>Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md text-sm font-semibold text-white cursor-pointer" style={{ backgroundColor: C.accent }}>
                      Review {rows.length > 1 ? `${rows.length} Entries` : "Entry"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: C.warningSoft, color: C.warning, border: `1px solid ${C.warningBorder}` }}>
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Double-check the entries below before saving.</strong> Entries can't be edited once saved, but you can archive an entry from the Cash Book if it was recorded by mistake.
                  </span>
                </div>
                {banner && (
                  <div className="flex items-start gap-2 rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: C.accentSoft, color: C.accent, border: `1px solid ${C.accentSoftBorder}` }}>
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{banner.message}</span>
                  </div>
                )}
                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase" style={{ backgroundColor: C.surface, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Detail</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3 text-right">{TYPE_LABEL.debit}</th>
                        <th className="py-2 px-3 text-right">{TYPE_LABEL.credit}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r._rowId} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-2 px-3 whitespace-nowrap" style={{ color: C.text }}>{r.date}</td>
                          <td className="py-2 px-3" style={{ color: C.text }}>{r.detail}</td>
                          <td className="py-2 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: C.surface, color: C.textMuted }}>
                              {categoryName(r.category_id)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {r.type === "debit" ? (
                              <span style={{ color: C.success }}>{formatPeso(Math.round(parseFloat(r.amount) * 100))}</span>
                            ) : (
                              <span style={{ color: C.textFaint }}>—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {r.type === "credit" ? (
                              <span style={{ color: C.accent }}>{formatPeso(Math.round(parseFloat(r.amount) * 100))}</span>
                            ) : (
                              <span style={{ color: C.textFaint }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-end gap-2 pt-4">
                  <button type="button" onClick={() => setStep("edit")} className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer" style={{ color: C.textMuted, backgroundColor: C.surface }}>
                    ← Back to Edit
                  </button>
                  <button type="button" onClick={handleConfirmSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white cursor-pointer disabled:opacity-50" style={{ backgroundColor: C.accent }}>
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {saving ? "Saving…" : "Save Entries"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

export default Ledger;