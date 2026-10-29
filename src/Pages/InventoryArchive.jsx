// INVENTORY - ARCHIVE (products, raw materials, packaging) with restore
import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, X, ArchiveRestore } from "lucide-react";
import { supabase } from "../api/supabase";

/* ── Design tokens ─────────────────────────────────────────────────────── */
const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
};

// One config per archive tab. `restore` is called with the row.
const TABS = [
  {
    key: "products",
    label: "Products",
    table: "inventory",
    select: "*",
    orderBy: "product_name",
    nameOf: (r) => r.product_name,
    codeOf: (r) => r.product_code,
    categoryOf: (r) => r.category,
    detailOf: (r) =>
      `${(r.shopee_stock || 0) + (r.lazada_stock || 0) + (r.tiktok_stock || 0)} units`,
    detailHeader: "STOCK",
    searchText: (r) => `${r.product_name} ${r.product_code}`,
  },
  {
    key: "materials",
    label: "Raw materials",
    table: "raw_materials",
    select: "*, suppliers(name)",
    orderBy: "material_name",
    nameOf: (r) => r.material_name,
    codeOf: (r) => r.suppliers?.name || null,
    categoryOf: (r) => r.category,
    detailOf: (r) => `${r.current_stock ?? 0} L`,
    detailHeader: "STOCK",
    searchText: (r) => `${r.material_name} ${r.suppliers?.name || ""}`,
  },
  {
    key: "packaging",
    label: "Packaging",
    table: "packaging_materials",
    select: "*",
    orderBy: "item_name",
    nameOf: (r) => r.item_name,
    codeOf: () => null,
    categoryOf: (r) => r.category,
    detailOf: (r) => `${(Number(r.current_stock) || 0).toLocaleString()} pcs`,
    detailHeader: "STOCK",
    searchText: (r) => r.item_name,
  },
];

/* ── Primitives ────────────────────────────────────────────────────────── */

const focusOn = (e) => {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
};
const focusOff = (e) => {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
};

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${className}`}
      style={{ backgroundColor: C.accent }}
      onMouseEnter={(e) =>
        !props.disabled &&
        (e.currentTarget.style.backgroundColor = C.accentHover)
      }
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

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
      style={
        active
          ? { backgroundColor: C.accent, borderColor: C.accent, color: "#fff" }
          : {
              backgroundColor: "#fff",
              borderColor: "#D1D5DB",
              color: "#142947",
            }
      }
    >
      {children}
    </button>
  );
}

function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <p
      className="text-xs rounded-md px-3 py-2 border"
      style={{
        color: C.accent,
        backgroundColor: C.accentSoft,
        borderColor: C.accentSoftBorder,
      }}
    >
      {error}
    </p>
  );
}

/* ── Restore logic ─────────────────────────────────────────────────────── */

async function restoreRow(tab, row) {
  if (tab.table === "inventory") {
    // Products are archived through archive_record(), which keeps a snapshot
    // in archived_records. Restore through the matching RPC so that entry is
    // cleared too (admin only). If there's no snapshot, flip the flag directly.
    const { data: entry } = await supabase
      .from("archived_records")
      .select("id")
      .eq("table_name", "inventory")
      .eq("record_id", String(row.id))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entry?.id) {
      return supabase.rpc("restore_archived_record", {
        p_archive_id: entry.id,
      });
    }
    return supabase
      .from("inventory")
      .update({ archived: false, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return supabase
    .from(tab.table)
    .update({
      archived: false,
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

/* ── Inventory_archive (page) ──────────────────────────────────────────── */

function Inventory_archive() {
  const [tabKey, setTabKey] = useState("products");
  const [rows, setRows] = useState({
    products: [],
    materials: [],
    packaging: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [toRestore, setToRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  const tab = TABS.find((t) => t.key === tabKey);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const results = await Promise.all(
      TABS.map((t) =>
        supabase
          .from(t.table)
          .select(t.select)
          .eq("archived", true)
          .order(t.orderBy, { ascending: true }),
      ),
    );
    const next = {};
    const errors = [];
    results.forEach((res, i) => {
      const t = TABS[i];
      if (res.error) {
        console.error(`${t.table} archive fetch error:`, res.error);
        errors.push(`${t.label}: ${res.error.message}`);
        next[t.key] = [];
      } else {
        next[t.key] = res.data || [];
      }
    });
    setRows(next);
    if (errors.length) setLoadError(errors.join(" · "));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const switchTab = (key) => {
    setTabKey(key);
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows[tabKey] || [];
    if (!q) return list;
    return list.filter((r) => tab.searchText(r).toLowerCase().includes(q));
  }, [rows, tabKey, search, tab]);

  const confirmRestore = async () => {
    if (!toRestore) return;
    setRestoring(true);
    setRestoreError("");
    const { error } = await restoreRow(tab, toRestore);
    if (error) {
      setRestoreError(error.message);
    } else {
      setRows((prev) => ({
        ...prev,
        [tabKey]: prev[tabKey].filter((r) => r.id !== toRestore.id),
      }));
      setToRestore(null);
    }
    setRestoring(false);
  };

  const closeModal = () => {
    setToRestore(null);
    setRestoreError("");
  };

  const TOTAL_COLS = 6;
  const archivedOn = (r) => {
    const d = r.archived_at || r.updated_at;
    return d ? new Date(d).toLocaleDateString() : "—";
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            Inventory - Archive
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Archived items are hidden from their inventory pages. Restore one to
            bring it back.
          </p>
        </div>

        {loadError && (
          <ErrorBox error={`Couldn't load some archived items: ${loadError}`} />
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <FilterChip
              key={t.key}
              active={tabKey === t.key}
              onClick={() => switchTab(t.key)}
            >
              {t.label}
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={
                  tabKey === t.key
                    ? { backgroundColor: "#fff", color: C.accent }
                    : { backgroundColor: C.accentSoft, color: C.accent }
                }
              >
                {rows[t.key].length}
              </span>
            </FilterChip>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder={`Search archived ${tab.label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
              onFocus={focusOn}
              onBlur={focusOff}
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
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-red-900 text-white">
                  <th className="px-2 py-2.5 w-8" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide min-w-[200px]">
                    NAME
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                    CATEGORY
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    {tab.detailHeader}
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    ARCHIVED
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                    RESTORE
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
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
                    <td
                      colSpan={TOTAL_COLS}
                      className="px-4 py-14 text-center text-gray-400"
                    >
                      <p className="text-sm font-medium text-gray-500">
                        {search
                          ? "No archived items match your search"
                          : `No archived ${tab.label.toLowerCase()}`}
                      </p>
                      <p className="text-xs mt-1">
                        Items you archive from their inventory page show up
                        here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => {
                    const code = tab.codeOf(item);
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        style={
                          (idx + 1) % 2 === 0
                            ? { backgroundColor: "#FAFAFA" }
                            : {}
                        }
                      >
                        <td className="px-2 py-2 text-center text-xs text-gray-400 w-8">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-800">
                          <p>{tab.nameOf(item)}</p>
                          {code && (
                            <p className="text-[11px] font-mono text-gray-400">
                              {code}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {tab.categoryOf(item) || (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs font-medium text-gray-700">
                          {tab.detailOf(item)}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">
                          {archivedOn(item)}
                        </td>
                        <td className="px-1.5 py-1.5 text-center">
                          <button
                            onClick={() => {
                              setRestoreError("");
                              setToRestore(item);
                            }}
                            title="Restore"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-red-200 transition-colors cursor-pointer"
                            style={{ color: C.accent }}
                          >
                            <ArchiveRestore size={15} />
                            Restore
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

        {/* Restore confirmation */}
        {toRestore && (
          <ModalShell
            title={`Restore ${tab.label.toLowerCase().replace(/s$/, "")}`}
            onClose={closeModal}
            footer={
              <>
                <SecondaryButton onClick={closeModal}>Cancel</SecondaryButton>
                <PrimaryButton onClick={confirmRestore} disabled={restoring}>
                  {restoring ? "Restoring…" : "Restore"}
                </PrimaryButton>
              </>
            }
          >
            <p className="text-sm text-gray-600">
              Restore{" "}
              <span className="font-medium text-gray-800">
                {tab.nameOf(toRestore)}
              </span>
              ? It will show up again on its inventory page.
            </p>
            <ErrorBox error={restoreError} />
          </ModalShell>
        )}
      </div>
    </div>
  );
}

export default Inventory_archive;