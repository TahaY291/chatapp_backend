import { v2 as cloudinary } from "cloudinary";


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})


const uploadOnCloudinary = (buffer: Buffer, folder: string = "uploads" , resourceType: "image" | "video" | "raw" | "auto" = "auto"): Promise<any> => {
    return new Promise((resolve, rejects) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type: resourceType, folder, use_filename: false },
            (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
                    resolve(null);
                } else {
                    console.log("File uploaded to Cloudinary:", result?.secure_url);
                    resolve(result);
                }
            }
        );
        stream.end(buffer)
    })
}

const deleteFromCloudinary = async (publicId: string): Promise<any> => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error("Cloudinary delete error:", error);
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };