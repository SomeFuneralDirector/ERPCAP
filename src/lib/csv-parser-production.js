// PRODUCTION parser — imports READY_TO_SHIP orders only.
import { createParser, detectPlatform, parsePrice, formatPrice } from "./csv-parser-core";

const { parseCSV, parseSpreadsheetRows, normalizeStatus } = createParser({
  targetStatus: "READY_TO_SHIP",
  keepCompletedAt: false,
  includeShippedAt: true,
});

// Keeps the original export name used by the production import component
const parseProductionCSV = parseCSV;

export { parseProductionCSV, parseCSV, parseSpreadsheetRows, detectPlatform, parsePrice, formatPrice, normalizeStatus };