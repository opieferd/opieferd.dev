"use strict";

const http = require("node:http");
const RPC = require("discord-rpc");

const CLIENT_ID = "1559060742760693840";
const PORT = 6464;
const rpc = new RPC.Client({ transport: "ipc" });
let rpcReady = false;

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Access-Control-Allow-Origin": "https://opieferd.dev",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    });
    response.end(JSON.stringify(body));
}

function validUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:";
    } catch {
        return false;
    }
}

async function updateActivity(payload) {
    if (!rpcReady) throw new Error("Discord is not connected");

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const episode = typeof payload.episode === "string" ? payload.episode.trim() : "";
    if (!title || !episode || title.length > 100 || episode.length > 40) {
        throw new Error("Invalid title or episode");
    }

    const activity = {
        details: `Watching ${title} ${episode}`,
        state: "opieferd.dev/watch",
        instance: false
    };
    if (validUrl(payload.image)) {
        activity.assets = {
            large_image: payload.image,
            large_text: title
        };
    }
    await rpc.setActivity(activity);
}

const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Origin": "https://opieferd.dev",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        });
        response.end();
        return;
    }

    if (request.method !== "POST" || request.url !== "/activity") {
        sendJson(response, 404, { error: "Not found" });
        return;
    }

    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) request.destroy();
    });
    request.on("end", async () => {
        try {
            await updateActivity(JSON.parse(body));
            sendJson(response, 200, { ok: true });
        } catch (error) {
            console.error("Unable to update Discord Rich Presence:", error.message);
            sendJson(response, 503, { error: error.message });
        }
    });
});

rpc.on("ready", () => {
    rpcReady = true;
    console.log("Connected to Discord. Waiting for /watch activity.");
});

rpc.on("disconnected", () => {
    rpcReady = false;
    console.error("Discord disconnected. Is the Discord desktop app running?");
});

rpc.login({ clientId: CLIENT_ID }).catch((error) => {
    console.error("Unable to connect to Discord. Start the Discord desktop app first.", error.message);
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Watch Rich Presence bridge listening on http://127.0.0.1:${PORT}`);
});

function shutdown() {
    if (rpcReady) rpc.clearActivity().catch(() => {});
    rpc.destroy();
    server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
