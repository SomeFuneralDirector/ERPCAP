import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../api/supabase";

/* ── Design tokens — shared with Inventory / Sales / Marketing pages ───── */
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
  shopee: "#EE4D2D",
  lazada: "#0F146D",
  tiktok: "#101113",
};

const normalizePlatform = (p) => {
  if (!p) return "Unknown";
  const key = p.toLowerCase();
  if (key === "shopee") return "Shopee";
  if (key === "lazada") return "Lazada";
  if (key === "tiktok") return "TikTok";
  return p;
};

const centsToPesos = (c) => (c || 0) / 100;

const fmt = (n) => (n ?? 0).toLocaleString();
const fmtPHP = (n) =>
  `₱${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const ORDER_ITEMS_CHUNK_SIZE = 150;

async function fetchOrderItemsInChunks(orderUuids) {
  const chunks = [];
  for (let i = 0; i < orderUuids.length; i += ORDER_ITEMS_CHUNK_SIZE) {
    chunks.push(orderUuids.slice(i, i + ORDER_ITEMS_CHUNK_SIZE));
  }

  if (chunks.length === 0) return { data: [], error: null };

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("order_items")
        .select(
          "order_uuid, order_id, platform, product_name, sku, quantity, unit_price"
        )
        .in("order_uuid", chunk)
    )
  );

  const firstError = results.find((r) => r.error)?.error || null;
  if (firstError) return { data: [], error: firstError };

  return { data: results.flatMap((r) => r.data || []), error: null };
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}
    >
      {children}
    </div>
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

function Marketing_io() {
  const [orderItems, setOrderItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");

    const { data: completedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_id")
      .eq("status", "COMPLETED");

    if (ordersError) {
      setErrorMsg(ordersError.message);
      setInitialLoading(false);
      setRefreshing(false);
      return;
    }

    const orderUuids = (completedOrders || []).map((o) => o.id).filter(Boolean);

    const [itemsRes, inventoryRes] = await Promise.all([
      fetchOrderItemsInChunks(orderUuids),
      supabase
        .from("inventory")
        .select("product_name, category, shopee_stock, lazada_stock, tiktok_stock"),
    ]);

    if (itemsRes.error) {
      setErrorMsg(itemsRes.error.message);
    } else {
      setOrderItems(itemsRes.data || []);
    }

    if (inventoryRes.error) {
      console.error("Error fetching inventory context:", inventoryRes.error);
    } else {
      setInventory(inventoryRes.data || []);
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData(true);

    const channel = supabase
      .channel("marketing-io-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchData(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => fetchData(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchData(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  const inventoryByName = useMemo(() => {
    const map = {};
    inventory.forEach((item) => {
      const stock =
        (Number(item.shopee_stock) || 0) +
        (Number(item.lazada_stock) || 0) +
        (Number(item.tiktok_stock) || 0);
      map[item.product_name] = {
        category: item.category || "—",
        stock,
      };
    });
    return map;
  }, [inventory]);

  const products = useMemo(() => {
    const map = {};
    orderItems.forEach((row) => {
      const name = row.product_name || "Unnamed Product";
      if (!map[name]) {
        map[name] = {
          id: name,
          name,
          shopee: 0,
          lazada: 0,
          tiktok: 0,
          revenue: 0,
          total: 0,
        };
      }
      const qty = Number(row.quantity) || 0;
      const platform = normalizePlatform(row.platform);
      const platformKey =
        platform === "TikTok" ? "tiktok" : platform.toLowerCase();
      if (map[name][platformKey] !== undefined) {
        map[name][platformKey] += qty;
      }
      map[name].revenue += qty * centsToPesos(row.unit_price);
      map[name].total += qty;
    });

    return Object.values(map).map((p) => ({
      ...p,
      category: inventoryByName[p.name]?.category ?? "—",
      stock: inventoryByName[p.name]?.stock ?? null,
    }));
  }, [orderItems, inventoryByName]);

  // Fixed gender categories like Inventory (All / Men / Women)
  const categoryOptions = ["All", "Men", "Women"];

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory =
        categoryFilter === "All" || p.category === categoryFilter;
      const matchSearch =
        !search || p.name.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [products, categoryFilter, search]);

  const sortedProductTable = useMemo(() => {
    return [...filteredProducts].sort((a, b) => b.total - a.total);
  }, [filteredProducts]);

  const loading = initialLoading;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Marketing - Inventory Overview
            </h1>
            {refreshing && (
              <p className="text-xs text-gray-400 mt-0.5">Syncing…</p>
            )}
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <SecondaryButton
              onClick={() => fetchData(false)}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? "Loading…" : "Refresh"}
            </SecondaryButton>
          </div>
        </Card>

        {errorMsg && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.accentSoft,
              borderColor: C.accentSoftBorder,
              color: C.accent,
            }}
          >
            {errorMsg}
          </div>
        )}

        {loading ? (
          <Card className="p-5">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </Card>
        ) : products.length === 0 ? (
          <Card className="p-5">
            <p className="text-xs text-gray-400 text-center py-8">
              No completed orders yet. Once orders come in through the Sales page,
              product sales data will show up here.
            </p>
          </Card>
        ) : (
          <>
            {/* Filters — same category buttons as Inventory */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-col md:flex-row gap-3 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  placeholder="Search product…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none"
                  onFocus={(e) => {
                    e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
                    e.target.style.borderColor = C.accent;
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = "none";
                    e.target.style.borderColor = "#D1D5DB";
                  }}
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
              <div className="flex gap-2 shrink-0">
                {categoryOptions.map((cat) => {
                  const active = categoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer border"
                      style={
                        active
                          ? {
                              backgroundColor: C.accent,
                              borderColor: C.accent,
                              color: "#fff",
                            }
                          : {
                              backgroundColor: "#fff",
                              borderColor: "#D1D5DB",
                              color: "#142947",
                            }
                      }
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Sales Table — red header like Inventory */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-red-900 text-white">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                        PRODUCT
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide">
                        CATEGORY
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-sm inline-block"
                            style={{ backgroundColor: C.shopee }}
                          />
                          SHOPEE
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-sm inline-block"
                            style={{ backgroundColor: C.lazada }}
                          />
                          LAZADA
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-sm inline-block"
                            style={{ backgroundColor: C.tiktok }}
                          />
                          TIKTOK
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        TOTAL SOLD
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        IN STOCK
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold tracking-wide">
                        REVENUE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProductTable.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-14 text-center text-gray-400"
                        >
                          <p className="text-sm font-medium text-gray-500">
                            No products found
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Try a different search term or category.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      sortedProductTable.map((p, idx) => {
                        const lowStock = p.stock !== null && p.stock <= 5;
                        const rowBg =
                          idx % 2 === 0 ? {} : { backgroundColor: "#FAFAFA" };
                        return (
                          <tr
                            key={p.id}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            style={
                              lowStock
                                ? { backgroundColor: C.accentSoft }
                                : rowBg
                            }
                          >
                            <td className="px-3 py-2 text-xs text-gray-800 font-medium">
                              {p.name}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {p.category}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {fmt(p.shopee)}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {fmt(p.lazada)}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {fmt(p.tiktok)}
                            </td>
                            <td
                              className="px-3 py-2 text-center text-xs font-semibold"
                              style={{ color: C.accent }}
                            >
                              {fmt(p.total)}
                            </td>
                            <td className="px-3 py-2 text-center text-xs">
                              {p.stock !== null ? (
                                <span
                                  className={
                                    lowStock
                                      ? "inline-flex items-center gap-1 font-medium"
                                      : "text-gray-600"
                                  }
                                  style={
                                    lowStock ? { color: C.warning } : undefined
                                  }
                                >
                                  {fmt(p.stock)}
                                  {lowStock && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                      style={{
                                        color: C.accent,
                                        backgroundColor: "#fff",
                                        border: `1px solid ${C.accentSoftBorder}`,
                                      }}
                                    >
                                      Low
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-600">
                              {fmtPHP(p.revenue)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Marketing_io;