import { useState, useEffect, useCallback } from "react";
import { Search, Plus, X, Eye, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../api/supabase";

const UNITS = ["pcs", "kg", "g", "liters", "ml", "meters", "rolls", "sheets", "boxes"];
const STOCK_STATUSES = ["In Stock", "Low Stock", "Out of Stock"];

const STATUS_STYLES = {
  "In Stock": "bg-green-100 text-green-700",
  "Low Stock": "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-red-100 text-red-700",
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">
            {isEdit ? "Edit Raw Material" : "Add Raw Material"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Material Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Oil - Bergamoth Note"
              value={form.material_name}
              onChange={(e) => set("material_name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Category
              </label>
              <input
                type="text"
                placeholder="e.g. Essential Oil"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Unit
              </label>
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
            <label className="block text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">
              Current Stock
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.current_stock}
              onChange={(e) => set("current_stock", e.target.value)}
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Supplier
              </label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Unit Cost (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.unit_cost}
                onChange={(e) => set("unit_cost", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Update Material" : "Add Material"}
          </button>
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Material Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Material Name
            </label>
            <p className="text-sm text-gray-800">{item.material_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Category
              </label>
              <p className="text-sm text-gray-800">{item.category || "—"}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </label>
              <span
                className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}
              >
                {status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Current Stock
              </label>
              <p className="text-sm font-bold text-amber-700">
                {item.current_stock} {item.unit}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Supplier
              </label>
              <p className="text-sm text-gray-800">{item.supplier || "—"}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Unit Cost
              </label>
              <p className="text-sm text-gray-800">
                {item.unit_cost != null ? `₱${item.unit_cost}` : "—"}
              </p>
            </div>
          </div>

          {item.notes && (
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Notes
              </label>
              <p className="text-sm text-gray-700">{item.notes}</p>
            </div>
          )}

          {item.updated_at && (
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Last Updated
              </label>
              <p className="text-xs text-gray-500">
                {new Date(item.updated_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
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

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Raw Materials</h1>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <button
            onClick={() => {
              setEditItem(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            Add Material
          </button>
          <button
            onClick={fetchMaterials}
            disabled={loading}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? "↻ Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search material or supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                filterCategory === cat
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-400 whitespace-nowrap">
          {filtered.length} materials
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr>
                <th className="bg-gray-100 border border-gray-300 w-8">#</th>
                <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700 min-w-[180px]">
                  MATERIAL
                </th>
                <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700">
                  SUPPLIER
                </th>
                <th className="bg-amber-400 text-amber-900 border border-amber-500 px-3 py-2 text-center text-xs font-bold">
                  STOCK
                </th>
                <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-center text-xs font-bold text-gray-700">
                  UNIT COST
                </th>
                <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-center text-xs font-bold text-gray-700">
                  STATUS
                </th>
                <th className="bg-emerald-800 text-white border border-emerald-700 px-3 py-2 text-center text-xs font-bold">
                  ACTION
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(TOTAL_COLS - 1)].map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS - 1} className="px-4 py-12 text-center text-gray-400">
                    <p className="text-4xl mb-2">🧵</p>
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
                      ? "bg-red-50"
                      : rowNum % 2 === 0
                      ? "bg-gray-50 hover:bg-gray-100"
                      : "bg-white hover:bg-gray-50";

                    rows.push(
                      <tr key={item.id} className={`${rowBg} border-b border-gray-200 transition-colors`}>
                        <td className="px-2 py-1.5 text-center text-xs text-gray-400 bg-gray-50 border-r border-gray-200 w-8">
                          {rowNum++}
                        </td>

                        <td className="px-3 py-1.5 text-xs text-gray-800 border-r border-gray-200">
                          <div className="flex items-center gap-2">
                            {item.material_name}
                            {status === "Low Stock" && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium shrink-0">
                                Low
                              </span>
                            )}
                            {status === "Out of Stock" && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded font-medium shrink-0">
                                Out
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-1.5 text-xs text-gray-500 border-r border-gray-200">
                          {item.supplier || "—"}
                        </td>

                        <td className="px-3 py-1.5 text-center border-r border-amber-200">
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
                              className="w-20 text-center text-xs border border-amber-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item)}
                              title="Click to edit stock"
                              className={`text-xs font-bold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all ${
                                low ? "text-red-700 bg-red-100" : "text-black"
                              }`}
                            >
                              {item.current_stock} {item.unit}
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-center text-xs text-gray-600 border-r border-gray-200">
                          {item.unit_cost != null ? `₱${item.unit_cost}` : "—"}
                        </td>

                        <td className="px-2 py-1.5 text-center border-r border-gray-200">
                          <select
                            value={status}
                            onChange={(e) => handleStatusChange(item, e.target.value)}
                            className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400 ${STATUS_STYLES[status]}`}
                          >
                            {STOCK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-1.5 py-1 text-center border border-gray-300">
                          <div className="flex items-center justify-center gap-5">
                            <button
                              onClick={() => handleView(item)}
                              title="View"
                              className="p-0.5 rounded hover:bg-blue-100 transition-colors cursor-pointer"
                            >
                              <Eye size={20} className="text-blue-600" />
                            </button>
                            <button
                              onClick={() => handleEdit(item)}
                              title="Edit"
                              className="p-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                            >
                              <Pencil size={20} className="text-amber-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(item)}
                              title="Delete"
                              className="p-0.5 rounded hover:bg-pink-100 transition-colors cursor-pointer"
                            >
                              <Trash2 size={20} className="text-pink-600" />
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
                <tr className="bg-amber-400 border-t-2 border-amber-500 font-bold">
                  <td className="px-2 py-2 text-center text-xs text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-xs text-amber-900 border-r border-amber-500">
                    TOTAL ({filtered.length} materials)
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-gray-900">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-gray-500 pb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />
          Low Stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">Delete Material</h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setItemToDelete(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={20} />
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
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setItemToDelete(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Production_rm;