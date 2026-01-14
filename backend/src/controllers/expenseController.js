import { z } from "zod";
import prisma from "../db.js";


const createExpenseSchema = z.object({
  title: z.string().min(1),
  amount: z.number().positive(),
  splits: z.array(
    z.object({
      userId: z.string(),
      share: z.number().positive(),
    })
  ).min(1),
});

export async function createExpense(req, res) {
  try {
    const { tripId } = req.params;
    const paidById = req.user.userId;

    const { title, amount, splits } = createExpenseSchema.parse(req.body);

    // Optional: validate sum of shares == amount (basic check)
    const sumShares = splits.reduce((acc, s) => acc + s.share, 0);
    if (Math.abs(sumShares - amount) > 0.01) {
      return res.status(400).json({ error: "Split shares must add up to the amount" });
    }

    const expense = await prisma.expense.create({
      data: {
        tripId,
        paidById,
        title,
        amount,
        splits: {
          create: splits.map((s) => ({
            userId: s.userId,
            share: s.share,
          })),
        },
      },
      include: { splits: true },
    });

    return res.json(expense);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

export async function listExpenses(req, res) {
  const { tripId } = req.params;

  const expenses = await prisma.expense.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    include: {
      paidBy: { select: { id: true, username: true } },
      splits: true,
    },
  });

  return res.json(expenses);
}
