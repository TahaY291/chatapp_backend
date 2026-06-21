import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { callInitiate , acceptCall , rejectCall , endedCall , getUserCallHistory } from "../controllers/call.controller";


const router = Router()


router.route('/initiate').post(verifyUser , callInitiate)
router.route('/:callId/accept').patch(verifyUser , acceptCall)
router.route('/:callId/reject').patch(verifyUser , rejectCall)
router.route('/:callId/end').patch(verifyUser , endedCall)
router.route('/calls').get(verifyUser , getUserCallHistory)


export default router;
