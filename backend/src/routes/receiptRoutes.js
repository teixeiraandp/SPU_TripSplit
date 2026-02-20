/*import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { processReceipt } from "../controllers/receiptController.js";
// For the AI see if it works 
import { refineReceipt } from "../services/aiService.js";

const router = Router();
router.use(requireAuth);

// accept both (alias)
router.post("/trips/:tripId/receipt/ocr", processReceipt);
router.post("/trips/:tripId/receipt/parse", processReceipt);

export default router;
*/


import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { processReceipt } from "../controllers/receiptController.js";

const router = Router();
router.use(requireAuth);

router.post("/trips/:tripId/receipt/ocr", processReceipt);
router.post("/trips/:tripId/receipt/parse", processReceipt);

export default router;
