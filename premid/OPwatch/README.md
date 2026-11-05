# OPwatch Discord activity

Application ID: `1558711400132640918`. No secret, bot token, hosted API, or
local Node server is needed. The website remains a static site and can be
hosted on GitHub Pages, Vercel, or another static host.

## Install for testing

1. Install the browser extension from https://premid.app/downloads and keep
   Discord desktop running with activity sharing enabled.
2. Download `watch/discord/opwatch-premid.zip` and keep it zipped. In PreMiD's
   settings, enable **Activity Developer Mode**. Open its Developer tab, choose
   **Load Compiled Activity** (or the activity ZIP upload button), and select
   `opwatch-premid.zip`. No source folder or local build is needed for visitors.
3. Open https://opieferd.dev/watch/, play a title, and enable **Discord sharing**
   in the player. Deploy the updated site files first when testing production.
4. Check Discord's profile activity. Changing movies or episodes updates the
   activity. Closing the player or turning sharing off clears it on the next
   PreMiD update. Sharing defaults to off and is remembered per site origin.

PreMiD's compiled activity loader is documented at:
https://docs.premid.app/v1/guide/loading-activities.html

## Public distribution

`watch/discord/opwatch-premid.zip` is a compiled activity containing
`metadata.json`, `presence.js`, and `iframe.js` at its root. Rebuild it after edits
with `python3 scripts/package-premid.py` (requires Node.js 22.13+ and Python 3).
The offline builder strips TypeScript, bundles the two PreMiD runtime imports
from `premid/runtime.ts`, wraps scripts as IIFEs, and validates JavaScript syntax.
Its archive layout matches PreMiD's ActivityCompiler ZIP output. It does not run
the official CLI's store submission checks or TypeScript type checking.
For ordinary one-click installation, submit this activity to
https://github.com/PreMiD/Activities under `websites/O/OPwatch` and wait for
review/publication. It is not currently published in the PreMiD store. Do not
present the download as a store installation. No Vercel backend is needed.

The author ID comes from the site's existing public Discord profile link.
Confirm it before submitting the activity for public review. Follow the
Activities repository's current image and contribution requirements as well.

## Playback support

The site's shared player publishes title, media type, episode, poster, and the
selected embed URL in `#player-section`'s `data-discord-presence` attribute.
This exposes no account information and makes no requests to localhost.

PreMiD's iframe script reads actual HTML video playback on the six configured
provider domains. It uses data only when the iframe URL matches the active
player. Trusted progress messages already supported by the site are a fallback.
Pause/progress samples expire after 15 seconds, so blocked, redirected, nested,
or unsupported embeds show title/episode without invented playback timers.
Provider redirects or nested video hosts may require extending the iframe
matching after testing those providers. Autonext inside an embed is not treated
as a title/episode change unless the site itself updates its episode selection.

## Verify

Run `node --test premid/presence.test.cjs` from the repository root. The tests
exercise the compiled JavaScript against a simulated PreMiD runtime and the browser adapter
against a minimal DOM. Live Discord/browser verification is still required for
each provider; tests do not validate PreMiD's installer or Discord's rendering.
