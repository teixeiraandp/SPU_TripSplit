import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { 
  createExpense, 
  listExpenses, 
  getPendingPayments 
} from "../controllers/expenseController.js";

const router = Router();
router.use(requireAuth);

router.get("/pending", getPendingPayments); // This fixes the 404 /payments/pending


export default router;