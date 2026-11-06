"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WatchHistoryStore } = require("./history-store.js");
const item = (id = 42, extra = {}) => ({ id, type: "tv", title: `Show ${id}`, poster_path: "/poster.jpg", season: 1, episode: 2, progress: { currentTime: 120, duration: 1800 }, ...extra });
const memory = (entries = {}) => {
    const data = new Map(Object.entries(entries));
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data };
};
function database() {
    const preferences = new Map();
    const rows = new Map();
    const calls = [];
    let before = async () => {};
    const db = {
        preferences, rows, calls,
        before(callback) { before = callback; },
        from(table) {
            const q = { table, op: "select", filters: {}, rows: null, limit: 24 };
            const chain = {
                select() { return chain; },
                eq(key, value) { q.filters[key] = value; return chain; },
                order() { return chain; },
                limit(value) { q.limit = value; return chain; },
                maybeSingle() { return chain; },
                upsert(value, options) { q.op = "upsert"; q.rows = value; q.options = options; return chain; },
                delete() { q.op = "delete"; return chain; },
                then(resolve, reject) {
                    return (async () => {
                        calls.push(q);
                        await before(q);
                        if (q.op === "select") {
                            const uid = q.filters.user_id;
                            assert.ok(uid, "all reads must filter by the signed-in user");
                            if (table === "watch_history_preferences") return { data: preferences.get(uid) || null, error: null };
                            return { data: [...rows.values()].filter(row => row.user_id === uid).reverse().slice(0, q.limit), error: null };
                        }
                        if (q.op === "upsert") {
                            if (table === "watch_history_preferences") preferences.set(q.rows.user_id, { ...q.rows });
                            else for (const row of q.rows) rows.set(`${row.user_id}:${row.media_type}:${row.media_id}`, { ...row });
                        }
                        if (q.op === "delete") {
                            assert.ok(q.filters.user_id, "delete must target exactly one account");
                            for (const [key, row] of rows) if (row.user_id === q.filters.user_id) rows.delete(key);
                        }
                        return { data: null, error: null };
                    })().then(resolve, reject);
                }
            };
            return chain;
        }
    };
    return db;
}
const store = (storage = memory()) => new WatchHistoryStore({ storage, setTimer: () => 1, clearTimer() {} });
async function signedIn(db, uid = "user-a", storage = memory()) {
    const s = store(storage);
    await s.setAccount(db, uid);
    await s.chooseAccount();
    return s;
}
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

test("existing anonymous browser history is preserved and remains opt-in", () => {
    const storage = memory({ "watch-history": JSON.stringify([item()]), "watch-history-enabled": "true" });
    const s = store(storage);
    assert.equal(s.mode, "browser");
    assert.equal(s.read()[0].id, 42);
    s.save(item(43));
    assert.deepEqual(s.read().map(i => i.id), [43, 42]);
    assert.equal(store().enabled, false);
});

test("account opt-in syncs titles, episode and progress to a second device without browser copies", async () => {
    const db = database();
    const local = memory({ "watch-history": JSON.stringify([item(99)]), "watch-history-enabled": "true" });
    const first = await signedIn(db, "user-a", local);
    first.save(item());
    await first.flush();
    const secondStorage = memory();
    const second = store(secondStorage);
    await second.setAccount(db, "user-a");
    assert.equal(second.mode, "account");
    assert.equal(second.read()[0].progress.currentTime, 120);
    assert.equal(second.read()[0].episode, 2);
    assert.equal(secondStorage.getItem("watch-history"), null);
    assert.equal(JSON.parse(local.getItem("watch-history"))[0].id, 99, "anonymous data is not imported or overwritten");
    assert.equal(db.rows.size, 1);
});

test("signing in alone does not opt in or upload anonymous history", async () => {
    const db = database();
    const s = store(memory({ "watch-history": JSON.stringify([item()]), "watch-history-enabled": "true" }));
    await s.setAccount(db, "user-a");
    assert.equal(s.mode, "browser");
    s.save(item(43));
    await s.flush();
    assert.equal(db.rows.size, 0);
});

test("browser mode can be selected per device while other devices continue syncing", async () => {
    const db = database();
    const storage = memory();
    const s = await signedIn(db, "user-a", storage);
    s.chooseBrowser();
    s.save(item(99));
    await s.flush();
    const reloaded = store(storage);
    await reloaded.setAccount(db, "user-a");
    assert.equal(reloaded.mode, "browser");
    assert.equal(reloaded.read()[0].id, 99);
    const otherDevice = store();
    await otherDevice.setAccount(db, "user-a");
    assert.equal(otherDevice.mode, "account");
    assert.equal(otherDevice.read().length, 0);
});

test("progress updates coalesce and TV episode changes save immediately", async () => {
    const db = database();
    const s = await signedIn(db);
    s.save(item());
    await s.flush();
    const initialWrites = db.calls.filter(q => q.op === "upsert" && q.table === "watch_history").length;
    for (let i = 121; i < 150; i++) s.save(item(42, { progress: { currentTime: i, duration: 1800 } }));
    assert.equal(db.calls.filter(q => q.op === "upsert" && q.table === "watch_history").length, initialWrites);
    await s.flush();
    assert.equal([...db.rows.values()][0].position, 149);
    s.save(item(42, { episode: 3 }));
    await s.queue;
    assert.equal([...db.rows.values()][0].episode, 3);
    assert.equal(db.rows.size, 1);
});

test("sign-out immediately clears account cache and drops unsent writes", async () => {
    const db = database();
    const s = await signedIn(db);
    s.save(item());
    await s.flush();
    s.save(item(42, { progress: { currentTime: 999, duration: 1800 } }));
    await s.setAccount(db, null);
    assert.equal(s.read().length, 0);
    assert.equal(s.pending.size, 0);
    await s.flush();
    assert.equal([...db.rows.values()][0].position, 120);
});

test("late account reads cannot reveal another user's history after account switching", async () => {
    const db = database();
    const s = await signedIn(db);
    s.save(item());
    await s.flush();
    const gate = deferred();
    const started = deferred();
    db.before(async q => {
        if (q.op === "select" && q.table === "watch_history" && q.filters.user_id === "user-a") {
            started.resolve();
            await gate.promise;
        }
    });
    const refresh = s.refresh();
    await started.promise;
    await s.setAccount(db, "user-b");
    gate.resolve();
    await refresh;
    assert.equal(s.userId, "user-b");
    assert.equal(s.read().length, 0);
});

test("clearing account history waits for writes and leaves browser data intact", async () => {
    const db = database();
    const local = memory({ "watch-history": JSON.stringify([item(99)]) });
    const s = await signedIn(db, "user-a", local);
    const gate = deferred();
    const started = deferred();
    db.before(async q => {
        if (q.op === "upsert" && q.table === "watch_history") { started.resolve(); await gate.promise; }
    });
    s.save(item());
    await started.promise;
    const clear = s.clear();
    assert.equal(s.clearing, true);
    s.save(item(43));
    gate.resolve();
    await clear;
    assert.equal(db.rows.size, 0);
    assert.equal(s.read().length, 0);
    assert.equal(s.clearing, false);
    assert.equal(JSON.parse(local.getItem("watch-history"))[0].id, 99);
});

test("network failures keep pending progress and retry without replacing newer data", async () => {
    const db = database();
    const s = await signedIn(db);
    db.before(async q => { if (q.op === "upsert" && q.table === "watch_history") throw new Error("offline"); });
    s.save(item());
    await s.flush();
    assert.equal(s.pending.size, 1);
    assert.match(s.error, /hasn’t synced/);
    s.save(item(42, { progress: { currentTime: 500, duration: 1800 } }));
    db.before(async () => {});
    await s.flush();
    assert.equal([...db.rows.values()][0].position, 500);
    assert.equal(s.error, "");
});

test("missing migration reports a failure without claiming account sync is enabled", async () => {
    const db = database();
    db.before(async () => { throw new Error("table does not exist"); });
    const s = store();
    await s.setAccount(db, "user-a");
    assert.match(s.error, /unavailable/);
    assert.equal(await s.chooseAccount(), false);
    assert.notEqual(s.mode, "account");
    assert.match(s.error, /Couldn’t enable/);
});

test("blocked local storage reports failure and account mode works without it", async () => {
    const storage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
    const s = store(storage);
    s.chooseBrowser();
    s.save(item());
    assert.match(s.error, /couldn’t save/);
    const db = database();
    await s.setAccount(db, "user-a");
    assert.equal(await s.chooseAccount(), true);
    s.save(item());
    await s.flush();
    assert.equal(db.rows.size, 1);
});

test("browser history is deduplicated, capped at 24, and cleared independently", async () => {
    const s = store();
    s.chooseBrowser();
    for (let id = 1; id <= 30; id++) s.save(item(id));
    s.save(item(30, { episode: 3 }));
    assert.equal(s.read().length, 24);
    assert.equal(s.read()[0].episode, 3);
    await s.clear();
    assert.deepEqual(s.read(), []);
});

test("clearing after a failed in-flight write cannot resurrect its retry data", async () => {
    const db = database();
    const s = await signedIn(db);
    const started = deferred();
    const gate = deferred();
    db.before(async q => {
        if (q.op === "upsert" && q.table === "watch_history") {
            started.resolve();
            await gate.promise;
            throw new Error("network failed during clear");
        }
    });
    s.save(item());
    await started.promise;
    const clear = s.clear();
    gate.resolve();
    await clear;
    assert.equal(s.pending.size, 0);
    db.before(async () => {});
    await s.flush();
    assert.equal(db.rows.size, 0);
});

test("a refresh cannot claim sync succeeded while failed writes remain pending", async () => {
    const db = database();
    const s = await signedIn(db);
    db.before(async q => { if (q.op === "upsert" && q.table === "watch_history") throw new Error("offline"); });
    s.save(item());
    await s.flush();
    await s.refresh();
    assert.equal(s.pending.size, 1);
    assert.match(s.error, /hasn’t synced/);
});

// Exercise the actual page renderer with real store transitions, rather than
// duplicating the visibility condition in a separate test-only implementation.
function historyPrompt(storage = memory()) {
    const vm = require("node:vm");
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "watching.js"), "utf8");
    const renderer = source.slice(source.indexOf("    function renderHistoryOptions()"), source.indexOf("    function renderHistory()"));
    const button = () => ({ setAttribute() {}, classList: { toggle() {} } });
    const context = {
        saveHistoryPrompt: { hidden: false },
        saveHistoryButton: button(), saveAccountHistoryButton: button(),
        historySaveStatus: { textContent: "" }, historySyncStatus: { hidden: true, textContent: "" },
        pendingAccountHistory: false, historyPromptDismissed: false, historyStore: null
    };
    vm.createContext(context);
    vm.runInContext(renderer, context);
    context.historyStore = new WatchHistoryStore({
        storage, setTimer: () => 1, clearTimer() {}, onChange: () => context.renderHistoryOptions()
    });
    context.renderHistoryOptions();
    return { context, store: context.historyStore, hidden: () => context.saveHistoryPrompt.hidden };
}

test("history prompt disappears after browser selection and stays hidden on reload and saving", async () => {
    const storage = memory();
    const ui = historyPrompt(storage);
    assert.equal(ui.hidden(), false);
    ui.store.chooseBrowser();
    assert.equal(ui.hidden(), true);
    ui.store.save(item());
    assert.equal(ui.hidden(), true);
    assert.equal(ui.store.read()[0].id, 42);
    await ui.store.clear();
    assert.equal(ui.hidden(), true, "clearing saved titles does not undo the choice");
    assert.equal(historyPrompt(storage).hidden(), true, "remembered browser choice dismisses on reload");
});

test("account choice dismisses only after successful saving and restores on another device", async () => {
    const db = database();
    const ui = historyPrompt();
    await ui.store.setAccount(db, "user-a");
    const started = deferred();
    const gate = deferred();
    db.before(async q => {
        if (q.table === "watch_history_preferences" && q.op === "upsert") {
            started.resolve();
            await gate.promise;
        }
    });
    const choosing = ui.store.chooseAccount();
    await started.promise;
    assert.equal(ui.hidden(), false, "do not dismiss while the choice is still saving");
    gate.resolve();
    assert.equal(await choosing, true);
    assert.equal(ui.hidden(), true);
    const otherDevice = historyPrompt();
    await otherDevice.store.setAccount(db, "user-a");
    assert.equal(otherDevice.hidden(), true);
});

test("sign-in is required before an account choice dismisses the history prompt", async () => {
    const ui = historyPrompt();
    ui.context.pendingAccountHistory = true;
    ui.context.renderHistoryOptions();
    assert.equal(await ui.store.chooseAccount(), false);
    assert.equal(ui.hidden(), false);
    assert.match(ui.context.historySaveStatus.textContent, /Sign in/);
    const db = database();
    await ui.store.setAccount(db, "user-a");
    ui.context.pendingAccountHistory = false;
    await ui.store.chooseAccount();
    assert.equal(ui.hidden(), true);
    await ui.store.setAccount(db, null);
    assert.equal(ui.hidden(), false, "signed-out users with no browser choice get the prompt");
});

test("failed browser or account choices leave the prompt visible with an error", async () => {
    const blocked = historyPrompt({ getItem() { return null; }, setItem() { throw Error("blocked"); } });
    blocked.store.chooseBrowser();
    assert.equal(blocked.hidden(), false);
    assert.match(blocked.context.historySaveStatus.textContent, /blocking storage/);
    const db = database();
    const account = historyPrompt();
    await account.store.setAccount(db, "user-a");
    db.before(async () => { throw Error("offline"); });
    assert.equal(await account.store.chooseAccount(), false);
    assert.equal(account.hidden(), false);
    assert.match(account.context.historySaveStatus.textContent, /Couldn’t enable/);
});

test("a later sync error stays in the history status without reopening the choice prompt", async () => {
    const db = database();
    const ui = historyPrompt();
    await ui.store.setAccount(db, "user-a");
    await ui.store.chooseAccount();
    assert.equal(ui.hidden(), true);
    db.before(async q => { if (q.table === "watch_history" && q.op === "upsert") throw Error("offline"); });
    ui.store.save(item());
    await ui.store.flush();
    assert.equal(ui.hidden(), true);
    assert.equal(ui.context.historySyncStatus.hidden, false);
    assert.match(ui.context.historySyncStatus.textContent, /hasn’t synced/);
});

test("a remembered account choice never falls back to browser storage during an outage", async () => {
    const db = database();
    db.preferences.set("user-a", { enabled: true });
    const storage = memory({
        "watch-history-enabled": "true",
        "watch-history-mode:user-a": "account",
        "watch-history": JSON.stringify([item(99)])
    });
    db.before(async q => { if (q.table === "watch_history_preferences") throw Error("offline"); });
    const s = store(storage);
    await s.setAccount(db, "user-a");
    assert.equal(s.mode, "account");
    s.save(item(42));
    await s.flush();
    assert.equal(JSON.parse(storage.getItem("watch-history"))[0].id, 99);
});

test("reconnecting retries account preferences after a failed initial load", async () => {
    const db = database();
    db.preferences.set("user-a", { enabled: true });
    db.rows.set("user-a:tv:42", { user_id: "user-a", media_type: "tv", media_id: 42, title: "Saved show", season: 1, episode: 2, position: 120, duration: 1800 });
    db.before(async () => { throw Error("offline"); });
    const s = store();
    await s.setAccount(db, "user-a");
    assert.notEqual(s.mode, "account");
    db.before(async () => {});
    await s.setAccount(db, "user-a", true);
    assert.equal(s.mode, "account");
    assert.equal(s.read()[0].id, 42);
});

test("concurrent ready events await the same account initialization", async () => {
    const db = database();
    db.preferences.set("user-a", { enabled: true });
    const gate = deferred();
    const started = deferred();
    db.before(async q => { if (q.table === "watch_history_preferences") { started.resolve(); await gate.promise; } });
    const s = store();
    const first = s.setAccount(db, "user-a");
    await started.promise;
    let secondDone = false;
    const second = s.setAccount(db, "user-a").then(() => { secondDone = true; });
    await Promise.resolve();
    assert.equal(secondDone, false);
    gate.resolve();
    await Promise.all([first, second]);
    assert.equal(s.mode, "account");
    assert.equal(db.calls.filter(q => q.table === "watch_history_preferences").length, 1);
});

test("the page saves the playing title when account mode recovers after sign-in", async () => {
    const db = database();
    db.preferences.set("user-a", { enabled: true });
    db.before(async () => { throw Error("offline"); });
    const s = store();
    await s.setAccount(db, "user-a");
    db.before(async () => {});
    const fs = require("node:fs");
    const path = require("node:path");
    const vm = require("node:vm");
    const source = fs.readFileSync(path.join(__dirname, "watching.js"), "utf8");
    const fn = source.slice(source.indexOf("    async function syncHistoryAccount("), source.indexOf("    try { pendingAccountHistory = sessionStorage"));
    let saves = 0;
    const context = {
        window: { OpieAccount: { client: db, getUser: () => ({ id: "user-a" }) } },
        historyStore: s, pendingAccountHistory: false,
        savePlayingTitleToHistory() { saves++; s.save(item()); }
    };
    vm.createContext(context);
    vm.runInContext(fn, context);
    await context.syncHistoryAccount(true);
    await s.flush();
    assert.equal(saves, 1);
    assert.equal([...db.rows.values()][0].media_id, 42);
});

test("returning to a device picks up account opt-in enabled on another device", async () => {
    const db = database();
    const s = store();
    await s.setAccount(db, "user-a");
    assert.equal(s.mode, "");
    db.preferences.set("user-a", { enabled: true });
    await s.setAccount(db, "user-a", true);
    assert.equal(s.mode, "account");
    s.chooseBrowser();
    await s.setAccount(db, "user-a", true);
    assert.equal(s.mode, "browser", "an explicit browser-only choice still wins on this device");
});
