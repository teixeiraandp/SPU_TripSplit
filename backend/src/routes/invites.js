import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listInvites, acceptInvite, declineInvite } from "../controllers/inviteController.js";

const router = Router();

router.use(requireAuth);

router.get("/", listInvites);
router.post("/:inviteId/accept", acceptInvite);
router.post("/:inviteId/decline", declineInvite);

export default router;