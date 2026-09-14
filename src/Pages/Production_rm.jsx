// INVENTORY RAW MATERIALS TO!!!!!!!
import { useState, useEffect, useCallback } from "react";
import { Search, Plus, X, Eye, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens ──────────────────────────────────────────────────────────
   Shared with Inventory.jsx so both pages of the module read as one product. */
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
  successBorder: "#CDE7D2",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
};

const UNITS = ["pcs", "kg", "g", "liters", "ml", "meters", "rolls", "sheets", "boxes"];
const STOCK_STATUSES = ["In Stock", "Low Stock", "Out of Stock"];

const STATUS_STYLE = {
  "In Stock": { color: C.success, backgroundColor: C.successSoft, borderColor: C.successBorder },
  "Low Stock": { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder },
  "Out of Stock": { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder },
};

const EMPTY_FORM = {
  material_name: "",
  category: "",
  unit: "pcs",
  current_stock: "",
  supplier: "",
  unit_cost: "",
  notes: "",
};

/* ── Shared field primitives ─────────────────────────────────────────────── */

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span style={{ color: C.accent }}> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputBase =
  "w-full border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors";

function TextInput(props) {
  return (
    <input
      {...props}
      className={`${inputBase} border-gray-300`}
      style={{ ...props.style }}
      onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`, e.target.style.borderColor = C.accent)}
      onBlur={(e) => (e.target.style.boxShadow = "none", e.target.style.borderColor = "#D1D5DB", props.onBlur?.(e))}
    />
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${className}`}
      style={{ backgroundColor: C.accent }}
      onMouseEnter={(e) => !props.disabled && (e.currentTarget.style.backgroundColor = C.accentHover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.accent)}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div className="flex-1 min-w-[110px] px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold mt-0.5" style={{ color: color || C.text }}>
        {value}
      </p>
    </div>
  );
}

/* ── AddMaterialModal ──────────────────────────────────────────────────── */

function AddMaterialModal({ onClose, onSaved, editItem = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setForm({
        material_name: editItem.material_name || "",
        category: editItem.category || "",
        unit: editItem.unit || "pcs",
        current_stock: editItem.current_stock?.toString() || "",
        supplier: editItem.supplier || "",
        unit_cost: editItem.unit_cost?.toString() || "",
        notes: editItem.notes || "",
      });
    }
  }, [editItem]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.material_name.trim()) {
      setError("Material name is required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      material_name: form.material_name.trim(),
      category: form.category.trim() || null,
      unit: form.unit,
      current_stock: Number(form.current_stock) || 0,
      supplier: form.supplier.trim() || null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      notes: form.notes.trim() || null,
    };

    let error = null;
    if (isEdit && editItem.id) {
      const { error: updateError } = await supabase.from("raw_materials").update(payload).eq("id", editItem.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from("raw_materials").insert([payload]);
      error = insertError;
    }

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? "Edit material" : "Add material"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Material name" required>
            <TextInput
              type="text"
              placeholder="e.g. Oil — Bergamot Note"
              value={form.material_name}
              onChange={(e) => set("material_name", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <TextInput
                type="text"
                placeholder="e.g. Essential Oil"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className={`${inputBase} border-gray-300 cursor-pointer`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Current stock">
            <TextInput
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.current_stock}
              onChange={(e) => set("current_stock", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <TextInput
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
              />
            </Field>
            <Field label="Unit cost (₱)">
              <TextInput
                type="number"
                min="0"
                step="any"
                value={form.unit_cost}
                onChange={(e) => set("unit_cost", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={`${inputBase} border-gray-300`}
              onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`, e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.boxShadow = "none", e.target.style.borderColor = "#D1D5DB")}
            />
          </Field>

          {error && (
            <p className="text-xs rounded-md px-3 py-2 border" style={{ color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update material" : "Add material"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── ViewMaterialModal ─────────────────────────────────────────────────── */

function ViewMaterialModal({ item, onClose }) {
  if (!item) return null;
  const status = item.status || "In Stock";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Material details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-500">Material name</p>
            <p className="text-sm text-gray-800 mt-0.5">{item.material_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Category</p>
              <p className="text-sm text-gray-800 mt-0.5">{item.category || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <span
                className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border"
                style={STATUS_STYLE[status]}
              >
                {status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Current stock</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: C.text }}>
                {item.current_stock} {item.unit}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Unit cost</p>
              <p className="text-sm text-gray-800 mt-0.5">{item.unit_cost != null ? `₱${item.unit_cost}` : "—"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500">Supplier</p>
            <p className="text-sm text-gray-800 mt-0.5">{item.supplier || "—"}</p>
          </div>

          {item.notes && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 mt-0.5">{item.notes}</p>
            </div>
          )}

          {item.updated_at && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Last updated {new Date(item.updated_at).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── Production_rm ─────────────────────────────────────────────────────── */

function Production_rm() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [editingStock, setEditingStock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("raw_materials")
      .select("*")
      .order("category", { ascending: true })
      .order("material_name", { ascending: true });

    if (!error && data) setMaterials(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleView = (item) => {
    setSelectedItem(item);
    setShowViewModal(true);
  };
  const handleEdit = (item) => {
    setEditItem(item);
    setShowAddModal(true);
  };
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setSaving(true);
    const { error } = await supabase.from("raw_materials").delete().eq("id", itemToDelete.id);
    if (!error) {
      setMaterials((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
    setSaving(false);
  };

  const categories = Array.from(new Set(materials.map((m) => m.category).filter(Boolean))).sort();

  const filtered = materials.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const matchSearch =
      !search ||
      item.material_name.toLowerCase().includes(search.toLowerCase()) ||
      (item.supplier || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const inStockCount = filtered.filter((m) => (m.status || "In Stock") === "In Stock").length;
  const lowStockCount = filtered.filter((m) => m.status === "Low Stock").length;
  const outStockCount = filtered.filter((m) => m.status === "Out of Stock").length;

  const saveField = async (id, field, value) => {
    const newValue = field === "current_stock" ? parseFloat(value) : value;
    if (field === "current_stock" && (isNaN(newValue) || newValue < 0)) return;

    setSaving(true);
    const updateData = { [field]: newValue, updated_at: new Date().toISOString() };

    const { error } = await supabase.from("raw_materials").update(updateData).eq("id", id);
    if (!error) {
      setMaterials((prev) => prev.map((i) => (i.id === id ? { ...i, ...updateData } : i)));
    }
    setSaving(false);
  };

  const handleStatusChange = async (item, newStatus) => {
    const { error } = await supabase.from("raw_materials").update({ status: newStatus }).eq("id", item.id);
    if (!error) {
      setMaterials((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
    }
  };

  const handleStockEdit = (item) => {
    setEditingStock({ id: item.id, value: String(item.current_stock ?? 0) });
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter" && editingStock) {
      saveField(id, "current_stock", editingStock.value);
      setEditingStock(null);
    }
    if (e.key === "Escape") setEditingStock(null);
  };

  const TOTAL_COLS = 7;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Inventory - Raw Materials</h1>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <PrimaryButton
              onClick={() => {
                setEditItem(null);
                setShowAddModal(true);
              }}
            >
              <Plus size={15} />
              Add material
            </PrimaryButton>
            <SecondaryButton onClick={fetchMaterials} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </SecondaryButton>
          </div>
        </div>

        {/* Summary strip */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-wrap divide-x divide-gray-300">
          <SummaryStat label="Materials" value={filtered.length} />
          <SummaryStat label="In stock" value={inStockCount} color={C.success} />
          <SummaryStat label="Low stock" value={lowStockCount} color={lowStockCount > 0 ? C.warning : C.text} />
          <SummaryStat label="Out of stock" value={outStockCount} color={outStockCount > 0 ? C.accent : C.text} />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search material or supplier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
              onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`, e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.boxShadow = "none", e.target.style.borderColor = "#D1D5DB")}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {["All", ...categories].map((cat) => {
              const active = filterCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
                  style={
                    active
                      ? { backgroundColor: C.accent, borderColor: C.accent, color: "#fff" }
                      : { backgroundColor: "#fff", borderColor: "#D1D5DB", color: "#142947" }
                  }
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-red-900 text-white">
                  <th className="px-2 py-2.5 w-8" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide min-w-[200px]">MATERIAL</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">SUPPLIER</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">STOCK</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">UNIT COST</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">STATUS</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">VIEW · EDIT · DELETE</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {[...Array(TOTAL_COLS)].map((_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={TOTAL_COLS} className="px-4 py-14 text-center text-gray-400">
                      <p className="text-sm font-medium text-gray-500">No raw materials found</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different search term or category.</p>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const rows = [];
                    let rowNum = 1;

                    for (const item of filtered) {
                      const status = item.status || "In Stock";
                      const low = status === "Low Stock" || status === "Out of Stock";
                      const rowBg = low ? {} : rowNum % 2 === 0 ? { backgroundColor: "#FAFAFA" } : {};

                      rows.push(
                        <tr
                          key={item.id}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                          style={low ? { backgroundColor: C.accentSoft } : rowBg}
                        >
                          <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">{rowNum++}</td>

                          <td className="px-3 py-2 text-xs text-gray-800">
                            <div className="flex items-center gap-2">
                              {item.material_name}
                              {status !== "In Stock" && (
                                <span
                                  className="px-1.5 py-0.5 text-[11px] rounded font-medium shrink-0 border"
                                  style={STATUS_STYLE[status]}
                                >
                                  {status === "Low Stock" ? "Low" : "Out"}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2 text-xs text-gray-500">{item.supplier || "—"}</td>

                          <td className="px-3 py-2 text-center">
                            {editingStock?.id === item.id ? (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={editingStock.value}
                                onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                onBlur={() => {
                                  saveField(item.id, "current_stock", editingStock.value);
                                  setEditingStock(null);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, item.id)}
                                autoFocus
                                className="w-20 text-center text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-2"
                                style={{ borderColor: C.accent, boxShadow: `0 0 0 2px ${C.accent}22` }}
                              />
                            ) : (
                              <button
                                onClick={() => handleStockEdit(item)}
                                title="Click to edit"
                                className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                              >
                                {item.current_stock} {item.unit}
                              </button>
                            )}
                          </td>

                          <td className="px-3 py-2 text-center text-xs text-gray-600">
                            {item.unit_cost != null ? `₱${item.unit_cost}` : "—"}
                          </td>

                          <td className="px-2 py-2 text-center">
                            <select
                              value={status}
                              onChange={(e) => handleStatusChange(item, e.target.value)}
                              className="px-2 py-1 rounded-full text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-1"
                              style={STATUS_STYLE[status]}
                            >
                              {STOCK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-1.5 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleView(item)}
                                title="View"
                                className="p-1.5 rounded-md hover:bg-red-200 transition-colors cursor-pointer"
                              >
                                <Eye size={16} className="text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                title="Edit"
                                className="p-1.5 rounded-md hover:bg-red-200 transition-colors cursor-pointer"
                              >
                                <Pencil size={16} className="text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(item)}
                                title="Delete"
                                className="p-1.5 rounded-md hover:bg-red-200 transition-colors cursor-pointer"
                              >
                                <Trash2 size={16} style={{ color: C.accent }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return rows;
                  })()
                )}

                {!loading && filtered.length > 0 && (
                  <tr className="border-t-2 font-semibold" style={{ borderTopColor: C.accent, backgroundColor: "#FAFAFA" }}>
                    <td className="px-2 py-2.5 text-center text-xs text-gray-400">—</td>
                    <td colSpan={2} className="px-3 py-2.5 text-xs text-gray-700">
                      TOTAL ({filtered.length} materials)
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {(lowStockCount + outStockCount) > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[11px] font-medium border"
                          style={STATUS_STYLE["Low Stock"]}
                        >
                          {lowStockCount + outStockCount} need attention
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 flex-wrap text-xs text-gray-500 pb-2">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: C.warningSoft, borderColor: C.warningBorder }} />
            Low stock
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }} />
            Out of stock
          </span>
        </div>

        {/* Modals */}
        {showAddModal && (
          <AddMaterialModal
            onClose={() => {
              setShowAddModal(false);
              setEditItem(null);
            }}
            onSaved={fetchMaterials}
            editItem={editItem}
          />
        )}

        {showViewModal && selectedItem && (
          <ViewMaterialModal
            item={selectedItem}
            onClose={() => {
              setShowViewModal(false);
              setSelectedItem(null);
            }}
          />
        )}

        {showDeleteModal && itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">Delete material</h2>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-sm text-gray-600">
                  Delete <span className="font-medium text-gray-800">{itemToDelete.material_name}</span>? This can't be undone.
                </p>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
                <SecondaryButton
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                  }}
                >
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={confirmDelete} disabled={saving}>
                  {saving ? "Deleting…" : "Delete"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Production_rm;