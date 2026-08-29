import { useState, useEffect, useCallback } from "react";
import { Plus, X, PackageCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "../api/supabase";

function generateBatchNumber() {
  const stamp = Date.now().toString().slice(-6);
  return `BATCH-${stamp}`;
}

function emptyForm() {
  return {
    work_order_id: "",
    product_name: "",
    quantity: "",
    batch_number: generateBatchNumber(),
    production_date: new Date().toISOString().slice(0, 10),
    notes: "",
    mark_wo_completed: false,
  };
}

function LogOutputModal({ workOrders, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleWorkOrderSelect = (id) => {
    const wo = workOrders.find((w) => w.id === id);
    setForm((p) => ({
      ...p,
      work_order_id: id,
      product_name: wo ? wo.product_name : p.product_name,
    }));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.product_name.trim()) {
      setError("Product name is required.");
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    if (!form.batch_number.trim()) {
      setError("Batch number is required.");
      return;
    }

    setSaving(true);
    const wo = workOrders.find((w) => w.id === form.work_order_id);

    const { error: insertError } = await supabase.from("production_output").insert([
      {
        work_order_id: form.work_order_id || null,
        wo_number: wo?.wo_number || null,
        product_name: form.product_name.trim(),
        quantity: qty,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date,
        notes: form.notes.trim() || null,
        allocated: false,
      },
    ]);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    if (form.mark_wo_completed && form.work_order_id) {
      await supabase
        .from("work_orders")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", form.work_order_id);
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Log Production Output</h2>
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
              onChange={(e) => handleWorkOrderSelect(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <option value="">— Not tied to a work order —</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.wo_number} · {wo.product_name} ({wo.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Product *
            </label>
            <input
              type="text"
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1 uppercase tracking-wide">
                Quantity Produced
              </label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Production Date
              </label>
              <input
                type="date"
                value={form.production_date}
                onChange={(e) => set("production_date", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Batch Number
            </label>
            <input
              type="text"
              value={form.batch_number}
              onChange={(e) => set("batch_number", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300"
            />
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

          {form.work_order_id && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.mark_wo_completed}
                onChange={(e) => set("mark_wo_completed", e.target.checked)}
                className="rounded border-gray-300"
              />
              Mark this work order as Completed
            </label>
          )}

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
            {saving ? "Saving…" : "Log Output"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Production_output() {
  const [output, setOutput] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [outputRes, woRes] = await Promise.all([
      supabase
        .from("production_output")
        .select("*")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("work_orders")
        .select("id, wo_number, product_name, status")
        .neq("status", "Cancelled")
        .order("created_at", { ascending: false }),
    ]);

    if (outputRes.error) setErrorMsg(outputRes.error.message);
    else setOutput(outputRes.data || []);

    if (!woRes.error) setWorkOrders(woRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const todayTotal = output
    .filter((o) => o.production_date === new Date().toISOString().slice(0, 10))
    .reduce((sum, o) => sum + Number(o.quantity), 0);

  const pendingCount = output.filter((o) => !o.allocated).length;

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Production Output</h1>
          <p className="text-sm text-gray-500 mt-1">
            What was produced, batch by batch · push to Finished Goods when ready
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer self-start md:self-auto"
        >
          <Plus size={15} />
          Log Output
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Produced today</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{todayTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Batches logged</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{output.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Pending allocation
          </p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{pendingCount}</p>
          <p className="text-xs mt-1 text-gray-400">See Finished Goods tab</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Product</th>
                <th className="py-2 px-4">Qty</th>
                <th className="py-2 px-4">Batch #</th>
                <th className="py-2 px-4">Work Order</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : output.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <PackageCheck className="mx-auto mb-2" size={32} />
                    <p className="font-medium text-gray-500">No output logged yet</p>
                  </td>
                </tr>
              ) : (
                output.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-red-50/40">
                    <td className="py-2 px-4 text-gray-600">
                      {new Date(o.production_date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 font-medium text-gray-700">{o.product_name}</td>
                    <td className="py-2 px-4">{o.quantity}</td>
                    <td className="py-2 px-4 font-mono text-xs text-gray-500">{o.batch_number}</td>
                    <td className="py-2 px-4 text-gray-500">{o.wo_number || "—"}</td>
                    <td className="py-2 px-4">
                      {o.allocated ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 size={12} />
                          Allocated
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <LogOutputModal workOrders={workOrders} onClose={() => setShowModal(false)} onSaved={fetchAll} />
      )}
    </div>
  );
}

export default Production_output;