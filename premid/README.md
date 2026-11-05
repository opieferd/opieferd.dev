# OPwatch PreMiD activity

The contribution source is in `websites/O/OPwatch/`, matching the layout of
[PreMiD/Activities](https://github.com/PreMiD/Activities). The Discord application
ID is `1558711400132640918`. Only that activity folder belongs in an upstream PR.
The local tooling, vendor directory, and generated ZIPs do not.

## Current status

The activity builds with esbuild against the real upstream PreMiD runtime.
Its metadata passes upstream JSON schema 1.17. The local regression tests pass.
This does **not** mean it is published or that the store review is complete.

Before submission, the following requirements remain:

1. Replace `logo` with a direct Imgur URL for a **512×512** OPwatch logo and
   `thumbnail` with a direct Imgur URL for a wide promotional image. The current
   site favicon is 175×160 and is only a provisional metadata value.
2. Run the official build, lint, and validation checks in a current fork.
3. Attach at least two real, unaltered screenshots showing the site alongside
   Discord activity, plus a screenshot of the extension's activity settings.
4. Create a PR from a fork of PreMiD/Activities. No fork was accessible through
   the connected GitHub account, and the connector cannot create one.

The source and screenshots must comply with the upstream
[contribution guide](https://github.com/PreMiD/Activities/blob/main/.github/CONTRIBUTING.md).
The current provisional image URLs intentionally fail the submission audit;
no successful metadata/image validation or live Discord verification is claimed.

## Develop and submit with the official tools

Fork https://github.com/PreMiD/Activities/fork, clone the fork, and copy this
repository's `premid/websites/O/OPwatch` to the fork's `websites/O/OPwatch`.
From the root of the fork:

```sh
npm ci
npx pmd build OPwatch --validate --zip
npx eslint websites/O/OPwatch
npx pmd dev OPwatch
```

The included `presence.test.ts` is a real-browser test that asks you to open a
title and enable site sharing, then verifies activity clearing when disabled.
It needs PreMiD's extension in Activity Developer Mode and a supported version.
Run `npx pmd test OPwatch` to run it separately. These interactive tests have
not been run in this environment.

Use PR title and commit message `feat(OPwatch): add activity`. A draft PR body
is in `submission/PR.md`; leave unchecked validation items unchecked until run.

This site's `PreMiD activity` GitHub Actions workflow checks out upstream commit
`ce94323cfba763f14412281aeebc34ea80887596`, copies the activity into it, and runs
its actual pmd compiler, ESLint rules, and metadata/image validation. It uploads
the official build when one is produced. Update the pinned upstream commit when
preparing the final fork PR. Workflow results must be inspected before claiming
that the official checks passed.

## Local build and regression tests

```sh
npm ci --prefix premid --ignore-scripts
npm run build --prefix premid
npm run validate --prefix premid
node scripts/validate-premid.cjs --submission
node --test premid/presence.test.cjs
```

The submission audit currently exits nonzero for the missing compliant images.
Local builds use esbuild and vendored upstream runtime sources for reproducible
imports. They do not replace the upstream CLI's TypeScript checks and lint.

Two different archives are produced:

- `watch/discord/opwatch-premid.zip`: compiled `metadata.json`, `presence.js`, and
  `iframe.js` at the root. Select this directly in the extension's compiled ZIP
  upload. Keep it zipped.
- `watch/discord/opwatch-premid-source.zip`: source files under
  `websites/O/OPwatch/`, ready to copy into the fork. This is not an extension
  upload and does not make the activity available in the store.

## Behavior and privacy

The site publishes only the selected media title, episode, poster URL, embed URL,
and supported playback samples in `#player-section[data-discord-presence]`.
Sharing is opt-in. The activity reads that public DOM data, makes no account
requests, and does not alter the website. It clears when sharing is off or the
player closes. The portfolio homepage and unrelated pages publish no activity.

Playback comes from trusted site messages or the selected provider iframe.
Pause/progress samples expire after 15 seconds. Blocked, nested, or redirected
embeds can show the title without a timer. An embed's internal autonext cannot
update the site's selected episode unless it reports that change to the site.

Language uses PreMiD's common strings. Extension settings control covers,
timestamps, and privacy mode. There are no promotional homepage buttons.
