import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  X,
  Upload,
  Eye,
  Pencil,
  Archive,
} from "lucide-react";
import { supabase } from "../api/supabase";

const isLowStock = (item) => {
  const total = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);
  return total <= 5;
};

const EMPTY_FORM = {
  product_code: "",
  product_name: "",
  category: "Women",
  shopee_stock: "",
  lazada_stock: "",
  tiktok_stock: "",
};

// ── AddProductModal ──────────────────────────────────────────────────────────────

function AddProductModal({ onClose, onSaved, editItem = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setForm({
        product_code: editItem.product_code || "",
        product_name: editItem.product_name || "",
        category: editItem.category || "Women",
        shopee_stock: editItem.shopee_stock?.toString() || "",
        lazada_stock: editItem.lazada_stock?.toString() || "",
        tiktok_stock: editItem.tiktok_stock?.toString() || "",
      });
    }
  }, [editItem]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.product_code.trim() || !form.product_name.trim()) {
      setError("Product code and name are required.");
      return;
    }
    setSaving(true);
    setError("");

    const shopee = parseInt(form.shopee_stock) || 0;
    const lazada = parseInt(form.lazada_stock) || 0;
    const tiktok = parseInt(form.tiktok_stock) || 0;
    const total = shopee + lazada + tiktok;

    const payload = {
      product_code: form.product_code.trim().toUpperCase(),
      product_name: form.product_name.trim(),
      category: form.category,
      shopee_stock: shopee,
      lazada_stock: lazada,
      tiktok_stock: tiktok,
      stock: total, // Auto-calculate total
      updated_at: new Date().toISOString(),
    };

    let error = null;
    if (isEdit && editItem.id) {
      const { error: updateError } = await supabase
        .from("inventory")
        .update(payload)
        .eq("id", editItem.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("inventory")
        .insert([payload]);
      error = insertError;
    }

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">
            {isEdit ? "Edit Product" : "Add New Product"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Product Code *
              </label>
              <input
                type="text"
                placeholder="e.g. F036"
                value={form.product_code}
                onChange={(e) => set("product_code", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                <option value="Women">Women</option>
                <option value="Men">Men</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
              Product Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Dior Sauvage dupe 85ml"
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#EE4D2D] mb-1 uppercase tracking-wide">
                Shopee Stock
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.shopee_stock}
                onChange={(e) => set("shopee_stock", e.target.value)}
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-violet-700 mb-1 uppercase tracking-wide">
                Lazada Stock
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.lazada_stock}
                onChange={(e) => set("lazada_stock", e.target.value)}
                className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                TikTok Stock
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.tiktok_stock}
                onChange={(e) => set("tiktok_stock", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
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
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Update Product" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ViewProductModal ──────────────────────────────────────────────────────────────

function ViewProductModal({ item, onClose }) {
  if (!item) return null;
  
  const totalStock = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Product Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Product Code
              </label>
              <p className="text-sm font-mono text-gray-800">{item.product_code}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Category
              </label>
              <p className="text-sm text-gray-800">{item.category}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Product Name
            </label>
            <p className="text-sm text-gray-800">{item.product_name}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Total Stock
              </label>
              <p className="text-sm font-bold text-amber-700">{totalStock}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#EE4D2D] uppercase tracking-wide">
                Shopee Stock
              </label>
              <p className="text-sm text-red-600">{item.shopee_stock || 0}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-violet-700 uppercase tracking-wide">
                Lazada Stock
              </label>
              <p className="text-sm text-indigo-600">{item.lazada_stock || 0}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                TikTok Stock
              </label>
              <p className="text-sm text-gray-600">{item.tiktok_stock || 0}</p>
            </div>
          </div>

          {item.updated_at && (
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Last Updated
              </label>
              <p className="text-xs text-gray-500">
                {new Date(item.updated_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory ──────────────────────────────────────────────────────────────

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [editingStock, setEditingStock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [itemToArchive, setItemToArchive] = useState(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("category", { ascending: true })
      .order("product_name", { ascending: true });

    if (!error && data) {
      setInventory(data);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleView = (item) => {
    setSelectedItem(item);
    setShowViewModal(true);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowAddModal(true);
  };

  const handleArchive = (item) => {
    setItemToArchive(item);
    setShowArchiveModal(true);
  };

  const confirmArchive = async () => {
    if (!itemToArchive) return;

    setSaving(true);
    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", itemToArchive.id);

    if (!error) {
      setInventory((prev) => prev.filter((i) => i.id !== itemToArchive.id));
      setShowArchiveModal(false);
      setItemToArchive(null);
    }
    setSaving(false);
  };

  const filtered = inventory.filter((item) => {
    const matchCat =
      filterCategory === "All" || item.category === filterCategory;
    const matchSearch =
      !search ||
      item.product_name.toLowerCase().includes(search.toLowerCase()) ||
      item.product_code.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totals = filtered.reduce(
    (acc, item) => ({
      shopee: acc.shopee + (item.shopee_stock || 0),
      lazada: acc.lazada + (item.lazada_stock || 0),
      tiktok: acc.tiktok + (item.tiktok_stock || 0),
    }),
    { shopee: 0, lazada: 0, tiktok: 0 }
  );
  
  // Calculate total as sum of all platforms
  const totalStock = totals.shopee + totals.lazada + totals.tiktok;

  const saveStock = async (id, field, value) => {
    const newValue = parseInt(value);
    if (isNaN(newValue) || newValue < 0) return;
    
    setSaving(true);
    const updateData = {
      [field]: newValue,
      updated_at: new Date().toISOString()
    };
    
    // If updating a platform stock, recalculate total
    if (field === 'shopee_stock' || field === 'lazada_stock' || field === 'tiktok_stock') {
      const item = inventory.find(i => i.id === id);
      if (item) {
        const shopee = field === 'shopee_stock' ? newValue : (item.shopee_stock || 0);
        const lazada = field === 'lazada_stock' ? newValue : (item.lazada_stock || 0);
        const tiktok = field === 'tiktok_stock' ? newValue : (item.tiktok_stock || 0);
        updateData.stock = shopee + lazada + tiktok;
      }
    }
    
    const { error } = await supabase
      .from("inventory")
      .update(updateData)
      .eq("id", id);
      
    if (!error) {
      setInventory((prev) =>
        prev.map((i) => {
          if (i.id === id) {
            const updated = { ...i, ...updateData };
            return updated;
          }
          return i;
        })
      );
    }
    setSaving(false);
  };

  const handleStockEdit = (item, field) => {
    const value = field === 'stock' ? item.stock : item[field];
    setEditingStock({
      id: item.id,
      field: field,
      value: String(value ?? 0),
    });
  };

  const handleKeyDown = (e, id) => {
    if (e.key === "Enter") {
      if (editingStock) {
        saveStock(id, editingStock.field, editingStock.value);
        setEditingStock(null);
      }
    }
    if (e.key === "Escape") setEditingStock(null);
  };

  const TOTAL_COLS = 8;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <button
            onClick={() => {
              setEditItem(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            Add Product
          </button>
          <button
            onClick={fetchInventory}
            disabled={loading}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? "↻ Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search product name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {["All", "Men", "Women"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                filterCategory === cat
                  ? cat === "Men"
                    ? "bg-blue-600 text-white"
                    : cat === "Women"
                    ? "bg-pink-500 text-white"
                    : "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-400 whitespace-nowrap">
          {filtered.length} products
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr>
                <th className="bg-gray-100 border border-gray-300 w-8" rowSpan={2} />
                <th
                  className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700"
                  rowSpan={2}
                >
                  CODE
                </th>
                <th
                  className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-xs font-bold text-gray-700 min-w-[200px]"
                  rowSpan={2}
                >
                  PRODUCT NAME
                </th>
                <th className="bg-amber-400 text-amber-900 border border-amber-500 px-3 py-1.5 text-center text-xs font-bold">
                  TOTAL STOCK
                </th>
                <th className="bg-[#EE4D2D] text-white border border-red-600 px-3 py-1.5 text-center text-xs font-bold">
                  SHOPEE
                </th>
                <th className="bg-violet-700 text-white border border-indigo-800 px-3 py-1.5 text-center text-xs font-bold">
                  LAZADA
                </th>
                <th className="bg-gray-800 text-white border border-gray-900 px-3 py-1.5 text-center text-xs font-bold">
                  TIKTOK
                </th>
                <th
                  className="bg-emerald-800 text-white border border-emerald-700 px-3 py-1.5 text-center text-xs font-bold"
                  rowSpan={1}
                >
                  ACTION
                </th>
              </tr>
              <tr>
                <th className="bg-amber-100 border border-amber-200 px-3 py-1 text-center text-xs font-semibold text-amber-800">
                  QTY
                </th>
                <th className="bg-red-100 border border-red-200 px-3 py-1 text-center text-xs font-semibold text-red-700">
                  QTY
                </th>
                <th className="bg-indigo-100 border border-indigo-200 px-3 py-1 text-center text-xs font-semibold text-indigo-700">
                  QTY
                </th>
                <th className="bg-gray-100 border border-gray-200 px-3 py-1 text-center text-xs font-semibold text-gray-700">
                  QTY
                </th>
                <th className="bg-emerald-100 border border-emerald-200 px-3 py-1 text-center text-xs font-semibold text-emerald-800">
                  VIEW · EDIT · ARCHIVE
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(TOTAL_COLS)].map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={TOTAL_COLS}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    <p className="text-4xl mb-2">📦</p>
                    <p className="font-medium text-gray-500">
                      No products found
                    </p>
                  </td>
                </tr>
              ) : (
                (() => {
                  const rows = [];
                  let rowNum = 1;
                  let lastCat = null;

                  for (const item of filtered) {
                    const totalStock = (item.shopee_stock || 0) + (item.lazada_stock || 0) + (item.tiktok_stock || 0);
                    const low = totalStock <= 5;
                    
                    if (item.category !== lastCat) {
                      rows.push(
                        <tr key={`cat-${item.category}`}>
                          <td
                            colSpan={TOTAL_COLS}
                            className={`px-3 py-1.5 text-xs font-bold text-white border ${
                              item.category === "Men"
                                ? "bg-blue-600 border-blue-700"
                                : "bg-pink-500 border-pink-600"
                            }`}
                          >
                            {item.category.toUpperCase()}
                          </td>
                        </tr>
                      );
                      lastCat = item.category;
                    }

                    const rowBg = low
                      ? "bg-red-50"
                      : rowNum % 2 === 0
                      ? "bg-gray-50 hover:bg-gray-100"
                      : "bg-white hover:bg-gray-50";

                    rows.push(
                      <tr
                        key={item.id}
                        className={`${rowBg} border-b border-gray-200 transition-colors`}
                      >
                        <td className="px-2 py-1.5 text-center text-xs text-gray-400 bg-gray-50 border-r border-gray-200 w-8">
                          {rowNum++}
                        </td>

                        <td className="px-3 py-1.5 text-xs font-mono text-gray-500 border-r border-gray-200 whitespace-nowrap">
                          {item.product_code}
                        </td>

                        <td className="px-3 py-1.5 text-xs text-gray-800 border-r border-gray-200">
                          <div className="flex items-center gap-2">
                            {item.product_name}
                            {low && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded font-medium shrink-0">
                                Low
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-1.5 text-center border-r border-amber-200">
                          {editingStock?.id === item.id && editingStock.field === 'stock' ? (
                            <input
                              type="number"
                              min="0"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  ...editingStock,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => {
                                if (editingStock) {
                                  saveStock(item.id, editingStock.field, editingStock.value);
                                  setEditingStock(null);
                                }
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-16 text-center text-xs border border-amber-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item, 'stock')}
                              title="Click to edit total stock"
                              className={`text-xs font-bold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all ${
                                low ? "text-red-700 bg-red-100" : "text-black"
                              }`}
                            >
                              {totalStock}
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-center text-xs font-semibold border-r border-red-100">
                          {editingStock?.id === item.id && editingStock.field === 'shopee_stock' ? (
                            <input
                              type="number"
                              min="0"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  ...editingStock,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => {
                                if (editingStock) {
                                  saveStock(item.id, editingStock.field, editingStock.value);
                                  setEditingStock(null);
                                }
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-16 text-center text-xs border border-red-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item, 'shopee_stock')}
                              title="Click to edit Shopee stock"
                              className="text-xs font-semibold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-red-400 transition-all"
                            >
                              {item.shopee_stock || 0}
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-center text-xs font-semibold border-r border-indigo-100">
                          {editingStock?.id === item.id && editingStock.field === 'lazada_stock' ? (
                            <input
                              type="number"
                              min="0"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  ...editingStock,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => {
                                if (editingStock) {
                                  saveStock(item.id, editingStock.field, editingStock.value);
                                  setEditingStock(null);
                                }
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-16 text-center text-xs border border-indigo-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item, 'lazada_stock')}
                              title="Click to edit Lazada stock"
                              className="text-xs font-semibold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                            >
                              {item.lazada_stock || 0}
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-center text-xs font-semibold border-r border-gray-200">
                          {editingStock?.id === item.id && editingStock.field === 'tiktok_stock' ? (
                            <input
                              type="number"
                              min="0"
                              value={editingStock.value}
                              onChange={(e) =>
                                setEditingStock({
                                  ...editingStock,
                                  value: e.target.value,
                                })
                              }
                              onBlur={() => {
                                if (editingStock) {
                                  saveStock(item.id, editingStock.field, editingStock.value);
                                  setEditingStock(null);
                                }
                              }}
                              onKeyDown={(e) => handleKeyDown(e, item.id)}
                              autoFocus
                              className="w-16 text-center text-xs border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                          ) : (
                            <button
                              onClick={() => handleStockEdit(item, 'tiktok_stock')}
                              title="Click to edit TikTok stock"
                              className="text-xs font-semibold px-2 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-gray-400 transition-all"
                            >
                              {item.tiktok_stock || 0}
                            </button>
                          )}
                        </td>

                        <td className="px-1.5 py-1 text-center border border-gray-300">
                          <div className="flex items-center justify-center gap-5">
                            <button
                              onClick={() => handleView(item)}
                              title="View"
                              className="p-0.5 rounded hover:bg-blue-100 transition-colors cursor-pointer"
                            >
                              <Eye size={20} className="text-blue-600" />
                            </button>
                            <button
                              onClick={() => handleEdit(item)}
                              title="Edit"
                              className="p-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                            >
                              <Pencil size={20} className="text-amber-600" />
                            </button>
                            <button
                              onClick={() => handleArchive(item)}
                              title="Archive"
                              className="p-0.5 rounded hover:bg-pink-100 transition-colors cursor-pointer"
                            >
                              <Archive size={20} className="text-pink-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })()
              )}

              {!loading && filtered.length > 0 && (
                <tr className="bg-amber-400 border-t-2 border-amber-500 font-bold">
                  <td className="px-2 py-2 text-center text-xs text-amber-900 border-r border-amber-500">
                    —
                  </td>
                  <td className="border-r border-amber-500" />
                  <td className="px-3 py-2 text-xs text-amber-900 border-r border-amber-500">
                    TOTAL ({filtered.length} products)
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-r border-amber-500">
                    {totalStock.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-red-900 border-r border-amber-500">
                    {totals.shopee.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-indigo-900 border-r border-amber-500">
                    {totals.lazada.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-gray-900 border-r border-amber-500">
                    {totals.tiktok.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-gray-900">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-gray-500 pb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />
          Low stock (≤ 5 total across all platforms)
        </span>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddProductModal
          onClose={() => {
            setShowAddModal(false);
            setEditItem(null);
          }}
          onSaved={fetchInventory}
          editItem={editItem}
        />
      )}

      {showViewModal && selectedItem && (
        <ViewProductModal
          item={selectedItem}
          onClose={() => {
            setShowViewModal(false);
            setSelectedItem(null);
          }}
        />
      )}

      {showArchiveModal && itemToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">
                Archive Product
              </h2>
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setItemToArchive(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to archive{" "}
                <span className="font-semibold">
                  {itemToArchive.product_name}
                </span>
                ? This action cannot be undone.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setItemToArchive(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmArchive}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;