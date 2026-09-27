// PRODUCTION RECIPES (BILL OF MATERIALS)
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Trash2, FlaskConical, Search } from "lucide-react";
import { supabase } from "../api/supabase";

const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  textMuted: "#6B6B70",
  border: "#E4E4E7",
  success: "#15803D",
  successSoft: "#EEF6EF",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
};

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${className}`}
      style={{ backgroundColor: C.accent }}
      onMouseEnter={(e) => !props.disabled && (e.currentTarget.style.backgroundColor = C.accentHover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.accent)}
    >
      {children}
    </button>
  );
}

// ── Searchable product picker ─────────────────────────────────────────────
function ProductPicker({ products, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = products.find((p) => p.id === selectedId);
  const filtered = !query
    ? products
    : products.filter(
        (p) =>
          p.product_name.toLowerCase().includes(query.toLowerCase()) ||
          p.product_code.toLowerCase().includes(query.toLowerCase())
      );

  return (
    <div className="relative w-full max-w-md" ref={wrapperRef}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <Search size={16} />
      </span>
      <input
        type="text"
        value={open ? query : selected ? `${selected.product_name} (${selected.product_code})` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder="Search product to build a recipe for…"
        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
        onFocusCapture={(e) => (e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`, e.target.style.borderColor = C.accent)}
        onBlur={(e) => (e.target.style.boxShadow = "none", e.target.style.borderColor = "#D1D5DB")}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 cursor-pointer flex justify-between items-center"
            >
              <span className="text-gray-800">{p.product_name}</span>
              <span className="text-xs text-gray-400 font-mono ml-2">{p.product_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add-material row form ─────────────────────────────────────────────────
function AddBomRow({ materials, existingMaterialIds, onAdd }) {
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");

  const available = materials.filter((m) => !existingMaterialIds.includes(m.id));
  const selectedMaterial = materials.find((m) => m.id === materialId);

  // Group available materials by category so the dropdown reads cleanly
  // (e.g. Essential Oils separated from Packaging).
  const grouped = available.reduce((acc, m) => {
    const key = m.category || "Uncategorized";
    (acc[key] = acc[key] || []).push(m);
    return acc;
  }, {});

  const handleAdd = () => {
    setError("");
    if (!materialId) {
      setError("Choose a material.");
      return;
    }
    const value = Number(qty);
    if (!value || value <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    onAdd(materialId, value);
    setMaterialId("");
    setQty("");
  };

  return (
    <div className="flex flex-col md:flex-row md:items-end gap-2 bg-gray-50 border border-gray-200 rounded-md p-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 cursor-pointer"
        >
          <option value="">Select a material…</option>
          {Object.entries(grouped).map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.material_name} ({m.current_stock} {m.unit} available)
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="w-full md:w-40">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Qty per unit {selectedMaterial ? `(${selectedMaterial.unit})` : ""}
        </label>
        <input
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
        />
      </div>
      <PrimaryButton onClick={handleAdd} className="whitespace-nowrap">
        <Plus size={14} /> Add to recipe
      </PrimaryButton>
      {error && <p className="text-xs w-full" style={{ color: C.accent }}>{error}</p>}
    </div>
  );
}

// ── Production_bom ─────────────────────────────────────────────────────
function Production_bom() {
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [bomRows, setBomRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory")
      .select("id, product_code, product_name")
      .order("product_name", { ascending: true });
    if (!error) setProducts(data || []);
  }, []);

  const fetchMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("raw_materials")
      .select("id, material_name, category, unit, current_stock")
      .order("category", { ascending: true })
      .order("material_name", { ascending: true });
    if (!error) setMaterials(data || []);
  }, []);

  const fetchBom = useCallback(async (productId) => {
    if (!productId) {
      setBomRows([]);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("bill_of_materials")
      .select("id, quantity_per_unit, raw_materials(id, material_name, category, unit, current_stock)")
      .eq("product_id", productId)
      .order("created_at", { ascending: true });

    if (error) setErrorMsg(error.message);
    else setBomRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchMaterials();
  }, [fetchProducts, fetchMaterials]);

  useEffect(() => {
    fetchBom(selectedProductId);
  }, [selectedProductId, fetchBom]);

  const handleAddRow = async (materialId, quantityPerUnit) => {
    setErrorMsg("");
    const { error } = await supabase.from("bill_of_materials").insert([
      {
        product_id: selectedProductId,
        raw_material_id: materialId,
        quantity_per_unit: quantityPerUnit,
      },
    ]);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    fetchBom(selectedProductId);
  };

  const handleUpdateQty = async (rowId, value) => {
    const newValue = Number(value);
    if (!newValue || newValue <= 0) return;
    const { error } = await supabase
      .from("bill_of_materials")
      .update({ quantity_per_unit: newValue, updated_at: new Date().toISOString() })
      .eq("id", rowId);
    if (!error) {
      setBomRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, quantity_per_unit: newValue } : r)));
    }
  };

  const handleRemoveRow = async (rowId) => {
    const { error } = await supabase.from("bill_of_materials").delete().eq("id", rowId);
    if (!error) setBomRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const existingMaterialIds = bomRows.map((r) => r.raw_materials?.id).filter(Boolean);

  // Group current recipe rows by material category for display
  const groupedRows = bomRows.reduce((acc, row) => {
    const key = row.raw_materials?.category || "Uncategorized";
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800">Production - Recipes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Define how much of each raw material goes into one unit of a finished product. This is
          checked and deducted automatically whenever a Work Order is created.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Product</label>
          <ProductPicker products={products} selectedId={selectedProductId} onSelect={setSelectedProductId} />
        </div>

        {errorMsg && (
          <p className="text-xs rounded-md px-3 py-2 border" style={{ color: C.accent, backgroundColor: C.accentSoft, borderColor: C.accentSoftBorder }}>
            {errorMsg}
          </p>
        )}

        {!selectedProductId ? (
          <div className="text-center text-gray-400 py-12">
            <FlaskConical className="mx-auto mb-2" size={32} />
            <p className="font-medium text-gray-500">Pick a product above to view or edit its recipe</p>
          </div>
        ) : loading ? (
          <p className="text-gray-500 text-sm">Loading recipe…</p>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                Current recipe — {selectedProduct?.product_name}
              </h2>
              {bomRows.length === 0 ? (
                <p className="text-xs text-gray-400 italic mb-3">
                  No recipe defined yet. Work Orders for this product won't check or deduct any raw
                  materials until you add rows below.
                </p>
              ) : (
                <div className="space-y-4 mb-3">
                  {Object.entries(groupedRows).map(([category, rows]) => (
                    <div key={category}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                        {category}
                      </p>
                      <div className="border border-gray-200 rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {rows.map((row) => {
                              const m = row.raw_materials;
                              const low = m && m.current_stock <= row.quantity_per_unit * 5; // rough heads-up
                              return (
                                <tr key={row.id} className="border-t border-gray-100 first:border-t-0">
                                  <td className="px-3 py-2 text-gray-800">{m?.material_name || "—"}</td>
                                  <td className="px-3 py-2 text-right w-32">
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      defaultValue={row.quantity_per_unit}
                                      onBlur={(e) => handleUpdateQty(row.id, e.target.value)}
                                      className="w-20 text-right border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-xs text-gray-500 w-16">{m?.unit}</td>
                                  <td className="px-2 py-2 text-xs text-gray-400 w-28">
                                    {m ? `${m.current_stock} ${m.unit} in stock` : ""}
                                  </td>
                                  <td className="px-2 py-2 text-right w-10">
                                    <button
                                      onClick={() => handleRemoveRow(row.id)}
                                      title="Remove from recipe"
                                      className="p-1 rounded hover:bg-red-100 transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={14} style={{ color: C.accent }} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Add material to recipe</p>
              <AddBomRow materials={materials} existingMaterialIds={existingMaterialIds} onAdd={handleAddRow} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Production_bom;