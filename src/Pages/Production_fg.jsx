import { useState, useEffect, useCallback } from "react";
import { ArrowRightCircle, Clock3, CheckCircle2, XCircle, Warehouse } from "lucide-react";
import { supabase } from "../api/supabase";

const PLATFORM_STYLES = {
  Shopee: "bg-orange-100 text-orange-600 border border-orange-300",
  Lazada: "bg-blue-100 text-blue-600 border border-blue-300",
  TikTok: "bg-gray-800 text-white",
  All: "bg-emerald-100 text-emerald-700 border border-emerald-300",
};

const ACTION_COLOR = "text-indigo-600 hover:text-indigo-700";


const linesFor = (wo) => {
  if (Array.isArray(wo.platform_breakdown) && wo.platform_breakdown.length > 0) {
    return wo.platform_breakdown.map((b, i) => ({
      key: `${wo.id}::${i}`,
      wo,
      platform: b.platform,
      quantity: b.quantity,
      concrete: true, 
    }));
  }
  return [
    {
      key: `${wo.id}::0`,
      wo,
      platform: wo.platform,
      quantity: wo.quantity,
      concrete: !!wo.platform && wo.platform !== "All",
    },
  ];
};

function Production_fg() {
  const [workOrders, setWorkOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ready");
  const [requestingKey, setRequestingKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [platformOverride, setPlatformOverride] = useState({});

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

  // Keep Finished Goods live in sync with whatever Inventory approves/rejects,
  // instead of only refreshing after this tab's own actions.
  useEffect(() => {
    const channel = supabase
      .channel("production_fg_allocation_requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "allocation_requests" },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // Flatten every completed work order into its platform lines, and match
  // each line to its own most recent allocation request.
  const lineRows = workOrders.flatMap(linesFor).map((line) => {
    const forLine = requests.filter((r) => {
      if (r.work_order_id !== line.wo.id) return false;
      // A concrete (breakdown-derived) line only matches requests filed for
      // that exact platform, so sibling lines on the same WO stay independent.
      // A legacy single-implicit-line WO has just one line, so any request
      // tied to that WO belongs to it regardless of resolved platform.
      return line.concrete ? r.platform === line.platform : true;
    });
    const request =
      forLine.length === 0
        ? null
        : forLine.reduce((a, b) => (new Date(a.requested_at) > new Date(b.requested_at) ? a : b));
    return { ...line, request };
  });

  const ready = lineRows.filter((l) => !l.request || l.request.status === "rejected");
  const pending = lineRows.filter((l) => l.request?.status === "pending");
  const allocated = lineRows.filter((l) => l.request?.status === "approved");

  const displayed =
    activeTab === "ready" ? ready : activeTab === "pending" ? pending : allocated;

  // The platform that will actually be sent on the request: resolved
  // already for breakdown lines, otherwise whatever Production picked in
  // the inline selector for a legacy ambiguous line.
  const resolvedPlatformFor = (line) =>
    line.concrete ? line.platform : platformOverride[line.key] || "";

  const handleRequestAllocation = async (line) => {
    const platform = resolvedPlatformFor(line);
    if (!platform) {
      setErrorMsg(`Choose a platform for ${line.wo.wo_number} before requesting allocation.`);
      return;
    }

    setRequestingKey(line.key);
    setErrorMsg("");

    const { error } = await supabase.from("allocation_requests").insert([
      {
        work_order_id: line.wo.id,
        wo_number: line.wo.wo_number,
        product_id: line.wo.product_id || null,
        product_name: line.wo.product_name,
        quantity: line.quantity,
        platform,
        status: "pending",
      },
    ]);

    setRequestingKey(null);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setPlatformOverride((p) => {
      const next = { ...p };
      delete next[line.key];
      return next;
    });
    fetchAll();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Production - Finished Goods</h1>
        <p className="text-sm text-gray-500 mt-1">
          Completed work orders, ready to request allocation into sellable stock. A work order
          split across platforms is requested one platform at a time. Inventory reviews and
          approves each request before stock is updated.
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
                {displayed.map((line) => {
                  const { wo, request } = line;
                  const ambiguous = activeTab === "ready" && !line.concrete;
                  const chosen = resolvedPlatformFor(line);

                  return (
                    <tr key={line.key} className="border-b border-gray-100 hover:bg-red-50/40">
                      <td className="py-2 pr-4 font-medium text-gray-700">{wo.wo_number}</td>
                      <td className="py-2 pr-4">{wo.product_name}</td>
                      <td className="py-2 pr-4">{line.quantity}</td>
                      <td className="py-2 pr-4">
                        {ambiguous ? (
                          <select
                            value={platformOverride[line.key] || ""}
                            onChange={(e) =>
                              setPlatformOverride((p) => ({ ...p, [line.key]: e.target.value }))
                            }
                            className="text-xs border rounded-md px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 cursor-pointer"
                            style={{
                              borderColor: platformOverride[line.key] ? "#D4D4D8" : "#F3C9C7",
                            }}
                          >
                            <option value="">Choose platform…</option>
                            <option value="Shopee">Shopee</option>
                            <option value="Lazada">Lazada</option>
                            <option value="TikTok">TikTok</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              PLATFORM_STYLES[
                                request?.status === "approved"
                                  ? request.resolved_platform || request.platform
                                  : line.platform
                              ] || "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {request?.status === "approved"
                              ? request.resolved_platform || request.platform
                              : line.platform}
                          </span>
                        )}
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
                              onClick={() => handleRequestAllocation(line)}
                              disabled={requestingKey === line.key || (ambiguous && !chosen)}
                              title={ambiguous && !chosen ? "Choose a platform first" : undefined}
                              className={`inline-flex items-center gap-1 ${ACTION_COLOR} hover:underline text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed`}
                            >
                              {requestingKey === line.key ? "Requesting…" : "Request Allocation"}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Production_fg;