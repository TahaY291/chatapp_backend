import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { deleteContact, saveContact, updateNickname } from "../controllers/contact.controller";

const router = Router()

router.route('/save').post(verifyUser , saveContact)
router.route('/update').patch(verifyUser , updateNickname)
router.route('/delete').delete(verifyUser , deleteContact)

export default router