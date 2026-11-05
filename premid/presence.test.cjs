"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { compileActivity } = require("../scripts/build-premid.cjs");
const root = path.resolve(__dirname, "..");
const { execFileSync } = require("node:child_process");
const compiled = JSON.parse(execFileSync("python3", ["-c",
    "import json,zipfile; z=zipfile.ZipFile('watch/discord/opwatch-premid.zip'); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))"
], { cwd: root, encoding: "utf8" }));

test("download ZIP contains current compiled scripts and metadata at the archive root", () => {
    assert.deepEqual(Object.keys(compiled).sort(), ["iframe.js", "metadata.json", "presence.js"]);
    assert.deepEqual(compiled, compileActivity());
    for (const name of ["presence.js", "iframe.js"]) {
        assert.doesNotMatch(compiled[name], /^\s*(?:import|export)\s/m);
        new vm.Script(compiled[name], { filename: name });
    }
});
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sample = (extra = {}) => ({
    version: 1, enabled: true, active: true, title: "Example show", mediaType: "tv",
    mediaId: 42, season: 2, episode: 3,
    image: "https://image.tmdb.org/t/p/w500/poster.jpg",
    playerUrl: "https://vidrock.to/tv/42/2/3?autoplay=true", ...extra
});

function runtime() {
    const handlers = {};
    const section = { hidden: false, dataset: { discordPresence: JSON.stringify(sample()) } };
    let now = 1800000000000;
    let activity;
    let clears = 0;
    let clientId;
    class Presence {
        constructor(options) { clientId = options.clientId; }
        on(event, callback) { handlers[event] = callback; }
        clearActivity() { activity = null; clears++; }
        setActivity(data) { activity = JSON.parse(JSON.stringify(data)); }
    }
    const context = {
        Presence, URL,
        document: { querySelector: () => section },
        Date: class extends Date { static now() { return now; } }
    };
    vm.runInNewContext(compiled["presence.js"], context);
    return {
        section, handlers, get activity() { return activity; }, get clears() { return clears; }, get clientId() { return clientId; },
        tick: () => handlers.UpdateData(),
        setState(value) { section.dataset.discordPresence = JSON.stringify(value); },
        advance(ms) { now += ms; },
        frame(video, url = sample().playerUrl) { handlers.iFrameData({ url, video: { ...video, updatedAt: now } }); },
        get now() { return now; }
    };
}

test("configured application, TV episode, poster, and movie activity", () => {
    const r = runtime();
    r.tick();
    assert.equal(r.clientId, "1558711400132640918");
    assert.equal(r.activity.type, 3);
    assert.equal(r.activity.details, "Example show");
    assert.match(r.activity.state, /S2 E3/);
    assert.equal(r.activity.largeImageKey, sample().image);
    assert.equal(r.activity.startTimestamp, undefined);
    r.setState(sample({ title: "Example movie", mediaType: "movie", image: "" }));
    r.tick();
    assert.match(r.activity.state, /Movie/);
    assert.match(r.activity.largeImageKey, /favicon/);
});

test("real iframe progress produces timestamps; pause removes them; stale samples expire", () => {
    const r = runtime();
    r.frame({ currentTime: 120, duration: 1800, paused: false });
    r.tick();
    assert.equal(r.activity.endTimestamp - r.activity.startTimestamp, 1800);
    const expectedEnd = r.activity.endTimestamp;
    r.advance(5000);
    r.tick();
    assert.equal(r.activity.endTimestamp, expectedEnd, "countdown must not restart on each extension tick");
    r.frame({ currentTime: 125, duration: 1800, paused: true });
    r.tick();
    assert.match(r.activity.state, /^Paused/);
    assert.equal(r.activity.endTimestamp, undefined);
    r.advance(16000);
    r.tick();
    assert.doesNotMatch(r.activity.state, /^Paused/);
    assert.equal(r.activity.endTimestamp, undefined);
});

test("late messages from another episode or provider cannot supply progress", () => {
    const r = runtime();
    r.frame({ currentTime: 120, duration: 1800, paused: false });
    r.setState(sample({ episode: 4, playerUrl: "https://vidrock.to/tv/42/2/4?autoplay=true" }));
    r.frame({ currentTime: 150, duration: 1800, paused: true });
    r.tick();
    assert.match(r.activity.state, /S2 E4/);
    assert.doesNotMatch(r.activity.state, /^Paused/);
    assert.equal(r.activity.endTimestamp, undefined);
    r.frame({ currentTime: 200, duration: 1800, paused: false }, "https://ads.example/video");
    r.tick();
    assert.equal(r.activity.endTimestamp, undefined);
});

test("trusted site progress is a fallback and unknown pause state invents no timer", () => {
    const r = runtime();
    r.setState(sample({ playback: { currentTime: 0, duration: 1800, paused: false, updatedAt: r.now } }));
    r.tick();
    assert.ok(r.activity.endTimestamp);
    r.setState(sample({ playback: { currentTime: 200, duration: 1800, paused: null, updatedAt: r.now } }));
    r.tick();
    assert.equal(r.activity.endTimestamp, undefined);
    r.setState(sample({ playback: { currentTime: -1, duration: 1800, paused: false, updatedAt: r.now } }));
    r.tick();
    assert.equal(r.activity.endTimestamp, undefined);
});

test("disabled sharing, closed player, hidden section, and malformed data clear activity", () => {
    const r = runtime();
    for (const state of [sample({ enabled: false }), sample({ active: false }), null, { version: 2 }]) {
        r.setState(state);
        r.tick();
        assert.equal(r.activity, null);
    }
    r.section.dataset.discordPresence = "not JSON";
    r.tick();
    assert.equal(r.activity, null);
    r.setState(sample());
    r.section.hidden = true;
    r.tick();
    assert.equal(r.activity, null);
    assert.equal(r.clears, 6);
});

function adapter(stored = null, blockedStorage = false) {
    const listeners = {};
    const elements = [];
    const createElement = () => {
        const element = {
            dataset: {}, children: [], attributes: {}, listeners: {},
            append(...children) { this.children.push(...children); },
            setAttribute(key, value) { this.attributes[key] = value; },
            addEventListener(event, callback) { this.listeners[event] = callback; }
        };
        elements.push(element);
        return element;
    };
    const section = createElement();
    const window = { addEventListener(event, callback) { listeners[event] = callback; } };
    const context = {
        window, URL,
        document: { getElementById: () => section, createElement, currentScript: { src: "https://opieferd.dev/watch/discord-presence.js?v=1" } },
        localStorage: {
            getItem() { if (blockedStorage) throw new Error("blocked"); return stored; },
            setItem(key, value) { if (blockedStorage) throw new Error("blocked"); stored = value; }
        }
    };
    vm.runInNewContext(read("watch/discord-presence.js"), context);
    const controls = section.children[0];
    return {
        section, window, listeners, controls,
        state: () => JSON.parse(section.dataset.discordPresence),
        toggle: () => controls.children[0].listeners.click(),
        stored: () => stored,
        storage(value) { stored = value; listeners.storage({ key: "watch-discord-sharing" }); }
    };
}

test("site sharing defaults off, persists opt-in, resets playback on title change, and clears", () => {
    const a = adapter();
    a.window.OpwatchDiscord.update(sample());
    assert.equal(a.state().enabled, false);
    assert.equal(a.state().title, undefined);
    a.toggle();
    assert.equal(a.stored(), "true");
    assert.equal(a.state().active, true);
    assert.equal(a.controls.children[0].attributes["aria-pressed"], "true");
    assert.equal(a.controls.children[1].href, "https://opieferd.dev/watch/discord/");
    a.window.OpwatchDiscord.playback({ currentTime: 10, duration: 100, paused: false });
    assert.equal(a.state().playback.currentTime, 10);
    a.window.OpwatchDiscord.update(sample({ episode: 4 }));
    assert.equal(a.state().playback, null);
    a.window.OpwatchDiscord.clear();
    assert.equal(a.state().active, false);
});

test("opt-out in another tab, navigation, and blocked storage are handled", () => {
    const a = adapter("true");
    a.window.OpwatchDiscord.update(sample());
    a.listeners.pagehide();
    assert.equal(a.state().active, false);
    a.listeners.pageshow();
    assert.equal(a.state().active, true);
    a.storage("false");
    assert.equal(a.state().active, false);
    const blocked = adapter(null, true);
    blocked.window.OpwatchDiscord.update(sample());
    blocked.toggle();
    assert.equal(blocked.state().active, true);
});

test("iframe adapter selects the largest playable video and reports no-video state", () => {
    let callback;
    let sent;
    let videos = [
        { readyState: 4, currentTime: 0, duration: 20, paused: true, ended: false, clientWidth: 20, clientHeight: 20 },
        { readyState: 4, currentTime: 90, duration: 1800, paused: false, ended: false, clientWidth: 1920, clientHeight: 1080 }
    ];
    class iFrame {
        on(event, value) { callback = value; }
        send(value) { sent = value; }
    }
    vm.runInNewContext(compiled["iframe.js"], {
        iFrame, document: { querySelectorAll: () => videos }, window: { location: { href: sample().playerUrl } }
    });
    callback();
    assert.equal(sent.video.currentTime, 90);
    assert.equal(sent.video.paused, false);
    assert.equal(sent.url, sample().playerUrl);
    videos = [];
    callback();
    assert.equal(sent.video, null);
});

test("metadata limits injection to site watch pages and actual provider domains", () => {
    const metadata = JSON.parse(read("premid/OPwatch/metadata.json"));
    const site = new RegExp(metadata.regExp);
    const frame = new RegExp(metadata.iFrameRegExp);
    for (const url of ["https://opieferd.dev/watch/", "https://www.opieferd.dev/watch/tv/", "https://watch.opieferd.dev/"])
        assert.ok(site.test(url), url);
    for (const url of ["https://opieferd.dev/resume/", "https://evilopieferd.dev/watch/", "https://opieferd.dev/watchlist/"])
        assert.equal(site.test(url), false, url);
    for (const host of ["vidrock.to", "vidsrc.sh", "vidlink.pro", "vaplayer.ru", "cinesrc.st", "vixsrc.to"])
        assert.ok(frame.test(`https://${host}/embed/42`));
    assert.equal(frame.test("https://vidrock.to.evil.example/embed/42"), false);
});

test("episode lookup ignores results arriving after closing or selecting another title", async () => {
    const source = read("watch/watching.js");
    const fn = source.slice(source.indexOf("    async function loadEpisodes("), source.indexOf("    function updateVidVaultLink("));
    let resolveFetch;
    const calls = [];
    const context = {
        episodeSelect: { value: "1", innerHTML: "" }, seasonSelect: { value: "2" },
        mediaRequestId: 1, activeMediaType: "tv", activeMedia: { id: 42 },
        TMDB_API: "https://api.example", TMDB_KEY: "test", console,
        fetch: () => new Promise(resolve => { resolveFetch = resolve; }),
        escapeHtml: value => value,
        updatePlayer: (...args) => calls.push(args), updateVidVaultLink() {}, saveCurrentMedia() {}
    };
    vm.createContext(context);
    vm.runInContext(fn, context);
    const pending = context.loadEpisodes(42, 2, 1);
    context.mediaRequestId++;
    resolveFetch({ ok: true, json: async () => ({ episodes: [{ episode_number: 1, name: "Old episode" }] }) });
    await pending;
    assert.equal(calls.length, 0);
    const current = context.loadEpisodes(42, 2, 1);
    resolveFetch({ ok: true, json: async () => ({ episodes: [{ episode_number: 1, name: "Current episode" }] }) });
    await current;
    assert.deepEqual(calls, [[2, 1]]);
});
