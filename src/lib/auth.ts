import bcrypt from 'bcryptjs'
import  jwt , {Secret , SignOptions} from 'jsonwebtoken'
import { db } from '../db'
import { users , refreshTokens } from '../db/schema'
import { eq } from 'drizzle-orm'

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


export const saveRefreshToken = async (
    userId: string,
    token: string
): Promise<void> => {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(refreshTokens).values({
        userId,
        token,
        expiresAt
    })
}

export const deleteRefreshToken =  async (token: string) : Promise<void> => {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token))
}

export const deleteAllRefreshToken = async (userId: string): Promise<void> => {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
}


export const verifyRefreshToken = async (token: string) => {
    
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!) as { id: string };

    const storedToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, token),
    });

    if (!storedToken) throw new Error("Refresh token not found");
    if (storedToken.expiresAt < new Date()) {
        await deleteRefreshToken(token); 
        throw new Error("Refresh token expired");
    }

    return decoded;
};