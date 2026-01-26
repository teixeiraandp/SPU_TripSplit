import prisma from "../db.js";

/**
 * Activity feed for the logged-in user
 * Shows recent expenses AND payments across trips the user is a member of.
 */
export async function listActivity(req, res) {
  try {
    const userId = req.user.userId;

    // Get expenses
    const expenses = await prisma.expense.findMany({
      where: {
        trip: {
          members: {
            some: { userId },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        trip: { select: { id: true, name: true } },
        paidBy: { select: { id: true, username: true } },
      },
    });

    // Get payments (all statuses - let frontend decide what to show)
    const payments = await prisma.payment.findMany({
      where: {
        trip: {
          members: {
            some: { userId },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        trip: { select: { id: true, name: true } },
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });

    // Format expenses
    const expenseActivity = expenses.map((e) => ({
      id: e.id,
      type: "expense",
      tripId: e.trip.id,
      tripName: e.trip.name,
      title: e.title,
      amount: e.amount,
      paidBy: e.paidBy?.username ?? "Unknown",
      paidById: e.paidBy?.id ?? null,
      createdAt: e.createdAt,
    }));

    // Format payments - include IDs so frontend can personalize ("You paid" vs "@alice paid")
    const paymentActivity = payments.map((p) => ({
      id: p.id,
      type: "payment",
      tripId: p.trip.id,
      tripName: p.trip.name,
      title: `Payment`, // frontend will format this based on user
      amount: p.amount,
      fromUserId: p.fromUser?.id ?? null,
      fromUser: p.fromUser?.username ?? "Unknown",
      toUserId: p.toUser?.id ?? null,
      toUser: p.toUser?.username ?? "Unknown",
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
    }));

    // Combine and sort by date
    const activity = [...expenseActivity, ...paymentActivity]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);

    return res.json(activity);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load activity", details: String(e) });
  }
}