import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { searchUsers, getMe } from "../controllers/userController.js";

const router = Router();

router.use(requireAuth);

router.get("/search", searchUsers);
router.get("/me", getMe);

export default router;