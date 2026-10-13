# Watch Discord Rich Presence

This optional local helper updates the Discord desktop client while something is
playing on [opieferd.dev/watch](https://opieferd.dev/watch).

## Setup

1. Install Node.js 18 or newer and the Discord desktop app.
2. In this directory, run `npm install`.
3. Start the bridge with `npm start`.
4. Open `/watch` in the same browser.

The presence appears as `Watching {title} {episode}`. TV episodes use the
format `S1 E2`; movies use `Movie`. The current TMDB poster is sent as the
large image URL.

The Discord application ID is public and included in `server.js`. An
application secret is not required for local Rich Presence and must not be
placed in this repository or in browser code. If the secret shared during setup
is real, rotate it in the Discord Developer Portal.
