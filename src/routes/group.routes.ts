import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { uploadAvatar, uploadMessageFile } from "../middlewares/multer.middleware";
import { addMemberToGroup, createGroup, deleteGroup, getAllGroups, getGroupMessages, memberLeavesGroup, removeMemberFromGroup, sendMessageToGroup, updateGroupDetails } from "../controllers/group.controller";

const router = Router()

router.route('/create').post(verifyUser, uploadAvatar.single("file"), createGroup)
router.route('/add_members').post(verifyUser, addMemberToGroup)
router.route('/remove_members').delete(verifyUser, removeMemberFromGroup)
router.route('/send').post(verifyUser, uploadMessageFile.single("file"), sendMessageToGroup)
router.route('/delete/:conversationId').delete(verifyUser, memberLeavesGroup)
router.route('/delete/:conversationId').delete(verifyUser, deleteGroup)
router.route('/read/:conversationId').patch(verifyUser, updateGroupDetails)

router.route('/groups').get(verifyUser, getAllGroups)
router.route('/:conversationId').get(verifyUser, getGroupMessages)

export default router