// INVENTORY - RAW MATERIALS (OILS + ALCOHOL)
// Materials are tracked as the supplier's purchased items (Belstar, IFF, MG, Sozio),
// NOT one-per-product. No BOM / recipe: production enters raw mats manually.
// Everything is measured in litres (L).
// Stock goes UP through (a) Receive delivery or (b) a manual edit by the beneficiary.
import { useState, useEffect, useCallback } from "react";
import { Search, Plus, X, Eye, Pencil, Trash2, PackagePlus, Boxes } from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens ─────────────────────────────────────────────────────── */
const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  success: "#15803D",
  successSoft: "#EEF6EF",
  successBorder: "#CDE7D2",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
};

// Every material (oils and alcohol) is measured in litres.
const UNIT = "L";
const CATEGORY_SUGGESTIONS = ["Oil", "Alcohol", "Other"];

const STATUS_STYLE = {
  "In Stock": { color: C.success, backgroundColor: C.successSoft, borderColor: C.successBorder },
  "Low Stock": { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder },
  "Out of Stock": { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder },
};

const EMPTY_FORM = {
  material_name: "",
  category: "Oil",
  current_stock: "",
  reorder_point: "5",
  supplier_id: "",
  notes: "",
};

const today = () => new Date().toISOString().slice(0, 10);

/* ── Shared primitives ─────────────────────────────────────────────────── */

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

const focusOn = (e) => {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
};
const focusOff = (e) => {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
};

function TextInput(props) {
  return (
    <input
      {...props}
      className={`${inputBase} border-gray-300`}
      onFocus={focusOn}
      onBlur={(e) => {
        focusOff(e);
        props.onBlur?.(e);
      }}
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

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
      style={
        active
          ? { backgroundColor: C.accent, borderColor: C.accent, color: "#fff" }
          : { backgroundColor: "#fff", borderColor: "#D1D5DB", color: "#142947" }
      }
    >
      {children}
    </button>
  );
}

function ModalShell({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`bg-white rounded-lg shadow-xl border border-gray-200 w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <p
      className="text-xs rounded-md px-3 py-2 border"
      style={{ color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }}
    >
      {error}
    </p>
  );
}

/* ── Add / Edit material ───────────────────────────────────────────────── */

function AddMaterialModal({ onClose, onSaved, suppliers, editItem = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setForm({
        material_name: editItem.material_name || "",
        category: editItem.category || "",
        current_stock: editItem.current_stock?.toString() || "",
        reorder_point: editItem.reorder_point?.toString() ?? "5",
        supplier_id: editItem.supplier_id || "",
        notes: editItem.notes || "",
      });
    }
  }, [editItem]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id);

  const handleSubmit = async () => {
    if (!form.material_name.trim()) return setError("Material name is required.");
    if (!form.supplier_id) return setError("Please select a supplier.");

    setSaving(true);
    setError("");

    // status is computed by the DB trigger from current_stock vs reorder_point
    const payload = {
      material_name: form.material_name.trim(),
      category: form.category.trim() || null,
      unit: UNIT,
      current_stock: Number(form.current_stock) || 0,
      reorder_point: form.reorder_point === "" ? 5 : Math.max(0, Number(form.reorder_point) || 0),
      supplier_id: form.supplier_id,
      notes: form.notes.trim() || null,
    };

    const { error: dbError } =
      isEdit && editItem.id
        ? await supabase.from("raw_materials").update(payload).eq("id", editItem.id)
        : await supabase.from("raw_materials").insert([payload]);

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <ModalShell
      title={isEdit ? "Edit material" : "Add material"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update material" : "Add material"}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Material name" required hint="Name it the way the supplier's receipt lists it.">
        <TextInput
          type="text"
          placeholder="e.g. Lavender Oil"
          value={form.material_name}
          onChange={(e) => set("material_name", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier" required hint={selectedSupplier?.notes || undefined}>
          <select
            value={form.supplier_id}
            onChange={(e) => set("supplier_id", e.target.value)}
            className={`${inputBase} border-gray-300 cursor-pointer`}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <TextInput
            type="text"
            list="rm-category-suggestions"
            placeholder="e.g. Oil"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          />
          <datalist id="rm-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={`Current stock (${UNIT})`}
          hint={isEdit ? undefined : "Opening balance. Use Receive delivery for new stock later."}
        >
          <TextInput
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={form.current_stock}
            onChange={(e) => set("current_stock", e.target.value)}
          />
        </Field>
        <Field label={`Reorder point (${UNIT})`} hint="Status flips to Low/Out automatically at or below this.">
          <TextInput
            type="number"
            min="0"
            step="any"
            placeholder="5"
            value={form.reorder_point}
            onChange={(e) => set("reorder_point", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={`${inputBase} border-gray-300`}
          onFocus={focusOn}
          onBlur={focusOff}
        />
      </Field>

      <ErrorBox error={error} />
    </ModalShell>
  );
}

/* ── Receive delivery (stock-in when a supplier delivers) ──────────────── */

const emptyLine = () => ({ key: Math.random().toString(36).slice(2), material_id: "", quantity: "" });

function ReceiveDeliveryModal({ onClose, onSaved, suppliers, materials }) {
  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const supplierMaterials = materials.filter((m) => m.supplier_id === supplierId);
  const setLine = (key, patch) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSupplierChange = (id) => {
    setSupplierId(id);
    setLines([emptyLine()]); // lines belong to one supplier's delivery
  };

  const handleSubmit = async () => {
    setError("");
    if (!supplierId) return setError("Select the supplier who delivered.");

    const filled = lines.filter((l) => l.material_id || l.quantity);
    if (filled.length === 0) return setError("Add at least one delivered item.");
    for (const l of filled) {
      if (!l.material_id) return setError("Every line needs a material.");
      if (!(Number(l.quantity) > 0)) return setError("Every line needs a quantity greater than 0.");
    }
    const ids = filled.map((l) => l.material_id);
    if (new Set(ids).size !== ids.length) return setError("A material appears twice. Combine it into one line.");

    setSaving(true);
    const { error: rpcError } = await supabase.rpc("receive_stock", {
      p_supplier_id: supplierId,
      p_received_date: receivedDate,
      p_items: filled.map((l) => ({ material_id: l.material_id, quantity: Number(l.quantity) })),
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <ModalShell
      title="Receive delivery"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Add to inventory"}
          </PrimaryButton>
        </>
      }
    >
      <p className="text-xs text-gray-500">
        Enter what the supplier delivered. Each quantity is added to the current stock of that item.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier" required>
          <select
            value={supplierId}
            onChange={(e) => handleSupplierChange(e.target.value)}
            className={`${inputBase} border-gray-300 cursor-pointer`}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date received" required>
          <TextInput type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Delivered items</p>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-12 gap-2 items-center">
            <select
              value={l.material_id}
              disabled={!supplierId}
              onChange={(e) => setLine(l.key, { material_id: e.target.value })}
              className={`${inputBase} border-gray-300 cursor-pointer col-span-8 disabled:bg-gray-50`}
            >
              <option value="">{supplierId ? "Select material…" : "Select supplier first"}</option>
              {supplierMaterials.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.material_name}
                </option>
              ))}
            </select>
            <div className="col-span-3 relative">
              <TextInput
                type="number"
                min="0"
                step="any"
                placeholder="Qty"
                style={{ paddingRight: 26 }}
                value={l.quantity}
                onChange={(e) => setLine(l.key, { quantity: e.target.value })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{UNIT}</span>
            </div>
            <button
              type="button"
              onClick={() => setLines((p) => (p.length === 1 ? [emptyLine()] : p.filter((x) => x.key !== l.key)))}
              className="col-span-1 text-gray-400 hover:text-gray-600 cursor-pointer flex justify-center"
              title="Remove line"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((p) => [...p, emptyLine()])}
          disabled={!supplierId}
          className="text-xs font-medium cursor-pointer disabled:opacity-40"
          style={{ color: C.accent }}
        >
          + Add another item
        </button>
        {supplierId && supplierMaterials.length === 0 && (
          <p className="text-xs text-gray-400">No materials are linked to this supplier yet. Use Add material first.</p>
        )}
      </div>

      <ErrorBox error={error} />
    </ModalShell>
  );
}

/* ── View material ─────────────────────────────────────────────────────── */

function ViewMaterialModal({ item, onClose }) {
  if (!item) return null;
  const status = item.status || "In Stock";
  const Row = ({ label, children }) => (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{children}</p>
    </div>
  );

  return (
    <ModalShell title="Material details" onClose={onClose} footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}>
      <Row label="Material name">{item.material_name}</Row>
      <Row label="Supplier">{item.suppliers?.name || "—"}</Row>
      <div className="grid grid-cols-2 gap-4">
        <Row label="Category">{item.category || "—"}</Row>
        <div>
          <p className="text-xs text-gray-500">Status</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border" style={STATUS_STYLE[status]}>
            {status}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
        <Row label="Current stock">
          <span className="font-semibold">
            {item.current_stock} {UNIT}
          </span>
        </Row>
        <Row label="Reorder point">
          {item.reorder_point ?? 5} {UNIT}
        </Row>
      </div>
      {item.notes && (
        <div className="pt-3 border-t border-gray-100">
          <Row label="Notes">{item.notes}</Row>
        </div>
      )}
      {item.updated_at && (
        <p className="pt-3 border-t border-gray-100 text-xs text-gray-400">
          Last updated {new Date(item.updated_at).toLocaleString()}
        </p>
      )}
    </ModalShell>
  );
}

/* ── Deliveries tab ────────────────────────────────────────────────────── */

function DeliveriesTable({ receipts, loading }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-red-900 text-white">
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">DATE</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">SUPPLIER</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">ITEMS RECEIVED</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Loading…
                </td>
              </tr>
            ) : receipts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-14 text-center text-gray-400">
                  <p className="text-sm font-medium text-gray-500">No deliveries recorded yet</p>
                  <p className="text-xs mt-1">Use "Receive delivery" when a supplier delivers.</p>
                </td>
              </tr>
            ) : (
              receipts.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {new Date(r.received_date).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{r.suppliers?.name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {(r.stock_receipt_items || []).map((it, i) => (
                      <div key={i}>
                        {it.raw_materials?.material_name}{" "}
                        <span className="text-gray-400">
                          +{it.quantity} {UNIT}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Production_rm (page) ──────────────────────────────────────────────── */

function Production_rm() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [tab, setTab] = useState("materials"); // "materials" | "deliveries"
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterSupplier, setFilterSupplier] = useState("All");
  const [editingStock, setEditingStock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const fetchSuppliers = useCallback(async () => {
    const { data, error } = await supabase.from("suppliers").select("*").order("name", { ascending: true });
    if (!error && data) setSuppliers(data);
    else if (error) console.error("suppliers fetch error:", error);
  }, []);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("raw_materials")
      .select("*, suppliers(id, name, notes)")
      .order("category", { ascending: true })
      .order("material_name", { ascending: true });
    if (!error && data) setMaterials(data);
    else if (error) console.error("raw_materials fetch error:", error);
    setLoading(false);
  }, []);

  const fetchReceipts = useCallback(async () => {
    setLoadingReceipts(true);
    const { data, error } = await supabase
      .from("stock_receipts")
      .select("*, suppliers(name), stock_receipt_items(quantity, raw_materials(material_name, unit))")
      .order("received_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setReceipts(data);
    else if (error) console.error("stock_receipts fetch error:", error);
    setLoadingReceipts(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
    fetchMaterials();
  }, [fetchSuppliers, fetchMaterials]);

  useEffect(() => {
    if (tab === "deliveries") fetchReceipts();
  }, [tab, fetchReceipts]);

  // Live-refresh so this page never shows stale stock.
  useEffect(() => {
    const channel = supabase
      .channel("raw_materials_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_materials" }, () => fetchMaterials())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setSaving(true);
    setDeleteError("");
    const { error } = await supabase.from("raw_materials").delete().eq("id", itemToDelete.id);
    if (error) {
      setDeleteError(
        error.code === "23503"
          ? "This material has delivery or usage history, so it can't be deleted. Set its stock to 0 instead."
          : error.message
      );
    } else {
      setMaterials((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
    setSaving(false);
  };

  const categories = Array.from(new Set(materials.map((m) => m.category).filter(Boolean))).sort();

  const filtered = materials.filter((item) => {
    const supplierName = item.suppliers?.name || "";
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const matchSupplier = filterSupplier === "All" || item.supplier_id === filterSupplier;
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      item.material_name.toLowerCase().includes(q) ||
      supplierName.toLowerCase().includes(q);
    return matchCat && matchSupplier && matchSearch;
  });

  const inStockCount = filtered.filter((m) => (m.status || "In Stock") === "In Stock").length;
  const lowStockCount = filtered.filter((m) => m.status === "Low Stock").length;
  const outStockCount = filtered.filter((m) => m.status === "Out of Stock").length;

  // Alert strip: materials at or below their reorder point (lowest stock first)
  const lowAll = materials.filter((m) => m.status === "Low Stock" || m.status === "Out of Stock");
  const lowTotal = lowAll.length;
  const lowMaterials = [...lowAll]
    .sort((a, b) => (Number(a.current_stock) || 0) - (Number(b.current_stock) || 0))
    .slice(0, 6);

  const needsReorderBySupplier = materials.reduce((acc, m) => {
    if (m.status === "Low Stock" || m.status === "Out of Stock") {
      acc[m.supplier_id] = (acc[m.supplier_id] || 0) + 1;
    }
    return acc;
  }, {});

  // Inline stock correction (beneficiary can fix a count directly).
  const saveStock = async (id, value) => {
    const newValue = parseFloat(value);
    if (isNaN(newValue) || newValue < 0) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("raw_materials")
      .update({ current_stock: newValue, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, suppliers(id, name, notes)")
      .single();
    if (!error && data) setMaterials((prev) => prev.map((i) => (i.id === id ? data : i)));
    setSaving(false);
  };

  const handleStockEdit = (item) => setEditingStock({ id: item.id, value: String(item.current_stock ?? 0) });

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter" && editingStock) {
      saveStock(id, editingStock.value);
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
            <h1 className="text-2xl font-semibold text-gray-900">Inventory - Raw Materials</h1>
            <p className="text-xs text-gray-500 mt-1">
              Oils and other materials as purchased from suppliers. Stock goes up when you record a supplier delivery.
            </p>
          </div>
          <div className="flex gap-2 self-start md:self-auto flex-wrap">
            <PrimaryButton onClick={() => setShowReceiveModal(true)}>
              <PackagePlus size={15} />
              Receive delivery
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setEditItem(null);
                setShowAddModal(true);
              }}
            >
              <Plus size={15} />
              Add material
            </SecondaryButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <FilterChip active={tab === "materials"} onClick={() => setTab("materials")}>
            Materials
          </FilterChip>
          <FilterChip active={tab === "deliveries"} onClick={() => setTab("deliveries")}>
            Deliveries
          </FilterChip>
        </div>

        {tab === "deliveries" ? (
          <DeliveriesTable receipts={receipts} loading={loadingReceipts} />
        ) : (
          <>
            {/* Summary strip */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-wrap divide-x divide-gray-300">
              <SummaryStat label="Materials" value={filtered.length} />
              <SummaryStat label="In stock" value={inStockCount} color={C.success} />
              <SummaryStat label="Low stock" value={lowStockCount} color={lowStockCount > 0 ? C.warning : C.text} />
              <SummaryStat label="Out of stock" value={outStockCount} color={outStockCount > 0 ? C.accent : C.text} />
            </div>

            {/* Alert: materials running low */}
            {lowMaterials.length > 0 && (
              <div className="bg-white rounded-lg border shadow-sm p-4" style={{ borderColor: C.warningBorder }}>
                <div className="flex items-center gap-2 mb-2">
                  <Boxes size={15} style={{ color: C.warning }} />
                  <p className="text-sm font-semibold text-gray-800">
                    Production is low on {lowTotal} raw material{lowTotal !== 1 ? "s" : ""}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Restocking finished goods that depend on these may be delayed:
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowMaterials.map((m) => (
                    <span
                      key={m.id}
                      className="px-2 py-1 rounded-md text-xs font-medium border"
                      style={
                        m.status === "Out of Stock"
                          ? { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }
                          : { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder }
                      }
                    >
                      {m.material_name} · {m.current_stock} {UNIT}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 space-y-3">
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search material or supplier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
                  onFocus={focusOn}
                  onBlur={focusOff}
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

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 w-16 shrink-0">Supplier</span>
                <FilterChip active={filterSupplier === "All"} onClick={() => setFilterSupplier("All")}>
                  All
                </FilterChip>
                {suppliers.map((s) => {
                  const count = needsReorderBySupplier[s.id] || 0;
                  return (
                    <FilterChip key={s.id} active={filterSupplier === s.id} onClick={() => setFilterSupplier(s.id)}>
                      {s.name}
                      {count > 0 && (
                        <span
                          className="ml-2 px-1.5 py-0.5 rounded-full text-[11px] font-semibold"
                          style={
                            filterSupplier === s.id
                              ? { backgroundColor: "#fff", color: C.accent }
                              : { backgroundColor: C.accentSoft, color: C.accent }
                          }
                          title={`${count} need reorder`}
                        >
                          {count}
                        </span>
                      )}
                    </FilterChip>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 w-16 shrink-0">Category</span>
                {["All", ...categories].map((cat) => (
                  <FilterChip key={cat} active={filterCategory === cat} onClick={() => setFilterCategory(cat)}>
                    {cat}
                  </FilterChip>
                ))}
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
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">REORDER AT</th>
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
                          <p className="text-xs text-gray-400 mt-1">
                            Try a different search term, supplier, or category.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item, idx) => {
                        const status = item.status || "In Stock";
                        const low = status === "Low Stock" || status === "Out of Stock";
                        const rowBg = low ? {} : (idx + 1) % 2 === 0 ? { backgroundColor: "#FAFAFA" } : {};

                        return (
                          <tr
                            key={item.id}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            style={low ? { backgroundColor: C.accentSoft } : rowBg}
                          >
                            <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">{idx + 1}</td>

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

                            <td className="px-3 py-2 text-xs text-gray-500">
                              {item.suppliers?.name || <span className="text-gray-300">—</span>}
                            </td>

                            <td className="px-3 py-2 text-center">
                              {editingStock?.id === item.id ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editingStock.value}
                                  onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                  onBlur={() => {
                                    saveStock(item.id, editingStock.value);
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
                                  title="Click to correct the count"
                                  className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                                >
                                  {item.current_stock} {UNIT}
                                </button>
                              )}
                            </td>

                            <td className="px-3 py-2 text-center text-xs text-gray-500">
                              {item.reorder_point ?? 5} {UNIT}
                            </td>

                            <td className="px-2 py-2 text-center">
                              <span
                                className="inline-block px-2 py-1 rounded-full text-xs font-semibold border"
                                style={STATUS_STYLE[status]}
                                title="Computed automatically from stock vs. reorder point"
                              >
                                {status}
                              </span>
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
                      })
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
                          {lowStockCount + outStockCount > 0 && (
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
                Low stock (at/below reorder point)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }} />
                Out of stock
              </span>
              <span className="flex items-center gap-1.5">
                <span className="px-1.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: C.accentSoft, color: C.accent }}>
                  n
                </span>
                Items needing reorder from that supplier
              </span>
            </div>
          </>
        )}

        {/* Modals */}
        {showAddModal && (
          <AddMaterialModal
            onClose={() => {
              setShowAddModal(false);
              setEditItem(null);
            }}
            onSaved={fetchMaterials}
            suppliers={suppliers}
            editItem={editItem}
          />
        )}

        {showReceiveModal && (
          <ReceiveDeliveryModal
            onClose={() => setShowReceiveModal(false)}
            onSaved={() => {
              fetchMaterials();
              if (tab === "deliveries") fetchReceipts();
            }}
            suppliers={suppliers}
            materials={materials}
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
          <ModalShell
            title="Delete material"
            onClose={() => {
              setShowDeleteModal(false);
              setItemToDelete(null);
            }}
            footer={
              <>
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
              </>
            }
          >
            <p className="text-sm text-gray-600">
              Delete <span className="font-medium text-gray-800">{itemToDelete.material_name}</span>? This can't be undone.
              Materials that already have delivery history can't be deleted.
            </p>
            <ErrorBox error={deleteError} />
          </ModalShell>
        )}
      </div>
    </div>
  );
}

export default Production_rm;