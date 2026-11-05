PR title: feat(OPwatch): add activity

## Description

Adds OPwatch, the movie, TV, and anime browsing/player section of opieferd.dev,
using Discord application ID 1558711400132640918. The activity displays the
selected title and episode, optional cover art, and reported pause/progress
state. It clears when the player is closed or site sharing is disabled.

The activity reads the site's public media-state DOM attribute without modifying
the DOM or accessing accounts, watch history, or user profiles. Its iframe code
reads HTML video elements only on the six configured provider domains. Exact
embed URL matching prevents old episode frames from supplying new progress.
Samples expire after 15 seconds; unsupported embeds do not get fabricated timers.

The portfolio root and unrelated subpages clear presence because their content
is unrelated to OPwatch. Common localized strings are used for playback state.
Settings include language, cover art, timestamps, and privacy. Cover art URLs
come from TMDB through the site's existing media metadata; no external API
requests or personal data are required by the activity.

This is a draft description. Replace the provisional logo and thumbnail URLs
with compliant Imgur images, run the official checks, and add real screenshots
before marking this contribution ready for review.

## Acknowledgements

- [x] I read the Activity Guidelines.
- [ ] I linted the code by running `npm run lint` in the upstream fork.
- [x] The proposed PR title follows the commit conventions.
- [ ] Official `npx pmd build OPwatch --validate --zip` passed.
- [ ] Metadata contains a 512×512 Imgur logo and an Imgur thumbnail.

## Screenshots

Pending: at least two real site/Discord activity screenshots (for example a
movie and a TV episode), plus screenshots of the activity settings. Do not use
mockups or generated screenshots as evidence of working Discord integration.
