import { z } from "zod";
import prisma from "../db.js";

// Create Trip
const createTripSchema = z.object({
  name: z.string().min(2),
});

export async function createTrip(req, res) {
  try {
    const { name } = createTripSchema.parse(req.body);
    const userId = req.user.userId;

    // Create trip + add creator as member
    const trip = await prisma.trip.create({
      data: {
        name,
        members: {
          create: [{ userId, role: "owner" }],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, username: true, email: true } } } },
      },
    });

    return res.json(trip);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

// List trips for logged-in user
export async function listTrips(req, res) {
  const userId = req.user.userId;

  const trips = await prisma.trip.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(trips);
}

// Add member to trip (by username)
const addMemberSchema = z.object({
  username: z.string().min(3),
});

export async function addMember(req, res) {
  try {
    const { username } = addMemberSchema.parse(req.body);
    const { tripId } = req.params;

    const userToAdd = await prisma.user.findUnique({ where: { username } });
    if (!userToAdd) return res.status(404).json({ error: "User not found" });

    // Add membership (unique prevents duplicates)
    const membership = await prisma.tripMember.create({
      data: {
        tripId,
        userId: userToAdd.id,
        role: "member",
      },
    });

    return res.json(membership);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}
