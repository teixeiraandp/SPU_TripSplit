// backend/src/controllers/receiptController.js
/*
import { parseReceiptRuleBased } from "../services/ocrService.js";
import { verifyWithLLM } from "../services/llmVerifier.js";

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      name: String(it?.name ?? it?.label ?? "").trim(),
      price: Number(it?.price),
    }))
    .filter((it) => it.name.length > 0 && Number.isFinite(it.price) && it.price > 0);
}

function normalizeRuleResult(rule) {
  return {
    merchantName: String(
      rule?.merchantName ??
        rule?.merchant ??
        rule?.title ??
        rule?.storeName ??
        "Unknown"
    ).trim(),

    transactionDate:
      rule?.transactionDate ?? rule?.date ?? rule?.purchasedAt ?? null,

    items: normalizeItems(rule?.items),

    subtotal: safeNum(rule?.subtotal),
    tax: safeNum(rule?.tax),
    tip: safeNum(rule?.tip),
    total: safeNum(rule?.total),

    warnings: Array.isArray(rule?.warnings) ? rule.warnings : [],
    source: "rules",
  };
}

export async function processReceipt(req, res) {
  try {
    const rawText = String(req.body?.rawText ?? "").trim();

    if (!rawText || rawText.length < 10) {
      return res.status(400).json({
        error: "Invalid request",
        details: "rawText is required (min 10 chars)",
      });
    }

    // 1) Rule-based parse
    const ruleRaw = await parseReceiptRuleBased(rawText);
    const ruleResult = normalizeRuleResult(ruleRaw);

    // 2) Optional verifier (verifyWithLLM internally skips if RECEIPT_LLM_URL is not set)
    const final = await verifyWithLLM({ rawText, ruleResult });

    // 3) Ensure output shape is still clean even if LLM returns weird types
    const out = normalizeRuleResult(final);

    // Preserve source if verifier used
    out.source = final?.source || out.source;
    out.warnings = Array.isArray(final?.warnings) ? final.warnings : out.warnings;

    return res.json(out);
  } catch (e) {
    console.error("processReceipt error:", e);
    return res
      .status(500)
      .json({ error: "Receipt parse failed", details: String(e) });
  }
}
*/


// backend/src/controllers/receiptController.js
import { parseReceiptRuleBased } from "../services/ocrService.js";
import { verifyWithLLM } from "../services/llmVerifier.js";

// --- money parsing that survives OCR glitches ---
function moneyToNumber(x) {
  if (typeof x === "number") return Number.isFinite(x) ? round2(x) : 0;
  if (x == null) return 0;

  let s = String(x).trim();
  if (!s) return 0;

  // common OCR fixes
  // S used instead of $ (your logs show S10.99, S2 31)
  s = s.replace(/^S(?=\d)/i, "$");

  // $O 08 / $O.08 / O.08
  s = s.replace(/\$\s*[oO](?=\s*\d{2}\b)/g, "$0");
  s = s.replace(/\$\s*[oO](?=\.\d{2})/g, "$0");
  s = s.replace(/(^|[^\d])[oO](?=\.\d{2})/g, (m, p1) => `${p1}0`);

  // "24 62" -> "2462"
  s = s.replace(/\s+/g, "");

  // Keep only digits and dot (but remember if it was currency-like)
  const hadCurrency = /^\$/.test(s) || /[$]/.test(s);
  s = s.replace(/[^0-9.]/g, "");

  if (!s) return 0;

  // If it already has a decimal, parse normally
  if (s.includes(".")) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? round2(n) : 0;
  }

  // If it looked like money and has >= 3 digits, treat last 2 as cents: "2462" -> 24.62
  if (hadCurrency && /^\d{3,}$/.test(s)) {
    const cents = parseInt(s, 10);
    if (!Number.isFinite(cents)) return 0;
    return round2(cents / 100);
  }

  // fallback
  const n = parseFloat(s);
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      name: String(it?.name ?? it?.label ?? "").trim(),
      price: moneyToNumber(it?.price),
    }))
    .filter((it) => it.name.length > 0 && Number.isFinite(it.price) && it.price > 0);
}

function normalizeResult(obj) {
  return {
    merchantName: String(
      obj?.merchantName ??
        obj?.merchant ??
        obj?.title ??
        obj?.storeName ??
        "Unknown"
    ).trim(),

    transactionDate: obj?.transactionDate ?? obj?.date ?? obj?.purchasedAt ?? null,

    items: normalizeItems(obj?.items),

    subtotal: moneyToNumber(obj?.subtotal),
    tax: moneyToNumber(obj?.tax),
    tip: moneyToNumber(obj?.tip),
    total: moneyToNumber(obj?.total),

    warnings: Array.isArray(obj?.warnings) ? obj.warnings : [],

    // IMPORTANT: do NOT hardcode "rules" here
    source: String(obj?.source ?? "").trim() || "rules",
  };
}

export async function processReceipt(req, res) {
  try {
    const rawText = String(req.body?.rawText ?? "").trim();
    if (!rawText || rawText.length < 10) {
      return res.status(400).json({
        error: "Invalid request",
        details: "rawText is required (min 10 chars)",
      });
    }

    // 1) Rule-based parse
    const ruleRaw = await parseReceiptRuleBased(rawText);
    const ruleResult = normalizeResult({ ...ruleRaw, source: "rules" });

    // 2) LLM verifier (verifyWithLLM should set source: "llm" when it actually ran)
    const verified = await verifyWithLLM({ rawText, ruleResult });

    // 3) Normalize final output, preserving the correct source
    const out = normalizeResult(verified);

    // If verifier didn't run / didn't set source, fall back to rules
    if (!out.source) out.source = "rules";

    return res.json(out);
  } catch (e) {
    console.error("processReceipt error:", e);
    return res.status(500).json({
      error: "Receipt parse failed",
      details: String(e),
    });
  }
}
