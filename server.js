const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// The user currently waiting for a stranger
let waitingUser = null;

// Maps socket IDs to their chat partner's socket ID
const partners = new Map();

app.use(express.static(path.join(__dirname, "public")));

function removeFromWaiting(socketId) {
    if (waitingUser === socketId) {
        waitingUser = null;
    }
}

function disconnectPair(socketId, notifyPartner = true) {
    const partnerId = partners.get(socketId);

    if (!partnerId) return;

    partners.delete(socketId);
    partners.delete(partnerId);

    if (notifyPartner) {
        const partnerSocket = io.sockets.sockets.get(partnerId);

        if (partnerSocket) {
            partnerSocket.emit("partner-disconnected");
        }
    }
}

function findPartner(socket) {
    // Make sure the user is not already waiting
    removeFromWaiting(socket.id);

    // Leave an existing conversation first
    if (partners.has(socket.id)) {
        disconnectPair(socket.id, true);
    }

    if (
        waitingUser &&
        waitingUser !== socket.id &&
        io.sockets.sockets.has(waitingUser)
    ) {
        const partnerId = waitingUser;
        const partnerSocket = io.sockets.sockets.get(partnerId);

        waitingUser = null;

        partners.set(socket.id, partnerId);
        partners.set(partnerId, socket.id);

        socket.emit("matched");
        partnerSocket.emit("matched");

        console.log(
            `Matched ${socket.id} with ${partnerId}`
        );
    } else {
        waitingUser = socket.id;
        socket.emit("waiting");

        console.log(`${socket.id} is waiting`);
    }
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.emit("connected");

    // User wants to start/find a chat
    socket.on("find-partner", () => {
        findPartner(socket);
    });

    // User sends a message
    socket.on("message", (message) => {
        const partnerId = partners.get(socket.id);

        if (!partnerId) return;

        if (typeof message !== "string") return;

        // Basic protection against huge messages
        const cleanMessage = message
            .trim()
            .slice(0, 1000);

        if (!cleanMessage) return;

        io.to(partnerId).emit("message", cleanMessage);
    });

    // User clicks Next
    socket.on("next", () => {
        const partnerId = partners.get(socket.id);

        if (partnerId) {
            disconnectPair(socket.id, false);

            const partnerSocket =
                io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                partnerSocket.emit("partner-left");
            }
        }

        findPartner(socket);
    });

    // User stops chatting
    socket.on("stop", () => {
        removeFromWaiting(socket.id);

        const partnerId = partners.get(socket.id);

        if (partnerId) {
            disconnectPair(socket.id, false);

            const partnerSocket =
                io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                partnerSocket.emit("partner-left");
            }
        }

        socket.emit("stopped");
    });

    // Browser/app disconnects
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        removeFromWaiting(socket.id);

        const partnerId = partners.get(socket.id);

        if (partnerId) {
            disconnectPair(socket.id, false);

            const partnerSocket =
                io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                partnerSocket.emit("partner-left");
            }
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`RandomChat running on port ${PORT}`);
});
