import { Router } from "express";
import {  getMessages, deleteMessage, markAsRead } from "../controllers/message.controller";
import { verifyUser } from "../middlewares/auth.middleware";
import { uploadAvatar, uploadMessageFile } from "../middlewares/multer.middleware";
import { addMemberToGroup, createGroup, removeMemberFromGroup, sendMessageToGroup } from "../controllers/group.controller";

const router = Router()

router.route('/create').post(verifyUser, uploadAvatar.single("file"), createGroup)
router.route('/add_members').post(verifyUser, addMemberToGroup)
router.route('/remove_members').delete(verifyUser, removeMemberFromGroup)
router.route('/send').post(verifyUser, uploadMessageFile.single("file"), sendMessageToGroup)
router.route('/delete/:messageId').delete(verifyUser, deleteMessage)
router.route('/read/:conversationId').patch(verifyUser, markAsRead)

router.route('/:conversationId').get(verifyUser, getMessages)

export default router