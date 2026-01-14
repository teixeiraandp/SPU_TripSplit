import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { createTrip, listTrips, addMember } from "../controllers/tripController.js";

const router = Router();

// all trips routes require login
router.use(requireAuth);

router.post("/", createTrip);
router.get("/", listTrips);
router.post("/:tripId/members", addMember);

export default router;
