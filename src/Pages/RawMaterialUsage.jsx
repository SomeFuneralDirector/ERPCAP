import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, Boxes } from "lucide-react";
import { supabase } from "../api/supabase";

const EMPTY_FORM = {
  work_order_id: "",
  material_id: "",
  quantity_used: "",
  usage_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function LogUsageModal({ workOrders, materials, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const selectedMaterial = materials.find((m) => m.id === form.material_id);

  const handleSubmit = async () => {
    setError("");

    if (!form.material_id) {
      setError("Select a raw material.");
      return;
    }
    const qty = Number(form.quantity_used);
    if (!qty || qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    if (selectedMaterial && qty > Number(selectedMaterial.current_stock)) {
      setError(
        `Only ${selectedMaterial.current_stock} ${selectedMaterial.unit} of ${selectedMaterial.material_name} available.`
      );
      return;
    }

    setSaving(true);

    const wo = workOrders.find((w) => w.id === form.work_order_id);

    // 1. Log the usage
    const { error: insertError } = await supabase.from("raw_material_usage").insert([
      {
        work_order_id: form.work_order_id || null,
        wo_number: wo?.wo_number || null,
        material_id: form.material_id,
        material_name: selectedMaterial.material_name,
        unit: selectedMaterial.unit,
        quantity_used: qty,
        usage_date: form.usage_date,
        notes: form.notes.trim() || null,
      },
    ]);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // 2. Deduct from raw_materials stock
    const newStock = Number(selectedMaterial.current_stock) - qty;
    const newStatus =
      newStock <= 0
        ? "Out of Stock"
        : selectedMaterial.status === "Out of Stock"
        ? "In Stock"
        : selectedMaterial.status;

    const { error: updateError } = await supabase
      .from("raw_materials")
      .update({
        current_stock: newStock,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", form.material_id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Log Material Usage</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Work Order (optional)
            </label>
            <select
              value={form.work_order_id}
              onChange={(e) => set("work_order_id", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <option value="">— Not tied to a work order —</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.wo_number} · {wo.product_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Raw Material *
            </label>
            <select
              value={form.material_id}
              onChange={(e) => set("material_id", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <option value="">Select a material…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.material_name} ({m.current_stock} {m.unit} available)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">
                Quantity Used {selectedMaterial ? `(${selectedMaterial.unit})` : ""}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={form.quantity_used}
                onChange={(e) => set("quantity_used", e.target.value)}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Usage Date
              </label>
              <input
                type="date"
                value={form.usage_date}
                onChange={(e) => set("usage_date", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Notes
            </label>
            <textarea
              rows={2}
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
            {saving ? "Saving…" : "Log Usage"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RawMaterialUsage() {
  const [usage, setUsage] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [usageRes, materialsRes, woRes] = await Promise.all([
      supabase
        .from("raw_material_usage")
        .select("*")
        .order("usage_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("raw_materials").select("*").order("material_name", { ascending: true }),
      supabase
        .from("work_orders")
        .select("id, wo_number, product_name, status")
        .neq("status", "Cancelled")
        .order("created_at", { ascending: false }),
    ]);

    if (usageRes.error) setErrorMsg(usageRes.error.message);
    else setUsage(usageRes.data || []);

    if (!materialsRes.error) setMaterials(materialsRes.data || []);
    if (!woRes.error) setWorkOrders(woRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Restore the stock that this usage entry consumed
    const { data: material } = await supabase
      .from("raw_materials")
      .select("current_stock, status")
      .eq("id", deleteTarget.material_id)
      .single();

    if (material) {
      const restoredStock = Number(material.current_stock) + Number(deleteTarget.quantity_used);
      await supabase
        .from("raw_materials")
        .update({
          current_stock: restoredStock,
          status: restoredStock > 0 && material.status === "Out of Stock" ? "In Stock" : material.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deleteTarget.material_id);
    }

    const { error } = await supabase.from("raw_material_usage").delete().eq("id", deleteTarget.id);

    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      fetchAll();
    }
  };

  const totalThisWeek = usage
    .filter((u) => {
      const days = (Date.now() - new Date(u.usage_date).getTime()) / 86_400_000;
      return days <= 7;
    })
    .reduce((sum, u) => sum + Number(u.quantity_used), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Raw Material Usage</h1>
          <p className="text-sm text-gray-500 mt-1">
            Logged against work orders · deducts from Raw Materials stock
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer self-start md:self-auto"
        >
          <Plus size={15} />
          Log Usage
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Entries logged</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{usage.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Used this week</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{totalThisWeek.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Materials tracked</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{materials.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Material</th>
                <th className="py-2 px-4">Qty Used</th>
                <th className="py-2 px-4">Work Order</th>
                <th className="py-2 px-4">Notes</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : usage.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Boxes className="mx-auto mb-2" size={32} />
                    <p className="font-medium text-gray-500">No usage logged yet</p>
                  </td>
                </tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-red-50/40">
                    <td className="py-2 px-4 text-gray-600">
                      {new Date(u.usage_date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 font-medium text-gray-700">{u.material_name}</td>
                    <td className="py-2 px-4">
                      {u.quantity_used} {u.unit}
                    </td>
                    <td className="py-2 px-4 text-gray-500">{u.wo_number || "—"}</td>
                    <td className="py-2 px-4 text-gray-500 max-w-xs truncate">{u.notes || "—"}</td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => setDeleteTarget(u)}
                        title="Delete & restore stock"
                        className="p-1 rounded hover:bg-pink-100 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} className="text-pink-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <LogUsageModal
          workOrders={workOrders}
          materials={materials}
          onClose={() => setShowModal(false)}
          onSaved={fetchAll}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">Delete Usage Entry</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Delete this entry and restore{" "}
                <span className="font-semibold">
                  {deleteTarget.quantity_used} {deleteTarget.unit}
                </span>{" "}
                to <span className="font-semibold">{deleteTarget.material_name}</span> stock?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete & Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RawMaterialUsage;