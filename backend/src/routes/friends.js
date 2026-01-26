import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listFriends,
  addFriend,
  removeFriend,
  listFriendInvites,
  acceptFriendInvite,
  declineFriendInvite,
} from "../controllers/friendsController.js";

const router = Router();

router.use(requireAuth);

router.get("/", listFriends);
router.post("/", addFriend);
router.delete("/:friendId", removeFriend);

// Friend invites
router.get("/invites", listFriendInvites);
router.post("/invites/:inviteId/accept", acceptFriendInvite);
router.post("/invites/:inviteId/decline", declineFriendInvite);

export default router;