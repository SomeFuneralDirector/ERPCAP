// RAW MATERIAL MANUAL ADJUSTMENTS
// Renamed in spirit from "Log Usage" — planned production consumption is now
// handled automatically by the BOM check/deduct at Work Order creation
// (see Production_wo.jsx). This page is ONLY for exceptions a recipe can't
// predict: spillage, wastage, damaged stock, QC samples, supplier
// short-shipments, or manual corrections. It intentionally no longer offers
// a Work Order dropdown, so it can't accidentally double-deduct the same
// consumption that a Work Order already deducted.
import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, Boxes } from "lucide-react";
import { supabase } from "../api/supabase";

const REASONS = ["Spillage / wastage", "Damaged stock", "QC sample", "Supplier short-shipment", "Correction", "Other"];

const EMPTY_FORM = {
  material_id: "",
  direction: "deduct", // "deduct" | "restock"
  quantity: "",
  reason: REASONS[0],
  adjustment_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function AdjustmentModal({ materials, onClose, onSaved }) {
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
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    if (form.direction === "deduct" && selectedMaterial && qty > Number(selectedMaterial.current_stock)) {
      setError(`Only ${selectedMaterial.current_stock} ${selectedMaterial.unit} of ${selectedMaterial.material_name} available.`);
      return;
    }

    setSaving(true);

    const signedChange = form.direction === "deduct" ? -qty : qty;

    // 1. Log the adjustment (kept in raw_material_usage for continuity with
    //    your existing table/UI; change is now signed so both deductions
    //    and restocks share one history instead of two tables).
    const { error: insertError } = await supabase.from("raw_material_usage").insert([
      {
        work_order_id: null,
        wo_number: null,
        material_id: form.material_id,
        material_name: selectedMaterial.material_name,
        unit: selectedMaterial.unit,
        quantity_used: signedChange,
        usage_date: form.adjustment_date,
        notes: `[${form.reason}]${form.notes ? " " + form.notes.trim() : ""}`,
      },
    ]);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // 2. Apply to stock. Status is NOT set here — the DB trigger
    //    (compute_material_status) derives it automatically from
    //    current_stock vs reorder_point on every update.
    const newStock = Number(selectedMaterial.current_stock) + signedChange;
    const { error: updateError } = await supabase
      .from("raw_materials")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
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
          <h2 className="text-base font-bold text-gray-800">Manual Stock Adjustment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-gray-400 -mt-1">
            For exceptions only — spillage, damage, QC samples, or corrections. Planned production
            consumption is deducted automatically when a Work Order is created.
          </p>

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

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Direction
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("direction", "deduct")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                  form.direction === "deduct"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Deduct (loss)
              </button>
              <button
                type="button"
                onClick={() => set("direction", "restock")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                  form.direction === "restock"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Restock (correction+)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">
                Quantity {selectedMaterial ? `(${selectedMaterial.unit})` : ""}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Date
              </label>
              <input
                type="date"
                value={form.adjustment_date}
                onChange={(e) => set("adjustment_date", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Reason
            </label>
            <select
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
            {saving ? "Saving…" : "Save Adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RawMaterialUsage() {
  const [usage, setUsage] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [usageRes, materialsRes] = await Promise.all([
      supabase
        .from("raw_material_usage")
        .select("*")
        .order("usage_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("raw_materials").select("*").order("material_name", { ascending: true }),
    ]);

    if (usageRes.error) setErrorMsg(usageRes.error.message);
    else setUsage(usageRes.data || []);

    if (!materialsRes.error) setMaterials(materialsRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Reversing an entry means undoing its signed change (a deduction of
    // -5 gets +5 back; a restock of +5 gets -5 back). Status is left to
    // the DB trigger, same as everywhere else.
    const { data: material } = await supabase
      .from("raw_materials")
      .select("current_stock")
      .eq("id", deleteTarget.material_id)
      .single();

    if (material) {
      const restoredStock = Number(material.current_stock) - Number(deleteTarget.quantity_used);
      await supabase
        .from("raw_materials")
        .update({
          current_stock: restoredStock,
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

  const totalDeductedThisWeek = usage
    .filter((u) => {
      const days = (Date.now() - new Date(u.usage_date).getTime()) / 86_400_000;
      return days <= 7 && Number(u.quantity_used) < 0;
    })
    .reduce((sum, u) => sum + Math.abs(Number(u.quantity_used)), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Production - Manual Stock Adjustments</h1>
          <p className="text-sm text-gray-500 mt-1">
            For spillage, wastage, damaged stock, or corrections only — not for planned production
            consumption, which is deducted automatically from a product's recipe when a Work Order
            is created.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer self-start md:self-auto"
        >
          <Plus size={15} />
          New Adjustment
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
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lost this week</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{totalDeductedThisWeek.toLocaleString()}</p>
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
                <th className="py-2 px-4">Change</th>
                <th className="py-2 px-4">Notes</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : usage.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    <Boxes className="mx-auto mb-2" size={32} />
                    <p className="font-medium text-gray-500">No adjustments logged yet</p>
                  </td>
                </tr>
              ) : (
                usage.map((u) => {
                  const qty = Number(u.quantity_used);
                  const isDeduction = qty < 0;
                  return (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-red-50/40">
                      <td className="py-2 px-4 text-gray-600">
                        {new Date(u.usage_date).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-4 font-medium text-gray-700">{u.material_name}</td>
                      <td className={`py-2 px-4 font-semibold ${isDeduction ? "text-red-600" : "text-emerald-600"}`}>
                        {isDeduction ? "−" : "+"}
                        {Math.abs(qty)} {u.unit}
                      </td>
                      <td className="py-2 px-4 text-gray-500 max-w-xs truncate">{u.notes || "—"}</td>
                      <td className="py-2 px-4 text-right">
                        <button
                          onClick={() => setDeleteTarget(u)}
                          title="Delete & reverse"
                          className="p-1 rounded hover:bg-pink-100 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} className="text-pink-600" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <AdjustmentModal materials={materials} onClose={() => setShowModal(false)} onSaved={fetchAll} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">Delete Adjustment</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Delete this entry and reverse{" "}
                <span className="font-semibold">
                  {Math.abs(Number(deleteTarget.quantity_used))} {deleteTarget.unit}
                </span>{" "}
                on <span className="font-semibold">{deleteTarget.material_name}</span>'s stock?
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
                {deleting ? "Deleting…" : "Delete & Reverse"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RawMaterialUsage;