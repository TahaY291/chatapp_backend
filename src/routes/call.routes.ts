import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { callInitiate , acceptCall , rejectCall , endedCall , getUserCallHistory } from "../controllers/call.controller";


const router = Router()


router.route('initiate').post(verifyUser , callInitiate)
router.route('accpet').patch(verifyUser , acceptCall)
router.route('reject').patch(verifyUser , rejectCall)
router.route('ended').patch(verifyUser , endedCall)
router.route('calls').get(verifyUser , getUserCallHistory)


export default router;
