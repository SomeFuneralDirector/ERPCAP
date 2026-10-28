import { useState, useEffect, useCallback } from "react";
import { Search, ArchiveRestore, Archive as ArchiveIcon } from "lucide-react";
import { supabase } from "../api/supabase";

const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
};

// One config per archivable table
const SOURCES = {
  products: {
    label: "Products",
    table: "inventory",
    select: "*",
    order: "product_name",
    name: (r) => r.product_name,
    sub: (r) => `${r.product_code} · ${r.category}`,
    qty: (r) =>
      `${(r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0)} pcs`,
  },
  raw: {
    label: "Raw Materials",
    table: "raw_materials",
    select: "*, suppliers(name)",
    order: "material_name",
    name: (r) => r.material_name,
    sub: (r) => [r.category, r.suppliers?.name].filter(Boolean).join(" · ") || "—",
    qty: (r) => `${r.current_stock ?? 0} L`,
  },
  packaging: {
    label: "Packaging Materials",
    table: "packaging_materials",
    select: "*",
    order: "item_name",
    name: (r) => r.item_name,
    sub: (r) => r.category || "—",
    qty: (r) => `${(Number(r.current_stock) || 0).toLocaleString()} pcs`,
  },
};

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
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

function InventoryArchive() {
  const [tab, setTab] = useState("products");
  const [rows, setRows] = useState({ products: [], raw: [], packaging: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      Object.entries(SOURCES).map(async ([key, s]) => {
        const { data, error } = await supabase
          .from(s.table)
          .select(s.select)
          .eq("archived", true)
          .order(s.order, { ascending: true });
        if (error) console.error(`${s.table} archive fetch error:`, error);
        return [key, data || []];
      }),
    );
    setRows(Object.fromEntries(results));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const restore = async (row) => {
    const s = SOURCES[tab];
    setBusyId(row.id);
    setError("");
    const { error } = await supabase
      .from(s.table)
      .update({ archived: false, archived_at: null })
      .eq("id", row.id);
    setBusyId(null);
    if (error) return setError(error.message);
    setRows((p) => ({ ...p, [tab]: p[tab].filter((r) => r.id !== row.id) }));
  };

  const s = SOURCES[tab];
  const q = search.toLowerCase();
  const visible = rows[tab].filter(
    (r) =>
      !q ||
      s.name(r).toLowerCase().includes(q) ||
      s.sub(r).toLowerCase().includes(q),
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            Inventory - Archive
          </h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          {Object.entries(SOURCES).map(([key, src]) => (
            <Chip
              key={key}
              active={tab === key}
              onClick={() => {
                setTab(key);
                setSearch("");
                setError("");
              }}
            >
              {src.label} ({rows[key].length})
            </Chip>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder={`Search archived ${s.label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
        </div>

        {error && (
          <p
            className="text-xs rounded-md px-3 py-2 border"
            style={{
              color: C.accent,
              backgroundColor: C.accentSoft,
              borderColor: "#F3C9C7",
            }}
          >
            {error}
          </p>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-red-900 text-white">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                    NAME
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                    DETAILS
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    STOCK AT ARCHIVE
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    ARCHIVED ON
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-gray-400">
                      <ArchiveIcon className="mx-auto mb-2" size={32} />
                      <p className="text-sm font-medium text-gray-500">
                        No archived {s.label.toLowerCase()}
                      </p>
                    </td>
                  </tr>
                ) : (
                  visible.map((r, idx) => {
                    const when = r.archived_at || r.updated_at;
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                        style={idx % 2 ? { backgroundColor: "#FAFAFA" } : undefined}
                      >
                        <td className="px-3 py-2 text-xs text-gray-800 font-medium">
                          {s.name(r)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{s.sub(r)}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-700">
                          {s.qty(r)}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">
                          {when ? new Date(when).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => restore(r)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50 cursor-pointer"
                            style={{ backgroundColor: C.accent }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = C.accentHover)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = C.accent)
                            }
                          >
                            <ArchiveRestore size={14} />
                            {busyId === r.id ? "Restoring…" : "Restore"}
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
      </div>
    </div>
  );
}

export default InventoryArchive;