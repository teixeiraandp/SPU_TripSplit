import { z } from "zod";
import prisma from "../db.js";

const addFriendSchema = z.object({
  username: z.string().min(3),
});

// List all friends for the logged-in user
export async function listFriends(req, res) {
  try {
    const userId = req.user.userId;

    const rows = await prisma.friend.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        friend: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json(rows.map((r) => r.friend));
  } catch (e) {
    return res.status(400).json({ error: "Failed to load friends", details: String(e) });
  }
}

// Send a friend request (creates pending invite)
export async function addFriend(req, res) {
  try {
    const userId = req.user.userId;
    const { username } = addFriendSchema.parse(req.body);

    const friendUser = await prisma.user.findUnique({ where: { username } });
    if (!friendUser) {
      return res.status(404).json({ error: "User not found" });
    }
    if (friendUser.id === userId) {
      return res.status(400).json({ error: "You can't add yourself as a friend" });
    }

    // Check if already friends
    const existingFriendship = await prisma.friend.findUnique({
      where: { userId_friendId: { userId, friendId: friendUser.id } },
    });
    if (existingFriendship) {
      return res.status(409).json({ error: "Already friends" });
    }

    // Check if invite already exists (either direction)
    const existingInvite = await prisma.friendInvite.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: friendUser.id, status: "pending" },
          { senderId: friendUser.id, receiverId: userId, status: "pending" },
        ],
      },
    });

    if (existingInvite) {
      // If they already sent us an invite, auto-accept it
      if (existingInvite.senderId === friendUser.id) {
        await prisma.$transaction([
          prisma.friendInvite.update({
            where: { id: existingInvite.id },
            data: { status: "accepted" },
          }),
          prisma.friend.create({ data: { userId, friendId: friendUser.id } }),
          prisma.friend.create({ data: { userId: friendUser.id, friendId: userId } }),
        ]);

        return res.json({
          ok: true,
          message: "Friend request accepted (they had already sent you one)",
          friend: { id: friendUser.id, username: friendUser.username, email: friendUser.email },
        });
      }

      return res.status(409).json({ error: "Friend request already sent" });
    }

    // Create the friend invite
    const invite = await prisma.friendInvite.create({
      data: {
        senderId: userId,
        receiverId: friendUser.id,
        status: "pending",
      },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
    });

    return res.json({
      ok: true,
      message: "Friend request sent",
      invite,
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Unique constraint")) {
      return res.status(409).json({ error: "Friend request already sent" });
    }
    return res.status(400).json({ error: "Failed to send friend request", details: msg });
  }
}

// Remove a friend
export async function removeFriend(req, res) {
  try {
    const userId = req.user.userId;
    const { friendId } = req.params;

    await prisma.$transaction([
      prisma.friend.deleteMany({ where: { userId, friendId } }),
      prisma.friend.deleteMany({ where: { userId: friendId, friendId: userId } }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: "Failed to remove friend", details: String(e) });
  }
}

// List pending friend invites for current user
export async function listFriendInvites(req, res) {
  try {
    const userId = req.user.userId;

    const invites = await prisma.friendInvite.findMany({
      where: {
        receiverId: userId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, username: true, email: true } },
      },
    });

    return res.json(invites);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load friend invites", details: String(e) });
  }
}

// Accept a friend invite
export async function acceptFriendInvite(req, res) {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const invite = await prisma.friendInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.receiverId !== userId) {
      return res.status(403).json({ error: "This invite is not for you" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: "Invite already responded to" });
    }

    // Accept: update invite and create mutual friendship
    await prisma.$transaction([
      prisma.friendInvite.update({
        where: { id: inviteId },
        data: { status: "accepted" },
      }),
      prisma.friend.create({ data: { userId: userId, friendId: invite.senderId } }),
      prisma.friend.create({ data: { userId: invite.senderId, friendId: userId } }),
    ]);

    return res.json({ ok: true, message: "Friend request accepted" });
  } catch (e) {
    return res.status(400).json({ error: "Failed to accept invite", details: String(e) });
  }
}

// Decline a friend invite
export async function declineFriendInvite(req, res) {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const invite = await prisma.friendInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.receiverId !== userId) {
      return res.status(403).json({ error: "This invite is not for you" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: "Invite already responded to" });
    }

    await prisma.friendInvite.update({
      where: { id: inviteId },
      data: { status: "declined" },
    });

    return res.json({ ok: true, message: "Friend request declined" });
  } catch (e) {
    return res.status(400).json({ error: "Failed to decline invite", details: String(e) });
  }
}