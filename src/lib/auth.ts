import bcrypt from 'bcryptjs'
import  jwt , {Secret , SignOptions} from 'jsonwebtoken'
import { db } from '../db'
import { users , refreshTokens } from '../db/schema'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { ApiError } from './ApiError'


export const hashToken = (token: string): string =>
    crypto.createHash('sha256').update(token).digest('hex')

export const bcryptPassword = async (password: string) : Promise<string> =>{
    return await bcrypt.hash(password , 10)
}

export const verifyPassword = async (plainPassword: string, hashedPassword : string ) : Promise<boolean> => {
    return await bcrypt.compare(plainPassword , hashedPassword)
}

export const generateAccessToken = (user: {
    id: string,
    email: string | null ,
    username: string
}): string => {
  return jwt.sign(
  { id: user.id, email: user.email, username: user.username },
  process.env.ACCESS_TOKEN_SECRET as Secret,
  {
    expiresIn: (process.env.ACCESS_TOKEN_EXPIRY || "15m") as SignOptions["expiresIn"],
  }
);
}

export const generateRefreshToken = (userId: string): string => {
    return jwt.sign(
        { id: userId },
        process.env.REFRESH_TOKEN_SECRET! as Secret,
        { expiresIn : (process.env.REFRESH_TOKEN_EXPIRY || '7d') as SignOptions['expiresIn']}
    )
}


export const deleteAllRefreshToken = async (userId: string): Promise<void> => {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
}


export const verifyRefreshToken = async (token: string) => {
    let decoded: { id: string }
    try {
        decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!) as { id: string }
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw new ApiError(401, "Refresh token expired")
        }
        throw new ApiError(401, "Invalid refresh token")
    }

    const storedToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, hashToken(token)),   // ← hash before lookup
    });

    if (!storedToken) throw new ApiError(401, "Refresh token not found")   // also fixing the plain-Error bug from earlier
    if (storedToken.expiresAt < new Date()) {
        await deleteRefreshToken(token)
        throw new ApiError(401, "Refresh token expired")
    }

    return decoded;
};

export const deleteRefreshToken = async (token: string): Promise<void> => {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, hashToken(token)))   // ← hash before delete
}

export const verifyOtpKey = (email: string) => `otp:verify:${email}`
export const resetOtpKey = (email: string) => `otp:reset:${email}`