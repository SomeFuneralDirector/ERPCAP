import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ClipboardList,
  PackageCheck,
  Boxes,
  Warehouse,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabase } from "../api/supabase";

// Update these to match your router's actual paths.
const LINKS = {
  workOrders: "/production/work-orders",
  output: "/production/output",
  materials: "/production/materials-usage",
  finishedGoods: "/production/finished-goods",
};

function Skeleton({ className = "h-8 w-16" }) {
  return <div className={`${className} bg-gray-100 rounded animate-pulse mt-1`} />;
}

function StatCard({ label, value, sub, color = "text-gray-800", loading, href }) {
  const content = (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {loading ? <Skeleton /> : <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>}
      {sub && <p className="text-xs mt-1 text-gray-400">{sub}</p>}
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {content}
    </a>
  ) : (
    content
  );
}

function Production() {
  const [workOrders, setWorkOrders] = useState([]);
  const [output, setOutput] = useState([]);
  const [usage, setUsage] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const [woRes, outputRes, usageRes, materialsRes] = await Promise.all([
      supabase.from("work_orders").select("*").order("created_at", { ascending: false }),
      supabase
        .from("production_output")
        .select("*")
        .order("production_date", { ascending: false })
        .limit(200),
      supabase
        .from("raw_material_usage")
        .select("*")
        .order("usage_date", { ascending: false })
        .limit(200),
      supabase.from("raw_materials").select("id, material_name, status, current_stock, unit"),
    ]);

    if (woRes.error) setErrorMsg(woRes.error.message);
    else setWorkOrders(woRes.data || []);

    if (!outputRes.error) setOutput(outputRes.data || []);
    if (!usageRes.error) setUsage(usageRes.data || []);
    if (!materialsRes.error) setMaterials(materialsRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const activeWOs = workOrders.filter((w) => ["Pending", "In Progress"].includes(w.status));
  const inProgressWOs = workOrders.filter((w) => w.status === "In Progress");
  const pendingOutput = output.filter((o) => !o.allocated);
  const pendingOutputQty = pendingOutput.reduce((sum, o) => sum + Number(o.quantity), 0);
  const lowMaterials = materials.filter((m) => m.status !== "In Stock");

  const todayOutputQty = output
    .filter((o) => o.production_date === new Date().toISOString().slice(0, 10))
    .reduce((sum, o) => sum + Number(o.quantity), 0);

  // Output by day, last 7 days
  const outputChartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const qty = output
        .filter((o) => o.production_date === key)
        .reduce((sum, o) => sum + Number(o.quantity), 0);
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        qty,
      });
    }
    return days;
  }, [output]);

  // Merge output + usage into one recent-activity feed
  const activity = useMemo(() => {
    const items = [
      ...output.map((o) => ({
        id: `out-${o.id}`,
        time: o.created_at,
        text: `Produced ${o.quantity} × ${o.product_name} (batch ${o.batch_number})`,
        type: "output",
      })),
      ...usage.map((u) => ({
        id: `use-${u.id}`,
        time: u.created_at,
        text: `Used ${u.quantity_used} ${u.unit} of ${u.material_name}${
          u.wo_number ? ` for ${u.wo_number}` : ""
        }`,
        type: "usage",
      })),
    ];
    return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
  }, [output, usage]);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Production</h1>
          <p className="text-sm text-gray-500 mt-1">
            Work orders → output → finished goods, with raw material usage tracked throughout
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer self-start md:self-auto"
        >
          {loading ? "↻ Loading…" : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Flow: Work Orders -> Output -> Finished Goods, with Materials feeding output */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active work orders"
          value={activeWOs.length}
          sub={`${inProgressWOs.length} in progress`}
          href={LINKS.workOrders}
          loading={loading}
        />
        <StatCard
          label="Produced today"
          value={todayOutputQty.toLocaleString()}
          sub="units logged"
          color="text-emerald-700"
          href={LINKS.output}
          loading={loading}
        />
        <StatCard
          label="Pending allocation"
          value={pendingOutputQty.toLocaleString()}
          sub={`${pendingOutput.length} batch(es) → Finished Goods`}
          color="text-amber-600"
          href={LINKS.finishedGoods}
          loading={loading}
        />
        <StatCard
          label="Materials needing attention"
          value={lowMaterials.length}
          sub="low / out of stock"
          color="text-red-700"
          href={LINKS.materials}
          loading={loading}
        />
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Work Orders", icon: ClipboardList, href: LINKS.workOrders },
          { label: "Production Output", icon: PackageCheck, href: LINKS.output },
          { label: "Raw Material Usage", icon: Boxes, href: LINKS.materials },
          { label: "Finished Goods", icon: Warehouse, href: LINKS.finishedGoods },
        ].map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            className="bg-white rounded-lg shadow p-4 flex items-center gap-3 hover:shadow-md hover:bg-red-50/40 transition-all"
          >
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <Icon size={18} />
            </div>
            <span className="text-sm font-semibold text-gray-700">{label}</span>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Output — last 7 days</h2>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={outputChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-700">{label}</p>
                        <p className="text-gray-600">{payload[0].value} units produced</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="qty" fill="#b91c1c" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-4">
            Materials needing reorder
            {!loading && (
              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                {lowMaterials.length}
              </span>
            )}
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : lowMaterials.length === 0 ? (
            <p className="text-xs text-gray-400">All materials sufficiently stocked.</p>
          ) : (
            <div className="space-y-2">
              {lowMaterials.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-amber-500" />
                    {m.material_name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                      m.status === "Out of Stock"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {m.current_stock} {m.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Recent activity</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-xs text-gray-400">No recent production activity.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    a.type === "output" ? "bg-emerald-600" : "bg-amber-500"
                  }`}
                />
                <div>
                  <p className="text-xs text-gray-700 leading-snug">{a.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(a.time).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Production;  