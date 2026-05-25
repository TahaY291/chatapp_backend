import { Router } from "express";
import { insertMessage, getMessages, getConversations, deleteMessage, markAsRead } from "../controllers/message.controller";
import { verifyUser } from "../middlewares/auth.middleware";
import { uploadMessageFile } from "../middlewares/multer.middleware";

const router = Router()

router.route('/send').post(
    verifyUser,
    uploadMessageFile.single("file"),
    insertMessage
)

router.route('/conversations').get(verifyUser, getConversations)

router.route('/:conversationId').get(verifyUser, getMessages)

router.route('/delete/:messageId').delete(verifyUser, deleteMessage)

router.route('/read/:conversationId').patch(verifyUser, markAsRead)

export default router