# Opieferd Discord Bot Backend

This is a standalone Discord bot service for Opieferd. It is intentionally kept separate from the website and from the local Rich Presence helper in `discord-rpc-helper/`.

## Included

- `/ping` — checks bot responsiveness and reports gateway latency.
- `/watch` — links to OPwatch.
- `/about` — explains the bot's basic commands.
- Presence — shows the bot account as **Watching OPwatch**.
- `GET /healthz` — JSON health endpoint for hosting-platform health checks.
- Environment-based secrets; no bot token is stored in source control.

## Requirements

- Node.js 20 or newer.
- A Discord application and bot created in the [Discord Developer Portal](https://discord.com/developers/applications).

## Run locally

1. Create a bot application in the Discord Developer Portal.
2. Under **Bot**, create/reset the bot token. Keep it private.
3. Under **General Information**, copy the Application ID.
4. Invite the bot to your server with the `bot` and `applications.commands` scopes. It needs no privileged gateway intents for the included commands.
5. From this directory, run:

   ```sh
   cp .env.example .env
   # Edit .env and fill in DISCORD_TOKEN and DISCORD_CLIENT_ID
   npm install
   npm start
   ```

6. Open `http://localhost:3000/healthz` to check service health, then try `/ping`, `/watch`, and `/about` in Discord.

For fast slash-command updates while developing, set `DISCORD_GUILD_ID` to your test server's ID. Leave it blank to register commands globally; global command updates can take a while to appear.

## Deployment

Deploy this directory as a Node.js service with `npm install` and `npm start`. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and optionally `DISCORD_GUILD_ID`, `PORT`, and `WATCH_URL` in the host's environment settings. Do not commit `.env`.

The service exposes only `/healthz` over HTTP. It does not expose the bot token or a public endpoint for arbitrary activity changes.

## Important: bot presence vs. your personal Rich Presence

A normal Discord bot can set **its own** activity, but it cannot change a user's personal Discord Rich Presence. The website's current `discord-rpc-helper/` is a different, local desktop bridge: it requires the user to run it on the same computer as the browser and the Discord desktop app. Hosting this bot backend does not replace that local bridge or make it possible to set a user's activity remotely.
