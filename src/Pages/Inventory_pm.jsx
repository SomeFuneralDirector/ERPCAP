// INVENTORY - PACKAGING MATERIALS (bottles, caps, boxes, labels, ...)
import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  Eye,
  Pencil,
  Archive,
  PackagePlus,
} from "lucide-react";
import LowStockNotice from "../Components/Lowstocknotice";
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

// Packaging is counted in pieces.
const UNIT = "pcs";
const CATEGORY_SUGGESTIONS = [
  "Bottle",
  "Cap",
  "Sprayer",
  "Box",
  "Label",
  "Shipping",
  "Other",
];

const STATUS_STYLE = {
  "In Stock": {
    color: C.success,
    backgroundColor: C.successSoft,
    borderColor: C.successBorder,
  },
  "Low Stock": {
    color: C.warning,
    backgroundColor: C.warningSoft,
    borderColor: C.warningBorder,
  },
  "Out of Stock": {
    color: C.accent,
    backgroundColor: C.accentSoft,
    borderColor: C.accentSoftBorder,
  },
};

const EMPTY_FORM = {
  item_name: "",
  category: "Bottle",
  current_stock: "",
  reorder_point: "100",
  notes: "",
};

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (Number(n) || 0).toLocaleString();

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
      onMouseEnter={(e) =>
        !props.disabled &&
        (e.currentTarget.style.backgroundColor = C.accentHover)
      }
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
      <p
        className="text-lg font-semibold mt-0.5"
        style={{ color: color || C.text }}
      >
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
          : {
              backgroundColor: "#fff",
              borderColor: "#D1D5DB",
              color: "#142947",
            }
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <p
      className="text-xs rounded-md px-3 py-2 border"
      style={{
        color: C.accent,
        backgroundColor: C.accentSoft,
        borderColor: C.accentSoftBorder,
      }}
    >
      {error}
    </p>
  );
}

/* ── Add / Edit packaging item ─────────────────────────────────────────── */

function AddItemModal({ onClose, onSaved, editItem = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setForm({
        item_name: editItem.item_name || "",
        category: editItem.category || "",
        current_stock: editItem.current_stock?.toString() || "",
        reorder_point: editItem.reorder_point?.toString() ?? "100",
        notes: editItem.notes || "",
      });
    }
  }, [editItem]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.item_name.trim()) return setError("Item name is required.");

    setSaving(true);
    setError("");

    // status is computed by the DB trigger from current_stock vs reorder_point
    const payload = {
      item_name: form.item_name.trim(),
      category: form.category.trim() || null,
      unit: UNIT,
      current_stock: Number(form.current_stock) || 0,
      reorder_point:
        form.reorder_point === ""
          ? 100
          : Math.max(0, Number(form.reorder_point) || 0),
      notes: form.notes.trim() || null,
    };

    const { error: dbError } =
      isEdit && editItem.id
        ? await supabase
            .from("packaging_materials")
            .update(payload)
            .eq("id", editItem.id)
        : await supabase.from("packaging_materials").insert([payload]);

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
      title={isEdit ? "Edit packaging item" : "Add packaging item"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update item" : "Add item"}
          </PrimaryButton>
        </>
      }
    >
      <Field
        label="Item name"
        required
        hint="Include the size so similar items are easy to tell apart."
      >
        <TextInput
          type="text"
          placeholder="e.g. 50ml Frosted Bottle"
          value={form.item_name}
          onChange={(e) => set("item_name", e.target.value)}
        />
      </Field>

      <Field label="Category">
        <TextInput
          type="text"
          list="pm-category-suggestions"
          placeholder="e.g. Bottle"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        />
        <datalist id="pm-category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={`Current stock (${UNIT})`}
          hint={
            isEdit
              ? undefined
              : "Opening balance. Use Receive delivery for new stock later."
          }
        >
          <TextInput
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={form.current_stock}
            onChange={(e) => set("current_stock", e.target.value)}
          />
        </Field>
        <Field
          label={`Reorder point (${UNIT})`}
          hint="Status flips to Low/Out automatically at or below this."
        >
          <TextInput
            type="number"
            min="0"
            step="1"
            placeholder="100"
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

/* ── Receive delivery ──────────────────────────────────────────────────── */

const STOCK_PRIORITY = { "Out of Stock": 0, "Low Stock": 1 };
const priorityOf = (m) => STOCK_PRIORITY[m.status] ?? 2;

const optionLabel = (m) =>
  m.status === "Out of Stock"
    ? `${m.item_name} (out of stock)`
    : m.status === "Low Stock"
      ? `${m.item_name} (low, ${fmt(m.current_stock)} ${UNIT} left)`
      : m.item_name;

const emptyLine = () => ({
  key: Math.random().toString(36).slice(2),
  material_id: "",
  quantity: "",
});

function ReceiveDeliveryModal({ onClose, onSaved, materials }) {
  const [receivedDate, setReceivedDate] = useState(today());
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...materials].sort(
    (a, b) =>
      priorityOf(a) - priorityOf(b) ||
      (Number(a.current_stock) || 0) - (Number(b.current_stock) || 0) ||
      a.item_name.localeCompare(b.item_name),
  );
  const needRestock = sorted.filter((m) => priorityOf(m) < 2);
  const otherMaterials = sorted.filter((m) => priorityOf(m) === 2);

  const setLine = (key, patch) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSubmit = async () => {
    setError("");
    const filled = lines.filter((l) => l.material_id || l.quantity);
    if (filled.length === 0)
      return setError("Add at least one delivered item.");
    for (const l of filled) {
      if (!l.material_id) return setError("Every line needs an item.");
      if (!(Number(l.quantity) > 0))
        return setError("Every line needs a quantity greater than 0.");
    }
    const ids = filled.map((l) => l.material_id);
    if (new Set(ids).size !== ids.length)
      return setError("An item appears twice. Combine it into one line.");

    setSaving(true);
    const { error: rpcError } = await supabase.rpc("receive_packaging_stock", {
      p_supplier: "",
      p_received_date: receivedDate,
      p_items: filled.map((l) => ({
        material_id: l.material_id,
        quantity: Number(l.quantity),
      })),
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
        Enter what was delivered. Each quantity is added to the current stock of
        that item.
      </p>

      <Field label="Date received" required>
        <TextInput
          type="date"
          value={receivedDate}
          onChange={(e) => setReceivedDate(e.target.value)}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Delivered items</p>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-12 gap-2 items-center">
            <select
              value={l.material_id}
              onChange={(e) => setLine(l.key, { material_id: e.target.value })}
              className={`${inputBase} border-gray-300 cursor-pointer col-span-8`}
            >
              <option value="">Select item…</option>
              {needRestock.length > 0 && (
                <optgroup label="Needs restock">
                  {needRestock.map((x) => (
                    <option key={x.id} value={x.id}>
                      {optionLabel(x)}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherMaterials.length > 0 && (
                <optgroup
                  label={needRestock.length > 0 ? "Other items" : "Items"}
                >
                  {otherMaterials.map((x) => (
                    <option key={x.id} value={x.id}>
                      {optionLabel(x)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="col-span-3 relative">
              <TextInput
                type="number"
                min="0"
                step="1"
                placeholder="Qty"
                style={{ paddingRight: 30 }}
                value={l.quantity}
                onChange={(e) => setLine(l.key, { quantity: e.target.value })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
                {UNIT}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setLines((p) =>
                  p.length === 1
                    ? [emptyLine()]
                    : p.filter((x) => x.key !== l.key),
                )
              }
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
          className="text-xs font-medium cursor-pointer"
          style={{ color: C.accent }}
        >
          + Add another item
        </button>
        {materials.length === 0 && (
          <p className="text-xs text-gray-400">
            No packaging items yet. Use Add item first.
          </p>
        )}
      </div>

      <ErrorBox error={error} />
    </ModalShell>
  );
}

/* ── View item ─────────────────────────────────────────────────────────── */

function ViewItemModal({ item, onClose }) {
  if (!item) return null;
  const status = item.status || "In Stock";
  const Row = ({ label, children }) => (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{children}</p>
    </div>
  );

  return (
    <ModalShell
      title="Packaging item details"
      onClose={onClose}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}
    >
      <Row label="Item name">{item.item_name}</Row>
      <div className="grid grid-cols-2 gap-4">
        <Row label="Category">{item.category || "—"}</Row>
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
        <Row label="Current stock">
          <span className="font-semibold">
            {fmt(item.current_stock)} {UNIT}
          </span>
        </Row>
        <Row label="Reorder point">
          {fmt(item.reorder_point ?? 100)} {UNIT}
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

/* ── Inventory_pm (page) ───────────────────────────────────────────────── */

function Inventory_pm() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [editingStock, setEditingStock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [itemToArchive, setItemToArchive] = useState(null);
  const [archiveError, setArchiveError] = useState("");

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("packaging_materials")
      .select("*")
      .eq("archived", false) // archived items live in Inventory - Archive
      .order("category", { ascending: true })
      .order("item_name", { ascending: true });
    if (!error && data) {
      setMaterials(data);
      setLoadError("");
    } else if (error) {
      console.error("packaging_materials fetch error:", error);
      setLoadError(error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Live-refresh so this page never shows stale stock.
  useEffect(() => {
    const channel = supabase
      .channel("packaging_materials_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "packaging_materials" },
        () => fetchMaterials(),
      )
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
  const handleArchiveClick = (item) => {
    setItemToArchive(item);
    setArchiveError("");
    setShowArchiveModal(true);
  };

  const confirmArchive = async () => {
    if (!itemToArchive) return;
    setSaving(true);
    setArchiveError("");
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("packaging_materials")
      .update({ archived: true, archived_at: now, updated_at: now })
      .eq("id", itemToArchive.id);
    if (error) {
      setArchiveError(error.message);
    } else {
      setMaterials((prev) => prev.filter((i) => i.id !== itemToArchive.id));
      setShowArchiveModal(false);
      setItemToArchive(null);
    }
    setSaving(false);
  };

  const categories = Array.from(
    new Set(materials.map((m) => m.category).filter(Boolean)),
  ).sort();

  const filtered = materials.filter((item) => {
    const matchCat =
      filterCategory === "All" || item.category === filterCategory;
    const q = search.toLowerCase();
    const matchSearch = !search || item.item_name.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const inStockCount = filtered.filter(
    (m) => (m.status || "In Stock") === "In Stock",
  ).length;
  const lowStockCount = filtered.filter((m) => m.status === "Low Stock").length;
  const outStockCount = filtered.filter(
    (m) => m.status === "Out of Stock",
  ).length;

  // Alert strip: items at or below their reorder point (lowest stock first)
  const lowAll = materials.filter(
    (m) => m.status === "Low Stock" || m.status === "Out of Stock",
  );
  const lowTotal = lowAll.length;
  const lowMaterials = [...lowAll]
    .sort(
      (a, b) => (Number(a.current_stock) || 0) - (Number(b.current_stock) || 0),
    )
    .slice(0, 6);

  // Inline stock correction.
  const saveStock = async (id, value) => {
    const newValue = parseFloat(value);
    if (isNaN(newValue) || newValue < 0) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("packaging_materials")
      .update({ current_stock: newValue })
      .eq("id", id)
      .select("*")
      .single();
    if (!error && data)
      setMaterials((prev) => prev.map((i) => (i.id === id ? data : i)));
    setSaving(false);
  };

  const handleStockEdit = (item) =>
    setEditingStock({ id: item.id, value: String(item.current_stock ?? 0) });

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
            <h1 className="text-2xl font-semibold text-gray-900">
              Inventory - Packaging Materials
            </h1>
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
              Add item
            </SecondaryButton>
          </div>
        </div>

        {loadError && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.warningSoft,
              borderColor: C.warningBorder,
              color: C.warning,
            }}
          >
            Couldn&apos;t load packaging materials: {loadError}
          </div>
        )}

        {/* Summary strip */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-wrap divide-x divide-gray-300">
          <SummaryStat label="Items" value={filtered.length} />
          <SummaryStat label="In stock" value={inStockCount} color={C.success} />
          <SummaryStat
            label="Low stock"
            value={lowStockCount}
            color={lowStockCount > 0 ? C.warning : C.text}
          />
          <SummaryStat
            label="Out of stock"
            value={outStockCount}
            color={outStockCount > 0 ? C.accent : C.text}
          />
        </div>

        {/* Alert: items running low */}
        {lowTotal > 0 && (
          <LowStockNotice
            title={`${lowTotal} packaging item${lowTotal !== 1 ? "s are" : " is"} running low`}
            items={lowMaterials.map((m) => ({
              id: m.id,
              name: m.item_name,
              qty: `${fmt(m.current_stock)} ${UNIT}`,
              out: m.status === "Out of Stock",
            }))}
            moreCount={lowTotal - lowMaterials.length}
          />
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 space-y-3">
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search item…"
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
            <span className="text-xs font-medium text-gray-500 w-16 shrink-0">
              Category
            </span>
            {["All", ...categories].map((cat) => (
              <FilterChip
                key={cat}
                active={filterCategory === cat}
                onClick={() => setFilterCategory(cat)}
              >
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
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide min-w-[200px]">
                    ITEM
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                    CATEGORY
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    STOCK
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    REORDER AT
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    STATUS
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    VIEW · EDIT · ARCHIVE
                  </th>
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
                    <td
                      colSpan={TOTAL_COLS}
                      className="px-4 py-14 text-center text-gray-400"
                    >
                      <p className="text-sm font-medium text-gray-500">
                        No packaging items found
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Try a different search term or category.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => {
                    const status = item.status || "In Stock";
                    const low =
                      status === "Low Stock" || status === "Out of Stock";
                    const rowBg = low
                      ? {}
                      : (idx + 1) % 2 === 0
                        ? { backgroundColor: "#FAFAFA" }
                        : {};

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        style={low ? { backgroundColor: C.accentSoft } : rowBg}
                      >
                        <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">
                          {idx + 1}
                        </td>

                        <td className="px-3 py-2 text-xs text-gray-800">
                          <div className="flex items-center gap-2">
                            {item.item_name}
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
                          {item.category || (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2 text-center">
                          {editingStock?.id === item.id ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  ...editingStock,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => {
                                saveStock(item.id, editingStock.value);
                                setEditingStock(null);
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-24 text-center text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-2"
                              style={{
                                borderColor: C.accent,
                                boxShadow: `0 0 0 2px ${C.accent}22`,
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item)}
                              title="Click to correct the count"
                              className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                            >
                              {fmt(item.current_stock)} {UNIT}
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-2 text-center text-xs text-gray-500">
                          {fmt(item.reorder_point ?? 100)} {UNIT}
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
                              onClick={() => handleArchiveClick(item)}
                              title="Archive"
                              className="p-1.5 rounded-md hover:bg-red-200 transition-colors cursor-pointer"
                            >
                              <Archive size={16} style={{ color: C.accent }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}

                {!loading && filtered.length > 0 && (
                  <tr
                    className="border-t-2 font-semibold"
                    style={{
                      borderTopColor: C.accent,
                      backgroundColor: "#FAFAFA",
                    }}
                  >
                    <td className="px-2 py-2.5 text-center text-xs text-gray-400">
                      —
                    </td>
                    <td
                      colSpan={2}
                      className="px-3 py-2.5 text-xs text-gray-700"
                    >
                      TOTAL ({filtered.length} items)
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-700">
                      {fmt(
                        filtered.reduce(
                          (s, m) => s + (Number(m.current_stock) || 0),
                          0,
                        ),
                      )}{" "}
                      {UNIT}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                      —
                    </td>
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
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 flex-wrap text-xs text-gray-500 pb-2">
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block border"
              style={{
                backgroundColor: C.accentSoft,
                borderColor: C.accentSoftBorder,
              }}
            />
            Low or out of stock (at/below reorder point)
          </span>
        </div>

        {/* Modals */}
        {showAddModal && (
          <AddItemModal
            onClose={() => {
              setShowAddModal(false);
              setEditItem(null);
            }}
            onSaved={fetchMaterials}
            editItem={editItem}
          />
        )}

        {showReceiveModal && (
          <ReceiveDeliveryModal
            onClose={() => setShowReceiveModal(false)}
            onSaved={fetchMaterials}
            materials={materials}
          />
        )}

        {showViewModal && selectedItem && (
          <ViewItemModal
            item={selectedItem}
            onClose={() => {
              setShowViewModal(false);
              setSelectedItem(null);
            }}
          />
        )}

        {showArchiveModal && itemToArchive && (
          <ModalShell
            title="Archive packaging item"
            onClose={() => {
              setShowArchiveModal(false);
              setItemToArchive(null);
            }}
            footer={
              <>
                <SecondaryButton
                  onClick={() => {
                    setShowArchiveModal(false);
                    setItemToArchive(null);
                  }}
                >
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={confirmArchive} disabled={saving}>
                  {saving ? "Archiving…" : "Archive"}
                </PrimaryButton>
              </>
            }
          >
            <p className="text-sm text-gray-600">
              Archive{" "}
              <span className="font-medium text-gray-800">
                {itemToArchive.item_name}
              </span>
              ? It will be hidden from this list and can be restored from
              Inventory - Archive.
            </p>
            <ErrorBox error={archiveError} />
          </ModalShell>
        )}
      </div>
    </div>
  );
}

export default Inventory_pm;