import { NextFunction, Response, Request } from "express";
import { users } from "../db/schema";
import { ApiError } from "../lib/ApiError";
import { asyncHandler } from "../lib/asyncHandler";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";

declare global {
  namespace Express {
    interface Request {
      user?: typeof users.$inferSelect;
    }
  }
}

export const verifyUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token =
    req.cookies.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "")  // ✅ space after Bearer

  if (!token) {
    throw new ApiError(401, "Unauthorized request");
  }

  let decodedToken: { id: string; email: string; username: string };

  try {
    decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as typeof decodedToken;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, "Access token expired");   // ✅ 401 so interceptor triggers refresh
    }
    throw new ApiError(401, "Invalid access token");
  }

  const userArr = await db.select().from(users).where(eq(users.id, decodedToken.id));
  const user = userArr[0];

  if (!user) {
    throw new ApiError(401, "Invalid access token");
  }

  req.user = user;
  next();
});