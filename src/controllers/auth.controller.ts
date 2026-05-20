import { Request, Response } from "express";
import { db } from "../db";
import { users } from "../db/schema";
import { asyncHandler } from "../lib/asyncHandler";
import { RegisterInput } from "../validator/auth.validator";
import { eq } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";
import { bcryptPassword } from "../lib/auth";
import { ApiResponse } from "../lib/ApiResponse";

export const registerUser = asyncHandler(
    async (req: Request, res: Response) => {
        const { username, email, password } =
            req.body as RegisterInput;

            const existedUser = await db
            .select()
            .from(users)
            .where(eq(users.email, email));

        if (existedUser.length > 0) {
            throw new ApiError(
                400,
                "User with this email already exists"
            );
        }

        const hashedPassword =
            await bcryptPassword(password);

        const newUser = await db
            .insert(users)
            .values({
                username,
                email,
                passwordHash: hashedPassword
            })
            .returning();

        const createdUser = newUser[0]
        if (!createdUser) {
            throw new ApiError(500 , "Failed to create User")
        }

        return res.status(201).json(new ApiResponse(201 , createdUser , "user create successfuly"))
    }
);