import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../db.js";


const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(6),
});

export async function register(req, res) {
  console.log("RECV DATA:", req.body);
  try {
    const { email, username, password } = registerSchema.parse(req.body);

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (exists) return res.status(409).json({ error: "User already exists" });

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, username, password: hash },
      select: { id: true, email: true, username: true },
    });

    return res.json(user);
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function login(req, res) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (e) {
    return res.status(400).json({ error: "Invalid request", details: String(e) });
  }
}
