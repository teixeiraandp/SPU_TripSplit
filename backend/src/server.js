import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: __dirname + "/.env" });

import authRoutes from "./routes/auth.js";
import tripRoutes from "./routes/trips.js";
import expenseRoutes from "./routes/expense.js";
import paymentRoutes from "./routes/payments.js";
import userRoutes from "./routes/users.js";
import friendsRoutes from "./routes/friends.js";
import activityRoutes from "./routes/activity.js";
import inviteRoutes from "./routes/invites.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "TripSplit API running" });
});

app.use("/auth", authRoutes);
app.use("/trips", tripRoutes);
app.use("/", expenseRoutes);
app.use("/", paymentRoutes);
app.use("/users", userRoutes);
app.use("/friends", friendsRoutes);
app.use("/activity", activityRoutes);
app.use("/invites", inviteRoutes);

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`API listening on ${port}`));