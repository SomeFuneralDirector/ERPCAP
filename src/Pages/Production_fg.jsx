import { useState, useEffect, useCallback } from "react";
import { ArrowRightCircle, Clock3, CheckCircle2, XCircle, Warehouse } from "lucide-react";
import { supabase } from "../api/supabase";

const PLATFORM_STYLES = {
  Shopee: "bg-orange-100 text-orange-600 border border-orange-300",
  Lazada: "bg-blue-100 text-blue-600 border border-blue-300",
  TikTok: "bg-gray-800 text-white",
  All: "bg-emerald-100 text-emerald-700 border border-emerald-300",
};

function Production_fg() {
  const [workOrders, setWorkOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ready");
  const [requestingId, setRequestingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [woRes, reqRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select("*")
        .eq("status", "Completed")
        .order("completed_at", { ascending: false }),
      supabase
        .from("allocation_requests")
        .select("*")
        .order("requested_at", { ascending: false }),
    ]);

    if (woRes.error) setErrorMsg(woRes.error.message);
    else setWorkOrders(woRes.data || []);

    if (!reqRes.error) setRequests(reqRes.data || []);
    else setErrorMsg((prev) => prev || reqRes.error.message);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // For each completed work order, find its most recent allocation request (if any)
  const latestRequestFor = (woId) => {
    const forWo = requests.filter((r) => r.work_order_id === woId);
    if (forWo.length === 0) return null;
    return forWo.reduce((a, b) =>
      new Date(a.requested_at) > new Date(b.requested_at) ? a : b
    );
  };

  const rows = workOrders.map((wo) => ({
    wo,
    request: latestRequestFor(wo.id),
  }));

  const ready = rows.filter((r) => !r.request || r.request.status === "rejected");
  const pending = rows.filter((r) => r.request?.status === "pending");
  const allocated = rows.filter((r) => r.request?.status === "approved");

  const displayed =
    activeTab === "ready" ? ready : activeTab === "pending" ? pending : allocated;

  const handleRequestAllocation = async (wo) => {
    setRequestingId(wo.id);
    setErrorMsg("");

    const { error } = await supabase.from("allocation_requests").insert([
      {
        work_order_id: wo.id,
        wo_number: wo.wo_number,
        product_id: wo.product_id || null,
        product_name: wo.product_name,
        quantity: wo.quantity,
        platform: wo.platform,
        status: "pending",
      },
    ]);

    setRequestingId(null);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    fetchAll();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Production - Finished Goods</h1>
        <p className="text-sm text-gray-500 mt-1">
          Completed work orders, ready to request allocation into sellable stock. Inventory
          reviews and approves each request before stock is updated.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ready to request</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{ready.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Awaiting approval</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{pending.length}</p>
          <p className="text-xs mt-1 text-gray-400">Sent to Inventory</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Allocated</p>
          <p className="text-3xl font-bold mt-1 text-emerald-700">{allocated.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("ready")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition cursor-pointer ${
              activeTab === "ready"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-500"
            }`}
          >
            Ready to Request ({ready.length})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition cursor-pointer ${
              activeTab === "pending"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-500"
            }`}
          >
            Awaiting Approval ({pending.length})
          </button>
          <button
            onClick={() => setActiveTab("allocated")}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition cursor-pointer ${
              activeTab === "allocated"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-500"
            }`}
          >
            Allocated ({allocated.length})
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : displayed.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <Warehouse className="mx-auto mb-2" size={32} />
            <p className="font-medium text-gray-500">
              {activeTab === "ready"
                ? "Nothing waiting — complete a work order to see it here"
                : activeTab === "pending"
                ? "No requests awaiting approval"
                : "Nothing allocated yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4">WO #</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Platform</th>
                  <th className="py-2 pr-4">Completed</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ wo, request }) => (
                  <tr key={wo.id} className="border-b border-gray-100 hover:bg-red-50/40">
                    <td className="py-2 pr-4 font-medium text-gray-700">{wo.wo_number}</td>
                    <td className="py-2 pr-4">{wo.product_name}</td>
                    <td className="py-2 pr-4">{wo.quantity}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          PLATFORM_STYLES[
                            request?.status === "approved"
                              ? request.resolved_platform || request.platform
                              : wo.platform
                          ] || "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {request?.status === "approved"
                          ? request.resolved_platform || request.platform
                          : wo.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">
                      {wo.completed_at ? new Date(wo.completed_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {activeTab === "ready" && (
                        <div className="flex items-center justify-end gap-2">
                          {request?.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
                              <XCircle size={13} /> Rejected — re-request?
                            </span>
                          )}
                          <button
                            onClick={() => handleRequestAllocation(wo)}
                            disabled={requestingId === wo.id}
                            className="inline-flex items-center gap-1 text-red-600 hover:underline text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {requestingId === wo.id ? "Requesting…" : "Request Allocation"}
                            <ArrowRightCircle size={14} />
                          </button>
                        </div>
                      )}
                      {activeTab === "pending" && (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                          <Clock3 size={14} /> Awaiting Inventory
                        </span>
                      )}
                      {activeTab === "allocated" && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <CheckCircle2 size={14} />
                          Approved{" "}
                          {request?.resolved_at &&
                            `· ${new Date(request.resolved_at).toLocaleDateString()}`}
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
    </div>
  );
}

export default Production_fg;