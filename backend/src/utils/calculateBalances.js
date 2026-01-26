// backend/src/utils/calculateBalances.js

function toNumberDecimal(d) {
  // Prisma Decimal sometimes comes in as Decimal.js object
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "string") return parseFloat(d);
  if (typeof d === "object" && typeof d.toString === "function") return parseFloat(d.toString());
  return Number(d) || 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Balances meaning:
 * +X => others owe this user X
 * -X => this user owes others X
 *
 * Expenses effect:
 * payer gets +total
 * each split user gets -share
 */
export function calculateBalancesFromExpenses(members, expenses) {
  const balances = {};
  for (const m of members) balances[m.userId] = 0;

  for (const expense of expenses) {
    const total = toNumberDecimal(expense.total ?? expense.amount ?? 0);
    const paidById = expense.paidById;

    if (balances[paidById] === undefined) balances[paidById] = 0;
    balances[paidById] += total;

    for (const split of expense.splits || []) {
      const share = toNumberDecimal(split.share);
      if (balances[split.userId] === undefined) balances[split.userId] = 0;
      balances[split.userId] -= share;
    }
  }

  // round
  for (const k of Object.keys(balances)) balances[k] = round2(balances[k]);
  return balances;
}

/**
 * Payments offset balances ONLY when confirmed:
 * If A pays B $x:
 * A owed decreases by x => balances[A] += x
 * B is owed less by x  => balances[B] -= x
 */
export function applyConfirmedPayments(balances, payments) {
  for (const p of payments || []) {
    if (p.status !== "confirmed") continue;

    const amt = toNumberDecimal(p.amount);
    if (balances[p.fromUserId] === undefined) balances[p.fromUserId] = 0;
    if (balances[p.toUserId] === undefined) balances[p.toUserId] = 0;

    balances[p.fromUserId] += amt;
    balances[p.toUserId] -= amt;
  }

  for (const k of Object.keys(balances)) balances[k] = round2(balances[k]);
  return balances;
}

export function buildSettlements(balancesByUserId, usersById) {
  // create debtors/creditors lists
  const debtors = [];
  const creditors = [];

  for (const [userId, bal] of Object.entries(balancesByUserId)) {
    const b = round2(bal);
    if (b < -0.009) debtors.push({ userId, amount: round2(-b) }); // owes
    if (b > 0.009) creditors.push({ userId, amount: round2(b) }); // is owed
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];

    const pay = round2(Math.min(d.amount, c.amount));
    if (pay > 0.009) {
      settlements.push({
        from: usersById[d.userId],
        to: usersById[c.userId],
        amount: pay,
      });
    }

    d.amount = round2(d.amount - pay);
    c.amount = round2(c.amount - pay);

    if (d.amount <= 0.009) i++;
    if (c.amount <= 0.009) j++;
  }

  return settlements;
}
