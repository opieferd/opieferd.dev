# Account watch history

The Supabase schema and migrations have already been applied. Completed SQL
setup scripts have been removed from this repository; their earlier versions
remain available in Git history. The website uses the existing Supabase tables
and policies configured for the project in `watch/accounts.js`.

The home-page prompt shows **In the browser (anonymous)** and
**Account (synced between devices)** side by side. The prompt disappears after a choice succeeds and stays
hidden on reload for a remembered choice. Failed choices remain visible for retry. Selecting Account while signed out opens sign-in.

Browser history preserves existing data and never automatically uploads it.
Account opt-in is saved in Supabase so other devices signed into that account
load the same history. Selecting Browser changes the choice on this device
without disabling account history elsewhere.

Account history stores the latest episode and reported position per title;
the rail shows the latest 24. Title/episode changes save immediately, while
progress updates are batched every 10 seconds. Closing the player, hiding the
tab, and leaving the page attempt to flush progress. Abrupt termination can
lose unsynced seconds. Resume still depends on provider support.

History refreshes on page load, focus, returning to the tab, and reconnecting.
It shares saved history rather than synchronizing simultaneous playback.
Account data stays in memory and Supabase, separate from browser storage.
Sign-out and account switches clear the account cache immediately. Unsaved
updates retry while the page remains open; errors are shown.

Clearing account history deletes it across devices. Clearing browser history
affects only this browser. Supabase row-level security restricts users to their
own rows; anonymous users have no access. No service key is used in the website.

Run `node --test watch/history-store.test.cjs premid/presence.test.cjs`.
Tests use simulated clients, not a live database. For live verification,
check saving/resuming on two devices and confirm a different account cannot
read or delete the first account's history.
