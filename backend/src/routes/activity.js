import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listActivity } from "../controllers/activityController.js";

const router = Router();

router.use(requireAuth);
router.get("/", listActivity);

export default router;
