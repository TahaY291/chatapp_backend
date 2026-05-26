import { z } from "zod"

export const createGroupSchema = z.object({
    name: z.string()
        .min(1, "Group name is required")
        .max(50, "Group name cannot exceed 50 characters")
        .trim(),

    description: z.string()
        .max(200, "Description cannot exceed 200 characters")
        .trim()
        .optional(),

    avatarUrl: z.string()
        .url("Invalid avatar URL")
        .optional(),

    groupMembersArr: z.array(
        z.string().uuid("Each member ID must be a valid UUID")
    )
        .min(1, "At least one member is required")
        .max(50, "Group cannot exceed 50 members"),
})

export type GroupInput = z.infer<typeof createGroupSchema>