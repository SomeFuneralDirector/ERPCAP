// ─── Column Maps (verified against real export files) ────────────────────────
const COLUMN_MAPS = {
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

// ─── Status Normalizer ────────────────────────────────────────────────────────
const STATUS_MAP = {
  // Shopee statuses (exact from export)
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
  // Lazada statuses (exact from export)
  "delivered":              "DELIVERED",
  "lost by third party":    "CANCELLED",
  "returned":               "CANCELLED",
  "failed delivery":        "CANCELLED",
  "shipped by 3pl":         "SHIPPED",
  "in transit":             "SHIPPED",
  "pending collection":     "READY_TO_SHIP",
  "packed":                 "READY_TO_SHIP",
};

function normalizeStatus(raw = "") {
  return STATUS_MAP[raw.toLowerCase().trim()] || raw.toUpperCase().replace(/\s+/g, "_");
}

// ─── Only import completed orders ────────────────────────────────────────────
const COMPLETED_STATUS = "COMPLETED";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parsePrice(val) {
  if (val === undefined || val === null || val === "") return 0;
  const cleaned = String(val).replace(/[₱,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

function get(row, key) {
  if (key === undefined || key === null) return "";
  return row[key] !== undefined ? String(row[key]).trim() : "";
}

// ─── Auto-detect Platform ─────────────────────────────────────────────────────
function detectPlatform(headers) {
  const h = headers.map(x => (x || "").toLowerCase().trim());

  // Lazada: has orderItemId
  if (h.includes("orderitemid")) return "lazada";
  // TikTok: has Order ID + SKU ID + Buyer Username
  if (h.includes("order id") && h.includes("sku id") && h.includes("buyer username")) return "tiktok";
  if (h.includes("order id") && h.includes("shipping provider name")) return "tiktok";
  // Shopee: has Order ID + Username (Buyer)
  if (h.includes("order id") && h.includes("username (buyer)")) return "shopee";
  if (h.includes("order id") && h.includes("receiver name")) return "shopee";

  return null;
}

// ─── CSV Row Parser ───────────────────────────────────────────────────────────
function parseCSVText(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Shopee Parser ────────────────────────────────────────────────────────────
function parseShopeeOrders(rows) {
  const map = COLUMN_MAPS.shopee;
  const ordersMap = {};

  for (const row of rows) {
    const orderId = get(row, map.order_id);
    if (!orderId) continue;

    const status = normalizeStatus(get(row, map.status));

    // Only process COMPLETED orders
    if (status !== COMPLETED_STATUS) continue;

    if (!ordersMap[orderId]) {
      ordersMap[orderId] = {
        platform:        "shopee",
        order_id:        orderId,
        status,
        tracking_no:     get(row, map.tracking_no) || null,
        shipping_option: get(row, map.shipping_option) || null,
        payment_method:  null,
        total_amount:    parsePrice(get(row, map.grand_total) || get(row, map.total_payment)),
        shipping_fee:    parsePrice(get(row, map.shipping_fee)),
        buyer_username:  get(row, map.buyer_username) || null,
        recipient_name:  get(row, map.recipient_name) || null,
        phone:           get(row, map.phone) || null,
        address: [
          get(row, map.address),
          get(row, map.town),
          get(row, map.city),
          get(row, map.province),
          get(row, map.zip),
        ].filter(Boolean).join(", "),
        created_at:   get(row, map.created_at) || null,
        paid_time:    get(row, map.paid_time) || null,
        completed_at: get(row, map.completed_at) || null,
        buyer_note:   get(row, map.buyer_note) || null,
        cancel_reason: null,
        items: [],
      };
    }

    const productName = get(row, map.product_name);
    if (productName) {
      ordersMap[orderId].items.push({
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

  return Object.values(ordersMap);
}

// ─── Lazada Parser ────────────────────────────────────────────────────────────
function parseLazadaOrders(rows) {
  const map = COLUMN_MAPS.lazada;

  return rows
    .filter(row => {
      const status = normalizeStatus(get(row, map.status));
      return status === COMPLETED_STATUS;
    })
    .map(row => {
      const addressParts = [
        get(row, map.address),
        get(row, map.address2),
        get(row, map.address3),
        get(row, map.address4),
        get(row, map.address5),
        get(row, map.city),
        get(row, map.province),
        get(row, map.zip),
      ].filter(Boolean);

      return {
        platform:        "lazada",
        order_id:        get(row, map.order_id),
        order_item_id:   get(row, map.order_item_id),
        status:          normalizeStatus(get(row, map.status)),
        tracking_no:     get(row, map.tracking_no) || null,
        shipping_option: get(row, map.shipping_option) || null,
        payment_method:  get(row, map.payment_method) || null,
        total_amount:    parsePrice(get(row, map.total_amount)),
        unit_price:      parsePrice(get(row, map.unit_price)),
        shipping_fee:    parsePrice(get(row, map.shipping_fee)),
        discount:        parsePrice(get(row, map.seller_discount)),
        recipient_name:  get(row, map.recipient_name) || get(row, map.customer_name) || null,
        phone:           get(row, map.phone) || null,
        address:         addressParts.join(", "),
        created_at:      get(row, map.created_at) || null,
        paid_time:       null,
        completed_at:    get(row, map.delivered_at) || null,
        cancel_reason:   null,
        buyer_note:      get(row, map.seller_note) || null,
        items: [{
          product_name:   get(row, map.product_name),
          sku:            get(row, map.sku) || null,
          variation:      get(row, map.variation) || null,
          quantity:       1,
          unit_price:     parsePrice(get(row, map.unit_price)),
          original_price: parsePrice(get(row, map.unit_price)),
          platform_disc:  0,
          seller_disc:    parsePrice(get(row, map.seller_discount)),
        }],
      };
    })
    .filter(o => o.order_id);
}

// ─── TikTok Parser ────────────────────────────────────────────────────────────
function parseTikTokOrders(rows) {
  const map = COLUMN_MAPS.tiktok;

  return rows
    .filter(row => {
      const status = normalizeStatus(get(row, map.status));
      return status === COMPLETED_STATUS;
    })
    .map(row => ({
      platform:        "tiktok",
      order_id:        get(row, map.order_id),
      status:          normalizeStatus(get(row, map.status)),
      tracking_no:     get(row, map.tracking_no) || null,
      shipping_option: get(row, map.shipping_option) || null,
      payment_method:  null,
      total_amount:    parsePrice(get(row, map.total_amount)),
      shipping_fee:    parsePrice(get(row, map.shipping_fee)),
      buyer_username:  get(row, map.buyer_username) || null,
      recipient_name:  get(row, map.recipient_name) || null,
      phone:           get(row, map.phone) || null,
      address: [
        get(row, map.address),
        get(row, map.city),
        get(row, map.province),
        get(row, map.zip),
      ].filter(Boolean).join(", "),
      created_at:    get(row, map.created_at) || null,
      paid_time:     get(row, map.paid_time) || null,
      completed_at:  null,
      cancel_reason: get(row, map.cancel_reason) || null,
      buyer_note:    get(row, map.buyer_note) || null,
      items: [{
        product_name:  get(row, map.product_name),
        sku:           get(row, map.sku) || null,
        variation:     get(row, map.variation) || null,
        quantity:      parseInt(get(row, map.quantity)) || 1,
        unit_price:    parsePrice(get(row, map.unit_price)),
        original_price: parsePrice(get(row, map.unit_price)),
        platform_disc: parsePrice(get(row, map.platform_disc)),
        seller_disc:   parsePrice(get(row, map.seller_disc)),
      }],
    }))
    .filter(o => o.order_id);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function computeSummary(orders) {
  const total = orders.reduce((s, o) => s + o.total_amount, 0);
  const byStatus = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  }
  return {
    total_orders: orders.length,
    total_amount: `PHP ${formatPrice(total)}`,
    total_items:  orders.reduce((s, o) => s + o.items.length, 0),
    by_status:    byStatus,
  };
}

// ─── Main Entry ───────────────────────────────────────────────────────────────
function parseCSV(csvText, platformHint = null) {
  if (!csvText || csvText.trim().length === 0) {
    return { error: "File is empty" };
  }

  const { headers, rows } = parseCSVText(csvText);
  if (!rows || rows.length === 0) {
    return { error: "No data rows found in file" };
  }

  const platform = platformHint || detectPlatform(headers);
  if (!platform) {
    return { error: "Cannot detect platform. Please ensure this is a Shopee, Lazada, or TikTok Shop export." };
  }

  let allOrders = [];
  let orders = [];

  if (platform === "shopee") {
    // For Shopee, we need to count all rows before filtering
    allOrders = rows.filter(r => get(r, COLUMN_MAPS.shopee.order_id));
    orders = parseShopeeOrders(rows);
  }
  if (platform === "lazada") {
    allOrders = rows.filter(r => get(r, COLUMN_MAPS.lazada.order_id));
    orders = parseLazadaOrders(rows);
  }
  if (platform === "tiktok") {
    allOrders = rows.filter(r => get(r, COLUMN_MAPS.tiktok.order_id));
    orders = parseTikTokOrders(rows);
  }

  return {
    platform,
    rowCount:      rows.length,
    allOrderCount: allOrders.length,
    parsedCount:   orders.length,
    skippedCount:  allOrders.length - orders.length,
    summary:       computeSummary(orders),
    orders,
  };
}

export { parseCSV, detectPlatform, parsePrice, formatPrice, normalizeStatus };