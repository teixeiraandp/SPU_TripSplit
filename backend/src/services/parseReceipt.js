// services/parseReceipt.js
// Robust rule-based receipt parser + confidence signals for LLM fallback.
const NON_CONTENT_PATTERNS = [
  "how're we doing", "how is our service", "let us know", "tell us", "feedback",
  "unique code", "survey", "deliciousness", "join our team", "privacy policy",
  "order:", "order #", "dine in", "cashier", "transaction", "sale", "retain this copy",
  "statement validation", "method:", "clover", "total number of items", "items sold", "change",
  "debit purchase", "credit purchase", "debit", "credit", "card #", "card number", "account",
  "primary", "ref:", "auth:", "approval", "approved", "declined", "aid", "application",
  "terminal", "rrn", "tvr", "tsi", "arc", "contactless", "chip", "pin", "signature",
  "visa", "mastercard", "amex", "discover",
  "cash back", "cashback",
];

const TOTAL_KW = ["total", "amount due", "balance due", "grand total", "total amount"];
const SUBTOTAL_KW = ["subtotal", "sub total"];
const TAX_KW = ["tax", "sales tax", "vat", "state tax"];
const TIP_KW = ["tip", "gratuity"];
const FEE_KW = ["service charge", "surcharge", "convenience fee", "fee"];

const LABELED_TOTAL_PATTERNS = [
  /total\s+transaction\s+amount\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
  /total\s+amount\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
  /\bamount\s+due\b\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
  /\bbalance\s+due\b\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
  /\bgrand\s+total\b\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
  /\bamount\b\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeLine(line) {
  return String(line || "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(line) {
  return normalizeLine(line).toLowerCase();
}

function isJunk(lower) {
  return NON_CONTENT_PATTERNS.some((p) => lower.includes(p));
}

function looksLikePhone(line) {
  return /\b\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/.test(String(line || ""));
}

function looksLikeAddress(s) {
  s = String(s || "").toLowerCase();
  return (
    (/^\d{1,6}\s+/.test(s) &&
      /(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|suite|ste)\b/.test(s)) ||
    /[a-z\s]+,\s*[a-z]{2}\s*\d{5}/.test(s)
  );
}

function isMerchantCandidate(s) {
  const raw = String(s || "");
  const lower = raw.toLowerCase();
  if (raw.length < 3) return false;
  if (looksLikeAddress(raw)) return false;
  if (looksLikePhone(raw)) return false;
  if (isJunk(lower)) return false;
  if (lower.includes("http") || lower.includes(".com") || lower.includes("www")) return false;
  const digits = (raw.match(/\d/g) || []).length;
  if (digits > raw.length * 0.4) return false;
  return /[a-z]/i.test(raw);
}

function cleanMerchantName(name) {
  let s = String(name || "").trim().replace(/\s+/g, " ");
  s = s.replace(/[)\]]+$/g, "").trim();
  s = s.replace(/[.]+$/g, "").trim();
  s = s.replace(/[,;:].*$/, "").trim();
  if (s.length > 48) s = s.slice(0, 48).trim();
  return s;
}

// -------- OCR Normalization --------
function normalizeOcrText(raw) {
  let s = String(raw || "");

  s = s.replace(/\bS(?=\d)/g, "$");         
  s = s.replace(/\bSO\b/g, "$0");           
  s = s.replace(/\bS0\b/g, "$0");           
  s = s.replace(/\$\s*[oO](?=[\s.]*\d{2}\b)/g, "$0");
  s = s.replace(/(\d),(\d{2})(?!\d)/g, "$1.$2");
  s = s.replace(/(\d),(\d{3})(\.\d{2})/g, "$1$2$3");
  s = s.replace(/\$\s+/g, "$");
  return s;
}
// ================================
//  LLM VERIFIER 
// ================================
function normalizeMoneyText(text) {
  let s = String(text || "");
  if (/%/.test(s)) return null;

  s = s.replace(/[oO](?=\d)/g, "0");
  s = s.replace(/[oO](?=\.\d{2})/g, "0");

  s = s.replace(/(\$?\d+)\s+(\d{2})\b/g, "$1.$2");

  s = s.replace(/\$(\d{3,6})\b/g, (m, digits) => {
    if (digits.includes(".")) return m;
    const d = String(digits);
    const head = d.slice(0, -2);
    const tail = d.slice(-2);
    return `$${head}.${tail}`;
  });


  // Remove commas
  s = s.replace(/,/g, "");

  return s;
}

function isLabeledTotalLine(line) {
  const s = String(line || "");
  return LABELED_TOTAL_PATTERNS.some((re) => re.test(s));
}

function findLabeledTotal(lines) {
  for (const line of lines) {
    const low = String(line || "").toLowerCase();
    if (low.includes("you pay")) continue;
    if (low === "price" || low.startsWith("price ")) continue;

    for (const re of LABELED_TOTAL_PATTERNS) {
      const m = String(line || "").match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) return round2(n);
      }
    }
  }
  return 0;
}

function getMoneyFromLine(line) {
  const norm = normalizeMoneyText(line);
  if (!norm) return [];

  const matches = norm.match(/\$?\d{1,6}(?:\.\d{2})?/g) || [];
  if (matches.length === 0) return [];

  if (isLabeledTotalLine(line)) {
    const vals = matches
      .map((m) => Number(m.replace("$", "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? [round2(vals[vals.length - 1])] : [];
  }

  if (matches.length > 1) return [];

  const n = Number(matches[0].replace("$", ""));
  return Number.isFinite(n) && n > 0 ? [round2(n)] : [];
}

function getDate(lines) {
  for (const line of lines) {
    let m = String(line).match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
    if (m) return m[0];

    m = String(line).match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i);
    if (m) return m[0];
  }
  return null;
}

function looksLikeTerminalMetaLine(line) {
  const s = String(line || "").toLowerCase();
  if (/\*{4,}\d{2,4}\b/.test(s)) return true;
  if (/(ref|auth|aid|rrn|tvr|tsi|arc|mid|tid)\s*[:#]/i.test(line)) return true;

  const bad = [
    "debit purchase", "credit purchase", "card #", "primary", "approval", "approved", "declined",
    "cash back", "cashback", "items sold", "total number of items", "application", "terminal",
    "authorization", "authorisation", "clover id", "clover", "privacy", "http", "www", ".com",
  ];
  if (bad.some((k) => s.includes(k))) return true;
  return false;
}

function isBadItemLine(line) {
  const low = normalizeLower(line);
  if (!line) return true;
  if (looksLikeAddress(line)) return true;
  if (looksLikePhone(line)) return true;
  if (isJunk(low)) return true;
  if (looksLikeTerminalMetaLine(line)) return true;
  if (low === "price" || low === "you pay") return true;
  if (low.includes("you pay") || low.startsWith("price ")) return true;
  return false;
}

function stripQtyPrefix(name) {
  let s = String(name || "").trim();
  s = s.replace(/^\s*(\d+\s*)+(\b[xX]\b\s*)?/g, "");
  return s.trim();
}

function isLikelyLabelLine(line) {
  const low = normalizeLower(line);
  const fuzzyTax = low.includes("tax") || low.includes("iax") || low.includes("1ax") || low.includes("i ax");
  const fuzzySub = low.includes("subtotal") || low.includes("sub total");
  const fuzzyTotal = low.includes("total") || low.includes("amount due") || low.includes("grand total");
  const fuzzyTip = low.includes("tip") || low.includes("gratuity");
  const fuzzyFee = low.includes("fee") || low.includes("surcharge") || low.includes("service charge");

  return fuzzySub || fuzzyTax || fuzzyTotal || fuzzyTip || fuzzyFee || isLabeledTotalLine(line);
}

function isLikelyItemName(line) {
  const s = String(line || "").trim();
  const low = s.toLowerCase();
  if (isBadItemLine(s)) return false;
  if (!/[a-z]/i.test(s)) return false;
  if (/^\d{1,3}$/.test(s)) return false;
  if (low.includes(":")) return false;

  if (isLikelyLabelLine(s)) return false;

  return true;
}

function sameMoney(a, b) {
  return Math.abs((a || 0) - (b || 0)) <= 0.01;
}

function findAmountAfterLabel(lines, labelTestFn, startIdx = 0, lookahead = 6) {
  for (let i = startIdx; i < lines.length; i++) {
    const low = normalizeLower(lines[i]);
    if (!labelTestFn(low)) continue;

    for (let j = i; j <= Math.min(i + lookahead, lines.length - 1); j++) {
      const vals = getMoneyFromLine(lines[j]);
      if (vals.length === 1) return { value: vals[0], idx: j };
    }
  }
  return { value: 0, idx: -1 };
}

function choosePricesToMatchTarget(prices, target, toleranceCents = 1) {
  const cents = prices.map((p) => Math.round(p * 100));
  const targetC = Math.round(target * 100);

  let dp = new Map();
  dp.set(0, { prev: null, idx: -1 });

  for (let i = 0; i < cents.length; i++) {
    const c = cents[i];
    const next = new Map(dp);

    for (const [sum, node] of dp.entries()) {
      const ns = sum + c;
      if (!next.has(ns)) next.set(ns, { prev: node, idx: i, sum });
    }
    dp = next;
  }

  let bestSum = null;
  for (let d = 0; d <= toleranceCents; d++) {
    if (dp.has(targetC - d)) { bestSum = targetC - d; break; }
    if (dp.has(targetC + d)) { bestSum = targetC + d; break; }
  }
  if (bestSum === null) return null;

  const picked = [];
  let cur = dp.get(bestSum);
  while (cur && cur.idx !== -1) {
    picked.push(cur.idx);
    cur = cur.prev;
  }
  picked.reverse();
  return picked;
}

function itemKey(name, price) {
  return `${String(name || "").toLowerCase().trim()}|${round2(price || 0).toFixed(2)}`;
}

export function parseReceiptText(raw) {
  const normalizedRaw = normalizeOcrText(raw);
  const lines = String(normalizedRaw || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const result = {
    merchantName: "Unknown",
    transactionDate: getDate(lines) || null,
    items: [],
    subtotal: 0,
    tax: 0,
    tip: 0,
    total: 0,
    confidence: 0,
    warnings: [],
    source: "rules",
    rawLineCount: lines.length,
    parsedLineCount: lines.length,
  };

  const seenItems = new Set();

  // ---------- Merchant ----------
  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const s = lines[i];
    if (looksLikeAddress(s)) {
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (isMerchantCandidate(lines[j])) {
          result.merchantName = cleanMerchantName(lines[j]);
          break;
        }
      }
      if (result.merchantName !== "Unknown") break;
    }
  }
  if (result.merchantName === "Unknown") {
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      if (isMerchantCandidate(lines[i])) {
        result.merchantName = cleanMerchantName(lines[i]);
        break;
      }
    }
  }

  // ---------- Totals ----------
  const labeledTotal = findLabeledTotal(lines);
  if (labeledTotal > 0) result.total = labeledTotal;

  let totalsStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isLikelyLabelLine(lines[i])) totalsStart = Math.min(totalsStart, i);
  }

  const subObj = findAmountAfterLabel(lines, (low) => low.includes("subtotal") || low.includes("sub total"));
  const taxObj = findAmountAfterLabel(lines, (low) =>
    low.includes("tax") || low.includes("iax") || low.includes("1ax") || low.includes("i ax")
  );
  const totalObj = findAmountAfterLabel(lines, (low) =>
    low.includes("total") || low.includes("amount due") || low.includes("grand total")
  );
  const tipObj = findAmountAfterLabel(lines, (low) => low.includes("tip") || low.includes("gratuity"));

  if (subObj.value > 0) result.subtotal = subObj.value;
  if (taxObj.value > 0) result.tax = taxObj.value;
  if (tipObj.value > 0) result.tip = tipObj.value;
  if (result.total === 0 && totalObj.value > 0) result.total = totalObj.value;

  if (result.subtotal === 0 && result.total > 0 && (result.tax > 0 || result.tip > 0)) {
    const maybe = result.total - result.tax - result.tip;
    if (maybe > 0) result.subtotal = round2(maybe);
  }

  if (result.total === 0) {
    const tailVals = [];
    for (let i = Math.max(0, lines.length - 15); i < lines.length; i++) {
      const v = getMoneyFromLine(lines[i]);
      if (v.length === 1) tailVals.push(v[0]);
    }
    if (tailVals.length) result.total = round2(Math.max(...tailVals));
  }

  const reservedTotals = new Set();
  if (result.subtotal > 0) reservedTotals.add(result.subtotal);
  if (result.tax > 0) reservedTotals.add(result.tax);
  if (result.tip > 0) reservedTotals.add(result.tip);
  if (result.total > 0) reservedTotals.add(result.total);

  const priceCandidates = [];
  const scanEnd = Math.min(lines.length, totalsStart + 12);

  for (let i = 0; i < scanEnd; i++) {
    if (/%/.test(lines[i])) continue;
    const vals = getMoneyFromLine(lines[i]);
    if (vals.length === 1) {
      const v = vals[0];
      if (v <= 0 || v > 20000) continue;
      priceCandidates.push({ idx: i, value: v });
    }
  }

  const usable = [];
  for (const p of priceCandidates) {
    let isReserved = false;
    for (const t of reservedTotals) {
      if (sameMoney(p.value, t)) { isReserved = true; break; }
    }
    if (isReserved) continue;

    if (p.value < 0.01) continue;

    usable.push(p);
  }

  // ---------- Choose which prices are the actual line items ----------
  let chosenIdxs = null;
  if (result.subtotal > 0 && usable.length > 0 && usable.length <= 18) {
    chosenIdxs = choosePricesToMatchTarget(usable.map((x) => x.value), result.subtotal, 1);
  }

  let chosen = [];
  if (chosenIdxs && chosenIdxs.length) {
    chosen = chosenIdxs.map((k) => usable[k]);
  } else {
    if (result.subtotal > 0) {
      const sorted = [...usable].sort((a, b) => b.value - a.value);
      let sum = 0;
      for (const p of sorted) {
        if (sum + p.value <= result.subtotal + 0.05) {
          chosen.push(p);
          sum += p.value;
        }
      }
      if (chosen.length === 0) chosen = sorted.slice(0, Math.min(6, sorted.length));
      chosen.sort((a, b) => a.idx - b.idx);
    } else {
      chosen = usable.slice(0, Math.min(6, usable.length));
    }
  }

  // ---------- Assign names to chosen prices ----------
  const usedNameIdx = new Set();

  function findNameForPrice(priceIdx) {
    for (let back = 0; back <= 6; back++) {
      const j = priceIdx - back;
      if (j < 0) break;
      if (usedNameIdx.has(j)) continue;

      const line = lines[j];
      if (!isLikelyItemName(line)) continue;
      if (j < 6 && isMerchantCandidate(line) && result.merchantName !== "Unknown") continue;

      usedNameIdx.add(j);
      return stripQtyPrefix(line);
    }

    // forward fallback
    for (let f = 1; f <= 2; f++) {
      const j = priceIdx + f;
      if (j >= lines.length) break;
      if (usedNameIdx.has(j)) continue;

      const line = lines[j];
      if (!isLikelyItemName(line)) continue;
      usedNameIdx.add(j);
      return stripQtyPrefix(line);
    }

    return null;
  }

  for (const p of chosen) {
    const nm = findNameForPrice(p.idx) || "Item";
    const key = itemKey(nm, p.value);
    if (!seenItems.has(key)) {
      result.items.push({ name: nm, price: round2(p.value) });
      seenItems.add(key);
    }
  }

  if (result.items.length === 0) {
    for (const p of usable) {
      const nm = findNameForPrice(p.idx);
      if (!nm) continue;
      const key = itemKey(nm, p.value);
      if (!seenItems.has(key)) {
        result.items.push({ name: nm, price: round2(p.value) });
        seenItems.add(key);
      }
    }
  }

  // ---------- Final fallbacks & sanity ----------
  if (result.subtotal === 0 && result.items.length > 0) {
    result.subtotal = round2(result.items.reduce((s, it) => s + (it.price || 0), 0));
  }

  // Round totals
  ["subtotal", "tax", "tip", "total"].forEach((k) => (result[k] = round2(result[k] || 0)));

  // warnings
  if (result.total > 0 && result.subtotal > 0) {
    const expected = round2(result.subtotal + result.tax + result.tip);
    const diff = Math.abs(expected - result.total);
    if (diff > 0.05) result.warnings.push(`Totals mismatch (diff $${diff.toFixed(2)})`);
  }
  if (result.items.length === 0) result.warnings.push("No items detected");

  let score = 0;
  if (result.merchantName !== "Unknown") score += 25;
  if (result.transactionDate) score += 10;
  if (result.total > 0) score += 20;
  if (result.subtotal > 0) score += 15;
  if (result.tax > 0) score += 10;
  if (result.items.length > 0) score += 20;

  if (result.subtotal > 0 && result.items.length > 0) {
    const sum = round2(result.items.reduce((s, it) => s + (it.price || 0), 0));
    if (Math.abs(sum - result.subtotal) <= 0.05) score += 15;
  }

  result.confidence = Number(Math.min(100, score).toFixed(0)) / 100;

  return result;
}