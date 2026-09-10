//Inventory PRODUCTS TO!!!
import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  Eye,
  Pencil,
  Archive,
  Boxes,
  Bell,
  Check,
  XCircle,
} from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens ──────────────────────────────────────────────────────────
   Single palette used across the module. Platform/category colors are kept
   as small swatches or text accents (identity cues), never as full-bleed
   fills, so the page reads as one product rather than three tinted zones. */
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
  shopee: "#EE4D2D",
  lazada: "#1E2A5E",
  tiktok: "#101113",
  men: "#1D4E89",
  women: "#8B2942",
};

const isLowStock = (item) => {
  const total = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);
  return total <= (item.reorder_point ?? 5);
};

const EMPTY_FORM = {
  product_code: "",
  product_name: "",
  category: "Women",
  shopee_stock: "",
  lazada_stock: "",
  tiktok_stock: "",
  reorder_point: "5",
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
      className={`${inputBase} border-gray-300 focus:ring-[${C.accent}]/20 focus:border-[${C.accent}]`}
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
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.accentHover)}
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

/* ── AddProductModal ────────────────────────────────────────────────────── */

function AddProductModal({ onClose, onSaved, editItem = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setForm({
        product_code: editItem.product_code || "",
        product_name: editItem.product_name || "",
        category: editItem.category || "Women",
        shopee_stock: editItem.shopee_stock?.toString() || "",
        lazada_stock: editItem.lazada_stock?.toString() || "",
        tiktok_stock: editItem.tiktok_stock?.toString() || "",
        reorder_point: editItem.reorder_point?.toString() ?? "5",
      });
    }
  }, [editItem]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.product_code.trim() || !form.product_name.trim()) {
      setError("Product code and name are required.");
      return;
    }
    setSaving(true);
    setError("");

    const shopee = parseInt(form.shopee_stock) || 0;
    const lazada = parseInt(form.lazada_stock) || 0;
    const tiktok = parseInt(form.tiktok_stock) || 0;
    const total = shopee + lazada + tiktok;

    const payload = {
      product_code: form.product_code.trim().toUpperCase(),
      product_name: form.product_name.trim(),
      category: form.category,
      shopee_stock: shopee,
      lazada_stock: lazada,
      tiktok_stock: tiktok,
      stock: total,
      reorder_point: form.reorder_point === "" ? 5 : Math.max(0, parseInt(form.reorder_point) || 0),
      updated_at: new Date().toISOString(),
    };

    let error = null;
    if (isEdit && editItem.id) {
      const { error: updateError } = await supabase.from("inventory").update(payload).eq("id", editItem.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from("inventory").insert([payload]);
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
            {isEdit ? "Edit product" : "Add product"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product code" required>
              <TextInput
                type="text"
                placeholder="e.g. F036"
                value={form.product_code}
                onChange={(e) => set("product_code", e.target.value)}
              />
            </Field>
            <Field label="Category" required>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={`${inputBase} border-gray-300 cursor-pointer`}
              >
                <option value="Women">Women</option>
                <option value="Men">Men</option>
              </select>
            </Field>
          </div>

          <Field label="Product name" required>
            <TextInput
              type="text"
              placeholder="e.g. Dior Sauvage dupe 85ml"
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={<span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.shopee }} />Shopee</span>}>
              <TextInput
                type="number"
                min="0"
                placeholder="0"
                value={form.shopee_stock}
                onChange={(e) => set("shopee_stock", e.target.value)}
              />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.lazada }} />Lazada</span>}>
              <TextInput
                type="number"
                min="0"
                placeholder="0"
                value={form.lazada_stock}
                onChange={(e) => set("lazada_stock", e.target.value)}
              />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.tiktok }} />TikTok</span>}>
              <TextInput
                type="number"
                min="0"
                placeholder="0"
                value={form.tiktok_stock}
                onChange={(e) => set("tiktok_stock", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Low stock threshold"
            hint="Flagged as low stock, and shown on Production's dashboard, at or below this combined total. Defaults to 5."
          >
            <TextInput
              type="number"
              min="0"
              placeholder="5"
              value={form.reorder_point}
              onChange={(e) => set("reorder_point", e.target.value)}
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
            {saving ? "Saving…" : isEdit ? "Update product" : "Add product"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── ViewProductModal ───────────────────────────────────────────────────── */

function ViewProductModal({ item, onClose }) {
  if (!item) return null;
  const totalStock = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Product details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Product code</p>
              <p className="text-sm font-mono text-gray-800 mt-0.5">{item.product_code}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Category</p>
              <p className="text-sm text-gray-800 mt-0.5">{item.category}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500">Product name</p>
            <p className="text-sm text-gray-800 mt-0.5">{item.product_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Total stock</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: C.text }}>{totalStock}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Low stock threshold</p>
              <p className="text-sm text-gray-800 mt-0.5">{item.reorder_point ?? 5}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.shopee }} />
                Shopee
              </p>
              <p className="text-sm text-gray-800 mt-0.5">{item.shopee_stock || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.lazada }} />
                Lazada
              </p>
              <p className="text-sm text-gray-800 mt-0.5">{item.lazada_stock || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.tiktok }} />
                TikTok
              </p>
              <p className="text-sm text-gray-800 mt-0.5">{item.tiktok_stock || 0}</p>
            </div>
          </div>

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

/* ── AllocationRequestsPanel ─────────────────────────────────────────────
   Notification: Production requests allocation, Inventory approves/rejects
   here. This is the only place that writes stock changes caused by
   production output, keeping Inventory as the source of truth. */
function AllocationRequestsPanel({ requests, inventory, onResolved }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const handleApprove = async (req) => {
    setError("");
    const productId = req.product_id;
    const platform = req.platform;

    if (!productId) {
      setError(`"${req.product_name}" isn't linked to an inventory product. Ask Production to resubmit with the correct product.`);
      return;
    }
    if (!platform || platform === "All") {
      setError(`${req.wo_number || req.product_name} doesn't specify a single platform. Ask Production to resubmit with one platform.`);
      return;
    }

    setBusyId(req.id);
    const product = inventory.find((p) => p.id === productId);
    const field = platform === "Shopee" ? "shopee_stock" : platform === "Lazada" ? "lazada_stock" : "tiktok_stock";
    const newFieldValue = (product?.[field] || 0) + req.quantity;
    const newTotal =
      (platform === "Shopee" ? newFieldValue : product?.shopee_stock || 0) +
      (platform === "Lazada" ? newFieldValue : product?.lazada_stock || 0) +
      (platform === "TikTok" ? newFieldValue : product?.tiktok_stock || 0);

    const { error: invError } = await supabase
      .from("inventory")
      .update({ [field]: newFieldValue, stock: newTotal, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (invError) {
      setError(invError.message);
      setBusyId(null);
      return;
    }

    const { error: reqError } = await supabase
      .from("allocation_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_product_id: productId, resolved_platform: platform })
      .eq("id", req.id);

    setBusyId(null);
    if (reqError) {
      setError(reqError.message);
      return;
    }
    onResolved();
  };

  const handleReject = async (req) => {
    setError("");
    setBusyId(req.id);
    const { error: reqError } = await supabase
      .from("allocation_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", req.id);
    setBusyId(null);
    if (reqError) {
      setError(reqError.message);
      return;
    }
    onResolved();
  };

  if (requests.length === 0) return null;

  const platformDot = (platform) =>
    platform === "Shopee" ? C.shopee : platform === "Lazada" ? C.lazada : platform === "TikTok" ? C.tiktok : C.textFaint;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4" style={{ borderLeftColor: C.accent }}>
      <div className="flex items-center gap-2 mb-3">
        <Bell size={15} style={{ color: C.accent }} />
        <p className="text-sm font-semibold text-gray-800">
          {requests.length} allocation request{requests.length !== 1 ? "s" : ""} awaiting approval
        </p>
      </div>

      {error && (
        <p className="text-xs rounded-md px-3 py-2 border mb-3" style={{ color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }}>
          {error}
        </p>
      )}

      <div className="space-y-2">
        {requests.map((req) => {
          const product = inventory.find((p) => p.id === req.product_id);
          const canApprove = !!req.product_id && !!req.platform && req.platform !== "All";

          return (
            <div key={req.id} className="border border-gray-200 rounded-md px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium text-gray-800">{req.product_name}</p>
                <p className="text-xs text-gray-500">
                  {req.wo_number || "No WO"} · {req.quantity} units · requested {new Date(req.requested_at).toLocaleDateString()}
                </p>
                {!product && <p className="text-xs mt-0.5" style={{ color: C.warning }}>Not matched to an inventory product</p>}
              </div>

              <div className="w-full md:w-56 text-xs text-gray-600">
                {product ? `${product.product_code} · ${product.product_name}` : "—"}
              </div>

              <div className="w-full md:w-32 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: platformDot(req.platform) }} />
                {req.platform || "Unspecified"}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleApprove(req)}
                  disabled={busyId === req.id || !canApprove}
                  title={!canApprove ? "Missing product or platform on this request" : undefined}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-40 transition-colors cursor-pointer"
                  style={{ backgroundColor: C.success }}
                >
                  <Check size={13} />
                  {busyId === req.id ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => handleReject(req)}
                  disabled={busyId === req.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <XCircle size={13} />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── SummaryBar ─────────────────────────────────────────────────────────── */

function SummaryStat({ label, value, dot }) {
  return (
    <div className="flex-1 min-w-[110px] px-4 py-3">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        {dot && <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: dot }} />}
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

/* ── Inventory ──────────────────────────────────────────────────────────── */

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [editingStock, setEditingStock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [itemToArchive, setItemToArchive] = useState(null);

  const [lowMaterials, setLowMaterials] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("category", { ascending: true })
      .order("product_name", { ascending: true });

    if (!error && data) setInventory(data);
    setLoading(false);
  }, []);

  const fetchMaterialAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("raw_materials")
      .select("id, material_name, status, current_stock, unit")
      .neq("status", "In Stock")
      .order("current_stock", { ascending: true })
      .limit(6);
    if (!error) setLowMaterials(data || []);
    else console.error("raw_materials alert fetch error:", error);
  }, []);

  const fetchPendingRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("allocation_requests")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (!error) setPendingRequests(data || []);
    else console.error("allocation_requests fetch error:", error);
  }, []);

  useEffect(() => {
    fetchInventory();
    fetchMaterialAlerts();
    fetchPendingRequests();
  }, [fetchInventory, fetchMaterialAlerts, fetchPendingRequests]);

  const handleView = (item) => {
    setSelectedItem(item);
    setShowViewModal(true);
  };
  const handleEdit = (item) => {
    setEditItem(item);
    setShowAddModal(true);
  };
  const handleArchive = (item) => {
    setItemToArchive(item);
    setShowArchiveModal(true);
  };

  const confirmArchive = async () => {
    if (!itemToArchive) return;
    setSaving(true);
    const { error } = await supabase.from("inventory").delete().eq("id", itemToArchive.id);
    if (!error) {
      setInventory((prev) => prev.filter((i) => i.id !== itemToArchive.id));
      setShowArchiveModal(false);
      setItemToArchive(null);
    }
    setSaving(false);
  };

  const filtered = inventory.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const matchSearch =
      !search ||
      item.product_name.toLowerCase().includes(search.toLowerCase()) ||
      item.product_code.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totals = filtered.reduce(
    (acc, item) => ({
      shopee: acc.shopee + (item.shopee_stock || 0),
      lazada: acc.lazada + (item.lazada_stock || 0),
      tiktok: acc.tiktok + (item.tiktok_stock || 0),
    }),
    { shopee: 0, lazada: 0, tiktok: 0 }
  );
  const totalStock = totals.shopee + totals.lazada + totals.tiktok;
  const lowCount = filtered.filter(isLowStock).length;

  const saveStock = async (id, field, value) => {
    const newValue = parseInt(value);
    if (isNaN(newValue) || newValue < 0) return;

    setSaving(true);
    const updateData = { [field]: newValue, updated_at: new Date().toISOString() };

    if (field === "shopee_stock" || field === "lazada_stock" || field === "tiktok_stock") {
      const item = inventory.find((i) => i.id === id);
      if (item) {
        const shopee = field === "shopee_stock" ? newValue : item.shopee_stock || 0;
        const lazada = field === "lazada_stock" ? newValue : item.lazada_stock || 0;
        const tiktok = field === "tiktok_stock" ? newValue : item.tiktok_stock || 0;
        updateData.stock = shopee + lazada + tiktok;
      }
    }

    const { error } = await supabase.from("inventory").update(updateData).eq("id", id);
    if (!error) {
      setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, ...updateData } : i)));
    }
    setSaving(false);
  };

  const handleStockEdit = (item, field) => {
    const value = field === "stock" ? item.stock : item[field];
    setEditingStock({ id: item.id, field, value: String(value ?? 0) });
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter" && editingStock) {
      saveStock(id, editingStock.field, editingStock.value);
      setEditingStock(null);
    }
    if (e.key === "Escape") setEditingStock(null);
  };

  const TOTAL_COLS = 8;

  const StockCell = ({ item, field, accentColor }) => {
    const isEditing = editingStock?.id === item.id && editingStock.field === field;
    const value = field === "stock" ? (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0) : item[field] || 0;

    if (isEditing) {
      return (
        <input
          type="number"
          min="0"
          value={editingStock.value}
          onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
          onBlur={() => {
            saveStock(item.id, editingStock.field, editingStock.value);
            setEditingStock(null);
          }}
          onKeyDown={(e) => handleKeyDown(e, item.id)}
          autoFocus
          className="w-16 text-center text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-2"
          style={{ borderColor: accentColor, boxShadow: `0 0 0 2px ${accentColor}22` }}
        />
      );
    }

    return (
      <button
        onClick={() => handleStockEdit(item, field)}
        title="Click to edit"
        className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
      >
        {value}
      </button>
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Inventory — Products</h1>
            <p className="text-xs text-gray-500 mt-0.5">Stock levels across Shopee, Lazada and TikTok</p>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <PrimaryButton
              onClick={() => {
                setEditItem(null);
                setShowAddModal(true);
              }}
            >
              <Plus size={15} />
              Add product
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                fetchInventory();
                fetchMaterialAlerts();
                fetchPendingRequests();
              }}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </SecondaryButton>
          </div>
        </div>

        {/* Summary strip */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-wrap divide-x divide-gray-100">
          <SummaryStat label="Products" value={filtered.length} />
          <SummaryStat label="Total stock" value={totalStock.toLocaleString()} />
          <SummaryStat label="Shopee" value={totals.shopee.toLocaleString()} dot={C.shopee} />
          <SummaryStat label="Lazada" value={totals.lazada.toLocaleString()} dot={C.lazada} />
          <SummaryStat label="TikTok" value={totals.tiktok.toLocaleString()} dot={C.tiktok} />
          <div className="flex-1 min-w-[110px] px-4 py-3">
            <p className="text-xs text-gray-500">Low stock</p>
            <p className="text-lg font-semibold mt-0.5" style={{ color: lowCount > 0 ? C.accent : C.text }}>
              {lowCount}
            </p>
          </div>
        </div>

        {/* Allocation-request notification: Production requests, Inventory approves */}
        <AllocationRequestsPanel
          requests={pendingRequests}
          inventory={inventory}
          onResolved={() => {
            fetchPendingRequests();
            fetchInventory();
          }}
        />

        {/* Cross-module alert: raw materials running low, affects restocking */}
        {lowMaterials.length > 0 && (
          <div className="bg-white rounded-lg border shadow-sm p-4" style={{ borderColor: C.warningBorder }}>
            <div className="flex items-center gap-2 mb-2">
              <Boxes size={15} style={{ color: C.warning }} />
              <p className="text-sm font-semibold text-gray-800">
                Production is low on {lowMaterials.length} raw material{lowMaterials.length !== 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-2">Restocking finished goods that depend on these may be delayed:</p>
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
                  {m.material_name} · {m.current_stock} {m.unit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search product name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": `${C.accent}33` }}
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
          <div className="flex gap-2">
            {["All", "Men", "Women"].map((cat) => {
              const active = filterCategory === cat;
              const activeColor = cat === "Men" ? C.men : cat === "Women" ? C.women : C.accent;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
                  style={
                    active
                      ? { backgroundColor: activeColor, borderColor: activeColor, color: "#fff" }
                      : { backgroundColor: "#fff", borderColor: "#D1D5DB", color: "#4B5563" }
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
                <tr className="bg-gray-900 text-white">
                  <th className="px-2 py-2.5 w-8" rowSpan={2} />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide" rowSpan={2}>
                    CODE
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide min-w-[220px]" rowSpan={2}>
                    PRODUCT NAME
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold tracking-wide">TOTAL</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold tracking-wide">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.shopee }} />
                      SHOPEE
                    </span>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold tracking-wide">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: C.lazada }} />
                      LAZADA
                    </span>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold tracking-wide">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block bg-white" />
                      TIKTOK
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide" rowSpan={1}>
                    ACTION
                  </th>
                </tr>
                <tr className="bg-gray-800 text-gray-300">
                  <th className="px-3 py-1 text-center text-[11px] font-medium">QTY</th>
                  <th className="px-3 py-1 text-center text-[11px] font-medium">QTY</th>
                  <th className="px-3 py-1 text-center text-[11px] font-medium">QTY</th>
                  <th className="px-3 py-1 text-center text-[11px] font-medium">QTY</th>
                  <th className="px-3 py-1 text-center text-[11px] font-medium">VIEW · EDIT · ARCHIVE</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
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
                      <p className="text-sm font-medium text-gray-500">No products found</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different search term or category.</p>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const rows = [];
                    let rowNum = 1;
                    let lastCat = null;

                    for (const item of filtered) {
                      const total = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);
                      const threshold = item.reorder_point ?? 5;
                      const low = total <= threshold;
                      const catColor = item.category === "Men" ? C.men : C.women;

                      if (item.category !== lastCat) {
                        rows.push(
                          <tr key={`cat-${item.category}`}>
                            <td
                              colSpan={TOTAL_COLS}
                              className="px-3 py-1.5 text-xs font-semibold border-l-4"
                              style={{ backgroundColor: "#FAFAFA", borderLeftColor: catColor, color: catColor }}
                            >
                              {item.category}
                            </td>
                          </tr>
                        );
                        lastCat = item.category;
                      }

                      const rowBg = low ? {} : rowNum % 2 === 0 ? { backgroundColor: "#FAFAFA" } : {};

                      rows.push(
                        <tr
                          key={item.id}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                          style={low ? { backgroundColor: C.accentSoft } : rowBg}
                        >
                          <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">{rowNum++}</td>

                          <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">{item.product_code}</td>

                          <td className="px-3 py-2 text-xs text-gray-800">
                            <div className="flex items-center gap-2">
                              {item.product_name}
                              {low && (
                                <span
                                  title={`At or below threshold of ${threshold} — shown on Production's dashboard`}
                                  className="px-1.5 py-0.5 text-[11px] rounded font-medium shrink-0"
                                  style={{ color: C.accent, backgroundColor: "#fff", border: `1px solid ${C.accentSoftBorder}` }}
                                >
                                  Low stock
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2 text-center">
                            <StockCell item={item} field="stock" accentColor={C.accent} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StockCell item={item} field="shopee_stock" accentColor={C.shopee} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StockCell item={item} field="lazada_stock" accentColor={C.lazada} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StockCell item={item} field="tiktok_stock" accentColor={C.tiktok} />
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
                                onClick={() => handleArchive(item)}
                                title="Archive"
                                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                              >
                                <Archive size={16} style={{ color: C.accent }} />
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
                    <td />
                    <td className="px-3 py-2.5 text-xs text-gray-700">TOTAL ({filtered.length})</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-900">{totalStock.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center text-xs" style={{ color: C.shopee }}>{totals.shopee.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center text-xs" style={{ color: C.lazada }}>{totals.lazada.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-900">{totals.tiktok.toLocaleString()}</td>
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
            <span className="w-3 h-3 rounded-sm inline-block border" style={{ backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }} />
            Low stock — at or below each product's threshold (default 5), also shown on Production's dashboard
          </span>
        </div>

        {/* Modals */}
        {showAddModal && (
          <AddProductModal
            onClose={() => {
              setShowAddModal(false);
              setEditItem(null);
            }}
            onSaved={fetchInventory}
            editItem={editItem}
          />
        )}

        {showViewModal && selectedItem && (
          <ViewProductModal
            item={selectedItem}
            onClose={() => {
              setShowViewModal(false);
              setSelectedItem(null);
            }}
          />
        )}

        {showArchiveModal && itemToArchive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">Archive product</h2>
                <button
                  onClick={() => {
                    setShowArchiveModal(false);
                    setItemToArchive(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-sm text-gray-600">
                  Archive <span className="font-medium text-gray-800">{itemToArchive.product_name}</span>? This can't be undone.
                </p>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Inventory;