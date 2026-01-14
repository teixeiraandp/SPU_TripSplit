import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { createExpense, listExpenses } from "../controllers/expenseController.js";

const router = Router();

router.use(requireAuth);

// Trip expenses
router.post("/trips/:tripId/expenses", createExpense);
router.get("/trips/:tripId/expenses", listExpenses);

export default router;
