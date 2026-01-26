// controllers/paymentController.js
import { z } from "zod";
import prisma from "../db.js";

const createPaymentSchema = z.object({
  toUsername: z.string().min(2).optional(),
  toUserId: z.string().optional(),
  amount: z.number().positive(),
  method: z.string().optional(), // "venmo" | "zelle" | "cash" | etc
});

export async function createPayment(req, res) {
  try {
    const { tripId } = req.params;
    const fromUserId = req.user.userId;

    const parsed = createPaymentSchema.parse(req.body);

    // must be trip member to record payment
    const isMember = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: fromUserId } },
    });
    if (!isMember) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // resolve receiver
    let toUser = null;

    if (parsed.toUserId) {
      toUser = await prisma.user.findUnique({ where: { id: parsed.toUserId } });
    } else if (parsed.toUsername) {
      toUser = await prisma.user.findUnique({ where: { username: parsed.toUsername } });
    }

    if (!toUser) return res.status(404).json({ error: "Receiver not found" });
    if (toUser.id === fromUserId) return res.status(400).json({ error: "Cannot pay yourself" });

    // receiver must be trip member too
    const receiverIsMember = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: toUser.id } },
    });
    if (!receiverIsMember) {
      return res.status(400).json({ error: "Receiver is not a member of this trip" });
    }

    const payment = await prisma.payment.create({
      data: {
        tripId,
        fromUserId,
        toUserId: toUser.id,
        amount: parsed.amount,
        method: parsed.method || null,
        status: "pending", // starts as pending, needs confirmation
      },
      include: {
        fromUser: { select: { id: true, username: true, email: true } },
        toUser: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json(payment);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

export async function listPayments(req, res) {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    // must be trip member to view
    const isMember = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!isMember) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const payments = await prisma.payment.findMany({
      where: { tripId },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, email: true } },
        toUser: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json(payments);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load payments", details: String(e) });
  }
}

// Confirm a payment (only the receiver can confirm)
export async function confirmPayment(req, res) {
  try {
    const { paymentId } = req.params;
    const userId = req.user.userId;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Only the receiver can confirm
    if (payment.toUserId !== userId) {
      return res.status(403).json({ error: "Only the receiver can confirm this payment" });
    }

    if (payment.status !== "pending") {
      return res.status(400).json({ error: `Payment already ${payment.status}` });
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "confirmed" },
      include: {
        fromUser: { select: { id: true, username: true, email: true } },
        toUser: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json({ ok: true, payment: updated });
  } catch (e) {
    return res.status(400).json({ error: "Failed to confirm payment", details: String(e) });
  }
}

// Decline a payment (only the receiver can decline)
const declinePaymentSchema = z.object({
  note: z.string().max(200).optional(), // optional reason
});

export async function declinePayment(req, res) {
  try {
    const { paymentId } = req.params;
    const userId = req.user.userId;
    const { note } = declinePaymentSchema.parse(req.body || {});

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Only the receiver can decline
    if (payment.toUserId !== userId) {
      return res.status(403).json({ error: "Only the receiver can decline this payment" });
    }

    if (payment.status !== "pending") {
      return res.status(400).json({ error: `Payment already ${payment.status}` });
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "declined",
        declineNote: note || null,
      },
      include: {
        fromUser: { select: { id: true, username: true, email: true } },
        toUser: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json({ ok: true, payment: updated });
  } catch (e) {
    return res.status(400).json({ error: "Failed to decline payment", details: String(e) });
  }
}

// Delete a payment (only the sender can delete, and only if pending)
export async function deletePayment(req, res) {
  try {
    const { paymentId } = req.params;
    const userId = req.user.userId;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Only the sender can delete
    if (payment.fromUserId !== userId) {
      return res.status(403).json({ error: "Only the sender can delete this payment" });
    }

    // Can only delete pending payments
    if (payment.status !== "pending") {
      return res.status(400).json({ error: "Can only delete pending payments" });
    }

    await prisma.payment.delete({
      where: { id: paymentId },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: "Failed to delete payment", details: String(e) });
  }
}

// Get pending payments for current user (payments they need to confirm)
export async function getPendingPayments(req, res) {
  try {
    const userId = req.user.userId;

    const payments = await prisma.payment.findMany({
      where: {
        toUserId: userId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, name: true } },
        fromUser: { select: { id: true, username: true, email: true } },
        toUser: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json(payments);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load pending payments", details: String(e) });
  }
}