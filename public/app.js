const socket = io();

const welcomeScreen =
    document.getElementById("welcomeScreen");

const chatScreen =
    document.getElementById("chatScreen");

const startBtn =
    document.getElementById("startBtn");

const nextBtn =
    document.getElementById("nextBtn");

const stopBtn =
    document.getElementById("stopBtn");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const messages =
    document.getElementById("messages");

const systemMessage =
    document.getElementById("systemMessage");

const statusText =
    document.getElementById("statusText");

const statusDot =
    document.getElementById("statusDot");


let isMatched = false;


/* Status */

function setStatus(text, type = "") {
    statusText.textContent = text;

    statusDot.className = "";

    if (type) {
        statusDot.classList.add(type);
    }
}


/* System message */

function setSystemMessage(text) {
    systemMessage.textContent = text;
}


/* Enable / disable chat */

function setChatEnabled(enabled) {
    isMatched = enabled;

    messageInput.disabled = !enabled;
    sendBtn.disabled = !enabled;

    nextBtn.disabled = false;

    if (enabled) {
        messageInput.focus();
    }
}


/* Add message */

function addMessage(text, type) {
    const message = document.createElement("div");

    message.className =
        `message ${type}`;

    const label =
        document.createElement("span");

    label.className =
        "message-label";

    label.textContent =
        type === "mine"
            ? "You"
            : "Stranger";

    const content =
        document.createElement("span");

    // textContent prevents HTML injection
    content.textContent = text;

    message.appendChild(label);
    message.appendChild(content);

    messages.appendChild(message);

    messages.scrollTop =
        messages.scrollHeight;
}


/* Start */

startBtn.addEventListener(
    "click",
    () => {
        welcomeScreen.classList.add("hidden");
        chatScreen.classList.remove("hidden");

        messages.innerHTML = "";

        setChatEnabled(false);

        setSystemMessage(
            "Looking for someone to chat with..."
        );

        setStatus(
            "Looking for stranger",
            "waiting"
        );

        socket.emit("find-partner");
    }
);


/* Next */

nextBtn.addEventListener(
    "click",
    () => {
        messages.innerHTML = "";

        setChatEnabled(false);

        setSystemMessage(
            "Finding a new stranger..."
        );

        setStatus(
            "Looking for stranger",
            "waiting"
        );

        socket.emit("next");
    }
);


/* Stop */

stopBtn.addEventListener(
    "click",
    () => {
        socket.emit("stop");

        setChatEnabled(false);

        messages.innerHTML = "";

        chatScreen.classList.add("hidden");
        welcomeScreen.classList.remove("hidden");

        setStatus("Ready to chat");

        setSystemMessage(
            "Click Start Chat to begin."
        );
    }
);


/* Send message */

messageForm.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();

        const message =
            messageInput.value.trim();

        if (!message || !isMatched) {
            return;
        }

        socket.emit("message", message);

        addMessage(message, "mine");

        messageInput.value = "";
        messageInput.focus();
    }
);


/* Socket events */

socket.on("connected", () => {
    setStatus("Connected", "online");
});


socket.on("waiting", () => {
    setChatEnabled(false);

    setSystemMessage(
        "Waiting for another person..."
    );

    setStatus(
        "Waiting for stranger",
        "waiting"
    );
});


socket.on("matched", () => {
    messages.innerHTML = "";

    setChatEnabled(true);

    setSystemMessage(
        "You are now chatting with a stranger."
    );

    setStatus(
        "Chatting anonymously",
        "online"
    );
});


socket.on("message", (message) => {
    if (!isMatched) return;

    addMessage(message, "stranger");
});


socket.on("partner-left", () => {
    setChatEnabled(false);

    setSystemMessage(
        "The stranger has left. Click Next to find someone else."
    );

    setStatus(
        "Stranger disconnected"
    );
});


socket.on("partner-disconnected", () => {
    setChatEnabled(false);

    setSystemMessage(
        "Previous stranger disconnected. Looking for someone new..."
    );

    setStatus(
        "Looking for stranger",
        "waiting"
    );
});


socket.on("stopped", () => {
    setChatEnabled(false);
});


socket.on("disconnect", () => {
    setChatEnabled(false);

    setStatus("Server disconnected");

    setSystemMessage(
        "Connection lost. Please refresh the page."
    );
});


socket.on("connect", () => {
    setStatus("Connected", "online");
});