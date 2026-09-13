// INVENTORY RAW MATERIALS TO!!!!!!!
import { useState, useEffect, useCallback } from "react";
import { Search, Plus, X, Eye, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../api/supabase";

/* ---------------------------------------------------------------------
 * Design tokens (ISONFAM ERP) — shared conventions with Production.jsx.
 * Red is reserved for the primary action and true alerts (low/out of
 * stock); status colors use their own semantic palette so red keeps
 * its meaning as "needs attention".
 * ------------------------------------------------------------------- */
const ACCENT = "#9A1B1B";
const ACCENT_HOVER = "#7F1616";

const CARD = "bg-white rounded-md border border-gray-200 shadow-sm";
const SEGMENT_WRAP = "flex gap-0.5 bg-gray-100 rounded-md p-0.5 flex-wrap";
const SEGMENT_BTN = (active) =>
  `px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
    active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`;
const PRIMARY_BTN =
  "px-3.5 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer";
const SECONDARY_BTN =
  "px-3.5 py-2 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer";

const UNITS = ["pcs", "kg", "g", "liters", "ml", "meters", "rolls", "sheets", "boxes"];
const STOCK_STATUSES = ["In Stock", "Low Stock", "Out of Stock"];

const STATUS_STYLES = {
  "In Stock": "bg-emerald-50 text-emerald-700",
  "Low Stock": "bg-amber-50 text-amber-700",
  "Out of Stock": "bg-red-50 text-red-700",
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

function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse`} />;
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`${PRIMARY_BTN} inline-flex items-center gap-1.5 ${className}`}
      style={{ background: ACCENT }}
      onMouseEnter={(e) => !props.disabled && (e.currentTarget.style.background = ACCENT_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button {...props} className={`${SECONDARY_BTN} inline-flex items-center gap-1.5 ${className}`}>
      {children}
    </button>
  );
}

// ── AddMaterialModal ──────────────────────────────────────────────────────

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
      const { error: updateError } = await supabase
        .from("raw_materials")
        .update(payload)
        .eq("id", editItem.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("raw_materials")
        .insert([payload]);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? "Edit Raw Material" : "Add Raw Material"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Material Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Oil - Bergamoth Note"
              value={form.material_name}
              onChange={(e) => set("material_name", e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Category
              </label>
              <input
                type="text"
                placeholder="e.g. Essential Oil"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Unit
              </label>
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1">
              Current Stock
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.current_stock}
              onChange={(e) => set("current_stock", e.target.value)}
              className="w-full border border-amber-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Supplier
              </label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Unit Cost (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.unit_cost}
                onChange={(e) => set("unit_cost", e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 rounded-md px-3 py-2 border border-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update Material" : "Add Material"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ── ViewMaterialModal ─────────────────────────────────────────────────────

function ViewMaterialModal({ item, onClose }) {
  if (!item) return null;
  const status = item.status || "In Stock";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Material Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Material Name
            </label>
            <p className="text-sm text-gray-800 mt-0.5">{item.material_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Category
              </label>
              <p className="text-sm text-gray-800 mt-0.5">{item.category || "—"}</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Status
              </label>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}
              >
                {status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Current Stock
              </label>
              <p className="text-sm font-semibold text-amber-700 mt-0.5">
                {item.current_stock} {item.unit}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Supplier
              </label>
              <p className="text-sm text-gray-800 mt-0.5">{item.supplier || "—"}</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Unit Cost
              </label>
              <p className="text-sm text-gray-800 mt-0.5">
                {item.unit_cost != null ? `₱${item.unit_cost}` : "—"}
              </p>
            </div>
          </div>

          {item.notes && (
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Notes
              </label>
              <p className="text-sm text-gray-700 mt-0.5">{item.notes}</p>
            </div>
          )}

          {item.updated_at && (
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Last Updated
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(item.updated_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

// ── Production_rm ─────────────────────────────────────────────────────────

function Production_rm() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [lastUpdated, setLastUpdated] = useState(null);
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

    if (!error && data) {
      setMaterials(data);
      setLastUpdated(new Date());
    }
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
    const { error } = await supabase
      .from("raw_materials")
      .delete()
      .eq("id", itemToDelete.id);

    if (!error) {
      setMaterials((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
    setSaving(false);
  };

  const categories = Array.from(
    new Set(materials.map((m) => m.category).filter(Boolean))
  ).sort();

  const filtered = materials.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const matchSearch =
      !search ||
      item.material_name.toLowerCase().includes(search.toLowerCase()) ||
      (item.supplier || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const saveField = async (id, field, value) => {
    const newValue = field === "current_stock" ? parseFloat(value) : value;
    if (field === "current_stock" && (isNaN(newValue) || newValue < 0)) return;

    setSaving(true);
    const updateData = { [field]: newValue, updated_at: new Date().toISOString() };

    const { error } = await supabase.from("raw_materials").update(updateData).eq("id", id);

    if (!error) {
      setMaterials((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...updateData } : i))
      );
    }
    setSaving(false);
  };

  const handleStatusChange = async (item, newStatus) => {
    const { error } = await supabase
      .from("raw_materials")
      .update({ status: newStatus })
      .eq("id", item.id);

    if (!error) {
      setMaterials((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
      );
    }
  };

  const handleStockEdit = (item) => {
    setEditingStock({ id: item.id, value: String(item.current_stock ?? 0) });
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter") {
      if (editingStock) {
        saveField(id, "current_stock", editingStock.value);
        setEditingStock(null);
      }
    }
    if (e.key === "Escape") setEditingStock(null);
  };

  const TOTAL_COLS = 8;
  const lowCount = filtered.filter((m) => (m.status || "In Stock") !== "In Stock").length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className={`${CARD} p-5 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Inventory — Raw Materials</h1>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <PrimaryButton
            onClick={() => {
              setEditItem(null);
              setShowAddModal(true);
            }}
          >
            <Plus size={15} />
            Add Material
          </PrimaryButton>
          <SecondaryButton onClick={fetchMaterials} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </SecondaryButton>
        </div>
      </div>

      {/* Filters */}
      <div className={`${CARD} px-4 py-3 flex flex-col md:flex-row gap-3 items-center`}>
        <div className="relative flex-1 w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search material or supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
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
        <div className={SEGMENT_WRAP}>
          {["All", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={SEGMENT_BTN(filterCategory === cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 whitespace-nowrap">
          {filtered.length} materials
        </p>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border-b border-gray-200 w-8" />
                <th className="border-b border-gray-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 min-w-[180px]">
                  Material
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Supplier
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Stock
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Unit Cost
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(TOTAL_COLS - 1)].map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS - 1} className="px-4 py-12 text-center text-gray-400">
                    <p className="font-medium text-gray-500">No raw materials found</p>
                  </td>
                </tr>
              ) : (
                (() => {
                  const rows = [];
                  let rowNum = 1;

                  for (const item of filtered) {
                    const status = item.status || "In Stock";
                    const low = status === "Low Stock" || status === "Out of Stock";

                    const rowBg = low
                      ? "bg-red-50/40"
                      : rowNum % 2 === 0
                      ? "bg-gray-50/60 hover:bg-gray-100"
                      : "bg-white hover:bg-gray-50";

                    rows.push(
                      <tr key={item.id} className={`${rowBg} border-b border-gray-100 transition-colors`}>
                        <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">
                          {rowNum++}
                        </td>

                        <td className="px-3 py-2 text-xs text-gray-800">
                          <div className="flex items-center gap-2">
                            {item.material_name}
                            {status === "Low Stock" && (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-xs rounded font-medium shrink-0">
                                Low
                              </span>
                            )}
                            {status === "Out of Stock" && (
                              <span className="px-1.5 py-0.5 bg-red-50 text-red-700 text-xs rounded font-medium shrink-0">
                                Out
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2 text-xs text-gray-500">
                          {item.supplier || "—"}
                        </td>

                        <td className="px-3 py-2 text-center">
                          {editingStock?.id === item.id ? (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({ ...editingStock, value: e.target.value })
                              }
                              onBlur={() => {
                                if (editingStock) {
                                  saveField(item.id, "current_stock", editingStock.value);
                                  setEditingStock(null);
                                }
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-20 text-center text-xs border border-amber-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item)}
                              title="Click to edit stock"
                              className={`text-xs font-semibold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all ${
                                low ? "text-red-700 bg-red-50" : "text-gray-800"
                              }`}
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
                            className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300 ${STATUS_STYLES[status]}`}
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
                              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                              <Eye size={16} className="text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleEdit(item)}
                              title="Edit"
                              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                              <Pencil size={16} className="text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(item)}
                              title="Delete"
                              className="p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} style={{ color: ACCENT }} />
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
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td className="px-2 py-2.5 text-center text-xs text-gray-400">—</td>
                  <td colSpan={2} className="px-3 py-2.5 text-xs text-gray-700">
                    TOTAL ({filtered.length} materials)
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                    {lowCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[11px] font-medium">
                        {lowCount} needs attention
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
      <div className="flex gap-4 flex-wrap text-xs text-gray-400 pb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Low Stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Out of Stock
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${CARD} w-full max-w-md`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Delete Material</h2>
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

            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete{" "}
                <span className="font-semibold">{itemToDelete.material_name}</span>? This
                action cannot be undone.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
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
  );
}

export default Production_rm;