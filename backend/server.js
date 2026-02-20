import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// server.js at the root
import inviteRoutes from "./src/routes/invites.js";
import authRoutes from "./src/routes/auth.js";
import tripRoutes from "./src/routes/trips.js";
import expenseRoutes from "./src/routes/expense.js";
import activityRoutes from "./src/routes/activity.js"; 
import userRoutes from "./src/routes/users.js"; 
import friendsRoutes from "./src/routes/friends.js"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/invites", inviteRoutes);

app.use("/friends", friendsRoutes);

app.use("/users", userRoutes);

// 1. Health CheckÇ
app.get("/health", (req, res) => res.json({ ok: true }));

// 2. ADD THIS LINE HERE:
app.use("/auth", authRoutes); 

// 3. Your existing trips route
app.use("/trips", tripRoutes); 

// 4. (Optional) Add your expenses route if you're using it
app.use("/expenses", expenseRoutes);

// 5. Add activity route
app.use("/activity", activityRoutes);

app.use("/payments", expenseRoutes);

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`API listening on port ${port}`));