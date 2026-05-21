import { CookieOptions, Request, RequestHandler, Response } from "express";
import { db } from "../db";
import { refreshTokens, users } from "../db/schema";
import { asyncHandler } from "../lib/asyncHandler";
import { LoginInput, RegisterInput } from "../validator/auth.validator";
import { eq } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";
import { bcryptPassword, generateAccessToken, generateRefreshToken, verifyPassword, verifyRefreshToken } from "../lib/auth";
import { ApiResponse } from "../lib/ApiResponse";
import transporter from "../utils/nodemailer";

const generateAccessAndRefreshToken = async (userId: string) => {
    try {
        const userArr = await db.select().from(users).where(eq(users.id, userId))
        const user = userArr[0]
        if (!user) {
            throw new ApiError(404, "User not found")
        }

        const accessToken = generateAccessToken({email: user.email ,username: user.username ,id: user.id})
        const refreshToken = generateRefreshToken(userId)

        await db.insert(refreshTokens).values({
            userId: userId,
            token: refreshToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
        return { accessToken, refreshToken }
    } catch (error) {
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

        await db.update(users)
            .set({ verifyOTP: otp, verifyOTPExpiry: otpExpiry })
            .where(eq(users.id, createdUser.id));

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: createdUser.email,
            subject: "Verify your email - ChatApp",
            text: `Your verification OTP is: ${otp}. It expires in 10 minutes.`,
        };

        transporter.sendMail(mailOptions).catch((emailError) => {
            console.error("Verification email failed:", emailError.message);
        });

        const { passwordHash, verifyOTP, verifyOTPExpiry,
                resetOTP, resetOTPExpiry, ...safeUser } = createdUser;

        return res.status(201).json(
            new ApiResponse(201, safeUser, "User registered successfully. Please check your email for OTP.")
        );
    }
);

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput

    const existingUser = await db.select().from(users).where(eq(users.email, email))
    if (!existingUser[0]) {
        throw new ApiError(401, "User not found")
    }

    if (!existingUser[0].isVerified) {
        throw new ApiError(403, "Please verify your email first")
    }

    const isMatch = await verifyPassword(password, existingUser[0].passwordHash)
    if (!isMatch) {
        throw new ApiError(403, "Wrong credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(existingUser[0].id)

    const { passwordHash, verifyOTP, verifyOTPExpiry,
            resetOTP, resetOTPExpiry, ...loggedInUser } = existingUser[0]

    const options: CookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    }

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { loggedInUser, accessToken, refreshToken }, "User logged in successfully"))
})

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    const incomingToken =  req.cookies?.refreshToken || req.body?.refreshToken || req.header('Authorization')?.replace("Bearer ", "")


    if (!incomingToken) {
        throw new ApiError(401 , "Unauthorized _ refresh token is missing" )
    }
    await db.delete(refreshTokens).where(eq(refreshTokens.token, incomingToken))

    const options: CookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    }

    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
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
        .where(eq(refreshTokens.token, incomingRefreshToken))

    if (!dbTokenArr[0]) {
        throw new ApiError(401, "Refresh token not found")
    }

    if (dbTokenArr[0].userId !== userId) {
        throw new ApiError(401, "Refresh token mismatch")
    }

    await db.delete(refreshTokens).where(eq(refreshTokens.token, incomingRefreshToken))

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(userId)

    const options: CookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    }

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { accessToken, refreshToken }, "Tokens refreshed successfully"))
})

export const verifyEmail = asyncHandler(async (req, res) => {
    const userId = req.user!.id
    const { otp } = req.body
    const userArr = await db.select().from(users).where(eq(users.id , userId))
    const user = userArr[0] 
    if (!user) {
        throw new ApiError(404, "User not found")
    }
    if (user.isVerified) {
        throw new ApiError(400, "User already verified")
    }
    if (!user.verifyOTP) {
        throw new ApiError(400, "No OTP found")
    }

    if (user.verifyOTPExpiry! < new Date()) {
        throw new ApiError(400, "OTP has expired")
    }

    if (user.verifyOTP !== String(otp)) {
        throw new ApiError(400, "Invalid OTP")
    }

    await db.update(users).set({
        
        isVerified: true,
        verifyOTP: null,
        verifyOTPExpiry: null
    }).where(eq(users.id ,userId))

    res.status(200).json(new ApiResponse(200, null, "Email verified successfully"))
})
