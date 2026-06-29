import { Router } from "express";
import { deleteMessage, markAsRead } from "../controllers/message.controller";
import { verifyUser } from "../middlewares/auth.middleware";
import {  uploadPdfFile } from "../middlewares/multer.middleware";
import { deleteFile, getFileConversations, ingestPdfFile, query } from "../controllers/rag.controller";

const router = Router()

router.route('/ingest').post(
    verifyUser,
    uploadPdfFile.single("file"),
    ingestPdfFile
)

router.route('/query').post(verifyUser, query)
router.route('/delete/:fileId').delete(verifyUser, deleteFile)
router.route('/conversations').get(verifyUser, getFileConversations)


export default router