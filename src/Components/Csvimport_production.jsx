import { useState, useCallback } from "react";
import { parseProductionCSV } from "../lib/csv-parser-production";
import { supabase } from "../api/supabase";

const PLATFORM_STYLES = {
  shopee: { dot: "bg-red-500", label: "Shopee" },
  lazada: { dot: "bg-indigo-700", label: "Lazada" },
  tiktok: { dot: "bg-gray-900", label: "TikTok Shop" },
};

async function hashFile(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function extractDateRange(orders) {
  const dates = orders
    .map((o) => o.created_at || o.paid_time)
    .filter(Boolean)
    .map((d) => {
      const cleaned = d.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
      const parsed = new Date(cleaned);
      return isNaN(parsed) ? null : parsed;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) return { dateFrom: null, dateTo: null };
  return {
    dateFrom: dates[0].toISOString().split("T")[0],
    dateTo: dates[dates.length - 1].toISOString().split("T")[0],
  };
}

// Required headers per platform (verified against real exports)
const REQUIRED_HEADERS = {
  shopee: ["Order ID", "Order Status", "Username (Buyer)", "Grand Total"],
  lazada: ["orderItemId", "orderNumber", "status", "paidPrice"],
  tiktok: ["Order ID", "Order Status", "SKU ID", "Order Amount"],
};

function validateHeaders(headers, platform) {
  return (REQUIRED_HEADERS[platform] || []).filter((h) => !headers.includes(h));
}

// ─── Duplicate detection helpers ────────────────────────────────────────────
// The real source of truth for "have we imported this already?" is
// production_orders, not production_import_logs. Log rows can be missing for
// all sorts of reasons (insert silently rejected, RLS, schema drift), and when
// they are, a log-based check never fires. Order IDs are always there if the
// import actually happened.

// Supabase caps how much you can cram into a single .in() filter, so chunk.
async function fetchExistingOrderIds(platform, orderIds) {
  const found = new Set();
  const CHUNK = 200;

  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("production_orders")
      .select("order_id")
      .eq("platform", platform)
      .in("order_id", chunk);

    if (error) throw error;
    (data || []).forEach((r) => found.add(String(r.order_id)));
  }

  return found;
}

// Secondary signal only — nice for the message, never the thing we rely on.
async function findPriorImportByHash(platform, hash) {
  const { data, error } = await supabase
    .from("production_import_logs")
    .select("filename, created_at, inserted")
    .eq("platform", platform)
    .eq("file_hash", hash)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("production_import_logs lookup failed:", error);
    return null;
  }
  return data?.length ? data[0] : null;
}

export default function Csvimport_production({ onImportComplete }) {
  const [step, setStep] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileHash, setFileHash] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFile = useCallback(async (file) => {
    setError(null);
    setWarning(null);
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError(
        "Invalid file type. Please upload a .csv or .xlsx file exported from Shopee, Lazada, or TikTok Shop.",
      );
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File too large (max 20 MB).");
      return;
    }

    try {
      let text;
      if (ext === "csv") {
        text = await file.text();
      } else {
        const XLSX =
          await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(ws);
      }

      // parseProductionCSV already filters to READY_TO_SHIP only
      const result = parseProductionCSV(text);
      if (result.error) {
        setError(result.error);
        return;
      }

      const firstLine = text.split("\n")[0];
      const rawHeaders = firstLine
        .split(",")
        .map((h) => h.replace(/"/g, "").trim());
      const missingHdrs = validateHeaders(rawHeaders, result.platform);
      if (missingHdrs.length) {
        setError(
          `Missing required columns: ${missingHdrs.join(", ")}. ` +
            `Please export directly from ${PLATFORM_STYLES[result.platform]?.label} Seller Center.`,
        );
        return;
      }

      if (result.orders.length === 0) {
        const skipped = result.allOrderCount || result.rowCount;
        setError(
          `No READY TO SHIP orders found in this file. ` +
            `Found ${skipped} order(s) with other statuses — ` +
            `only orders ready to hand off to a courier are imported here.`,
        );
        return;
      }

      const hash = await hashFile(text);
      setFileHash(hash);
      const range = extractDateRange(result.orders);
      setDateRange(range);

      // ── Duplicate check ─────────────────────────────────────────────────
      // Primary check is against production_orders: if every order in this
      // file is already sitting in the prep queue, the file has been imported
      // before, regardless of what (if anything) the log table says.
      const orderIds = [
        ...new Set(
          result.orders.map((o) => String(o.order_id || "")).filter(Boolean),
        ),
      ];

      let existingIds = null;
      try {
        existingIds = await fetchExistingOrderIds(result.platform, orderIds);
      } catch (e) {
        // Fail open — a broken lookup shouldn't block a real import.
        console.error("Duplicate check against production_orders failed:", e);
      }

      if (existingIds && existingIds.size > 0) {
        const alreadyIn = orderIds.filter((id) => existingIds.has(id));

        if (alreadyIn.length === orderIds.length) {
          // Every order already imported → block.
          const prior = await findPriorImportByHash(result.platform, hash);
          const when = prior?.created_at
            ? ` (last imported ${new Date(prior.created_at).toLocaleString()}${
                prior.filename ? ` as "${prior.filename}"` : ""
              })`
            : "";
          const message =
            `All ${orderIds.length} order(s) in this file are already in the ` +
            `prep queue${when}. Nothing new to import.`;

          setError(`🚫 Duplicate file detected. ${message}`);

          const { error: logErr } = await supabase
            .from("production_import_logs")
            .insert({
              platform: result.platform,
              filename: file.name,
              file_hash: hash,
              date_from: range.dateFrom,
              date_to: range.dateTo,
              row_count: result.rowCount,
              parsed_count: result.parsedCount,
              inserted: 0,
              skipped: 0,
              status: "rejected",
              reject_reason: message,
            });
          if (logErr) console.warn("Could not write rejected log:", logErr);

          return;
        }

        // Partial overlap → let it through, but say so. Re-importing these
        // updates the existing rows rather than creating new ones.
        setWarning(
          `${alreadyIn.length} of ${orderIds.length} order(s) in this file are ` +
            `already in the prep queue and will be updated, not duplicated. ` +
            `${orderIds.length - alreadyIn.length} order(s) are new.`,
        );
      }

      if (!range.dateFrom) {
        setWarning(
          "Could not detect order dates. Duplicate date checking is disabled for this import.",
        );
      }

      setParsed({ ...result, filename: file.name });
      setStep("preview");
    } catch (e) {
      setError("Failed to read file: " + e.message);
    }
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile],
  );

  const importToSupabase = async () => {
    setStep("importing");
    setProgress({ current: 0, total: parsed.orders.length });

    let inserted = 0,
      skipped = 0;
    const errors = [];
    const unmatchedProducts = [];
    const stockBlocked = [];
    let productSummary = [];

    // ── Preload current stock for this platform, once ──────────────────────
    // A CSV import is always one platform, so we only need that platform's
    // stock column. We decrement a local copy as orders are processed so two
    // orders in the same file competing for the last few units are gated
    // against each other, not just against the DB's stale snapshot.
    const stockField = `${parsed.platform}_stock`;
    const { data: stockRows, error: stockErr } = await supabase
      .from("inventory")
      .select(`product_name, ${stockField}`);

    if (stockErr) {
      console.error(
        "Failed to load inventory stock for availability check:",
        stockErr,
      );
    }

    const availableStock = {};
    (stockRows || []).forEach((row) => {
      availableStock[row.product_name] = row[stockField] ?? 0;
    });

    // ── Pass 1: filter/validate in memory, no network calls ────────────────
    // This is the part that used to interleave DB round trips with the
    // validation logic. Splitting it out means the DB work below only ever
    // touches orders that actually need writing.
    const toImport = [];

    for (const order of parsed.orders) {
      if (order.status !== "READY_TO_SHIP") {
        skipped++;
        continue;
      }

      const platform = order.platform || parsed.platform;
      if (!platform) {
        console.error(
          "MISSING PLATFORM — full order object:",
          JSON.stringify(order, null, 2),
        );
        console.error("parsed.platform was:", parsed.platform);
        errors.push(`${order.order_id}: missing platform, skipped`);
        skipped++;
        continue;
      }

      // ── Stock availability check ────────────────────────────────────────
      // Only blocks on items we actually found in Inventory but don't have
      // enough of. Items with no matching product at all are left alone here
      // — that's the existing `unmatched` case, still handled after insert by
      // the deduct_inventory_for_production_order RPC below.
      const shortages = (order.items || [])
        .filter(
          (item) =>
            item.product_name &&
            availableStock[item.product_name] !== undefined,
        )
        .filter((item) => availableStock[item.product_name] < item.quantity)
        .map(
          (item) =>
            `"${item.product_name}" — ${availableStock[item.product_name]} in stock, order needs ${item.quantity}`,
        );

      if (shortages.length > 0) {
        stockBlocked.push(`${order.order_id}: ${shortages.join("; ")}`);
        skipped++;
        continue;
      }

      // Reserve stock locally so later orders in this same file see the
      // reduced quantity, before anything is actually written to the DB.
      (order.items || []).forEach((item) => {
        if (
          item.product_name &&
          availableStock[item.product_name] !== undefined
        ) {
          availableStock[item.product_name] -= item.quantity;
        }
      });

      toImport.push({ ...order, platform });
    }

    setProgress({ current: 0, total: toImport.length || 1 });

    // ── Pass 2: one batched upsert for every order, instead of one per row ──
    let orderRows = [];
    if (toImport.length > 0) {
      const { data, error: upsertErr } = await supabase
        .from("production_orders")
        .upsert(
          toImport.map((order) => ({
            platform: order.platform,
            order_id: order.order_id,
            status: order.status,
            tracking_no: order.tracking_no,
            shipping_option: order.shipping_option,
            payment_method: order.payment_method,
            total_amount: order.total_amount,
            shipping_fee: order.shipping_fee,
            buyer_username: order.buyer_username,
            recipient_name: order.recipient_name,
            phone: order.phone,
            address: order.address,
            created_at: order.created_at,
            paid_time: order.paid_time,
            cancel_reason: order.cancel_reason,
            buyer_note: order.buyer_note,
            shipped_at: null,
          })),
          { onConflict: "platform,order_id" },
        )
        .select();

      if (upsertErr) {
        console.error("BATCH UPSERT FAILED:", upsertErr);
        errors.push(`Batch order upsert failed: ${upsertErr.message}`);
        skipped += toImport.length;
      } else {
        orderRows = data || [];
      }
    }

    setProgress({ current: Math.round(orderRows.length / 2), total: toImport.length || 1 });

    if (orderRows.length > 0) {
      const uuidByKey = {};
      orderRows.forEach((r) => {
        uuidByKey[`${r.platform}:${r.order_id}`] = r.id;
      });

      // ── Pass 3: one batched delete + one batched insert for all items ────
      // Grouped by platform since delete/insert both filter on it; in
      // practice this file is always a single platform, so it's one round
      // trip each in the common case.
      const idsByPlatform = {};
      toImport.forEach((o) => {
        (idsByPlatform[o.platform] ||= []).push(o.order_id);
      });

      for (const [platform, orderIds] of Object.entries(idsByPlatform)) {
        const { error: delErr } = await supabase
          .from("production_order_items")
          .delete()
          .eq("platform", platform)
          .in("order_id", orderIds);
        if (delErr) {
          console.error("Batch item delete failed:", delErr);
          errors.push(`Item cleanup failed for ${platform}: ${delErr.message}`);
        }
      }

      const itemsToInsert = [];
      // Aggregated per product name: how many units total, and across how
      // many orders — only counting orders that actually made it into this
      // batch (i.e. have a uuid), so this matches what was really imported.
      const productTotals = {};
      toImport.forEach((order) => {
        const uuid = uuidByKey[`${order.platform}:${order.order_id}`];
        if (!uuid || !order.items?.length) return;
        order.items.forEach((item) => {
          itemsToInsert.push({
            order_uuid: uuid,
            platform: order.platform,
            order_id: order.order_id,
            product_name: item.product_name,
            sku: item.sku,
            variation: item.variation,
            quantity: item.quantity,
            unit_price: item.unit_price,
            original_price: item.original_price || item.unit_price,
            platform_disc: item.platform_disc || 0,
            seller_disc: item.seller_disc || 0,
          });

          if (item.product_name) {
            if (!productTotals[item.product_name]) {
              productTotals[item.product_name] = {
                quantity: 0,
                orderIds: new Set(),
              };
            }
            productTotals[item.product_name].quantity += item.quantity || 0;
            productTotals[item.product_name].orderIds.add(order.order_id);
          }
        });
      });

      productSummary = Object.entries(productTotals)
        .map(([name, t]) => ({
          name,
          quantity: t.quantity,
          orderCount: t.orderIds.size,
        }))
        .sort((a, b) => b.quantity - a.quantity);

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from("production_order_items")
          .insert(itemsToInsert);
        if (itemsErr) {
          console.error("Batch item insert failed:", itemsErr);
          errors.push(`Batch item insert failed: ${itemsErr.message}`);
        }
      }

      // ── Pass 4: inventory deduction RPC, fired in parallel ────────────────
      // No batch RPC exists for this on the DB side, so it's still one call
      // per order — but running them concurrently instead of awaiting each
      // one inside the old loop turns N sequential round trips into roughly
      // one round-trip's worth of wall-clock time.
      const deductResults = await Promise.all(
        orderRows.map(async (row) => {
          try {
            const { data: deductResult, error: deductErr } = await supabase.rpc(
              "deduct_inventory_for_production_order",
              { p_order_uuid: row.id, p_platform: row.platform },
            );
            return { row, deductResult, deductErr };
          } catch (e) {
            return { row, deductErr: e };
          }
        }),
      );

      deductResults.forEach(({ row, deductResult, deductErr }) => {
        if (deductErr) {
          errors.push(
            `${row.order_id}: inventory deduction failed — ${deductErr.message}`,
          );
        } else if (deductResult?.unmatched?.length) {
          unmatchedProducts.push(
            ...deductResult.unmatched.map((name) => `${row.order_id}: ${name}`),
          );
        }
      });

      inserted = orderRows.length;
    }

    setProgress({ current: toImport.length, total: toImport.length || 1 });

    // Surface log-write failures instead of swallowing them — a silently
    // rejected insert here is what makes hash-based duplicate checks useless.
    const { error: logErr } = await supabase
      .from("production_import_logs")
      .insert({
        platform: parsed.platform,
        filename: parsed.filename,
        file_hash: fileHash,
        date_from: dateRange?.dateFrom || null,
        date_to: dateRange?.dateTo || null,
        row_count: parsed.rowCount,
        parsed_count: parsed.parsedCount,
        inserted,
        skipped,
        errors: errors.length ? errors : null,
        status: "success",
      });
    if (logErr) console.warn("Could not write import log:", logErr);

    setImportResult({
      inserted,
      skipped,
      errors,
      unmatchedProducts,
      stockBlocked,
      productSummary,
      dateRange,
    });
    setStep("done");
    if (onImportComplete) onImportComplete();
  };

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setFileHash(null);
    setDateRange(null);
    setImportResult(null);
    setError(null);
    setWarning(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Import Orders </h2>
      </div>

      {/* ── UPLOAD ── */}
      {step === "upload" && (
        <div>
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() =>
              document.getElementById("production-csv-input").click()
            }
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
              ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
          >
            <div className="text-5xl mb-3"></div>
            <p className="font-semibold text-gray-700 text-base">
              Import CSV or Excel file here
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Shopee (.csv / .xlsx) · Lazada (.csv / .xlsx) · TikTok Shop (.csv
              / .xlsx)
            </p>
            <input
              id="production-csv-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm leading-relaxed">
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === "preview" && parsed && (
        <div>
          <div className="mb-4 p-3 bg-green-50 border border-green-300 rounded-lg flex items-center gap-2">
            <p className="text-green-800 text-sm font-medium">
              Ready to Ship orders:
            </p>
          </div>

          {warning && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-sm">
              {warning}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Platform">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${PLATFORM_STYLES[parsed.platform]?.dot}`}
                />
                <span className="font-bold text-gray-800">
                  {PLATFORM_STYLES[parsed.platform]?.label}
                </span>
              </div>
            </StatCard>
            <StatCard label="Ready to Ship">
              <span className="text-2xl font-bold text-green-600">
                {parsed.summary.total_orders}
              </span>
            </StatCard>
            <StatCard label="Total Amount">
              <span className="text-lg font-bold text-gray-800">
                {parsed.summary.total_amount}
              </span>
            </StatCard>
            <StatCard label="Date Range">
              <span className="text-sm font-semibold text-gray-800">
                {dateRange?.dateFrom
                  ? `${dateRange.dateFrom} → ${dateRange.dateTo}`
                  : "Unknown"}
              </span>
            </StatCard>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Stock availability is checked when you click import below — any
            order whose product is out of stock in Inventory will be skipped and
            listed afterward.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200 mb-5">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Order ID",
                    "Recipient",
                    "Products",
                    "Total (PHP)",
                    "Date",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.orders.map((o, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {o.order_id}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {o.recipient_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {o.items.length > 0
                        ? o.items
                            .map(
                              (item) =>
                                `${item.product_name}${
                                  item.quantity > 1 ? ` ×${item.quantity}` : ""
                                }`,
                            )
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {(o.total_amount / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {(o.created_at || o.paid_time || "—").split(" ")[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={importToSupabase}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Import {parsed.summary.total_orders} orders to prepare
            </button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {step === "importing" && (
        <div className="text-center py-16">
          <div className="mx-auto mb-6 w-12 h-12 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-lg font-semibold text-gray-800 mb-2">
            Importing orders…
          </p>
          <p className="text-gray-500 text-sm">
            This may take a moment, please don't close this tab.
          </p>
        </div>
      )}

      {/* ── DONE ── */}
      {step === "done" && importResult && (
        <div>
          <div className="text-center p-8 bg-green-50 border border-green-200 rounded-xl mb-5">
            <div className="text-5xl mb-3"></div>
            <h3 className="text-lg font-bold text-green-700">
              Import Complete
            </h3>
            {importResult.dateRange?.dateFrom && (
              <p className="text-green-600 text-sm mt-1">
                {importResult.dateRange.dateFrom} →{" "}
                {importResult.dateRange.dateTo}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard label="Imported">
              <span className="text-2xl font-bold text-green-600">
                {importResult.inserted}
              </span>
            </StatCard>
            <StatCard label="Blocked — Out of Stock">
              <span className="text-2xl font-bold text-red-600">
                {importResult.stockBlocked?.length || 0}
              </span>
            </StatCard>
            <StatCard label="Skipped (total)">
              <span className="text-2xl font-bold text-amber-500">
                {importResult.skipped}
              </span>
            </StatCard>
          </div>

          {importResult.productSummary?.length > 0 && (
            <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
              <p className="font-semibold text-gray-700 text-sm px-4 py-3 bg-gray-50 border-b border-gray-200">
                Products Ordered ({importResult.productSummary.length})
              </p>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {importResult.productSummary.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-100 last:border-b-0"
                      >
                        <td className="px-4 py-2 text-gray-700">{p.name}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                          {p.orderCount} order{p.orderCount === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">
                          ×{p.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importResult.stockBlocked?.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="font-semibold text-red-700 text-sm mb-2">
                Blocked — product out of stock in Inventory (
                {importResult.stockBlocked.length})
              </p>
              <p className="text-xs text-red-500 mb-2">
                These orders were not imported. Restock the product in
                Inventory, then re-import this file — already-imported orders
                won't be duplicated.
              </p>
              {importResult.stockBlocked.map((s, i) => (
                <p key={i} className="text-xs text-red-600 mt-1">
                  • {s}
                </p>
              ))}
            </div>
          )}

          {importResult.unmatchedProducts?.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="font-semibold text-amber-700 text-sm mb-2">
                Products not found in Inventory (
                {importResult.unmatchedProducts.length})
              </p>
              {importResult.unmatchedProducts.map((p, i) => (
                <p key={i} className="text-xs text-amber-600 mt-1">
                  • {p}
                </p>
              ))}
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="font-semibold text-red-600 text-sm mb-2">
                Errors ({importResult.errors.length})
              </p>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-500 mt-1">
                  • {e}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={reset}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, children }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}