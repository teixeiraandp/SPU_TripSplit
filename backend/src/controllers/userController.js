import prisma from "../db.js";

// Search users by username (for adding to trips)
export async function searchUsers(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: q,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
      take: 10,
    });

    return res.json(users);
  } catch (e) {
    return res.status(400).json({ error: "Search failed", details: String(e) });
  }
}

// Get current user profile
export async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
    });

    return res.json(user);
  } catch (e) {
    return res.status(400).json({ error: "Failed to get profile", details: String(e) });
  }
}