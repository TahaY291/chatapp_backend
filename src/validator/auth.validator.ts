import { z } from "zod";

// ─── Register ─────────────────────────────────────────
export const registerSchema = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username must be at most 30 characters")
        .trim(),

    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),

    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(32, "Password must be at most 32 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
})

// ─── Login ────────────────────────────────────────────
export const loginSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),

    password: z
        .string()
        .min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username must be at most 30 characters")
        .trim()
        .optional(),

    about: z
        .string()
        .max(150, "About must be at most 150 characters")
        .trim()
        .optional(),

    avatarUrl: z
        .string()
        .url("Invalid avatar URL")
        .optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided to update" }
);

export const verifyEmailSchema = z.object({
    otp: z
        .string()
        .length(6, "OTP must be exactly 6 digits")
        .regex(/^\d+$/, "OTP must contain only numbers"),
    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),    
})

export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),
});

export const resetPasswordSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .toLowerCase()
        .trim(),

    otp: z
        .string()
        .length(6, "OTP must be exactly 6 digits")
        .regex(/^\d+$/, "OTP must contain only numbers"),

    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(32, "Password must be at most 32 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),

})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput       = z.infer<typeof loginSchema>;
export type UpdateProfileInput  = z.infer<typeof updateProfileSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>;