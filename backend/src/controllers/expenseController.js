import { z } from "zod";
import prisma from "../db.js";

/**
 * Supports TWO payload shapes:
 *
 * A) Old style (your current UI):
 * {
 *   title: string,
 *   amount: number,
 *   splits: [{ userId, share }]
 * }
 *
 * B) New restaurant/items style (future UI):
 * {
 *   title: string,
 *   tax?: number,
 *   tip?: { type: "percent"|"amount", value: number },
 *   items: [{ name, price, assignedUserIds: string[] }]
 * }
 */

// -------------------- Schemas --------------------

const splitPayloadSchema = z.object({
  title: z.string().min(1),
  amount: z.number().positive(),
  splits: z
    .array(
      z.object({
        userId: z.string(),
        share: z.number().positive(),
      })
    )
    .min(1),
});

const tipSchema = z
  .object({
    type: z.enum(["percent", "amount"]),
    value: z.number().nonnegative(),
  })
  .optional();

const itemsPayloadSchema = z.object({
  title: z.string().min(1),
  tax: z.number().nonnegative().optional(),
  tip: tipSchema,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.number().positive(),
        assignedUserIds: z.array(z.string()).min(1),
      })
    )
    .min(1),
});

const createExpenseSchema = z.union([splitPayloadSchema, itemsPayloadSchema]);

// -------------------- Helpers --------------------

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function toCents(n) {
  return Math.round((n + Number.EPSILON) * 100);
}
function fromCents(c) {
  return c / 100;
}

/**
 * Proportional allocation in cents.
 * Ensures final allocations sum EXACTLY to allocCents.
 */
function allocateProportionally(subtotalCentsByUser, allocCents) {
  const entries = Array.from(subtotalCentsByUser.entries());
  const totalSubtotalCents = entries.reduce((sum, [, c]) => sum + c, 0);

  const out = new Map();
  if (allocCents === 0 || totalSubtotalCents === 0) {
    for (const [userId] of entries) out.set(userId, 0);
    return out;
  }

  const raw = entries.map(([userId, subCents]) => {
    const exact = (allocCents * subCents) / totalSubtotalCents;
    const floor = Math.floor(exact);
    const rem = exact - floor;
    return { userId, floor, rem };
  });

  let used = raw.reduce((sum, r) => sum + r.floor, 0);
  let remaining = allocCents - used;

  raw.sort((a, b) => b.rem - a.rem);

  for (let i = 0; i < raw.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    out.set(raw[i].userId, raw[i].floor + add);
    remaining -= add;
  }

  if (remaining !== 0) {
    const first = raw[0]?.userId;
    if (first) out.set(first, (out.get(first) || 0) + remaining);
  }

  return out;
}

// -------------------- Controllers --------------------

export async function createExpense(req, res) {
  try {
    const { tripId } = req.params;
    const paidById = req.user.userId;

    // ✅ Security: must be a trip member to add expense
    const isMember = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: paidById } },
    });
    if (!isMember) {
      return res.status(403).json({ error: "Not allowed to add expenses to this trip" });
    }

    const parsed = createExpenseSchema.parse(req.body);

    // ============================
    // A) Old style: amount + splits
    // ============================
    if ("splits" in parsed) {
      const { title, amount, splits } = parsed;

      const sumShares = splits.reduce((acc, s) => acc + s.share, 0);
      if (Math.abs(sumShares - amount) > 0.01) {
        return res.status(400).json({ error: "Split shares must add up to the amount" });
      }

      const expense = await prisma.expense.create({
        data: {
          tripId,
          paidById,
          title,

          // Keep compatibility:
          amount: round2(amount),
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: round2(amount),

          splits: {
            create: splits.map((s) => ({
              userId: s.userId,
              share: round2(s.share),
            })),
          },
        },
        include: {
          paidBy: { select: { id: true, username: true } },
          splits: true,
          items: { include: { assignees: true } },
        },
      });

      return res.json(expense);
    }

    // ============================
    // B) New style: items + tax + tip
    // ============================
    const { title, items } = parsed;
    const tax = round2(parsed.tax || 0);

    const subtotal = round2(items.reduce((sum, i) => sum + i.price, 0));

    let tipDollars = 0;
    if (parsed.tip?.type === "amount") {
      tipDollars = round2(parsed.tip.value);
    } else if (parsed.tip?.type === "percent") {
      tipDollars = round2((parsed.tip.value / 100) * subtotal);
    }
    const tip = tipDollars;
    const total = round2(subtotal + tax + tip);

    // Validate assignees are trip members
    const allAssignedIds = [...new Set(items.flatMap((i) => i.assignedUserIds))];
    const memberRows = await prisma.tripMember.findMany({
      where: { tripId, userId: { in: allAssignedIds } },
      select: { userId: true },
    });
    const memberSet = new Set(memberRows.map((m) => m.userId));
    const invalid = allAssignedIds.filter((id) => !memberSet.has(id));
    if (invalid.length > 0) {
      return res.status(400).json({ error: "One or more assignees are not trip members" });
    }

    // Compute per-user item subtotals in cents
    const subtotalCentsByUser = new Map();

    for (const item of items) {
      const priceCents = toCents(item.price);
      const n = item.assignedUserIds.length;

      const base = Math.floor(priceCents / n);
      let rem = priceCents - base * n;

      for (let idx = 0; idx < item.assignedUserIds.length; idx++) {
        const userId = item.assignedUserIds[idx];
        const add = rem > 0 ? 1 : 0;
        rem -= add;

        const shareCents = base + add;
        subtotalCentsByUser.set(userId, (subtotalCentsByUser.get(userId) || 0) + shareCents);
      }
    }

    // Allocate tax/tip proportionally by subtotal
    const taxAlloc = allocateProportionally(subtotalCentsByUser, toCents(tax));
    const tipAlloc = allocateProportionally(subtotalCentsByUser, toCents(tip));

    // Build final splits
    let splits = Array.from(subtotalCentsByUser.entries()).map(([userId, subCents]) => {
      const finalCents = subCents + (taxAlloc.get(userId) || 0) + (tipAlloc.get(userId) || 0);
      return { userId, share: fromCents(finalCents) };
    });

    // Ensure sum(splits) == total exactly (cents), fix penny delta
    const sumFinalCents = splits.reduce((sum, s) => sum + toCents(s.share), 0);
    const totalCents = toCents(total);
    const delta = totalCents - sumFinalCents;

    if (delta !== 0 && splits.length > 0) {
      splits.sort(
        (a, b) =>
          (subtotalCentsByUser.get(b.userId) || 0) - (subtotalCentsByUser.get(a.userId) || 0)
      );
      splits[0].share = fromCents(toCents(splits[0].share) + delta);
    }

    const expense = await prisma.$transaction(async (tx) => {
      const createdExpense = await tx.expense.create({
        data: {
          tripId,
          paidById,
          title,

          // Keep compatibility: amount == total
          amount: total,
          subtotal,
          tax,
          tip,
          total,
        },
      });

      // Create items + assignees
      for (const item of items) {
        const createdItem = await tx.expenseItem.create({
          data: {
            expenseId: createdExpense.id,
            name: item.name,
            price: round2(item.price),
          },
        });

        await tx.expenseItemAssignment.createMany({
          data: item.assignedUserIds.map((userId) => ({
            itemId: createdItem.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      // Create splits
      await tx.expenseSplit.createMany({
        data: splits.map((s) => ({
          expenseId: createdExpense.id,
          userId: s.userId,
          share: round2(s.share),
        })),
      });

      return tx.expense.findUnique({
        where: { id: createdExpense.id },
        include: {
          paidBy: { select: { id: true, username: true } },
          splits: true,
          items: { include: { assignees: true } },
        },
      });
    });

    return res.json(expense);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

export async function listExpenses(req, res) {
  try {
    const { tripId } = req.params;

    const expenses = await prisma.expense.findMany({
      where: { tripId },
      orderBy: { createdAt: "desc" },
      include: {
        paidBy: { select: { id: true, username: true } },
        splits: true,
        items: { include: { assignees: true } },
      },
    });

    return res.json(expenses);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load expenses", details: String(e) });
  }
}
