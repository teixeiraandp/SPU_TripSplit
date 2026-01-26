// routes/payments.js
import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  createPayment,
  listPayments,
  confirmPayment,
  declinePayment,
  deletePayment,
  getPendingPayments,
} from "../controllers/paymentController.js";

const router = Router();

router.use(requireAuth);

// Get pending payments for current user (to confirm/decline)
router.get("/payments/pending", getPendingPayments);

// Trip payments
router.post("/trips/:tripId/payments", createPayment);
router.get("/trips/:tripId/payments", listPayments);

// Payment actions
router.post("/payments/:paymentId/confirm", confirmPayment);
router.post("/payments/:paymentId/decline", declinePayment);
router.delete("/payments/:paymentId", deletePayment);

export default router;