import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import tripRoutes from "./routes/trips.js";
import expenseRoutes from "./routes/expense.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "TripSplit API running" });
});

app.use("/auth", authRoutes);
app.use("/trips", tripRoutes);
app.use("/", expenseRoutes); // contains /trips/:tripId/expenses

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`API listening on ${port}`));
