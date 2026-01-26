import { z } from "zod";
import prisma from "../db.js";

// Create Trip
const createTripSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(),
  status: z.enum(["planning", "active", "completed"]).optional(),
});

export async function createTrip(req, res) {
  try {
    const { name, location, startDate, endDate, status } = createTripSchema.parse(req.body);
    const userId = req.user.userId;

    const trip = await prisma.trip.create({
      data: {
        name,
        location: location || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status || "planning",
        members: {
          create: [{ userId, role: "owner" }],
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });

    return res.json({
      ...trip,
      totalAmount: 0,
      expenseCount: 0,
      userBalance: 0,
    });
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

// Update Trip
const updateTripSchema = z.object({
  name: z.string().min(2).optional(),
  location: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(["planning", "active", "completed"]).optional(),
});

export async function updateTrip(req, res) {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;
    const updates = updateTripSchema.parse(req.body);

    // Check user is a member
    const membership = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this trip" });
    }

    // Build update data
    const data = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.location !== undefined) data.location = updates.location;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.startDate !== undefined) {
      data.startDate = updates.startDate ? new Date(updates.startDate) : null;
    }
    if (updates.endDate !== undefined) {
      data.endDate = updates.endDate ? new Date(updates.endDate) : null;
    }

    const trip = await prisma.trip.update({
      where: { id: tripId },
      data,
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });

    return res.json(trip);
  } catch (e) {
    return res.status(400).json({ error: "Failed to update trip", details: String(e) });
  }
}

// Helper function to calculate balances including payments
function calculateBalancesWithPayments(members, expenses, payments) {
  const balances = {};

  // Initialize balances for all members
  for (const member of members) {
    balances[member.userId] = 0;
  }

  // Process expenses: payer gets credited, splits get debited
  for (const expense of expenses) {
    const expenseAmount = parseFloat(expense.amount.toString());

    // The payer gets credited the full amount
    if (balances[expense.paidById] !== undefined) {
      balances[expense.paidById] += expenseAmount;
    }

    // Each person's split is subtracted from their balance
    for (const split of expense.splits) {
      if (balances[split.userId] !== undefined) {
        balances[split.userId] -= parseFloat(split.share.toString());
      }
    }
  }

  // Process payments: sender's balance increases (less debt), receiver's decreases
  // Payment means: fromUser paid toUser, so:
  // - fromUser's balance goes UP (they paid off debt)
  // - toUser's balance goes DOWN (they received money owed to them)
  // NOTE: Only confirmed payments count toward balances!
  for (const payment of payments) {
    if (payment.status !== "confirmed") continue; // skip pending/declined

    const amount = parseFloat(payment.amount.toString());

    if (balances[payment.fromUserId] !== undefined) {
      balances[payment.fromUserId] += amount;
    }
    if (balances[payment.toUserId] !== undefined) {
      balances[payment.toUserId] -= amount;
    }
  }

  // Round balances
  for (const odlUserId in balances) {
    balances[odlUserId] = Math.round(balances[odlUserId] * 100) / 100;
  }

  return balances;
}

// List trips for logged-in user (WITH members + totals + balance)
export async function listTrips(req, res) {
  try {
    const userId = req.user.userId;

    // 1) Get trips + members
    const trips = await prisma.trip.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });

    const tripIds = trips.map((t) => t.id);
    if (tripIds.length === 0) return res.json([]);

    // 2) Aggregate totals per trip (sum of Expense.amount)
    const sums = await prisma.expense.groupBy({
      by: ["tripId"],
      where: { tripId: { in: tripIds } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totalByTripId = {};
    const countByTripId = {};

    for (const row of sums) {
      const total = row._sum.amount ? parseFloat(row._sum.amount.toString()) : 0;
      totalByTripId[row.tripId] = total;
      countByTripId[row.tripId] = row._count._all || 0;
    }

    // 3) Get expenses and payments for balance calculation
    const expenses = await prisma.expense.findMany({
      where: { tripId: { in: tripIds } },
      include: { splits: true },
    });

    const payments = await prisma.payment.findMany({
      where: { tripId: { in: tripIds } },
    });

    // Group by tripId
    const expensesByTrip = {};
    const paymentsByTrip = {};
    for (const tripId of tripIds) {
      expensesByTrip[tripId] = [];
      paymentsByTrip[tripId] = [];
    }
    for (const expense of expenses) {
      expensesByTrip[expense.tripId].push(expense);
    }
    for (const payment of payments) {
      paymentsByTrip[payment.tripId].push(payment);
    }

    // 4) Calculate balance for each trip (including payments)
    const balanceByTripId = {};

    for (const trip of trips) {
      const tripExpenses = expensesByTrip[trip.id] || [];
      const tripPayments = paymentsByTrip[trip.id] || [];
      const balances = calculateBalancesWithPayments(trip.members, tripExpenses, tripPayments);
      balanceByTripId[trip.id] = balances[userId] || 0;
    }

    // 5) Attach totals and balance to each trip
    const enriched = trips.map((t) => ({
      ...t,
      totalAmount: totalByTripId[t.id] ?? 0,
      expenseCount: countByTripId[t.id] ?? 0,
      userBalance: Math.round(balanceByTripId[t.id] * 100) / 100,
    }));

    return res.json(enriched);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load trips", details: String(e) });
  }
}

// Get single trip with full details
export async function getTrip(req, res) {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
        expenses: {
          orderBy: { createdAt: "desc" },
          include: {
            paidBy: { select: { id: true, username: true } },
            splits: true,
            items: { include: { assignees: true } },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            fromUser: { select: { id: true, username: true } },
            toUser: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Check user is a member
    const isMember = trip.members.some((m) => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not a member of this trip" });
    }

    // Calculate totals
    const totalAmount = trip.expenses.reduce(
      (sum, e) => sum + parseFloat(e.amount.toString()),
      0
    );

    // Calculate balances INCLUDING payments
    const balances = calculateBalancesWithPayments(trip.members, trip.expenses, trip.payments);

    // Current user's balance
    const userBalance = balances[userId] || 0;

    return res.json({
      ...trip,
      totalAmount: Math.round(totalAmount * 100) / 100,
      expenseCount: trip.expenses.length,
      paymentCount: trip.payments.length,
      userBalance,
      balances,
    });
  } catch (e) {
    return res.status(400).json({ error: "Failed to load trip", details: String(e) });
  }
}

// Get detailed balances and settlement suggestions for a trip
export async function getTripBalances(req, res) {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
        expenses: {
          include: {
            paidBy: { select: { id: true, username: true } },
            splits: true,
          },
        },
        payments: {
          include: {
            fromUser: { select: { id: true, username: true } },
            toUser: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const isMember = trip.members.some((m) => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not a member of this trip" });
    }

    // Build member map
    const memberMap = {};
    for (const member of trip.members) {
      memberMap[member.userId] = member.user;
    }

    // Calculate balances INCLUDING payments
    const balances = calculateBalancesWithPayments(trip.members, trip.expenses, trip.payments);

    // Calculate settlement suggestions (who should pay whom)
    const settlements = [];
    const debtors = [];
    const creditors = [];

    for (const [odlUserId, balance] of Object.entries(balances)) {
      if (balance < -0.01) {
        debtors.push({ odlUserId, amount: Math.abs(balance) });
      } else if (balance > 0.01) {
        creditors.push({ odlUserId, amount: balance });
      }
    }

    // Sort by amount descending
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Greedy settlement algorithm
    let i = 0,
      j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) {
        settlements.push({
          from: {
            userId: debtor.odlUserId,
            username: memberMap[debtor.odlUserId]?.username || "Unknown",
          },
          to: {
            userId: creditor.odlUserId,
            username: memberMap[creditor.odlUserId]?.username || "Unknown",
          },
          amount: Math.round(amount * 100) / 100,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    // Build response with usernames
    const balancesWithNames = Object.entries(balances).map(([odlUserId, balance]) => ({
      userId: odlUserId,
      username: memberMap[odlUserId]?.username || "Unknown",
      balance,
    }));

    // Total paid in settlements
    const totalSettled = trip.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount.toString()),
      0
    );

    return res.json({
      tripId,
      userBalance: balances[userId] || 0,
      balances: balancesWithNames,
      settlements,
      totalSettled: Math.round(totalSettled * 100) / 100,
      paymentCount: trip.payments.length,
    });
  } catch (e) {
    return res.status(400).json({ error: "Failed to load balances", details: String(e) });
  }
}

// Invite member to trip (by username) - creates pending invite
const addMemberSchema = z.object({
  username: z.string().min(3),
});

export async function addMember(req, res) {
  try {
    const { username } = addMemberSchema.parse(req.body);
    const { tripId } = req.params;
    const inviterId = req.user.userId;

    const userToInvite = await prisma.user.findUnique({ where: { username } });
    if (!userToInvite) return res.status(404).json({ error: "User not found" });

    // Check if already a member
    const existingMember = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: userToInvite.id } },
    });
    if (existingMember) {
      return res.status(409).json({ error: "User already in trip" });
    }

    // Check if invite already exists
    const existingInvite = await prisma.tripInvite.findUnique({
      where: { tripId_inviteeId: { tripId, inviteeId: userToInvite.id } },
    });
    if (existingInvite) {
      return res.status(409).json({ error: "Invite already sent" });
    }

    // Create the invite
    const invite = await prisma.tripInvite.create({
      data: {
        tripId,
        inviterId,
        inviteeId: userToInvite.id,
        status: "pending",
      },
      include: {
        trip: { select: { id: true, name: true } },
        inviter: { select: { id: true, username: true } },
        invitee: { select: { id: true, username: true } },
      },
    });

    return res.json({ ok: true, invite });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return res.status(409).json({ error: "Invite already sent" });
    }
    return res.status(400).json({ error: "Invalid request", details: msg });
  }
}