# Account watch history

Run `watch/account-watch-history.sql` once in the SQL Editor of the Supabase
project configured in `watch/accounts.js`. It is safe to re-run and only adds
private history tables, policies, an index, and a timestamp trigger. New
installations include the same migration in `watch/supabaseschema.sql`.
Do not re-run the full schema just for this update: it also sets owner settings.

The migration has not been applied automatically: no database-management
connection was available. Until it is applied, account history shows an error
and browser history continues working.

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
Tests use simulated clients, not a live database. After applying the migration,
verify saving/resuming on two devices and confirm a different account cannot
read or delete the first account's history.
