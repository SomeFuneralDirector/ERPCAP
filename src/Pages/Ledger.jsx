import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import { Loader2, Plus, Trash2, X, AlertCircle } from "lucide-react";

function formatPeso(cents) {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

// ISO-week key (Mon-Sun) for a YYYY-MM-DD date string, plus a display label
// for that week's range — used to collapse individual sale entries into
// one weekly total instead of showing every order as its own row.
function getWeekInfo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt) =>
    dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  return {
    key: monday.toISOString().slice(0, 10),
    label: `Week of ${fmt(monday)}–${fmt(sunday)}`,
  };
}

const PAGE_SIZE = 10;

function newRow() {
  return {
    _rowId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `row-${Date.now()}-${Math.random()}`,
    date: new Date().toISOString().slice(0, 10),
    detail: "",
    category_id: "",
    type: "debit",
    amount: "",
  };
}

function Ledger() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState("edit"); // "edit" | "confirm"
  const [rows, setRows] = useState([newRow()]);
  const [rowErrors, setRowErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    loadLedger();
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

  async function loadLedger() {
    setLoading(true);

    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        "id, date, detail, type, amount, ledger_categories ( name, classification )"
      )
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    if (error) {
      console.error("Error loading ledger:", error);
      setLoading(false);
      return;
    }

    setEntries(data || []);
    setLoading(false);
  }

  // Collapse Sales Revenue entries into one row per week; everything
  // else (expenses, manual entries) stays as individual rows.
  const displayRows = (() => {
    const salesWeeks = {};
    const others = [];

    entries.forEach((e) => {
      if (e.ledger_categories?.name === "Sales Revenue") {
        const { key, label } = getWeekInfo(e.date);
        if (!salesWeeks[key]) {
          salesWeeks[key] = {
            id: `sales-week-${key}`,
            date: key,
            detail: label,
            type: e.type,
            amount: 0,
            ledger_categories: e.ledger_categories,
          };
        }
        salesWeeks[key].amount += e.amount;
      } else {
        others.push(e);
      }
    });

    return [...Object.values(salesWeeks), ...others].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  })();

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pageRows = displayRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

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
      return [
        ...prev,
        { ...last, _rowId: newRow()._rowId, amount: "" },
      ];
    });
  }

  function handleRowChange(rowId, field, value) {
    setRows((prev) =>
      prev.map((r) => (r._rowId === rowId ? { ...r, [field]: value } : r))
    );
    setRowErrors((prev) => {
      if (!prev[rowId]?.[field]) return prev;
      const next = { ...prev, [rowId]: { ...prev[rowId], [field]: null } };
      return next;
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
    loadLedger();
  }

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name || "—";
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Ledger</h1>
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
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 bg-red-700 text-white text-sm font-bold px-3 py-1.5 rounded hover:bg-red-600"
          >
            <Plus size={14} />
            Add Entry
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Loading ledger…
          </div>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-gray-400">
            No entries in this date range.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-700 uppercase tracking-wide">
                  <th className="py-3 px-4 font-extrabold">No</th>
                  <th className="py-3 px-4 font-extrabold">Date</th>
                  <th className="py-3 px-4 font-extrabold">Detail</th>
                  <th className="py-3 px-4 font-extrabold text-right">Debit</th>
                  <th className="py-3 px-4 font-extrabold text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e, i) => (
                  <tr
                    key={e.id}
                    className={`border-t border-gray-100 hover:bg-red-100 transition-colors ${
                      i % 2 === 1 ? "bg-gray-50/50" : "bg-white"
                    }`}
                  >
                    <td className="py-3 px-4 text-gray-400">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-gray-900 font-medium">
                      {e.date}
                    </td>
                    <td className="py-3 px-4 text-gray-900">
                      {e.detail}
                      {e.ledger_categories?.name && (
                        <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                          {e.ledger_categories.name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {e.type === "debit" ? (
                        <span className="text-green-600">
                          {formatPeso(e.amount)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {e.type === "credit" ? (
                        <span className="text-red-600">
                          {formatPeso(e.amount)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
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
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} · {displayRows.length} rows
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum =
                  Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${
                      page === pageNum
                        ? "bg-red-600 border-red-600 text-white"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk add entries modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleReview}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-gray-800">
                {step === "edit" ? "Add Ledger Entries" : "Confirm Entries"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={18} />
              </button>
            </div>

            {step === "edit" ? (
              <>
                <p className="text-xs text-gray-500 mb-4">
                  Add as many rows as you need, then review before saving.
                  Liabilities you owe (like unpaid salaries) are usually a{" "}
                  <strong>Credit</strong>; money spent or an increase in what
                  you own is usually a <strong>Debit</strong>.
                </p>

                {banner && (
                  <div className="flex items-start gap-2 rounded-lg p-3 text-sm bg-red-50 text-red-700 border border-red-200 mb-4">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{banner.message}</span>
                  </div>
                )}

                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                        <th className="py-2 pr-2">Date</th>
                        <th className="py-2 pr-2">Detail</th>
                        <th className="py-2 pr-2">Category</th>
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">Amount (₱)</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const err = rowErrors[r._rowId] || {};
                        return (
                          <tr
                            key={r._rowId}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 pr-2 align-top">
                              <input
                                type="date"
                                value={r.date}
                                onChange={(e) =>
                                  handleRowChange(
                                    r._rowId,
                                    "date",
                                    e.target.value
                                  )
                                }
                                className={`w-36 border rounded px-2 py-1.5 text-sm text-gray-900 ${
                                  err.date
                                    ? "border-red-400"
                                    : "border-gray-300"
                                }`}
                              />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <input
                                type="text"
                                value={r.detail}
                                onChange={(e) =>
                                  handleRowChange(
                                    r._rowId,
                                    "detail",
                                    e.target.value
                                  )
                                }
                                placeholder="e.g. Staff salaries - Aug 1-15"
                                className={`w-48 border rounded px-2 py-1.5 text-sm text-gray-900 ${
                                  err.detail
                                    ? "border-red-400"
                                    : "border-gray-300"
                                }`}
                              />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <select
                                value={r.category_id}
                                onChange={(e) =>
                                  handleRowChange(
                                    r._rowId,
                                    "category_id",
                                    e.target.value
                                  )
                                }
                                className={`w-40 border rounded px-2 py-1.5 text-sm ${
                                  err.category_id
                                    ? "border-red-400"
                                    : "border-gray-300"
                                }`}
                              >
                                <option value="">Select</option>
                                {[
                                  "asset",
                                  "liability",
                                  "equity",
                                  "revenue",
                                  "expense",
                                ].map((cls) => {
                                  const inClass = categories.filter(
                                    (c) => c.classification === cls
                                  );
                                  if (inClass.length === 0) return null;
                                  return (
                                    <optgroup
                                      key={cls}
                                      label={
                                        cls.charAt(0).toUpperCase() +
                                        cls.slice(1)
                                      }
                                    >
                                      {inClass.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRowChange(r._rowId, "type", "debit")
                                  }
                                  className={`px-2 py-1.5 rounded text-xs font-semibold border ${
                                    r.type === "debit"
                                      ? "bg-green-600 text-white border-green-600"
                                      : "border-gray-300 text-gray-500"
                                  }`}
                                >
                                  Debit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRowChange(r._rowId, "type", "credit")
                                  }
                                  className={`px-2 py-1.5 rounded text-xs font-semibold border ${
                                    r.type === "credit"
                                      ? "bg-red-600 text-white border-red-600"
                                      : "border-gray-300 text-gray-500"
                                  }`}
                                >
                                  Credit
                                </button>
                              </div>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={r.amount}
                                onChange={(e) =>
                                  handleRowChange(
                                    r._rowId,
                                    "amount",
                                    e.target.value
                                  )
                                }
                                placeholder="0.00"
                                className={`w-28 border rounded px-2 py-1.5 text-sm text-gray-900 ${
                                  err.amount
                                    ? "border-red-400"
                                    : "border-gray-300"
                                }`}
                              />
                            </td>
                            <td className="py-2 align-top">
                              <button
                                type="button"
                                onClick={() => removeRow(r._rowId)}
                                disabled={rows.length === 1}
                                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed p-1.5"
                              >
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline"
                    >
                      <Plus size={14} />
                      Add Row
                    </button>
                    <button
                      type="button"
                      onClick={duplicateLastRow}
                      className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                    >
                      Duplicate Last
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="text-sm font-semibold text-gray-500 px-4 py-2 rounded hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-red-600 text-white text-sm font-bold px-4 py-2 rounded hover:bg-red-700"
                    >
                      Review {rows.length > 1 ? `${rows.length} Entries` : "Entry"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-lg p-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 mb-4">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>This cannot be undone.</strong> Double-check the
                    entries below before saving — once saved, they'll appear
                    permanently in your Ledger.
                  </span>
                </div>

                {banner && (
                  <div className="flex items-start gap-2 rounded-lg p-3 text-sm bg-red-50 text-red-700 border border-red-200 mb-4">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{banner.message}</span>
                  </div>
                )}

                <div className="overflow-y-auto flex-1 -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Detail</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3 text-right">Debit</th>
                        <th className="py-2 px-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r._rowId} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-900 whitespace-nowrap">
                            {r.date}
                          </td>
                          <td className="py-2 px-3 text-gray-900">
                            {r.detail}
                          </td>
                          <td className="py-2 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                              {categoryName(r.category_id)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {r.type === "debit" ? (
                              <span className="text-green-600">
                                {formatPeso(
                                  Math.round(parseFloat(r.amount) * 100)
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {r.type === "credit" ? (
                              <span className="text-red-600">
                                {formatPeso(
                                  Math.round(parseFloat(r.amount) * 100)
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep("edit")}
                    className="text-sm font-semibold text-gray-500 px-4 py-2 rounded hover:bg-gray-100"
                  >
                    ← Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-red-600 text-white text-sm font-bold px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {saving ? "Saving…" : "Yes, Save Permanently"}
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