import { useState, useEffect, useCallback } from "react";
import { Search, Boxes } from "lucide-react";
import { supabase } from "../api/supabase";

const C = {
  accent: "#B3211B",
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

const STATUS_STYLE = {
  "In Stock": { color: C.success, backgroundColor: C.successSoft, borderColor: C.successBorder },
  "Low Stock": { color: C.warning, backgroundColor: C.warningSoft, borderColor: C.warningBorder },
  "Out of Stock": { color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder },
};

const STATUS_FILTERS = ["All", "In Stock", "Low Stock", "Out of Stock"];

// Packaging is counted in pieces.
const UNIT = "pcs";
const fmt = (n) => (Number(n) || 0).toLocaleString();

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer border"
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

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: color || C.text }}>
        {value}
      </p>
    </div>
  );
}

function PackagingMaterialOverview() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");

  const fetchAll = useCallback(async () => {
    setErrorMsg("");
    const { data, error } = await supabase
      .from("packaging_materials")
      .select("*")
      .order("category", { ascending: true })
      .order("item_name", { ascending: true });

    if (error) setErrorMsg(error.message);
    else setMaterials(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Keep production's view current as deliveries / corrections happen.
  useEffect(() => {
    const channel = supabase
      .channel("pm_overview_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "packaging_materials" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const filtered = materials.filter((m) => {
    const status = m.status || "In Stock";
    const q = search.toLowerCase();
    const matchSearch = !search || m.item_name.toLowerCase().includes(q);
    const matchStatus = filterStatus === "All" || status === filterStatus;
    const matchCategory = filterCategory === "All" || m.category === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const categories = Array.from(new Set(materials.map((m) => m.category).filter(Boolean))).sort();

  const count = (s) => materials.filter((m) => (m.status || "In Stock") === s).length;
  const lowCount = count("Low Stock");
  const outCount = count("Out of Stock");

  // Needs-restock panel: out of stock first, then lowest stock.
  const needRestock = materials
    .filter((m) => m.status === "Low Stock" || m.status === "Out of Stock")
    .sort(
      (a, b) =>
        (a.status === "Out of Stock" ? 0 : 1) - (b.status === "Out of Stock" ? 0 : 1) ||
        (Number(a.current_stock) || 0) - (Number(b.current_stock) || 0),
    );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-350 mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">Production - Packaging Material Overview</h1>
        </div>

        {errorMsg && (
          <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow-sm p-4 text-sm">{errorMsg}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Items" value={materials.length} />
          <StatCard label="In stock" value={count("In Stock")} color={C.success} />
          <StatCard label="Low stock" value={lowCount} color={lowCount > 0 ? C.warning : C.text} />
          <StatCard label="Out of stock" value={outCount} color={outCount > 0 ? C.accent : C.text} />
        </div>

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
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 w-16 shrink-0">Category</span>
            {["All", ...categories].map((cat) => (
              <Chip key={cat} active={filterCategory === cat} onClick={() => setFilterCategory(cat)}>
                {cat}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 w-16 shrink-0">Status</span>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Availability table */}
          <div className="xl:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-red-900 text-white">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">ITEM</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">CATEGORY</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">AVAILABLE</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(8)].map((_, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        {[...Array(4)].map((_, j) => (
                          <td key={j} className="px-3 py-2.5">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                        <Boxes className="mx-auto mb-2" size={32} />
                        <p className="text-sm font-medium text-gray-500">No packaging items match</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => {
                      const status = m.status || "In Stock";
                      const low = status !== "In Stock";
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-gray-100"
                          style={low ? { backgroundColor: C.accentSoft } : undefined}
                        >
                          <td className="px-3 py-2 text-xs text-gray-800">{m.item_name}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{m.category || "—"}</td>
                          <td className="px-3 py-2 text-center text-xs font-semibold text-gray-800">
                            {fmt(m.current_stock)} {UNIT}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className="inline-block px-2 py-1 rounded-full text-xs font-semibold border"
                              style={STATUS_STYLE[status]}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Needs restock */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Needs restock</h2>
              <p className="text-xs text-gray-400 mt-0.5">At or below reorder point, lowest first</p>
            </div>
            {needRestock.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-400">Everything is above its reorder point</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {needRestock.map((m) => (
                  <li key={m.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{m.item_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {m.category || "—"} · reorder at {fmt(m.reorder_point ?? 100)} {UNIT}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold shrink-0"
                      style={{ color: m.status === "Out of Stock" ? C.accent : C.warning }}
                    >
                      {fmt(m.current_stock)} {UNIT}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PackagingMaterialOverview;