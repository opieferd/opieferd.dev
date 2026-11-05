(function (root) {
    "use strict";
    const LIMIT = 24;
    const normalize = (items) => {
        const seen = new Set();
        return (Array.isArray(items) ? items : []).filter((item) => {
            if (!item || !Number.isInteger(Number(item.id)) || Number(item.id) <= 0 || !["movie", "tv"].includes(item.type)) return false;
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, LIMIT);
    };
    const fromRow = (row) => ({
        id: row.media_id, type: row.media_type, title: row.title, poster_path: row.poster_path,
        season: row.season, episode: row.episode,
        progress: { currentTime: row.position, duration: row.duration }
    });
    class WatchHistoryStore {
        constructor({ storage, onChange = () => {}, delay = 10000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
            this.storage = storage;
            this.onChange = onChange;
            this.delay = delay;
            this.setTimer = setTimer;
            this.clearTimer = clearTimer;
            this.client = null;
            this.userId = null;
            this.epoch = 0;
            this.version = 0;
            this.readVersion = 0;
            this.clearVersion = 0;
            this.clearing = false;
            this.items = [];
            this.pending = new Map();
            this.queue = Promise.resolve();
            this.loading = false;
            this.clearing = false;
            this.lastTitle = null;
            this.lastSelection = null;
            this.error = "";
            this.mode = this.get("watch-history-enabled") === "true" ? "browser" : "";
        }
        get(key) { try { return this.storage.getItem(key); } catch { return null; } }
        put(key, value) { this.storage.setItem(key, value); }
        get preferenceKey() { return this.userId ? `watch-history-mode:${this.userId}` : "watch-history-mode"; }
        get enabled() { return this.mode === "browser" || (this.mode === "account" && !!this.userId); }
        emit() { this.onChange(this); }
        read() {
            if (this.mode === "account") return this.userId ? this.items.slice() : [];
            if (this.mode !== "browser") return [];
            try { return normalize(JSON.parse(this.get("watch-history") || "[]")); } catch { return []; }
        }
        async setAccount(client, userId, force = false) {
            if (client === this.client && userId === this.userId) {
                if (force && userId && this.mode === "account") await this.refresh();
                return;
            }
            this.clearTimer(this.timer);
            this.epoch++;
            this.version++;
            this.client = client;
            this.userId = userId || null;
            this.pending.clear();
            this.items = [];
            this.loading = false;
            this.clearing = false;
            this.lastTitle = null;
            this.lastSelection = null;
            this.error = "";
            this.mode = this.get("watch-history-enabled") === "true" ? "browser" : "";
            const override = this.get(this.preferenceKey);
            if (override === "browser") this.mode = "browser";
            this.emit();
            if (!client || !this.userId || override === "browser") return;
            const epoch = this.epoch;
            this.loading = true;
            this.emit();
            try {
                const { data, error } = await client.from("watch_history_preferences").select("enabled").eq("user_id", this.userId).maybeSingle();
                if (error) throw error;
                if (epoch !== this.epoch) return;
                if (data?.enabled) {
                    this.mode = "account";
                    await this.refresh();
                }
            } catch {
                if (epoch === this.epoch) this.error = "Account history is unavailable. You can still save in this browser.";
            } finally {
                if (epoch === this.epoch) { this.loading = false; this.emit(); }
            }
        }
        chooseBrowser() {
            this.clearTimer(this.timer);
            // Requests already sent may finish for their original owner, but
            // unsent account progress must never be written in anonymous mode.
            this.epoch++;
            this.version++;
            this.pending.clear();
            this.items = [];
            this.mode = "browser";
            this.loading = false;
            this.error = "";
            try {
                this.put("watch-history-enabled", "true");
                this.put(this.preferenceKey, "browser");
            } catch { this.error = "Your browser is blocking storage, so history cannot be saved here."; }
            this.emit();
        }
        async chooseAccount() {
            if (!this.client || !this.userId) return false;
            if (this.mode === "account") { await this.refresh(); return !this.error; }
            const epoch = ++this.epoch;
            const client = this.client;
            const userId = this.userId;
            this.clearTimer(this.timer);
            this.loading = true;
            this.error = "";
            this.emit();
            try {
                const { error } = await client.from("watch_history_preferences").upsert({ user_id: userId, enabled: true }, { onConflict: "user_id" });
                if (error) throw error;
                if (epoch !== this.epoch) return false;
                this.mode = "account";
                this.items = [];
                this.pending.clear();
                try { this.put(this.preferenceKey, "account"); } catch { /* The server preference works without browser storage. */ }
                await this.refresh();
                return !this.error;
            } catch {
                if (epoch === this.epoch) this.error = "Couldn’t enable account history. Please try again.";
                return false;
            } finally {
                if (epoch === this.epoch) { this.loading = false; this.emit(); }
            }
        }
        async refresh() {
            if (!this.userId || this.mode !== "account") return;
            const epoch = this.epoch;
            const userId = this.userId;
            const version = this.version;
            const readVersion = ++this.readVersion;
            try {
                await this.flush();
                if (epoch !== this.epoch || this.pending.size) return;
                const { data, error } = await this.client.from("watch_history").select("media_id,media_type,title,poster_path,season,episode,position,duration,updated_at")
                    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(LIMIT);
                if (error) throw error;
                if (epoch !== this.epoch || this.mode !== "account" || readVersion !== this.readVersion) return;
                // Keep unsaved playback ahead of a refresh that started earlier.
                this.items = normalize([...(version !== this.version ? this.items : []), ...(data || []).map(fromRow)]);
                this.error = "";
            } catch {
                if (epoch === this.epoch && readVersion === this.readVersion) this.error = "Couldn’t load account history. Please try again when you’re online.";
            }
            if (epoch === this.epoch) this.emit();
        }
        save(item) {
            if (!this.enabled || this.clearing || !normalize([item]).length) return;
            if (this.mode === "browser") {
                try {
                    this.put("watch-history", JSON.stringify(normalize([item, ...this.read()])));
                    this.error = "";
                } catch { this.error = "Your browser couldn’t save watch history."; }
                this.emit();
                return;
            }
            this.version++;
            this.items = normalize([item, ...this.items]);
            const key = `${item.type}:${item.id}`;
            const newTitle = this.lastTitle !== key;
            this.lastTitle = key;
            this.pending.set(key, item);
            this.emit();
            // Save title/episode changes immediately; coalesce progress updates.
            const selection = `${key}:${item.season || 0}:${item.episode || 0}`;
            if (newTitle || this.lastSelection !== selection) {
                this.lastSelection = selection;
                void this.flush();
            } else if (!this.timer) {
                this.timer = this.setTimer(() => { this.timer = null; void this.flush(); }, this.delay);
            }
        }
        flush() {
            this.clearTimer(this.timer);
            this.timer = null;
            if (!this.userId || !this.pending.size) return this.queue;
            const epoch = this.epoch;
            const userId = this.userId;
            const client = this.client;
            const entries = [...this.pending.entries()];
            const clearVersion = this.clearVersion;
            this.pending.clear();
            this.queue = this.queue.catch(() => {}).then(async () => {
                if (epoch !== this.epoch) return;
                const rows = entries.map(([, item]) => ({
                    user_id: userId, media_id: Number(item.id), media_type: item.type,
                    title: String(item.title || "Untitled").slice(0, 200), poster_path: item.poster_path || "",
                    season: item.type === "tv" ? Number(item.season) || 1 : 0,
                    episode: item.type === "tv" ? Number(item.episode) || 1 : 0,
                    position: Math.max(0, Number(item.progress?.currentTime) || 0),
                    duration: Math.max(0, Number(item.progress?.duration) || 0)
                }));
                try {
                    const { error } = await client.from("watch_history").upsert(rows, { onConflict: "user_id,media_type,media_id" });
                    if (error) throw error;
                    if (epoch === this.epoch) { this.error = ""; this.emit(); }
                } catch {
                    if (epoch !== this.epoch || clearVersion !== this.clearVersion) return;
                    for (const [key, item] of entries) if (!this.pending.has(key)) this.pending.set(key, item);
                    this.error = "Account history hasn’t synced yet. Keep this page open and retry when you’re online.";
                    this.emit();
                }
            });
            return this.queue;
        }
        async clear() {
            if (!this.enabled) return;
            this.clearTimer(this.timer);
            this.timer = null;
            this.pending.clear();
            this.version++;
            this.readVersion++;
            this.clearVersion++;
            if (this.mode === "browser") {
                try { this.storage.removeItem("watch-history"); this.error = ""; }
                catch { this.error = "Your browser couldn’t clear watch history."; }
                this.emit();
                return;
            }
            const epoch = this.epoch;
            const userId = this.userId;
            const client = this.client;
            this.clearing = true;
            this.emit();
            // Serialize after earlier writes so they cannot resurrect cleared rows.
            this.queue = this.queue.catch(() => {}).then(async () => {
                if (epoch !== this.epoch) return;
                try {
                    const { error } = await client.from("watch_history").delete().eq("user_id", userId);
                    if (error) throw error;
                    if (epoch === this.epoch) { this.items = []; this.error = ""; }
                } catch {
                    if (epoch === this.epoch) this.error = "Couldn’t clear account history. Please try again.";
                }
                if (epoch === this.epoch) { this.clearing = false; this.emit(); }
            });
            await this.queue;
        }
    }
    if (typeof module !== "undefined" && module.exports) module.exports = { WatchHistoryStore, normalize };
    else root.WatchHistoryStore = WatchHistoryStore;
})(typeof window !== "undefined" ? window : globalThis);
