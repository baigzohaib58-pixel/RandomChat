const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));


// ===============================
// WAITING QUEUES
// ===============================

const textQueue = [];
const videoQueue = [];


// ===============================
// USER DATA
// ===============================

const users = new Map();


// ===============================
// FIND PARTNER
// ===============================

function findPartner(socket, mode) {

    const queue =
        mode === "video"
            ? videoQueue
            : textQueue;

    // Remove disconnected sockets
    while (queue.length > 0) {

        const partnerId = queue.shift();

        const partner = io.sockets.sockets.get(
            partnerId
        );

        if (
            partner &&
            partner.id !== socket.id
        ) {

            const partnerData =
                users.get(partner.id);

            if (!partnerData) {
                continue;
            }

            if (partnerData.partnerId) {
                continue;
            }

            // Connect both users
            users.get(socket.id).partnerId =
                partner.id;

            partnerData.partnerId =
                socket.id;

users.get(socket.id).mode =
    mode;

partnerData.mode =
    mode;

users.get(socket.id).waiting = false;
partnerData.waiting = false;

socket.join(partner.id);
partner.join(socket.id);

            socket.emit(
    "partner_found",
    {
        mode: mode,
        partnerId: partner.id,
        initiator: true
    }
);

partner.emit(
    "partner_found",
    {
        mode: mode,
        partnerId: socket.id,
        initiator: false
    }
);

            console.log(
                `Matched ${socket.id} with ${partner.id}`
            );

            return true;
        }
    }

    return false;
}


// ===============================
// SOCKET CONNECTION
// ===============================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );

    users.set(
        socket.id,
        {
            partnerId: null,
            mode: "text",
            waiting: false
        }
    );


    // ===========================
    // FIND PARTNER
    // ===========================

    socket.on(
        "find_partner",
        (data = {}) => {

            const mode =
                data.mode === "video"
                    ? "video"
                    : "text";

            const user =
                users.get(socket.id);

            if (!user) return;

            user.mode = mode;

            // Don't queue twice
            if (user.waiting) {
                return;
            }

            // Already connected
            if (user.partnerId) {
                return;
            }

            const matched =
                findPartner(
                    socket,
                    mode
                );

            if (!matched) {

                user.waiting = true;

                const queue =
                    mode === "video"
                        ? videoQueue
                        : textQueue;

                queue.push(
                    socket.id
                );

                socket.emit(
                    "waiting"
                );

                console.log(
                    `${socket.id} is waiting for ${mode}`
                );
            }

        }
    );


    // ===========================
    // TEXT MESSAGE
    // ===========================

socket.on(
    "message",
    (data) => {

        const user = users.get(socket.id);

        if (!user || !user.partnerId) {
            return;
        }

        const text =
            typeof data === "string"
                ? data
                : data?.text;

        if (!text) return;

        const cleanText =
            String(text)
                .trim()
                .slice(0, 1000);

        if (!cleanText) return;

        // Send the message only to the matched stranger
        io.to(user.partnerId).emit(
            "message",
            {
                text: cleanText,
                senderId: socket.id
            }
        );

    }
);

    // ===========================
    // NEXT
    // ===========================

    socket.on(
        "next",
        () => {

            disconnectPartner(
                socket,
                true
            );

            const user =
                users.get(socket.id);

            if (!user) return;

            user.waiting = false;

            const matched =
                findPartner(
                    socket,
                    user.mode
                );

            if (!matched) {

                user.waiting = true;

                const queue =
                    user.mode === "video"
                        ? videoQueue
                        : textQueue;

                queue.push(
                    socket.id
                );

                socket.emit(
                    "waiting"
                );

            }

        }
    );


    // ===========================
    // STOP
    // ===========================

    socket.on(
        "stop",
        () => {

            disconnectPartner(
                socket,
                false
            );

            const user =
                users.get(socket.id);

            if (user) {

                user.waiting = false;

            }

            removeFromQueues(
                socket.id
            );

        }
    );


    // ===========================
    // REPORT
    // ===========================

    socket.on(
        "report",
        (data) => {

            const user =
                users.get(socket.id);

            console.log(
                "Report received:",
                {
                    reporter: socket.id,
                    reason: data?.reason || "Unknown",
                    reportedUser:
                        user?.partnerId || null
                }
            );

        }
    );


    // ===========================
    // WEBRTC SIGNALING
    // ===========================

    socket.on(
        "webrtc-offer",
        (data) => {

            forwardToPartner(
                socket,
                "webrtc-offer",
                data
            );

        }
    );


    socket.on(
        "webrtc-answer",
        (data) => {

            forwardToPartner(
                socket,
                "webrtc-answer",
                data
            );

        }
    );


    socket.on(
        "webrtc-ice-candidate",
        (data) => {

            forwardToPartner(
                socket,
                "webrtc-ice-candidate",
                data
            );

        }
    );


    // ===========================
    // DISCONNECT
    // ===========================

    socket.on(
        "disconnect",
        () => {

            console.log(
                "User disconnected:",
                socket.id
            );

            disconnectPartner(
                socket,
                false
            );

            removeFromQueues(
                socket.id
            );

            users.delete(
                socket.id
            );

        }
    );

});


// ===============================
// FORWARD WEBRTC DATA
// ===============================

function forwardToPartner(
    socket,
    event,
    data
) {

    const user =
        users.get(socket.id);

    if (!user || !user.partnerId) {
        return;
    }

    io.to(user.partnerId).emit(
        event,
        data
    );

}


// ===============================
// DISCONNECT PARTNER
// ===============================

function disconnectPartner(
    socket,
    notify
) {

    const user =
        users.get(socket.id);

    if (!user) return;

    const partnerId =
        user.partnerId;

    if (!partnerId) {
        return;
    }

    const partner =
        io.sockets.sockets.get(
            partnerId
        );

    user.partnerId = null;

    if (partner) {

        const partnerData =
            users.get(partnerId);

        if (partnerData) {

            partnerData.partnerId =
                null;

            partnerData.waiting =
                false;

        }

        if (notify) {

            partner.emit(
                "partner_left"
            );

        }

    }

}


// ===============================
// REMOVE USER FROM QUEUES
// ===============================

function removeFromQueues(
    socketId
) {

    for (
        let i = textQueue.length - 1;
        i >= 0;
        i--
    ) {

        if (
            textQueue[i] === socketId
        ) {

            textQueue.splice(
                i,
                1
            );

        }

    }


    for (
        let i = videoQueue.length - 1;
        i >= 0;
        i--
    ) {

        if (
            videoQueue[i] === socketId
        ) {

            videoQueue.splice(
                i,
                1
            );

        }

    }

}


// ===============================
// START SERVER
// ===============================

server.listen(PORT, () => {
    console.log(`RandomChat running on port ${PORT}`);
});
