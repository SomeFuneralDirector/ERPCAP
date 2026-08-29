import { useState, useEffect, useCallback } from "react";
import { X, ArrowRightCircle, CheckCircle2, Warehouse } from "lucide-react";
import { supabase } from "../api/supabase";

const PLATFORM_STYLES = {
  Shopee: "bg-orange-100 text-orange-600 border border-orange-300",
  Lazada: "bg-blue-100 text-blue-600 border border-blue-300",
  TikTok: "bg-gray-800 text-white",
};

function AllocateModal({ item, products, onClose, onAllocated }) {
  const [platform, setPlatform] = useState("Shopee");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-select a matching product by name, if one exists
  useEffect(() => {
    const match = products.find(
      (p) => p.product_name.toLowerCase() === item.product_name.toLowerCase()
    );
    if (match) setProductId(match.id);
  }, [item, products]);

  const handleAllocate = async () => {
    setError("");
    if (!productId) {
      setError("Select which inventory product this output belongs to.");
      return;
    }
    setSaving(true);

    const product = products.find((p) => p.id === productId);
    const field =
      platform === "Shopee" ? "shopee_stock" : platform === "Lazada" ? "lazada_stock" : "tiktok_stock";
    const newFieldValue = (product[field] || 0) + item.quantity;
    const newTotal =
      (platform === "Shopee" ? newFieldValue : product.shopee_stock || 0) +
      (platform === "Lazada" ? newFieldValue : product.lazada_stock || 0) +
      (platform === "TikTok" ? newFieldValue : product.tiktok_stock || 0);

    const { error: invError } = await supabase
      .from("inventory")
      .update({ [field]: newFieldValue, stock: newTotal, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (invError) {
      setError(invError.message);
      setSaving(false);
      return;
    }

    const { error: outputError } = await supabase
      .from("production_output")
      .update({
        allocated: true,
        allocated_at: new Date().toISOString(),
        allocated_platform: platform,
        allocated_inventory_id: productId,
      })
      .eq("id", item.id);

    setSaving(false);
    if (outputError) {
      setError(outputError.message);
      return;
    }

    onAllocated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Allocate to Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <p className="font-semibold text-gray-700">{item.product_name}</p>
            <p className="text-xs text-gray-500">
              Batch {item.batch_number} · {item.quantity} units
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Inventory Product *
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_code} · {p.product_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              No matching product? Add it in Products first, then come back here.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Platform *
            </label>
            <div className="flex gap-2">
              {["Shopee", "Lazada", "TikTok"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    platform === p ? PLATFORM_STYLES[p] : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
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
            onClick={handleAllocate}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Allocating…" : `Add ${item.quantity} to ${platform} stock`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Production_fg() {
  const [output, setOutput] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [allocateItem, setAllocateItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [outputRes, productsRes] = await Promise.all([
      supabase
        .from("production_output")
        .select("*")
        .order("production_date", { ascending: false })
        .limit(300),
      supabase
        .from("inventory")
        .select("id, product_code, product_name, shopee_stock, lazada_stock, tiktok_stock")
        .order("product_name", { ascending: true }),
    ]);

    if (outputRes.error) setErrorMsg(outputRes.error.message);
    else setOutput(outputRes.data || []);

    if (!productsRes.error) setProducts(productsRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const pending = output.filter((o) => !o.allocated);
  const allocated = output.filter((o) => o.allocated);
  const displayed = activeTab === "pending" ? pending : allocated;
  const pendingQty = pending.reduce((sum, o) => sum + Number(o.quantity), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Production — Finished Goods</h1>
        <p className="text-sm text-gray-500 mt-1">
          Finished batches waiting to be pushed into sellable Products stock
        </p>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Pending allocation
          </p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{pendingQty.toLocaleString()}</p>
          <p className="text-xs mt-1 text-gray-400">{pending.length} batch(es)</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Allocated to date
          </p>
          <p className="text-3xl font-bold mt-1 text-emerald-700">{allocated.length}</p>
          <p className="text-xs mt-1 text-gray-400">batches pushed to Products</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
              activeTab === "pending"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-500 cursor-pointer"
            }`}
          >
            Pending Allocation ({pending.length})
          </button>
          <button
            onClick={() => setActiveTab("allocated")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
              activeTab === "allocated"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-500 cursor-pointer"
            }`}
          >
            Allocation History ({allocated.length})
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : displayed.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <Warehouse className="mx-auto mb-2" size={32} />
            <p className="font-medium text-gray-500">
              {activeTab === "pending" ? "Nothing waiting to be allocated" : "No allocations yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Batch #</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Produced</th>
                  {activeTab === "allocated" && <th className="py-2 pr-4">Platform</th>}
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-red-50/40">
                    <td className="py-2 pr-4 font-medium text-gray-700">{o.product_name}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-500">{o.batch_number}</td>
                    <td className="py-2 pr-4">{o.quantity}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {new Date(o.production_date).toLocaleDateString()}
                    </td>
                    {activeTab === "allocated" && (
                      <td className="py-2 pr-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            PLATFORM_STYLES[o.allocated_platform] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {o.allocated_platform || "—"}
                        </span>
                      </td>
                    )}
                    <td className="py-2 pr-4 text-right">
                      {activeTab === "pending" ? (
                        <button
                          onClick={() => setAllocateItem(o)}
                          className="inline-flex items-center gap-1 text-red-600 hover:underline text-xs font-semibold"
                        >
                          Allocate <ArrowRightCircle size={14} />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <CheckCircle2 size={14} /> Done
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {allocateItem && (
        <AllocateModal
          item={allocateItem}
          products={products}
          onClose={() => setAllocateItem(null)}
          onAllocated={fetchAll}
        />
      )}
    </div>
  );
}

export default Production_fg;