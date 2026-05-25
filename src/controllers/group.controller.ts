import { db } from "../db";
import { users } from "../db/schema";
import { asyncHandler } from "../lib/asyncHandler";


export const createGroup = asyncHandler(async (req, res)=> {
    const {name ,  avatarUrl , description , groupMembersArr} = req.body
    const groupMemeberId = req.user!.id

    
})