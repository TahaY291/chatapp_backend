import { CookieOptions, Request, RequestHandler, Response } from "express";
import { db } from "../db";
import { refreshTokens, users } from "../db/schema";
import { asyncHandler } from "../lib/asyncHandler";
import { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput, UpdateProfileInput } from "../validator/auth.validator";
import { eq } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";
import { bcryptPassword, generateAccessToken, generateRefreshToken, hashToken, resetOtpKey, verifyOtpKey, verifyPassword, verifyRefreshToken } from "../lib/auth";
import { ApiResponse } from "../lib/ApiResponse";
import transporter from "../utils/nodemailer";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary";
import { redisClient } from "../lib/redis";


const generateAccessAndRefreshToken = async (userId: string) => {
    try {
        const userArr = await db.select().from(users).where(eq(users.id, userId))
        const user = userArr[0]
        if (!user) {
            throw new ApiError(404, "User not found")
        }

        const accessToken = generateAccessToken({ email: user.email, username: user.username, id: user.id })
        const refreshToken = generateRefreshToken(userId)

        await db.insert(refreshTokens).values({
            userId: userId,
            token: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
        return { accessToken, refreshToken }
    } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(500, "Failed to generate tokens")
    }
}

export const registerUser = asyncHandler(
    async (req: Request, res: Response) => {
        const { username, email, password } = req.body as RegisterInput;

        const existedUser = await db
            .select()
            .from(users)
            .where(eq(users.email, email));

        if (existedUser.length > 0) {
            throw new ApiError(400, "User with this email already exists");
        }

        const hashedPassword = await bcryptPassword(password);

        const newUser = await db
            .insert(users)
            .values({ username, email, passwordHash: hashedPassword })
            .returning();

        const createdUser = newUser[0];
        if (!createdUser) {
            throw new ApiError(500, "Failed to create user");
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
        await redisClient.set(verifyOtpKey(createdUser.email), otp, 'EX', 10 * 60); 

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: createdUser.email,
            subject: "Verify your email - ChatApp",
            text: `Your verification OTP is: ${otp}. It expires in 10 minutes.`,
        };

        transporter.sendMail(mailOptions).catch((emailError) => {
            console.error("Verification email failed:", emailError.message);
        });

        const { passwordHash, ...safeUser } = createdUser;

        return res.status(201).json(
            new ApiResponse(201, safeUser, "User registered successfully. Please check your email for OTP.")
        );
    }
);

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput

    const existingUser = await db.select().from(users).where(eq(users.email, email))
    if (!existingUser[0]) {
        throw new ApiError(404, "User not found")
    }

    if (!existingUser[0].isVerified) {
        throw new ApiError(403, "Please verify your email first")
    }

    const isMatch = await verifyPassword(password, existingUser[0].passwordHash)
    if (!isMatch) {
        throw new ApiError(403, "Wrong credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(existingUser[0].id)

    const { passwordHash,  ...loggedInUser } = existingUser[0]

const accessTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000 // 15 minutes — match ACCESS_TOKEN_EXPIRY
}

const refreshTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — match REFRESH_TOKEN_EXPIRY
}

    const res1 = res.status(200)
        .cookie("accessToken", accessToken, accessTokenOptions)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)

    return res1.json(new ApiResponse(200, { loggedInUser }, "User logged in successfully"))
})
export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken || req.header('Authorization')?.replace("Bearer ", "")


    if (!incomingToken) {
        throw new ApiError(401, "Unauthorized _ refresh token is missing")
    }
    await db.delete(refreshTokens).where(eq(refreshTokens.token, hashToken(incomingToken)))

const accessTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000 // 15 minutes — match ACCESS_TOKEN_EXPIRY
}

const refreshTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — match REFRESH_TOKEN_EXPIRY
}
    return res.status(200)
        .clearCookie("accessToken", accessTokenOptions)
        .clearCookie("refreshToken", refreshTokenOptions)
        .json(new ApiResponse(200, null, "User logged out successfully"))
})

export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken || req.header('Authorization')?.replace("Bearer ", "")

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized — refresh token missing")
    }

    const decoded = await verifyRefreshToken(incomingRefreshToken)
    const userId = decoded.id

    const dbTokenArr = await db.select().from(refreshTokens)
        .where(eq(refreshTokens.token, hashToken(incomingRefreshToken)))

    if (!dbTokenArr[0]) {
        throw new ApiError(401, "Refresh token not found")
    }

    if (dbTokenArr[0].userId !== userId) {
        throw new ApiError(401, "Refresh token mismatch")
    }

    await db.delete(refreshTokens).where(eq(refreshTokens.token, hashToken(incomingRefreshToken)))

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(userId)

    const accessTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000 // 15 minutes — match ACCESS_TOKEN_EXPIRY
}

const refreshTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — match REFRESH_TOKEN_EXPIRY
}

    return res.status(200)
        .cookie("accessToken", accessToken, accessTokenOptions)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)
        .json(new ApiResponse(200, null, "Tokens refreshed successfully"))
})

export const verifyEmail = asyncHandler(async (req, res) => {
    const { otp, email } = req.body  // ← email from body, no req.user

    const userArr = await db.select().from(users).where(eq(users.email, email))
    const user = userArr[0]

    if (!user) throw new ApiError(404, "User not found")
    if (user.isVerified) throw new ApiError(400, "User already verified")
        
    const storedOtp = await redisClient.get(verifyOtpKey(email))
    if (!storedOtp || storedOtp !== otp) {
        throw new ApiError(400, "Invalid OTP")
    }

    await db.update(users).set({
        isVerified: true,
    }).where(eq(users.email, email))  // ← use email not userId

    await redisClient.del(verifyOtpKey(email))  // ← delete OTP from Redis after successful verification

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user.id)

    const { passwordHash,  ...loggedInUser } = user

    const finalUser = { ...loggedInUser, isVerified: true }

    const accessTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000 // 15 minutes — match ACCESS_TOKEN_EXPIRY
}

const refreshTokenOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — match REFRESH_TOKEN_EXPIRY
}

    return res.status(200)
        .cookie("accessToken", accessToken, accessTokenOptions)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)
        .json(new ApiResponse(200, { user: finalUser }, "Email verified successfully"))
})

export const resendVerifyOtpForEmail = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body  // ← email from body, no req.user
    console.log(email)

    const checkUserExistArr = await db.select().from(users).where(eq(users.email, email))
    const user = checkUserExistArr[0]

    if (!user) throw new ApiError(404, "User not found")
    if (user.isVerified) throw new ApiError(400, "User is already verified")

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    await redisClient.set(verifyOtpKey(email), otp, 'EX', 10 * 60)  // ← store OTP in Redis with expiry

    const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: user.email,
        subject: "Verify your email - ChatApp",
        text: `Your new verification OTP is: ${otp}. It expires in 10 minutes.`,
    }

    try {
        await transporter.sendMail(mailOptions)
    } catch (emailError) {
        throw new ApiError(500, "Failed to send OTP email — please try again")
    }

    return res.status(200).json(
        new ApiResponse(200, null, "OTP resent successfully. Please check your email.")
    )
})


export const uploadUserAvatar = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id

    const existingUserArr = await db.select().from(users).where(eq(users.id, userId))
    const existinguser = existingUserArr[0]

    if (!existinguser) {
        throw new ApiError(404, "User not found")
    }
    if (!existinguser.isVerified) {
        throw new ApiError(401, "User is not verified")
    }

    if (!req.file) {
        throw new ApiError(400, "no file upload")
    }

    if (existinguser.avatarUrl) {
        const publicid = existinguser.avatarUrl.split("/").pop()?.split('.')[0]
        if (publicid) {
            await deleteFromCloudinary(`avatars/${publicid}`)
        }
    }

    const result = await uploadOnCloudinary(req.file.buffer, "avatars")
    if (!result) {
        throw new ApiError(500, "Failed to upload avatar")
    }

    await db.update(users)
        .set({ avatarUrl: result.secure_url })
        .where(eq(users.id, userId))

    return res.status(200).json(
        new ApiResponse(200, { avatarUrl: result.secure_url }, "Avatar uploaded successfully")
    )
})

export const updateUsernameAndBio = asyncHandler(async (req: Request, res: Response) => {
    const { username, about } = req.body as UpdateProfileInput
    const userId = req.user!.id

    if (!username && !about) {
        throw new ApiError(400, "At least one field must be provided to update")
    }

    const usersArr = await db.select().from(users).where(eq(users.id, userId))
    const user = usersArr[0]

    if (!user) {
        throw new ApiError(404, "User not found")
    }

    if (!user.isVerified) {
        throw new ApiError(401, "Email is not verified")
    }

    const updatedUserArr = await db.update(users)
        .set({
            ...(username && { username }),
            ...(about && { about })
        })
        .where(eq(users.id, userId))
        .returning()

    const { passwordHash, ...safeUser } = updatedUserArr[0]

    res.status(200).json(new ApiResponse(200, safeUser, "Profile updated successfully"))
})

export const sendResetPasswordOTP = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as ForgotPasswordInput

    const usersArr = await db.select().from(users).where(eq(users.email, email))
    const user = usersArr[0]

    if (!user) {
        throw new ApiError(404, "User not found")
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000))
    await redisClient.set(resetOtpKey(email), otp, 'EX', 10 * 60)  

    const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: user.email,
        subject: "Your OTP for Password Reset",
        text: `Dear ${user.username},\n\nYour OTP for password reset is: ${otp}. This OTP is valid for 10 minutes.\n\nBest regards,\nChatApp Team`
    }
    try {
        await transporter.sendMail(mailOptions)
    } catch (error) {
        throw new ApiError(500, "Failed to send OTP email")
    }
    res.status(200).json(new ApiResponse(200, null, "OTP sent to email successfully"))
})

export const verifyResetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body as ResetPasswordInput

    const usersArr = await db.select().from(users).where(eq(users.email, email))
    const user = usersArr[0]
    if (!user) {
        throw new ApiError(404, "User not found")
    }
    const resetOtp = await redisClient.get(resetOtpKey(email))

    if (resetOtp !== String(otp)) {
        throw new ApiError(400, "Invalid OTP")
    }

    await redisClient.del(resetOtpKey(email))  // Delete OTP from Redis after successful verification

    const password = await bcryptPassword(newPassword)

    await db.update(users).set({
        passwordHash: password
    }).where(eq(users.email, email))

    res.status(200).json(new ApiResponse(200, null, "OTP verified successfully"))
})

export const searchUserByEmail = asyncHandler(async (req: Request, res: Response) => {
    const email = req.query.email as string

    if (!email) {
        throw new ApiError(400, "Email is required")
    }


    const usersEmailArr = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatarUrl: users.avatarUrl,
        about: users.about,
    }).from(users).where(eq(users.email, email))

    if (!usersEmailArr[0]) {
        throw new ApiError(404, "User not exist with this email")
    }

    return res.status(200).json(new ApiResponse(200, usersEmailArr[0], "User fetched successfuly"))

})
export const getMe = asyncHandler(async (req, res) => {
    const userId = req.user!.id

    const userExist = await db.select().from(users).where(eq(users.id, userId))
    if (!userExist[0]) {
        throw new ApiError(404, "user not found")
    }

    const { passwordHash, ...loggedInUser } = userExist[0]

    return res.status(200).json(new ApiResponse(200, loggedInUser, "User fetched successfuly"))
})