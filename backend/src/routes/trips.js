/*import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { createTrip, listTrips, getTrip, getTripBalances, updateTrip, addMember } from "../controllers/tripController.js";

const router = Router();

// all trips routes require login
router.use(requireAuth);

router.post("/", createTrip);
router.get("/", listTrips);
router.get("/:tripId", getTrip);
router.patch("/:tripId", updateTrip);
router.get("/:tripId/balances", getTripBalances);
router.post("/:tripId/members", addMember);

export default router;
*/

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

import {
  createTrip,
  listTrips,
  getTrip,
  getTripBalances,
  updateTrip,
  addMember,
} from "../controllers/tripController.js";

import { processReceipt } from "../controllers/receiptController.js";
import { listActivity } from "../controllers/activityController.js";

import {
  createExpense,
  listExpenses,
} from "../controllers/expenseController.js";

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// Trip routes
router.post("/", createTrip);
router.get("/", listTrips);
router.get("/:tripId", getTrip);
router.patch("/:tripId", updateTrip);
router.get("/:tripId/balances", getTripBalances);
router.post("/:tripId/members", addMember);

// Trip activity
router.get("/:tripId/activities", listActivity);

router.post("/:tripId/expenses", createExpense);
router.get("/:tripId/expenses", listExpenses);

// Receipt OCR 
router.post("/:tripId/receipt/ocr", processReceipt);

export default router;
