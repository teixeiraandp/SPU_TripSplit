// services/llmVerifier.js
// Enable by setting: RECEIPT_LLM_URL=http://127.0.0.1:11434/v1/chat/completions

const SYS = `You are a receipt-json verifier.
You will be given:
(1) raw OCR text
(2) a JSON result from a rule-based parser

Your job:
- Fix obvious mistakes WITHOUT inventing items.
- Prefer labeled totals.
- NEVER treat terminal/card metadata as items.
- Do NOT double count fees.
- Output STRICT JSON only with keys:
merchantName, transactionDate, items, subtotal, tax, tip, total, warnings
items is array of {name, price}.
If unsure, keep the rule-based value and add a warning.
`;

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      name: String(it?.name ?? it?.label ?? "").trim(),
      price: safeNum(it?.price),
    }))
    .filter((it) => it.name.length > 0 && it.price > 0);
}

function shouldVerify(ruleResult) {
  if (!ruleResult) return true;

  const items = normalizeItems(ruleResult.items);
  const subtotal = safeNum(ruleResult.subtotal);
  const tax = safeNum(ruleResult.tax);
  const tip = safeNum(ruleResult.tip);
  const total = safeNum(ruleResult.total);
  const confidence = Number(ruleResult.confidence || 0);
  const warnings = Array.isArray(ruleResult.warnings) ? ruleResult.warnings : [];

  const itemSum = items.reduce((s, it) => s + it.price, 0);

  const hasTotals = total > 0 && (subtotal > 0 || itemSum > 0);
  const sumMatches = subtotal > 0 ? Math.abs(itemSum - subtotal) <= 0.25 : true;

  // Trigger LLM when things look suspicious
  if (confidence > 0 && confidence < 0.8) return true;
  if (!hasTotals) return true;
  if (items.length < 2) return true;
  if (!sumMatches) return true;
  if (warnings.length > 0) return true;

  return false;
}

function stripFence(txt) {
  const s = String(txt || "").trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m?.[1]?.trim() ?? s;
}

export async function verifyWithLLM({ rawText, ruleResult }) {
  const url = process.env.RECEIPT_LLM_URL;
  if (!url) return { ...ruleResult, source: "rules" };

  // First check if we even need to verify - if rules are confident and everything looks good, skip the LLM call
  const doVerify = shouldVerify(ruleResult);
  if (!doVerify) {
   
    return { ...ruleResult, source: ruleResult?.source || "rules" };
  }

  console.log("LLM verify running...", {
    confidence: ruleResult?.confidence,
    warnings: ruleResult?.warnings?.length || 0,
    items: ruleResult?.items?.length || 0,
    subtotal: ruleResult?.subtotal,
    total: ruleResult?.total,
  });

  const body = {
    model: process.env.RECEIPT_LLM_MODEL || "local-model",
    messages: [
      { role: "system", content: SYS },
      {
        role: "user",
        content: JSON.stringify(
          { rawText: String(rawText || ""), ruleResult },
          null,
          2
        ),
      },
    ],
    temperature: 0,
  };

  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ...ruleResult,
      warnings: [...(ruleResult.warnings || []), `LLM fetch failed: ${String(e)}`],
      source: "rules",
    };
  }

  if (!r.ok) {
    return {
      ...ruleResult,
      warnings: [...(ruleResult.warnings || []), `LLM check failed: HTTP ${r.status}`],
      source: "rules",
    };
  }

  const data = await r.json();
  const txt = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  const cleaned = stripFence(txt);

  try {
    const parsed = JSON.parse(cleaned);

    return {
      merchantName: String(parsed.merchantName || ruleResult.merchantName || "Unknown").trim(),
      transactionDate: parsed.transactionDate || ruleResult.transactionDate || null,
      items: normalizeItems(parsed.items?.length ? parsed.items : ruleResult.items),
      subtotal: safeNum(parsed.subtotal ?? ruleResult.subtotal),
      tax: safeNum(parsed.tax ?? ruleResult.tax),
      tip: safeNum(parsed.tip ?? ruleResult.tip),
      total: safeNum(parsed.total ?? ruleResult.total),
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings
        : (ruleResult.warnings || []),
      source: "rules+llm-check",
    };
  } catch {
    return {
      ...ruleResult,
      warnings: [...(ruleResult.warnings || []), "LLM returned non-JSON; skipped"],
      source: "rules",
    };
  }
}