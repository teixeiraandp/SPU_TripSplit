// services/ocrService.js
// Universal receipt parser (rule-based).
// Handles all three OCR variants seen in logs:
//   - iOS upload (clean)
//   - iOS/Android camera (Sales Iiax, stray "1" line, Clover junk)
//   - Worst-case camera (SO 08, 910 99, S1124, $22 31)

// =======================
// TEXT NORMALIZATION
// =======================
export function normalizeReceiptText(rawText) {
  const text = Array.isArray(rawText) ? rawText.join("\n") : String(rawText ?? "");

  return text
    .split(/\r?\n/)
    .map((l) =>
      normalizeOcrLine(
        String(l)
          .replace(/[|]/g, " ")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
    )
    .filter(Boolean);
}

/**
 * Per-line OCR normalization — fixes the actual glitches seen in logs:
 *
 * "SO 08"   -> "$0.08"   (S misread $, O misread 0, space before cents)
 * "910 99"  -> "$10.99"  (9 misread $, space before cents)
 * "S1124"   -> "$11.24"  (S misread $, missing decimal)
 * "$22 31"  -> "$22.31"  (space before cents)
 * "S2.31"   -> "$2.31"   (S misread $)
 * "Sales Iiax" -> "Sales Tax"  (OCR garble)
 * "1035%"   -> kept as-is (percent, ignored by money parser)
 */
function normalizeOcrLine(line) {
  let s = String(line || "");

  // --- Label fixes first ---

  // "Sales Iiax" / "Sales 1ax" / "Sales lax" -> "Sales Tax"
  s = s.replace(/\bSales\s+[I1l][a-z]{2}\b/gi, "Sales Tax");
  s = s.replace(/\bSales\s+1ax\b/gi, "Sales Tax");

  // --- Money fixes ---

  // Fix "9" misread as "$": "910.99" -> "$10.99", "910 99" -> "$10.99"
  s = s.replace(/(^|\s)9(\d{1,3}(?:[. ]\d{2}))(\s|$)/g, (m, p1, num, p3) => {
    return `${p1}$${num}${p3}`;
  });

  // Fix "S" misread as "$": "S10.99", "S0.08", "S1124", "S2 31"
  s = s.replace(/(^|\s)S(\d)/g, (m, p1, digit) => `${p1}$${digit}`);

  // Fix "O" or "o" misread as "0" after "$": "$O.08" -> "$0.08", "$O 08" -> "$0.08"
  s = s.replace(/\$\s*[Oo](?=[. ]\d{2})/g, "$0");

  // Fix space before cents: "$24 62" -> "$24.62", "$0 08" -> "$0.08"
  s = s.replace(/\$(\d{1,4})\s+(\d{2})(?!\d)/g, "$$$1.$2");

  // Fix missing decimal: "$1124" -> "$11.24", "$2231" -> "$22.31"
  // Only 3-6 digit amounts after $ with no decimal
  s = s.replace(/\$(\d{3,6})(?![.\d])/g, (match, digits) => {
    const candidate = parseInt(digits, 10) / 100;
    if (candidate >= 0.5 && candidate < 1000) {
      return `$${candidate.toFixed(2)}`;
    }
    return match;
  });

  // Normalize "$ 10.99" -> "$10.99"
  s = s.replace(/\$\s+/g, "$");

  // Comma as decimal: "24,62" -> "24.62"
  s = s.replace(/(\d),(\d{2})(?!\d)/g, "$1.$2");

  // Remove thousands commas: "1,234.56" -> "1234.56"
  s = s.replace(/(\d),(\d{3})(\.\d{2})/g, "$1$2$3");

  return s;
}

// =======================
// MONEY PARSING (ROBUST)
// =======================
function normalizeMoneyString(s) {
  let x = String(s || "");

  // Ignore percentages
  if (/%/.test(x)) return null;

  // Belt-and-suspenders O->0
  x = x.replace(/\$[Oo](?=\.\d{2})/g, "$0");

  // "$7 49" -> "$7.49"
  x = x.replace(/(\$?\s*\d+)\s(\d{2}\b)/g, "$1.$2");

  // Remove commas
  x = x.replace(/,/g, "");

  return x;
}

function looksLikeLongNumericCode(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (/\$/.test(s) || /\d\.\d{2}\b/.test(s)) return false;

  const groups = s.match(/\d+/g) || [];
  const totalDigits = groups.reduce((acc, g) => acc + g.length, 0);
  if (groups.length >= 3 && totalDigits >= 8) return true;
  if (/^\d{8,}$/.test(s.replace(/\s+/g, ""))) return true;

  return false;
}

export function parseMoneyFromLine(line) {
  if (looksLikeLongNumericCode(line)) return null;

  // Apply per-line normalization first
  const normalized = normalizeOcrLine(line);

  let s = normalizeMoneyString(normalized);
  if (s === null) return null;
  s = String(s);

  // Prefer decimal amounts
  const dec = s.match(/-?\$?\d+(?:\.\d{2})/g);
  if (dec && dec.length) {
    const last = dec[dec.length - 1].replace("$", "");
    const val = Number(last);
    return Number.isFinite(val) ? val : null;
  }

  // Only allow whole dollar if explicitly has $
  const ints = s.match(/-?\$\d+/g);
  if (!ints || !ints.length) return null;

  const last = ints[ints.length - 1].replace("$", "");
  const val = Number(last);
  return Number.isFinite(val) ? val : null;
}

function isMoneyOnly(line) {
  if (looksLikeLongNumericCode(line)) return false;
  const normalized = normalizeOcrLine(line);
  const s = normalizeMoneyString(normalized);
  if (s === null) return false;
  return /^\$?\d+(?:\.\d{2})$/.test(String(s).trim());
}

// =======================
// KEYWORDS
// =======================
const KEYWORDS = {
  subtotal: [/subtotal/i, /sub\s*total/i],
  // Include common OCR garbles of "Tax": "Iiax", "1ax", "lax"
  tax: [/tax/i, /sales\s*tax/i, /\bvat\b/i, /\bstate\s*tax\b/i, /sales\s*[il1][a-z]{2}/i],
  tip: [/tip/i, /gratuity/i, /service\s*charge/i, /surcharge/i, /charge\s*fee/i],
  total: [/amount\s*due/i, /balance\s*due/i, /grand\s*total/i, /\btotal\b/i],
};

// =======================
// META / ADDRESS / JUNK
// =======================
function looksLikeReceiptMeta(line) {
  return /\b(server:|check\s*#|ordered:|transaction|authorization|authorisation|approval|payment|application|device|card\s*reader|rrn|terminal|approved|declined|visa|mastercard|amex|discover|debit|credit|contactless|chip|pin|a000|sale|shift|bbpos|wifi|password|authorizing|retain this copy|statement validation|reference id|auth id|mid:|aid:|clover)\b/i.test(
    String(line || "")
  );
}

function looksLikeSurveyOrPromo(line) {
  const s = String(line || "").toLowerCase();
  return (
    s.includes("feedback") ||
    s.includes("survey") ||
    s.includes("unique code") ||
    s.includes("how're we doing") ||
    s.includes("how are we doing") ||
    s.includes("let us know") ||
    s.includes("tell us") ||
    s.includes("join our team") ||
    s.includes("www.") ||
    s.includes("http")
  );
}

function looksLikePhone(line) {
  return /\b\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/.test(String(line || ""));
}

function looksLikeAddress(line) {
  const s = String(line || "").toLowerCase();
  const street = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|pike|suite|ste)\b/.test(s);
  const cityStateZip = /\b[a-z\s]+,\s*[a-z]{2}\s*\d{5}\b/.test(s);
  const startsWithNum = /^\d{1,6}\s+/.test(s);
  return (startsWithNum && street) || cityStateZip;
}

function isMetaLine(line) {
  const s = String(line || "").trim();
  if (!s) return true;
  if (looksLikeReceiptMeta(s)) return true;
  if (looksLikeAddress(s)) return true;
  if (looksLikeSurveyOrPromo(s)) return true;
  if (looksLikePhone(s)) return true;

  // Standalone quantity-only lines
  if (/^\d{1,2}$/.test(s)) return true;

  // Long numeric codes/IDs
  if (/^\d{6,}$/.test(s.replace(/\s+/g, ""))) return true;

  // Order / cashier / transaction labels
  if (/\border\b.*[:#]/i.test(s)) return true;
  if (/\bcashier[:\s]/i.test(s)) return true;
  if (/\btransaction\b/i.test(s)) return true;

  // Date/time-only lines
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(s)) return true;

  return false;
}

// =======================
// LINE ORDER REPAIR (Android scrambled OCR)
// =======================
function isLikelyLabelLine(line) {
  const low = String(line || "").toLowerCase();
  return (
    KEYWORDS.subtotal.some((r) => r.test(low)) ||
    KEYWORDS.tax.some((r) => r.test(low)) ||
    KEYWORDS.total.some((r) => r.test(low)) ||
    KEYWORDS.tip.some((r) => r.test(low))
  );
}

function isLikelyItemNameLine(line) {
  const s = String(line || "").trim();
  if (!s || isMetaLine(s)) return false;
  if (!/[a-z]/i.test(s)) return false;
  if (/^\d{1,3}$/.test(s)) return false;
  if (isLikelyLabelLine(s)) return false;
  if (parseMoneyFromLine(s) !== null) return false;
  return true;
}

function detectScrambledLines(lines) {
  let firstLabelIdx = lines.length;
  let firstItemIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (firstLabelIdx === lines.length && isLikelyLabelLine(lines[i])) firstLabelIdx = i;
    if (firstItemIdx === lines.length && isLikelyItemNameLine(lines[i])) firstItemIdx = i;
  }

  return firstLabelIdx < firstItemIdx && firstItemIdx < lines.length;
}

function sortScrambledLines(lines) {
  const header = [], items = [], totals = [];

  for (const line of lines) {
    if (isLikelyLabelLine(line)) {
      totals.push(line);
    } else if (looksLikeAddress(line) || looksLikePhone(line) || looksLikeReceiptMeta(line) || isMetaLine(line)) {
      header.push(line);
    } else if (isLikelyItemNameLine(line)) {
      items.push(line);
    } else {
      totals.push(line);
    }
  }

  return [...header, ...items, ...totals];
}

// =======================
// QUANTITY-LINE MERGER
// =======================
/**
 * Merge standalone quantity lines with the following item name.
 * "1" + "Bag (Bolsa)"  ->  "1 Bag (Bolsa)"
 */
function mergeQtyLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];

    if (/^\d{1,2}$/.test(cur) && next && isLikelyItemNameLine(next)) {
      out.push(`${cur} ${next}`);
      i++;
      continue;
    }
    out.push(cur);
  }
  return out;
}

// =======================
// START INDEX
// =======================
export function findContentStartIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    if (!line) continue;
    if (looksLikeReceiptMeta(line)) continue;
    if (/^(?:\W|_)+$/.test(line)) continue;
    if (String(line).trim().length < 3) continue;
    if (/[a-zA-Z]/.test(line)) return i;
  }
  return 0;
}

// =======================
// MERCHANT + DATE
// =======================
export function extractMerchantName(lines) {
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (looksLikeAddress(lines[i])) {
      for (let j = i - 1; j >= 0 && j >= i - 6; j--) {
        const cand = String(lines[j] || "").trim();
        if (!cand || isMetaLine(cand)) continue;
        if (parseMoneyFromLine(cand) !== null) continue;
        if (cand.length >= 3 && cand.length <= 48 && /[a-zA-Z]/.test(cand)) return cand;
      }
    }
  }

  for (const line of lines.slice(0, 20)) {
    const cand = String(line || "").trim();
    if (!cand || isMetaLine(cand)) continue;
    if (parseMoneyFromLine(cand) !== null) continue;
    if (cand.length >= 3 && cand.length <= 48 && /[a-zA-Z]/.test(cand)) return cand;
  }

  return null;
}

export function extractTransactionDate(lines) {
  const SLASH_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/;
  const MON_RE = /\b\d{1,2}\s*-?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*-?\s*\d{4}\b/i;
  const SPACE_MON_RE = /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4}\b/i;

  for (const line of lines) {
    const s = String(line || "");
    const m3 = s.match(SPACE_MON_RE);
    if (m3) return m3[0];
    const m1 = s.match(SLASH_RE);
    if (m1) return m1[0];
    const m2 = s.match(MON_RE);
    if (m2) return m2[0].replace(/\s+/g, "");
  }

  return null;
}

// =======================
// TOTALS
// =======================
export function extractTotals(lines) {
  let subtotal = null, tax = null, tip = null, total = null;

  const moneyVals = [];
  for (let i = 0; i < lines.length; i++) {
    const v = parseMoneyFromLine(lines[i]);
    if (v !== null && Number.isFinite(v) && v > 0) {
      moneyVals.push({ idx: i, val: Number(v.toFixed(2)), line: lines[i] });
    }
  }
  if (!moneyVals.length) return { subtotal, tax, tip, total };

  const findKeywordIdx = (reList) => {
    for (let i = 0; i < lines.length; i++) {
      if (reList.some((re) => re.test(String(lines[i] || "")))) return i;
    }
    return -1;
  };

  const moneyOnLine = (idx) => {
    if (idx < 0 || idx >= lines.length) return null;
    const v = parseMoneyFromLine(lines[idx]);
    return v !== null ? Number(v.toFixed(2)) : null;
  };

  const firstMoneyAfter = (kIdx, maxLook = 8) => {
    if (kIdx < 0) return null;
    for (const m of moneyVals) {
      if (m.idx > kIdx && m.idx <= kIdx + maxLook) return m.val;
    }
    return null;
  };

  const subtotalIdx = findKeywordIdx(KEYWORDS.subtotal);
  const taxIdx = findKeywordIdx(KEYWORDS.tax);
  const tipIdx = findKeywordIdx(KEYWORDS.tip);
  const totalIdx = findKeywordIdx(KEYWORDS.total);

  total = moneyOnLine(totalIdx) ?? firstMoneyAfter(totalIdx, 8);
  subtotal = moneyOnLine(subtotalIdx) ?? firstMoneyAfter(subtotalIdx, 8);
  tax = moneyOnLine(taxIdx) ?? firstMoneyAfter(taxIdx, 8);
  tip = moneyOnLine(tipIdx) ?? firstMoneyAfter(tipIdx, 8);

  const tail = moneyVals.slice(Math.max(0, moneyVals.length - 10)).map((x) => x.val);
  if (total === null && tail.length) total = Math.max(...tail);

  const last3 = tail.slice(-3);
  if (last3.length === 3) {
    const [a, b, c] = last3;
    if (Math.abs(c - (total ?? 0)) <= 0.03 && Math.abs(a + b - c) <= 0.05) {
      if (subtotal === null) subtotal = a;
      if (tax === null) tax = b;
      return { subtotal, tax, tip, total };
    }
  }

  const last4 = tail.slice(-4);
  if (last4.length === 4) {
    const [a, b, c, d] = last4;
    if (Math.abs(d - (total ?? 0)) <= 0.03 && Math.abs(a + b + c - d) <= 0.05) {
      const hasFee = lines.some((ln) => KEYWORDS.tip.some((re) => re.test(String(ln))));
      const hasTax = lines.some((ln) => KEYWORDS.tax.some((re) => re.test(String(ln))));
      if (subtotal === null) subtotal = a;
      if (hasFee && hasTax) {
        if (tip === null) tip = b;
        if (tax === null) tax = c;
      } else {
        if (tax === null) tax = b;
        if (tip === null) tip = c;
      }
      return { subtotal, tax, tip, total };
    }
  }

  if (subtotal === null && total !== null) {
    const maybe = total - (tax || 0) - (tip || 0);
    if (maybe > 0) subtotal = Number(maybe.toFixed(2));
  }

  return { subtotal, tax, tip, total };
}

// =======================
// ITEMS
// =======================
function isGoodItemName(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (isMetaLine(s)) return false;
  if (looksLikeReceiptMeta(s)) return false;
  if (looksLikeAddress(s)) return false;
  if (/\b(subtotal|tax|total|balance due|amount due|debit|credit|visa|mastercard|amex|discover)\b/i.test(s)) return false;
  if (looksLikeSurveyOrPromo(s)) return false;
  if (/\?/.test(s)) return false;
  if (!/[a-z]/i.test(s)) return false;
  if (s.length < 3 || s.length > 64) return false;
  return true;
}

export function extractItems(lines) {
  const items = [];

  const totals = extractTotals(lines);
  const subtotalVal = totals.subtotal ? Number(totals.subtotal.toFixed(2)) : null;

  const money = [];
  for (let i = 0; i < lines.length; i++) {
    const v = parseMoneyFromLine(lines[i]);
    if (v !== null && Number.isFinite(v) && v > 0) {
      money.push({ idx: i, val: Number(v.toFixed(2)) });
    }
  }
  if (!money.length) return items;

  const tailMoney = money.slice(Math.max(0, money.length - 12));
  const firstTailIdx = tailMoney[0].idx;

  const subtotalKeywordIdx = lines.findIndex((ln) =>
    KEYWORDS.subtotal.some((re) => re.test(String(ln)))
  );
  const nameEndIdx =
    subtotalKeywordIdx >= 0 ? Math.min(firstTailIdx, subtotalKeywordIdx) : firstTailIdx;

  const nameArea = lines.slice(0, Math.max(0, nameEndIdx));
  const names = nameArea.filter(isGoodItemName).map((ln) => String(ln).trim());

  if (!names.length) return items;

  const tailVals = tailMoney.map((m) => m.val);

  let cutoff = tailVals.length;
  if (subtotalVal !== null) {
    const subIdx = tailVals.lastIndexOf(subtotalVal);
    if (subIdx >= 0) cutoff = subIdx;
  }

  // Filter out tiny non-item amounts (like the $0.08 bag fee)
  // unless there are explicitly named items that map to them
  const itemPrices = tailVals.slice(0, cutoff).filter((v) => v >= 0.05);

  const n = Math.min(names.length, itemPrices.length);
  if (n <= 0) return items;

  const namesToUse = names.length === n ? names : names.slice(-n);

  for (let i = 0; i < n; i++) {
    const name = namesToUse[i];
    const price = itemPrices[i];
    if (name && Number.isFinite(price) && price > 0) {
      items.push({ name, price });
    }
  }

  const seen = new Set();
  return items.filter((it) => {
    const key = `${it.name.toLowerCase()}|${Number(it.price).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// =======================
// CONFIDENCE
// =======================
export function scoreParse(result) {
  let score = 0;
  const warnings = [];

  if (result.merchantName) score += 0.2;
  if (result.total && result.total > 0) score += 0.35;
  if (result.subtotal && result.subtotal > 0) score += 0.15;
  if (result.items && result.items.length > 0) score += 0.25;
  if (result.tax && result.tax > 0) score += 0.05;
  if (result.tip && result.tip > 0) score += 0.05;

  if (result.total && result.subtotal) {
    const expected = (result.subtotal || 0) + (result.tax || 0) + (result.tip || 0);
    const diff = Math.abs(expected - result.total);
    if (diff <= 0.06) score += 0.1;
    else warnings.push(`Totals mismatch ($${diff.toFixed(2)})`);
  }

  if (!result.items?.length) warnings.push("No items detected.");
  if (!result.total) warnings.push("No total detected.");

  return { confidence: Math.min(1, Math.max(0, score)), warnings };
}

// =======================
// MAIN PARSER
// =======================
export function parseReceiptRuleBased(rawText) {
  let lines = normalizeReceiptText(rawText);

  // Repair scrambled Android/Clover OCR ordering
  if (detectScrambledLines(lines)) {
    lines = sortScrambledLines(lines);
  }

  // Merge standalone qty lines: "1" + "Bag (Bolsa)" -> "1 Bag (Bolsa)"
  lines = mergeQtyLines(lines);

  const startIdx = findContentStartIndex(lines);

  const lastMoneyIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (parseMoneyFromLine(lines[i]) !== null || isMoneyOnly(lines[i])) return i;
    }
    return lines.length - 1;
  })();

  const safeEnd = Math.max(startIdx, lastMoneyIdx + 1);
  const mainLines = lines.slice(startIdx, safeEnd);

  console.log("START IDX:", startIdx, "START LINE:", lines[startIdx] ?? "<none>");
  console.log("END IDX:", safeEnd - 1, "END LINE:", lines[safeEnd - 1] ?? "<end>");
  console.log("MAIN first 25:", mainLines.slice(0, 25));
  console.log("MAIN last 25:", mainLines.slice(-25));

  const merchantName = extractMerchantName(mainLines);
  const transactionDate = extractTransactionDate(lines);
  const totals = extractTotals(mainLines);
  const items = extractItems(mainLines);

  const result = {
    merchantName,
    transactionDate,
    items,
    subtotal: totals.subtotal ?? 0,
    tax: totals.tax ?? 0,
    tip: totals.tip ?? 0,
    total: totals.total ?? 0,
    rawLineCount: lines.length,
    parsedLineCount: mainLines.length,
  };

  const { confidence, warnings } = scoreParse(result);
  return { ...result, confidence, warnings, source: "rules" };
}