"use strict";

require("dotenv").config();

const http = require("node:http");
const {
    ActivityType,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT) || 3000;
const watchUrl = process.env.WATCH_URL || "https://opieferd.dev/watch/";

if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. Copy .env.example to .env and fill them in.");
    process.exit(1);
}

let ready = false;
let startedAt = Date.now();

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check whether the Opieferd bot is responsive."),
    new SlashCommandBuilder()
        .setName("watch")
        .setDescription("Get the link to Opie Watch."),
    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn what the Opieferd bot does.")
];

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const healthServer = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    const body = {
        ok: ready,
        service: "opieferd-discord-bot",
        discord: ready ? "connected" : "connecting",
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000)
    };

    response.writeHead(ready ? 200 : 503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(body));
});

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(token);
    const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId);

    await rest.put(route, { body: commands.map((command) => command.toJSON()) });
    console.log(`Registered ${commands.length} slash commands (${guildId ? "test guild" : "globally"}).`);
}

client.once(Events.ClientReady, (readyClient) => {
    ready = true;
    startedAt = Date.now();
    readyClient.user.setPresence({
        activities: [{ name: "Opie Watch", type: ActivityType.Watching }],
        status: "online"
    });
    console.log(`Logged in as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === "ping") {
            const latency = Math.max(0, Math.round(client.ws.ping));
            await interaction.reply({
                content: `Pong! Gateway latency: ${latency} ms.`,
                ephemeral: true
            });
            return;
        }

        if (interaction.commandName === "watch") {
            const embed = new EmbedBuilder()
                .setColor(0x8b5cf6)
                .setTitle("Opie Watch")
                .setDescription("Browse movies, TV, and anime on Opie Watch.")
                .setURL(watchUrl)
                .setFooter({ text: "opieferd.dev" });

            await interaction.reply({
                content: watchUrl,
                embeds: [embed]
            });
            return;
        }

        if (interaction.commandName === "about") {
            await interaction.reply({
                content: "I'm the Opieferd community bot. Use /watch to open Opie Watch or /ping to check whether I'm online.",
                ephemeral: true
            });
        }
    } catch (error) {
        console.error("Interaction handler failed:", error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "Something went wrong handling that command. Please try again later.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

client.on(Events.Error, (error) => {
    console.error("Discord client error:", error);
});

client.on(Events.ShardDisconnect, () => {
    ready = false;
});

client.on(Events.ShardReady, () => {
    ready = true;
});

healthServer.listen(port, "0.0.0.0", () => {
    console.log(`Health endpoint listening on port ${port} at /healthz.`);
});

async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down.`);
    ready = false;
    healthServer.close();
    client.destroy();
    process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

(async () => {
    try {
        await registerCommands();
        await client.login(token);
    } catch (error) {
        console.error("Unable to start Discord bot:", error);
        process.exitCode = 1;
        healthServer.close();
        client.destroy();
    }
})();
