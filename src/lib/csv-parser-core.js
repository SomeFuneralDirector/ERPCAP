// Shared parser for Shopee / Lazada / TikTok order exports.
// Sales and Production both use this; they differ only in the options passed
// to createParser() (see csvParser.js and csvParser_production.js).

export const COLUMN_MAPS = {
  shopee: {
    order_id:        "Order ID",
    status:          "Order Status",
    tracking_no:     "Tracking Number*",
    shipping_option: "Shipping Option",
    created_at:      "Order Creation Date",
    paid_time:       "Order Paid Time",
    completed_at:    "Order Complete Time",
    buyer_username:  "Username (Buyer)",
    recipient_name:  "Receiver Name",
    phone:           "Phone Number",
    address:         "Delivery Address",
    town:            "Town",
    city:            "City",
    province:        "Province",
    zip:             "Zip Code",
    product_name:    "Product Name",
    sku:             "SKU Reference No.",
    variation:       "Variation Name",
    original_price:  "Original Price",
    deal_price:      "Deal Price",
    quantity:        "Quantity",
    total_payment:   "Total Buyer Payment",
    grand_total:     "Grand Total",
    shipping_fee:    "Buyer Paid Shipping Fee",
    buyer_note:      "Remark from buyer",
  },

  lazada: {
    order_item_id:   "orderItemId",
    order_id:        "orderNumber",
    lazada_id:       "lazadaId",
    sku:             "sellerSku",
    platform_sku:    "lazadaSku",
    warehouse:       "wareHouse",
    created_at:      "createTime",
    updated_at:      "updateTime",
    delivered_at:    "deliveredDate",
    customer_name:   "customerName",
    customer_email:  "customerEmail",
    recipient_name:  "shippingName",
    address:         "shippingAddress",
    address2:        "shippingAddress2",
    address3:        "shippingAddress3",
    address4:        "shippingAddress4",
    address5:        "shippingAddress5",
    phone:           "shippingPhone",
    city:            "shippingCity",
    zip:             "shippingPostCode",
    province:        "shippingRegion",
    payment_method:  "payMethod",
    total_amount:    "paidPrice",
    unit_price:      "unitPrice",
    seller_discount: "sellerDiscountTotal",
    shipping_fee:    "shippingFee",
    wallet_credit:   "walletCredit",
    product_name:    "itemName",
    variation:       "variation",
    shipping_option: "shippingProvider",
    tracking_no:     "trackingCode",
    status:          "status",
    refund_amount:   "refundAmount",
    bundle_discount: "bundleDiscount",
    seller_note:     "sellerNote",
  },

  tiktok: {
    order_id:        "Order ID",
    status:          "Order Status",
    product_name:    "Product Name",
    sku:             "SKU ID",
    variation:       "SKU Name",
    quantity:        "Quantity",
    unit_price:      "SKU Unit Original Price",
    platform_disc:   "SKU Platform Discount",
    seller_disc:     "SKU Seller Discount",
    subtotal:        "SKU Subtotal After Discount",
    shipping_fee:    "Shipping Fee After Discount",
    total_amount:    "Order Amount",
    buyer_username:  "Buyer Username",
    recipient_name:  "Recipient",
    phone:           "Phone #",
    address:         "Detailed address",
    province:        "Province",
    city:            "City",
    zip:             "Zip Code",
    tracking_no:     "Tracking ID",
    shipping_option: "Shipping Provider Name",
    paid_time:       "Paid Time",
    created_at:      "Create Time",
    cancel_reason:   "Cancel Reason",
    buyer_note:      "Buyer Note",
  },
};

// One status table for the whole app. The only per-module difference is
// passed in as `statusOverrides` (Sales treats Lazada "delivered" as COMPLETED).
const BASE_STATUS_MAP = {
  // Shopee
  "completed":              "COMPLETED",
  "to receive":             "DELIVERED",
  "shipped":                "SHIPPED",
  "to ship":                "READY_TO_SHIP",
  "ready to ship":          "READY_TO_SHIP",
  "to be shipped":          "READY_TO_SHIP",
  "ready_to_ship":          "READY_TO_SHIP",
  "cancelled":              "CANCELLED",
  "unpaid":                 "UNPAID",
  "pending":                "PENDING",
  "processing":             "PROCESSING",
  // Lazada
  "delivered":              "DELIVERED",
  "lost by third party":    "CANCELLED",
  "returned":               "CANCELLED",
  "failed delivery":        "CANCELLED",
  "shipped by 3pl":         "SHIPPED",
  "in transit":             "SHIPPED",
  "pending collection":     "READY_TO_SHIP",
  "packed":                 "READY_TO_SHIP",
  // TikTok (common labels — verify against your actual export)
  "awaiting shipment":      "READY_TO_SHIP",
  "awaiting collection":    "READY_TO_SHIP",
  "on hold":                "ON_HOLD",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function parsePrice(val) {
  if (val === undefined || val === null || val === "") return 0;
  const cleaned = String(val).replace(/[₱,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

export function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

function get(row, key) {
  if (key === undefined || key === null) return "";
  return row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : "";
}

export function detectPlatform(headers) {
  const h = headers.map(x => (x || "").toLowerCase().trim());
  if (h.includes("orderitemid")) return "lazada";
  if (h.includes("order id") && h.includes("sku id") && h.includes("buyer username")) return "tiktok";
  if (h.includes("order id") && h.includes("shipping provider name")) return "tiktok";
  if (h.includes("order id") && h.includes("username (buyer)")) return "shopee";
  if (h.includes("order id") && h.includes("receiver name")) return "shopee";
  return null;
}

// ─── CSV reader ──────────────────────────────────────────────────────────────
// Reads the whole text as one stream so line breaks inside quoted fields
// (addresses, buyer notes) stay inside their field, and strips the BOM that
// Excel adds to the start of saved CSVs.
function parseCSVRecords(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(field.trim());
    field = "";
    if (row.some(v => v !== "")) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  endRow();
  return records;
}

function parseCSVText(csvText) {
  const records = parseCSVRecords(csvText);
  if (records.length < 2) return { headers: [], rows: [] };

  const headers = records[0];
  const rows = records.slice(1).map(values => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : "";
    });
    return row;
  });
  return { headers, rows };
}

// ─── Factory ─────────────────────────────────────────────────────────────────
/**
 * options:
 *  targetStatus     – normalized status to import (e.g. "COMPLETED", "READY_TO_SHIP")
 *  statusOverrides  – { "raw lowercase status": "NORMALIZED" } applied over the base map
 *  keepCompletedAt  – keep completed/delivered timestamps (Sales) or null them (Production)
 *  includeShippedAt – add a shipped_at: null field to each order (Production)
 */
export function createParser({
  targetStatus,
  statusOverrides = {},
  keepCompletedAt = true,
  includeShippedAt = false,
}) {
  const STATUS_MAP = { ...BASE_STATUS_MAP, ...statusOverrides };

  function normalizeStatus(raw = "") {
    const key = String(raw).toLowerCase().trim();
    return STATUS_MAP[key] || String(raw).toUpperCase().trim().replace(/\s+/g, "_");
  }

  // Adds an item to an order. Identical lines (same SKU/product/variation)
  // are merged by quantity — Lazada exports one row per unit.
  function addItem(order, item) {
    const existing = order.items.find(
      i => i.sku === item.sku && i.product_name === item.product_name && i.variation === item.variation
    );
    if (existing) {
      existing.quantity += item.quantity;
      existing.seller_disc += item.seller_disc;
      existing.platform_disc += item.platform_disc;
    } else {
      order.items.push(item);
    }
  }

  // ── Shopee: order-level fields repeat on every row, take them once ──
  function parseShopee(rows) {
    const map = COLUMN_MAPS.shopee;
    const byId = {};

    for (const row of rows) {
      const orderId = get(row, map.order_id);
      if (!orderId) continue;
      if (normalizeStatus(get(row, map.status)) !== targetStatus) continue;

      if (!byId[orderId]) {
        byId[orderId] = {
          platform:        "shopee",
          order_id:        orderId,
          status:          targetStatus,
          tracking_no:     get(row, map.tracking_no) || null,
          shipping_option: get(row, map.shipping_option) || null,
          payment_method:  null,
          total_amount:    parsePrice(get(row, map.grand_total) || get(row, map.total_payment)),
          shipping_fee:    parsePrice(get(row, map.shipping_fee)),
          buyer_username:  get(row, map.buyer_username) || null,
          recipient_name:  get(row, map.recipient_name) || null,
          phone:           get(row, map.phone) || null,
          address: [
            get(row, map.address), get(row, map.town), get(row, map.city),
            get(row, map.province), get(row, map.zip),
          ].filter(Boolean).join(", "),
          created_at:    get(row, map.created_at) || null,
          paid_time:     get(row, map.paid_time) || null,
          completed_at:  get(row, map.completed_at) || null,
          buyer_note:    get(row, map.buyer_note) || null,
          cancel_reason: null,
          items: [],
        };
      }

      const productName = get(row, map.product_name);
      if (productName) {
        addItem(byId[orderId], {
          product_name:   productName,
          sku:            get(row, map.sku) || null,
          variation:      get(row, map.variation) || null,
          quantity:       parseInt(get(row, map.quantity)) || 1,
          unit_price:     parsePrice(get(row, map.deal_price) || get(row, map.original_price)),
          original_price: parsePrice(get(row, map.original_price)),
          platform_disc:  0,
          seller_disc:    0,
        });
      }
    }
    return Object.values(byId);
  }

  // ── Lazada: one row per unit. Group rows into orders; paidPrice,
  // shippingFee and seller discount are per-row, so they are summed. ──
  function parseLazada(rows) {
    const map = COLUMN_MAPS.lazada;
    const byId = {};

    for (const row of rows) {
      const orderId = get(row, map.order_id);
      if (!orderId) continue;
      if (normalizeStatus(get(row, map.status)) !== targetStatus) continue;

      if (!byId[orderId]) {
        byId[orderId] = {
          platform:        "lazada",
          order_id:        orderId,
          order_item_id:   get(row, map.order_item_id),
          status:          targetStatus,
          tracking_no:     get(row, map.tracking_no) || null,
          shipping_option: get(row, map.shipping_option) || null,
          payment_method:  get(row, map.payment_method) || null,
          total_amount:    0,
          unit_price:      parsePrice(get(row, map.unit_price)),
          shipping_fee:    0,
          discount:        0,
          recipient_name:  get(row, map.recipient_name) || get(row, map.customer_name) || null,
          phone:           get(row, map.phone) || null,
          address: [
            get(row, map.address), get(row, map.address2), get(row, map.address3),
            get(row, map.address4), get(row, map.address5), get(row, map.city),
            get(row, map.province), get(row, map.zip),
          ].filter(Boolean).join(", "),
          created_at:    get(row, map.created_at) || null,
          paid_time:     null,
          completed_at:  get(row, map.delivered_at) || null,
          cancel_reason: null,
          buyer_note:    get(row, map.seller_note) || null,
          items: [],
        };
      }

      const order = byId[orderId];
      order.total_amount += parsePrice(get(row, map.total_amount));
      order.shipping_fee += parsePrice(get(row, map.shipping_fee));
      order.discount     += parsePrice(get(row, map.seller_discount));

      addItem(order, {
        product_name:   get(row, map.product_name),
        sku:            get(row, map.sku) || null,
        variation:      get(row, map.variation) || null,
        quantity:       1,
        unit_price:     parsePrice(get(row, map.unit_price)),
        original_price: parsePrice(get(row, map.unit_price)),
        platform_disc:  0,
        seller_disc:    parsePrice(get(row, map.seller_discount)),
      });
    }
    return Object.values(byId);
  }

  // ── TikTok: one row per SKU. "Order Amount" and shipping repeat on every
  // row, so they are taken once (first row) to avoid double counting. ──
  function parseTikTok(rows) {
    const map = COLUMN_MAPS.tiktok;
    const byId = {};

    for (const row of rows) {
      const orderId = get(row, map.order_id);
      if (!orderId) continue;
      if (normalizeStatus(get(row, map.status)) !== targetStatus) continue;

      if (!byId[orderId]) {
        byId[orderId] = {
          platform:        "tiktok",
          order_id:        orderId,
          status:          targetStatus,
          tracking_no:     get(row, map.tracking_no) || null,
          shipping_option: get(row, map.shipping_option) || null,
          payment_method:  null,
          total_amount:    parsePrice(get(row, map.total_amount)),
          shipping_fee:    parsePrice(get(row, map.shipping_fee)),
          buyer_username:  get(row, map.buyer_username) || null,
          recipient_name:  get(row, map.recipient_name) || null,
          phone:           get(row, map.phone) || null,
          address: [
            get(row, map.address), get(row, map.city),
            get(row, map.province), get(row, map.zip),
          ].filter(Boolean).join(", "),
          created_at:    get(row, map.created_at) || null,
          paid_time:     get(row, map.paid_time) || null,
          completed_at:  null,
          cancel_reason: get(row, map.cancel_reason) || null,
          buyer_note:    get(row, map.buyer_note) || null,
          items: [],
        };
      }

      addItem(byId[orderId], {
        product_name:   get(row, map.product_name),
        sku:            get(row, map.sku) || null,
        variation:      get(row, map.variation) || null,
        quantity:       parseInt(get(row, map.quantity)) || 1,
        unit_price:     parsePrice(get(row, map.unit_price)),
        original_price: parsePrice(get(row, map.unit_price)),
        platform_disc:  parsePrice(get(row, map.platform_disc)),
        seller_disc:    parsePrice(get(row, map.seller_disc)),
      });
    }
    return Object.values(byId);
  }

  function computeSummary(orders) {
    const total = orders.reduce((s, o) => s + o.total_amount, 0);
    const byStatus = {};
    for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    return {
      total_orders: orders.length,
      total_amount: `PHP ${formatPrice(total)}`,
      total_items:  orders.reduce((s, o) => s + o.items.length, 0),
      by_status:    byStatus,
    };
  }

  // Counts distinct orders per status across the WHOLE file, and lists raw
  // status labels the app doesn't recognise, so nothing is skipped silently.
  function analyseStatuses(rows, platform) {
    const map = COLUMN_MAPS[platform];
    const ordersByStatus = {};   // normalized -> Set(order ids)
    const unknown = {};          // raw -> Set(order ids)
    const allIds = new Set();

    for (const row of rows) {
      const orderId = get(row, map.order_id);
      if (!orderId) continue;
      allIds.add(orderId);

      const raw = get(row, map.status);
      const normalized = normalizeStatus(raw);
      (ordersByStatus[normalized] ||= new Set()).add(orderId);

      if (raw && !STATUS_MAP[raw.toLowerCase().trim()]) {
        (unknown[raw] ||= new Set()).add(orderId);
      }
    }

    return {
      allOrderCount: allIds.size,
      statusBreakdown: Object.fromEntries(
        Object.entries(ordersByStatus).map(([k, v]) => [k, v.size])
      ),
      unrecognizedStatuses: Object.entries(unknown).map(([raw, ids]) => ({ raw, count: ids.size })),
    };
  }

  // Works on already-parsed rows ({ "Column Header": value }), so XLSX files
  // converted with SheetJS (XLSX.utils.sheet_to_json) can use the same path.
  function parseRows(headers, rows, platformHint = null) {
    if (!rows || rows.length === 0) return { error: "No data rows found in file" };

    const platform = platformHint || detectPlatform(headers);
    if (!platform) {
      return { error: "Cannot detect platform. Please ensure this is a Shopee, Lazada, or TikTok Shop export." };
    }

    const parsers = { shopee: parseShopee, lazada: parseLazada, tiktok: parseTikTok };
    let orders = parsers[platform](rows).filter(o => o.order_id);

    orders = orders.map(o => {
      const out = { ...o };
      if (!keepCompletedAt) out.completed_at = null;
      if (includeShippedAt) out.shipped_at = null;
      return out;
    });

    const { allOrderCount, statusBreakdown, unrecognizedStatuses } = analyseStatuses(rows, platform);

    return {
      platform,
      rowCount:        rows.length,
      allOrderCount,                                   // distinct orders in the file
      parsedCount:     orders.length,                  // orders matching targetStatus
      skippedCount:    allOrderCount - orders.length,  // orders with another status
      statusBreakdown,                                 // e.g. { COMPLETED: 40, CANCELLED: 3 }
      unrecognizedStatuses,                            // e.g. [{ raw: "Awaiting Pickup", count: 5 }]
      itemsWithoutSku: orders.reduce((s, o) => s + o.items.filter(i => !i.sku).length, 0),
      summary:         computeSummary(orders),
      orders,
    };
  }

  function parseCSV(csvText, platformHint = null) {
    if (!csvText || csvText.trim().length === 0) return { error: "File is empty" };
    const { headers, rows } = parseCSVText(csvText);
    if (rows.length === 0) return { error: "No data rows found in file" };
    return parseRows(headers, rows, platformHint);
  }

  // For XLSX: pass the array of row objects from sheet_to_json
  function parseSpreadsheetRows(rows, platformHint = null) {
    if (!rows || rows.length === 0) return { error: "No data rows found in file" };
    return parseRows(Object.keys(rows[0]), rows, platformHint);
  }

  return { parseCSV, parseSpreadsheetRows, normalizeStatus };
}