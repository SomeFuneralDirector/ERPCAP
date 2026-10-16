// SALES parser — imports COMPLETED orders only.
import { createParser, detectPlatform, parsePrice, formatPrice } from "./csv-parser-core";

const { parseCSV, parseSpreadsheetRows, normalizeStatus } = createParser({
  targetStatus: "COMPLETED",
  // Lazada "delivered" counts as a completed sale
  statusOverrides: { delivered: "COMPLETED" },
  keepCompletedAt: true,
});

export { parseCSV, parseSpreadsheetRows, detectPlatform, parsePrice, formatPrice, normalizeStatus };