import express from "express";
import dotenv from "dotenv";
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRouter from '../src/routes/auth.routes'
import contactRouter from '../src/routes/contact.routes'
import groupRouter from '../src/routes/group.routes'
import messageRouter from '../src/routes/messages.routes'
import { Server } from "socket.io";
import http from 'http'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use('/user', authRouter)
app.use('/message', messageRouter)
app.use('/group', groupRouter)
app.use('/contact', contactRouter)
app.get("/health", (req, res) => {
    res.json({ status: "server is running" });
});

const httpServer = http.createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
})

export const onlineUsers = new Map<string, string>();

io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on("user:online", (userId: string) => {
        onlineUsers.set(userId, socket.id);
        socket.data.userId = userId
        io.emit("user:status", { userId, status: "online" });
    })

    socket.on("join-room", (roomId: string) => {
        socket.join(roomId)
        socket.to(roomId).emit("room:user-joined", {
            socketId: socket.id,
            userId: socket.data.userId
        })
    })

    socket.on("leave-room", (roomId: string) => {
        socket.leave(roomId)
        socket.to(roomId).emit("room:user-left", {
            socketId: socket.id,
            userId: socket.data.userId,
        })
    })


    socket.on("typing-start", ({ roomId }: { roomId: string }) => {
        socket.to(roomId).emit("typing:start", {
            userId: socket.data.userId
        })
    })

    socket.on("typing:stop", ({ roomId }: { roomId: string }) => {
        socket.to(roomId).emit("typing:stop", {
            userId: socket.data.userId
        })
    })

    socket.on("webrtc:offer", (data: { roomId: string; offer: RTCSessionDescriptionInit }) => {
        socket.to(data.roomId).emit("webrtc:offer", {
            offer: data.offer,
            from: socket.id,
        });
    })

    socket.on("webrtc:answer", (data: { roomId: string; answer: RTCSessionDescriptionInit }) => {
        socket.to(data.roomId).emit("webrtc:answer", data.answer);
    })

    socket.on("webrtc:ice-candidate", (data: { roomId: string; candidate: RTCIceCandidateInit }) => {
        socket.to(data.roomId).emit("webrtc:ice-candidate", data.candidate);
    })


    socket.on("disconnect", () => {
        const userId = socket.data.userId as string | undefined;
        if (userId) {
            if (onlineUsers.get(userId) === socket.id) {
                onlineUsers.delete(userId);
                io.emit("user:status", { userId, status: "offline" });
                console.log(`User offline: ${userId}`);
            }
        }
    }) 

}) 

export { io };

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});