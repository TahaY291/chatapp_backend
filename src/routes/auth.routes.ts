import { Router } from "express";
import { 
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    verifyEmail, 
    searchUserByEmail, 
    resendVerifyOtpForEmail,
    uploadUserAvatar,
    updateUsernameAndBio,
    sendResetPasswordOTP,
    verifyResetPassword
} from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import { 
    registerSchema, 
    loginSchema, 
    verifyEmailSchema,
    updateProfileSchema,
    forgotPasswordSchema,
    resetPasswordSchema
} from "../validator/auth.validator";
import { verifyUser } from "../middlewares/auth.middleware";
import { uploadAvatar } from "../middlewares/multer.middleware";

const router = Router()


router.route('/register').post(validate(registerSchema), registerUser)
router.route('/login').post(validate(loginSchema), loginUser)
router.route('/logout').post(verifyUser, logoutUser)
router.route('/refresh-token').post(refreshAccessToken)

router.route('/verify-email').post(verifyUser, validate(verifyEmailSchema), verifyEmail)
router.route('/resend-otp').post(verifyUser, resendVerifyOtpForEmail)

router.route('/upload-avatar').patch(verifyUser, uploadAvatar.single("file"), uploadUserAvatar)
router.route('/update-profile').patch(verifyUser, validate(updateProfileSchema), updateUsernameAndBio)

router.route('/forgot-password').post(validate(forgotPasswordSchema), sendResetPasswordOTP)
router.route('/reset-password').post(validate(resetPasswordSchema), verifyResetPassword)

router.route('/search').get(verifyUser, searchUserByEmail)

export default router