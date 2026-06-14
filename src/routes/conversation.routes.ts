import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { createConversation } from "../controllers/conversation.controller";

const router = Router()


router.route('/create').post(verifyUser , createConversation)


export default router;
