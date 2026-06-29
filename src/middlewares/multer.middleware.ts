import multer from 'multer'

const storage = multer.memoryStorage()

export const uploadAvatar = multer({
    storage, limits: {
        fileSize: 5 * 1024 * 1024
    }, fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error("Only image files are allowed"))
        }
    }
})

export const uploadMessageFile = multer({
    storage, limits: {
        fileSize: 50 * 1024 * 1024,
    }, fileFilter: (req, file, cb) => {
        const allowedTypes = [

            "image/jpeg", "image/png", "image/webp", "image/gif",

            "video/mp4", "video/webm", "video/quicktime",

            "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",

            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error("File type not allowed"))
        }
    }
})

export const uploadPdfFile = multer({
    storage, limits: {
        fileSize: 50 * 1024 * 1024,
    }, fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "application/pdf"
        ]
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error("File type not allowed"))
        }
    }
})