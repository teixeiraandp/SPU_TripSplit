import prisma from "../db.js";

// List pending invites for current user
export async function listInvites(req, res) {
  try {
    const userId = req.user.userId;

    const invites = await prisma.tripInvite.findMany({
      where: {
        inviteeId: userId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      include: {
        trip: { select: { id: true, name: true } },
        inviter: { select: { id: true, username: true } },
      },
    });

    return res.json(invites);
  } catch (e) {
    return res.status(400).json({ error: "Failed to load invites", details: String(e) });
  }
}

// Accept an invite
export async function acceptInvite(req, res) {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const invite = await prisma.tripInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.inviteeId !== userId) {
      return res.status(403).json({ error: "This invite is not for you" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: "Invite already responded to" });
    }

    // Accept: update invite status and add user to trip
    await prisma.$transaction([
      prisma.tripInvite.update({
        where: { id: inviteId },
        data: { status: "accepted" },
      }),
      prisma.tripMember.create({
        data: {
          tripId: invite.tripId,
          userId: userId,
          role: "member",
        },
      }),
    ]);

    return res.json({ ok: true, message: "Invite accepted" });
  } catch (e) {
    return res.status(400).json({ error: "Failed to accept invite", details: String(e) });
  }
}

// Decline an invite
export async function declineInvite(req, res) {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const invite = await prisma.tripInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.inviteeId !== userId) {
      return res.status(403).json({ error: "This invite is not for you" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ error: "Invite already responded to" });
    }

    await prisma.tripInvite.update({
      where: { id: inviteId },
      data: { status: "declined" },
    });

    return res.json({ ok: true, message: "Invite declined" });
  } catch (e) {
    return res.status(400).json({ error: "Failed to decline invite", details: String(e) });
  }
}