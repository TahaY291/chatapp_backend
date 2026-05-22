import express from "express";
import dotenv from "dotenv";
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRouter from '../src/routes/auth.routes'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: '16kb' }));           // ← must be before routes
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());


app.use('/user' , authRouter)

app.get("/health", (req, res) => {
    res.json({ status: "server is running" });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});