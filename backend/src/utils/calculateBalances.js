/**
 * expenses format:
 * [
 *   {
 *     paidById: "user1",
 *     amount: 60,
 *     splits: [
 *       { userId: "user1", share: 20 },
 *       { userId: "user2", share: 20 },
 *       { userId: "user3", share: 20 }
 *     ]
 *   }
 * ]
 */

export function calculateBalances(expenses) {
  const balances = {};

  for (const expense of expenses) {
    const { paidById, amount, splits } = expense;

    // Ensure payer exists
    balances[paidById] ??= 0;
    balances[paidById] += Number(amount);

    // Subtract shares
    for (const split of splits) {
      balances[split.userId] ??= 0;
      balances[split.userId] -= Number(split.share);
    }
  }

  return balances;
}
