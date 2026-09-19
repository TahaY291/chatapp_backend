import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/ApiError";

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors,
            data: err.data,
        });
    }

    console.error("Unhandled error:", err);
    return res.status(500).json({
        success: false,
        message: "Internal server error",
    });
}