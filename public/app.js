const socket = io();

let selectedMode = "text";
let connected = false;
let localStream = null;
let peerConnection = null;
let isMuted = false;
let isCameraOff = false;
let partnerId = null;
let isInitiator = false;

const rtcConfig = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ]
        }
    ]
};


/* =========================
   ELEMENTS
========================= */

const welcomeScreen = document.getElementById("welcomeScreen");
const chatScreen = document.getElementById("chatScreen");

const textModeBtn = document.getElementById("textModeBtn");
const videoModeBtn = document.getElementById("videoModeBtn");
const startBtn = document.getElementById("startBtn");

const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const nextBtn = document.getElementById("nextBtn");
const stopBtn = document.getElementById("stopBtn");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const chatStatus = document.getElementById("chatStatus");
const systemMessage = document.getElementById("systemMessage");

const videoArea = document.getElementById("videoArea");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");

const micBtn = document.getElementById("micBtn");
const cameraBtn = document.getElementById("cameraBtn");

const reportBtn = document.getElementById("reportBtn");
const reportModal = document.getElementById("reportModal");
const closeReport = document.getElementById("closeReport");
const reportOptions = document.querySelectorAll(".report-option");


/* =========================
   MODE SELECTION
========================= */

textModeBtn.addEventListener("click", () => {
    selectedMode = "text";
    textModeBtn.classList.add("active");
    videoModeBtn.classList.remove("active");
});

videoModeBtn.addEventListener("click", () => {
    selectedMode = "video";
    videoModeBtn.classList.add("active");
    textModeBtn.classList.remove("active");
});


/* =========================
   STATUS
========================= */

function setStatus(text, type = "") {
    statusText.textContent = text;
    statusDot.className = "status-dot " + type;
}

function setSystemMessage(text) {
    systemMessage.textContent = text;
}


/* =========================
   START CHAT
========================= */

startBtn.addEventListener("click", async () => {

    welcomeScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    messageInput.disabled = true;
    sendBtn.disabled = true;
    nextBtn.disabled = true;

    setStatus("Preparing", "waiting");
    chatStatus.textContent = "Preparing...";
    setSystemMessage("Preparing your chat...");

    if (selectedMode === "video") {
        videoArea.classList.remove("hidden");

        const success = await startCamera();

        if (!success) {
            stopEverything();
            chatScreen.classList.add("hidden");
            welcomeScreen.classList.remove("hidden");
            return;
        }
    } else {
        videoArea.classList.add("hidden");
    }

    socket.emit("find_partner", {
        mode: selectedMode
    });
});


/* =========================
   CAMERA / MICROPHONE
========================= */

async function startCamera() {

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },
            audio: true
        });

        localVideo.srcObject = localStream;

        isMuted = false;
        isCameraOff = false;

        micBtn.textContent = "🎤";
        cameraBtn.textContent = "📹";

        return true;

    } catch (error) {

        console.error("Camera error:", error);

        alert(
            "Camera and microphone permission is required for video chat."
        );

        return false;
    }
}


/* =========================
   SOCKET CONNECTION
========================= */

socket.on("connect", () => {
    connected = true;
    setStatus("Online", "online");
});

socket.on("disconnect", () => {

    connected = false;

    setStatus("Offline");

    chatStatus.textContent = "Disconnected";

    setSystemMessage(
        "Connection lost. Refresh the page."
    );

    messageInput.disabled = true;
    sendBtn.disabled = true;
    nextBtn.disabled = true;

    closePeerConnection();
});


/* =========================
   WAITING
========================= */

socket.on("waiting", () => {

    setStatus("Searching", "waiting");

    chatStatus.textContent =
        "Searching for someone...";

    setSystemMessage(
        "Finding a stranger..."
    );

});


/* =========================
   PARTNER FOUND
========================= */

socket.on("partner_found", async (data) => {
    partnerId = data.partnerId;
    isInitiator = data.initiator;
    chatStatus.textContent = "Connected";

    setStatus("Connected", "online");

    setSystemMessage(
        "You are now connected!"
    );

    messageInput.disabled = false;
    sendBtn.disabled = false;
    nextBtn.disabled = false;

    removeEmptyState();

    if (selectedMode === "video") {

        remotePlaceholder.classList.remove("hidden");

        createPeerConnection();

        /*
         * One user creates the offer.
         * We use socket ID comparison so both users
         * don't create offers at the same time.
         */
    if (isInitiator) {
         await createAndSendOffer();
}
    }

});


/*
 * The server currently doesn't send partner IDs.
 * For reliable offer creation, the server will need
 * one small update in the next step.
 */


/* =========================
   CREATE PEER CONNECTION
========================= */

function createPeerConnection() {

    closePeerConnection();

    peerConnection =
        new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {

        peerConnection.addTrack(
            track,
            localStream
        );

    });


    peerConnection.ontrack = event => {

        console.log(
            "Remote stream received"
        );

        remoteVideo.srcObject =
            event.streams[0];

        remotePlaceholder.classList.add(
            "hidden"
        );

    };


    peerConnection.onicecandidate =
        event => {

            if (event.candidate) {

                socket.emit(
                    "webrtc-ice-candidate",
                    event.candidate
                );

            }

        };


    peerConnection.onconnectionstatechange =
        () => {

            console.log(
                "WebRTC:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState ===
                "connected"
            ) {

                setSystemMessage(
                    "Video connected"
                );

            }

        };

}


/* =========================
   CREATE OFFER
========================= */

async function createAndSendOffer() {

    try {

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        socket.emit(
            "webrtc-offer",
            offer
        );

    } catch (error) {

        console.error(
            "Offer error:",
            error
        );

    }

}


/* =========================
   RECEIVE OFFER
========================= */

socket.on(
    "webrtc-offer",
    async offer => {

        try {

            if (!peerConnection) {
                createPeerConnection();
            }

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    offer
                )
            );

            const answer =
                await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(
                answer
            );

            socket.emit(
                "webrtc-answer",
                answer
            );

        } catch (error) {

            console.error(
                "Offer handling error:",
                error
            );

        }

    }
);


/* =========================
   RECEIVE ANSWER
========================= */

socket.on(
    "webrtc-answer",
    async answer => {

        try {

            if (!peerConnection) return;

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    answer
                )
            );

        } catch (error) {

            console.error(
                "Answer error:",
                error
            );

        }

    }
);


/* =========================
   RECEIVE ICE CANDIDATE
========================= */

socket.on(
    "webrtc-ice-candidate",
    async candidate => {

        try {

            if (
                peerConnection &&
                candidate
            ) {

                await peerConnection.addIceCandidate(
                    new RTCIceCandidate(
                        candidate
                    )
                );

            }

        } catch (error) {

            console.error(
                "ICE error:",
                error
            );

        }

    }
);


/* =========================
   TEXT MESSAGE
========================= */

messageForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        const text =
            messageInput.value.trim();

        if (!text || !connected) return;

        socket.emit("message", {
            text: text
        });

        addMessage(text, "mine");

        messageInput.value = "";
        messageInput.focus();

    }
);


socket.on("message", data => {

    const text =
        typeof data === "string"
            ? data
            : data?.text;

    if (!text) return;

    addMessage(text, "stranger");

});


function addMessage(text, type) {

    removeEmptyState();

    const message =
        document.createElement("div");

    message.className =
        "message " + type;

    const label =
        document.createElement("span");

    label.className =
        "message-label";

    label.textContent =
        type === "mine"
            ? "You"
            : "Stranger";

    const content =
        document.createElement("div");

    content.textContent = text;

    message.appendChild(label);
    message.appendChild(content);

    messages.appendChild(message);

    messages.scrollTop =
        messages.scrollHeight;

}


function removeEmptyState() {

    const empty =
        document.getElementById(
            "emptyState"
        );

    if (empty) {
        empty.remove();
    }

}


/* =========================
   PARTNER LEFT
========================= */

socket.on("partner_left", () => {

    setStatus("Searching", "waiting");

    chatStatus.textContent =
        "Stranger left";

    setSystemMessage(
        "The stranger disconnected."
    );

    messageInput.disabled = true;
    sendBtn.disabled = true;
    nextBtn.disabled = true;

    closePeerConnection();

});


/* =========================
   NEXT STRANGER
========================= */

nextBtn.addEventListener(
    "click",
    () => {

        closePeerConnection();

        socket.emit("next");

        clearMessages();

        messageInput.disabled = true;
        sendBtn.disabled = true;
        nextBtn.disabled = true;

        setStatus("Searching", "waiting");

        chatStatus.textContent =
            "Searching...";

        setSystemMessage(
            "Finding another stranger..."
        );

        if (selectedMode === "video") {
            remoteVideo.srcObject = null;
            remotePlaceholder.classList.remove(
                "hidden"
            );
        }

    }
);


/* =========================
   STOP
========================= */

stopBtn.addEventListener(
    "click",
    () => {

        socket.emit("stop");

        stopEverything();

        chatScreen.classList.add("hidden");
        welcomeScreen.classList.remove("hidden");

        setStatus("Ready");

    }
);


function stopEverything() {

    closePeerConnection();

    stopLocalStream();

    clearMessages();

    messageInput.value = "";

    messageInput.disabled = true;
    sendBtn.disabled = true;
    nextBtn.disabled = true;

    remoteVideo.srcObject = null;

}


function stopLocalStream() {

    if (localStream) {

        localStream.getTracks().forEach(
            track => track.stop()
        );

        localStream = null;
    }

    localVideo.srcObject = null;

}


function closePeerConnection() {

    if (peerConnection) {

        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;

        peerConnection.close();

        peerConnection = null;
    }

}


/* =========================
   MICROPHONE
========================= */

micBtn.addEventListener(
    "click",
    () => {

        if (!localStream) return;

        isMuted = !isMuted;

        localStream
            .getAudioTracks()
            .forEach(track => {

                track.enabled =
                    !isMuted;

            });

        micBtn.textContent =
            isMuted ? "🔇" : "🎤";

    }
);


/* =========================
   CAMERA
========================= */

cameraBtn.addEventListener(
    "click",
    () => {

        if (!localStream) return;

        isCameraOff = !isCameraOff;

        localStream
            .getVideoTracks()
            .forEach(track => {

                track.enabled =
                    !isCameraOff;

            });

        cameraBtn.textContent =
            isCameraOff ? "🚫" : "📹";

    }
);


/* =========================
   REPORT
========================= */

reportBtn.addEventListener(
    "click",
    () => {
        reportModal.classList.remove("hidden");
    }
);


closeReport.addEventListener(
    "click",
    () => {
        reportModal.classList.add("hidden");
    }
);


reportOptions.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            socket.emit("report", {
                reason:
                    button.dataset.reason
            });

            reportModal.classList.add(
                "hidden"
            );

            setSystemMessage(
                "Report submitted."
            );

        }
    );

});


reportModal.addEventListener(
    "click",
    event => {

        if (
            event.target === reportModal
        ) {
            reportModal.classList.add(
                "hidden"
            );
        }

    }
);
