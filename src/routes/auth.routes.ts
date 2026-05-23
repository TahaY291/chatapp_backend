import { Router } from "express";
import { registerUser, loginUser, logoutUser, refreshAccessToken, verifyEmail } from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import { registerSchema, loginSchema, verifyEmailSchema  } from "../validator/auth.validator";
import { verifyUser } from "../middlewares/auth.middleware";

const router = Router()

router.route('/register').post(validate(registerSchema), registerUser)
router.route('/login').post(validate(loginSchema), loginUser)
router.route('/logout').post(verifyUser, logoutUser)
router.route('/refreshAccessToken').post(refreshAccessToken)
router.route('/verifyEmail').post(verifyUser, validate(verifyEmailSchema), verifyEmail)

export default router