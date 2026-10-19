(function () {
    "use strict";

    /* =====================================================================
       CONFIG (Supabase -> Project Settings -> API)
       The publishable key is meant to be public; row-level security protects data.
       NEVER put an sb_secret_ key in this file.
       ===================================================================== */
    const SUPABASE_URL = "https://ykipenudpfnzbgmxrepi.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_4_AkBab6OcvzLubqcONTvw_-LLsarF9";
    const KOFI_URL = "https://ko-fi.com/opieferd";
    const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
    /* Production site root used for email confirm / password-reset links.
       Never use location.origin here — local/dev hosts (localhost:3000) end up in emails. */
    const SITE_URL = "https://opieferd.dev/watch/";
    function authRedirectTo() {
        const host = location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return SITE_URL;
        if (host.startsWith("watch.")) return `${location.origin}/`;
        if (host === "opieferd.dev" || host === "www.opieferd.dev" || host.endsWith(".opieferd.dev")) {
            return `${location.origin}/watch/`;
        }
        return SITE_URL;
    }

    if (!window.supabase || SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_ANON_KEY.includes("YOUR-ANON")) {
        console.info("[accounts] Not configured yet: set SUPABASE_URL and SUPABASE_ANON_KEY in accounts.js.");
        return;
    }

    if (!document.body) {
        console.error("[accounts] accounts.js must load after <body> (before </body>), not in <head>.");
        return;
    }

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    /* Expose early so other scripts (and late init failures) can still use the client. */
    window.OpieAccount = {
        client: sb,
        openAuth: () => {},
        isSignedIn: () => false,
        getProfile: () => null,
        hasEarlyAccess: () => false
    };
    document.documentElement.dataset.accountsReady = "0";

    /* ---------- Perks (must match supabase-schema.sql) ---------- */
    const DEFAULT_ACCENT = "#ebaf36"; // Opie Orange
    const BASIC_ACCENTS = ["#ebaf36", "#e5484d", "#3e9bff", "#30c48d", "#a66bff", "#ff7ab6"];
    const GOLD_ACCENTS = BASIC_ACCENTS.concat(["#ff9f1c", "#00d1c1", "#d8d8d8", "#ffd700", "#7cff6b", "#ff5e3a"]);
    const BORDERS = [
        { id: "none", label: "None" },
        { id: "gold", label: "Gold" },
        { id: "neon", label: "Neon" },
        { id: "ember", label: "Ember" }
    ];
    const TIER_LABEL = { free: "Member", basic: "Basic Supporter", gold: "Gold Supporter" };
    const PROFILE_COLS = "id,username,role,tier,moderator,avatar_url,banner_url,bio,accent,border,profile_color,show_on_wall,banned,created_at";
    const COMMENTS_PER_PAGE = 25;

    const state = { user: null, profile: null, watchlist: [], media: null, commentPages: 1 };
    let view = null; // the profile currently shown in the profile dialog

    /* ---------- helpers ---------- */
    const $ = (selector, root = document) => root.querySelector(selector);
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const safeUrl = (url, bucket) => {
        if (typeof url !== "string" || !url) return "";
        // Strip cache-buster for validation, keep original for <img src>
        const bare = url.split("?")[0];
        const prefix = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
        if (!bare.startsWith(prefix)) return "";
        if (!/^[A-Za-z0-9\-._~:/?#=&%+]+$/.test(url)) return "";
        return url;
    };
    const effTier = (p) => (p && p.role === "owner" ? "gold" : (p && p.tier) || "free");
    const isModerator = (p) => p && p.moderator === true;
    const accentList = (p) => (effTier(p) === "gold" ? GOLD_ACCENTS : effTier(p) === "basic" ? BASIC_ACCENTS : [DEFAULT_ACCENT]);
    const accentFor = (p) => (p && accentList(p).includes(String(p.accent).toLowerCase()) ? String(p.accent).toLowerCase() : DEFAULT_ACCENT);
    const DEFAULT_PROFILE_COLOR = "#171411";
    const profileColorFor = (p) => (p && effTier(p) === "gold" && /^#[0-9a-f]{6}$/i.test(String(p.profile_color || "")) ? String(p.profile_color).toLowerCase() : DEFAULT_PROFILE_COLOR);
    const borderFor = (p) => {
        if (!p) return "none";
        if (p.role === "owner") return "owner";
        return effTier(p) === "gold" && BORDERS.some((b) => b.id === p.border) ? p.border : "none";
    };
    const tierLabel = (p) => (p.role === "owner" ? "Owner" : TIER_LABEL[p.tier] || "Member");
    const joined = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
    function ago(iso) {
        const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        const steps = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
        for (const [size, label] of steps) if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
        return "just now";
    }

    function avatarHTML(p, size = "md") {
        const url = safeUrl(p.avatar_url, "avatars");
        return `<span class="acc-avatar acc-avatar-${size} acc-border-${borderFor(p)}" style="--u-accent:${accentFor(p)}">${
            url ? `<img src="${esc(url)}" alt="" loading="lazy">`
                : `<span class="acc-avatar-fallback">${esc(p.username.slice(0, 1).toUpperCase())}</span>`
        }</span>`;
    }
    function badgesHTML(p) {
        let badges = '';
        if (p.role === "owner") badges += '<span class="acc-badge acc-badge-owner" title="Site owner">♛ Owner</span>';
        if (p.moderator) badges += '<span class="acc-badge acc-badge-moderator" title="Moderator">☐ Mod</span>';
        if (p.tier === "gold") badges += '<span class="acc-badge acc-badge-gold" title="Gold Supporter">★ Gold</span>';
        if (p.tier === "basic") badges += '<span class="acc-badge acc-badge-basic" title="Basic Supporter">♥</span>';
        return badges;
    }
    function nameHTML(p) {
        const cls = p.role === "owner" ? " is-owner" : p.tier === "gold" ? " is-gold" : "";
        return `<button class="acc-name${cls}" type="button" data-user="${esc(p.username)}" style="--u-accent:${accentFor(p)}">${esc(p.username)}</button>${badgesHTML(p)}`;
    }

    function makeDialog(id) {
        const dialog = document.createElement("dialog");
        dialog.id = id;
        dialog.className = "disclaimer acc-dialog";
        dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
        document.body.appendChild(dialog);
        return dialog;
    }

    /* =====================================================================
       Top-right profile picture + menu (replaces the settings gear)
       The original gear button stays in the page (hidden by accounts.css)
       and is triggered from the "Settings" menu item.
       ===================================================================== */
    document.body.classList.add("has-accounts");

    const settingsButton = $(".settings-button");
    const topWrap = document.createElement("div");
    topWrap.className = "acc-top";

    const accountButton = document.createElement("button");
    accountButton.id = "account-button";
    accountButton.type = "button";
    accountButton.className = "acc-top-btn";
    accountButton.setAttribute("aria-haspopup", "menu");
    accountButton.setAttribute("aria-expanded", "false");

    const accountMenu = document.createElement("div");
    accountMenu.className = "acc-menu";
    accountMenu.setAttribute("role", "menu");
    accountMenu.hidden = true;

    topWrap.append(accountButton, accountMenu);
    // Mount where the gear lives so we inherit the same positioned container
    const mountPoint = settingsButton && settingsButton.parentNode ? settingsButton.parentNode : document.body;
    mountPoint.insertBefore(topWrap, settingsButton || null);

    const PERSON_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path></svg>';

    function renderAccountButtons() {
        const p = state.profile;
        accountButton.innerHTML = p ? avatarHTML(p, "md") : PERSON_ICON;
        accountButton.classList.toggle("is-signed-in", Boolean(p));
        accountButton.setAttribute("aria-label", p ? `Account menu for ${p.username}` : "Sign in or open settings");
        accountButton.title = p ? p.username : "Account";
        if (!accountMenu.hidden) renderMenu();
        window.dispatchEvent(new CustomEvent("account:changed"));
    }

    function renderMenu() {
        const p = state.profile;
        const item = (act, label) => `<button type="button" class="acc-menu-item" role="menuitem" data-menu="${act}">${label}</button>`;
        const parts = [];
        if (p) {
            parts.push(`<div class="acc-menu-head">${avatarHTML(p, "sm")}<div><strong>${esc(p.username)}</strong><small>${esc(tierLabel(p))}</small></div></div>`);
            parts.push(item("profile", "Your profile"), item("watchlist", "Watchlist"), item("customize", "Customize"));
            parts.push(item("upgrade", "Upgrade"));
        } else {
            parts.push(item("signin", "Sign in"), item("signup", "Create account"));
            parts.push(item("upgrade", "Upgrade"));
        }
        if (settingsButton) parts.push('<div class="acc-menu-sep" role="separator"></div>', item("settings", "Settings"));
        if (p) parts.push(item("signout", "Sign out"));
        accountMenu.innerHTML = parts.join("");
    }

    function upgradeHref() {
        const page = document.body.dataset.page;
        if (page === "upgrade") return "./";
        if (page === "home") return "upgrade/";
        if (location.hostname.startsWith("watch.")) return "/upgrade/";
        return "../upgrade/";
    }

    function setMenu(open) {
        if (open) renderMenu();
        accountMenu.hidden = !open;
        accountButton.setAttribute("aria-expanded", String(open));
    }

    accountButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setMenu(accountMenu.hidden);
    });
    accountMenu.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-menu]");
        if (!target) return;
        const act = target.dataset.menu;
        setMenu(false);
        if (act === "signin" || act === "signup") openAuth(act);
        else if (act === "upgrade") { location.href = upgradeHref(); }
        else if (act === "settings") { if (settingsButton) settingsButton.click(); }
        else if (act === "signout") await sb.auth.signOut();
        else if (state.profile) openProfile(state.profile.username, act);
    });
    document.addEventListener("click", (event) => {
        if (!accountMenu.hidden && !topWrap.contains(event.target)) setMenu(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !accountMenu.hidden) { setMenu(false); accountButton.focus(); }
    });

    /* =====================================================================
       Auth dialog (sign in / create account / forgot / set new password)
       ===================================================================== */
    const authDialog = makeDialog("acc-auth-dialog");
    let authMode = "signin";

    function openAuth(mode) {
        authMode = mode;
        renderAuth();
        if (!authDialog.open) authDialog.showModal();
    }

    function renderAuth() {
        const signup = authMode === "signup";
        const reset = authMode === "reset";
        const recover = authMode === "recover";
        const title = recover ? "Choose a new password" : reset ? "Reset your password" : signup ? "Create your account" : "Welcome back";
        const submit = recover ? "Save password" : reset ? "Send reset link" : signup ? "Create account" : "Sign in";
        authDialog.innerHTML = `
            <div class="disclaimer-content">
                <p class="eyebrow">Opie Watch account</p>
                <h2>${title}</h2>
                ${reset || recover ? "" : `
                <div class="acc-tabs" role="group" aria-label="Sign in or create account">
                    <button type="button" class="acc-tab${!signup ? " active" : ""}" data-mode="signin">Sign in</button>
                    <button type="button" class="acc-tab${signup ? " active" : ""}" data-mode="signup">Create account</button>
                </div>`}
                <form id="acc-form" novalidate>
                    ${signup ? `<label class="acc-field"><span>Username</span><input id="acc-username" type="text" autocomplete="username" maxlength="20" required></label>` : ""}
                    ${recover ? "" : `<label class="acc-field"><span>Email</span><input id="acc-email" type="email" autocomplete="email" required></label>`}
                    ${reset ? "" : `<label class="acc-field"><span>${recover ? "New password" : "Password"}</span><input id="acc-password" type="password" autocomplete="${signup || recover ? "new-password" : "current-password"}" minlength="8" required></label>`}
                    ${signup ? `<p class="acc-hint">Username: 3 to 20 letters, numbers or underscores. Password: 8+ characters.</p>` : ""}
                    <p id="acc-auth-msg" class="form-message" role="status"></p>
                    <div class="confirm-actions">
                        <button class="primary-button" type="submit">${submit}</button>
                        <button class="grey-button" type="button" id="acc-auth-close">Close</button>
                    </div>
                </form>
                ${authMode === "signin" ? `<button type="button" class="text-button acc-forgot" id="acc-forgot">Forgot password?</button>` : ""}
                ${reset ? `<button type="button" class="text-button acc-forgot" id="acc-back">← Back to sign in</button>` : ""}
            </div>`;

        authDialog.querySelectorAll(".acc-tab").forEach((tab) => tab.addEventListener("click", () => openAuth(tab.dataset.mode)));
        $("#acc-auth-close", authDialog).addEventListener("click", () => authDialog.close());
        const forgot = $("#acc-forgot", authDialog);
        if (forgot) forgot.addEventListener("click", () => openAuth("reset"));
        const back = $("#acc-back", authDialog);
        if (back) back.addEventListener("click", () => openAuth("signin"));
        $("#acc-form", authDialog).addEventListener("submit", onAuthSubmit);
    }

    async function onAuthSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const message = $("#acc-auth-msg", authDialog);
        const button = form.querySelector('[type="submit"]');
        const say = (text, ok = false) => { message.textContent = text; message.classList.toggle("is-ok", ok); };
        const field = (id) => { const input = $(id, authDialog); return input ? input.value.trim() : ""; };
        const email = field("#acc-email");
        const password = $("#acc-password", authDialog) ? $("#acc-password", authDialog).value : "";
        const username = field("#acc-username");

        if (authMode !== "recover" && !$("#acc-email", authDialog).checkValidity()) return say("Enter a valid email address.");
        if (authMode === "signup" && !/^[A-Za-z0-9_]{3,20}$/.test(username)) return say("Username must be 3 to 20 letters, numbers or underscores.");
        if (authMode !== "reset" && password.length < 8) return say("Password must be at least 8 characters.");

        button.disabled = true;
        say("One moment…", true);
        try {
            if (authMode === "signin") {
                const { error } = await sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                authDialog.close();
            } else if (authMode === "signup") {
                const { data, error } = await sb.auth.signUp({
                    email, password,
                    options: { data: { username }, emailRedirectTo: authRedirectTo() }
                });
                if (error) throw error;
                if (data.session) authDialog.close();
                else say("Almost there! Check your email to confirm your account, then sign in.", true);
            } else if (authMode === "reset") {
                const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
                if (error) throw error;
                say("If that email has an account, a reset link is on its way.", true);
            } else if (authMode === "recover") {
                const { error } = await sb.auth.updateUser({ password });
                if (error) throw error;
                authDialog.close();
            }
        } catch (error) {
            const text = String(error.message || "");
            if (authMode === "signin") {
                say(/not confirmed/i.test(text) ? "Confirm your email first (check your inbox)." : "Incorrect email or password.");
            } else if (authMode === "signup") {
                say(/password/i.test(text) ? text : "Couldn’t create that account. The username may be taken or reserved, or the email is already in use.");
            } else {
                say("Something went wrong. Please try again.");
            }
        } finally {
            button.disabled = false;
        }
    }

    /* =====================================================================
       Session + data loading
       ===================================================================== */
    async function loadProfile() {
        if (!state.user) { state.profile = null; return; }
        const { data } = await sb.from("profiles").select(PROFILE_COLS).eq("id", state.user.id).maybeSingle();
        state.profile = data || null;
    }

    async function loadWatchlist() {
        if (!state.user) { state.watchlist = []; return; }
        const { data } = await sb.from("watchlist").select("media_id,media_type,title,poster_path,added_at").order("added_at", { ascending: false });
        state.watchlist = data || [];
    }

    async function refreshAll() {
        await Promise.all([loadProfile(), loadWatchlist()]);
        renderAccountButtons();
        renderWatchlistRail();
        updateWatchlistButton();
        renderCommentsShell();
        if (state.media) loadComments();
        if (profileDialog.open) {
            if (state.profile) openProfile(view && view.p ? view.p.username : state.profile.username, view ? view.tab : "profile");
            else profileDialog.close();
        }
        // Notify other watch-page scripts only after the signed-in profile has loaded.
        window.dispatchEvent(new CustomEvent("opie:account-ready"));
    }

    sb.auth.onAuthStateChange((event, session) => {
        state.user = session ? session.user : null;
        // Don't call other supabase methods directly inside this callback
        setTimeout(() => {
            refreshAll();
            if (event === "PASSWORD_RECOVERY") openAuth("recover");
        }, 0);
    });

    /* =====================================================================
       Profile dialog
       ===================================================================== */
    const profileDialog = makeDialog("acc-profile-dialog");
    profileDialog.addEventListener("click", onProfileClick);
    profileDialog.addEventListener("change", onProfileChange);

    async function openProfile(username, tab = "profile") {
        profileDialog.innerHTML = '<div class="disclaimer-content"><p class="acc-muted">Loading…</p></div>';
        if (!profileDialog.open) profileDialog.showModal();
        const { data } = await sb.from("profiles").select(PROFILE_COLS).eq("username_lower", String(username).toLowerCase()).maybeSingle();
        if (!data) {
            profileDialog.innerHTML = '<div class="disclaimer-content"><h2>Profile not found</h2><div class="confirm-actions"><button class="grey-button" type="button" data-act="close-profile">Close</button></div></div>';
            return;
        }
        view = { p: data, self: !!state.profile && data.id === state.profile.id, tab };
        renderProfile();
    }

    function renderProfile() {
        const { p, self } = view;
        const accent = accentFor(p);
        const canBanner = effTier(p) === "gold";
        const banner = canBanner ? safeUrl(p.banner_url, "banners") : "";
        const avatar = self
            ? `<button class="acc-avatar-trigger" type="button" data-act="pick-avatar" aria-label="Change profile picture">${avatarHTML(p, "xl")}<span class="acc-image-hint">Change</span></button>`
            : avatarHTML(p, "xl");
        const bannerMarkup = self && canBanner
            ? `<button class="acc-banner acc-banner-trigger" type="button" data-act="pick-banner" aria-label="Change profile banner"${banner ? ` style="background-image:url('${esc(banner)}')"` : ""}><span class="acc-image-hint">Change banner</span></button>`
            : `<div class="acc-banner"${banner ? ` style="background-image:url('${esc(banner)}')"` : ""}></div>`;
        const tabs = self ? [["profile", "Profile"], ["watchlist", "Watchlist"], ["customize", "Customize"], ["roadmap", "Roadmap"]] : [];
        if (self && p.role === "owner") tabs.push(["owner", "Owner"]);
        if (self && isModerator(p)) tabs.push(["moderator", "Moderator"]);
        if (!tabs.some(([id]) => id === view.tab)) view.tab = "profile";

        profileDialog.innerHTML = `
            <div class="acc-profile" style="--u-accent:${accent};--u-profile-color:${profileColorFor(p)}">
                ${bannerMarkup}
                <button class="icon-button acc-close" type="button" data-act="close-profile" aria-label="Close">×</button>
                <div class="acc-head">
                    ${avatar}
                    <div class="acc-head-copy">
                        <h2 class="acc-username${p.role === "owner" ? " is-owner" : p.tier === "gold" ? " is-gold" : ""}">${esc(p.username)} ${badgesHTML(p)}</h2>
                        <p class="acc-muted">${esc(tierLabel(p))} · Joined ${esc(joined(p.created_at))}</p>
                    </div>
                </div>
                ${tabs.length ? `<div class="acc-tabs acc-tabs-scroll" role="group" aria-label="Profile sections">${tabs.map(([id, label]) => `<button type="button" class="acc-tab${view.tab === id ? " active" : ""}" data-act="tab" data-tab="${id}">${label}</button>`).join("")}</div>` : ""}
                <div class="acc-panel" id="acc-panel">${panelHTML()}</div>
                ${self ? '<input id="acc-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="acc-banner-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' : ""}
            </div>`;
        afterPanelRender();
    }

    function panelHTML() {
        const { p, self, tab } = view;
        if (tab === "watchlist") return watchlistPanelHTML();
        if (tab === "customize") return customizePanelHTML();
        if (tab === "roadmap") return `<div id="road-list" class="acc-muted">Loading…</div>`;
        if (tab === "owner") return ownerPanelHTML();
        if (tab === "moderator") return moderatorPanelHTML();
        return `
            ${p.bio ? `<p class="acc-bio">${esc(p.bio)}</p>` : `<p class="acc-muted">${self ? "You haven’t written a bio yet. Add one in Customize." : "No bio yet."}</p>`}
            ${p.tier !== "free" && p.role !== "owner" ? `<p class="acc-muted">Thanks for helping keep the lights on.</p>` : ""}
            ${self ? `<div class="confirm-actions"><button class="grey-button" type="button" data-act="signout">Sign out</button></div>` : ""}`;
    }

    function afterPanelRender() {
        if (view.tab === "roadmap") loadRoadmap();
        if (view.tab === "owner") loadOwnerData();
        if (view.tab === "moderator") loadModeratorData();
    }

    function setTab(tab) {
        view.tab = tab;
        renderProfile();
    }

    function panelMessage(text, ok = false) {
        const node = $("#acc-panel-msg");
        if (!node) return;
        node.textContent = text;
        node.classList.toggle("is-ok", ok);
    }

    /* ----- Watchlist panel ----- */
    function watchlistPanelHTML() {
        if (!state.watchlist.length) return '<p class="acc-muted">Nothing saved yet. Open a movie or show and tap “Add to watchlist”.</p>';
        return `<div class="acc-wl-grid">${state.watchlist.map((item) => `
            <div class="acc-wl-item">
                <button class="recommendation-card" type="button" data-act="wl-open" data-id="${item.media_id}" data-type="${esc(item.media_type)}" title="${esc(item.title)}">
                    <span class="recommendation-poster">${item.poster_path ? `<img src="${TMDB_POSTER}${esc(item.poster_path)}" alt="" loading="lazy">` : "<span>No poster</span>"}</span>
                    <span class="recommendation-copy"><small>${item.media_type === "tv" ? "Show" : "Movie"}</small><strong>${esc(item.title)}</strong></span>
                </button>
                <button class="text-button acc-wl-remove" type="button" data-act="wl-remove" data-id="${item.media_id}" data-type="${esc(item.media_type)}">Remove</button>
            </div>`).join("")}</div>`;
    }

    /* ----- Customize panel ----- */
    function customizePanelHTML() {
        const { p } = view;
        const eff = effTier(p);
        const allowed = accentList(p);
        const gold = eff === "gold";
        const supporter = eff !== "free";
        return `
            <p id="acc-panel-msg" class="form-message" role="status"></p>

            <h3 class="acc-h3">Avatar</h3>
            <div class="acc-row">
                ${avatarHTML(p, "lg")}
                <div class="acc-row-actions">
                    <button class="text-button" type="button" data-act="pick-avatar">Upload avatar</button>
                    ${p.avatar_url ? '<button class="text-button" type="button" data-act="remove-avatar">Remove</button>' : ""}
                </div>
            </div>

            <h3 class="acc-h3">Profile accent ${supporter ? "" : '<small class="acc-lock">Supporter perk</small>'}</h3>
            <div class="acc-swatches">${GOLD_ACCENTS.map((color) => {
                const ok = allowed.includes(color);
                return `<button type="button" class="acc-swatch${color === accentFor(p) ? " active" : ""}" data-act="accent" data-color="${color}" style="--sw:${color}" ${ok ? "" : "disabled"} title="${ok ? color : (BASIC_ACCENTS.includes(color) ? "Supporter perk" : "Gold perk")}" aria-label="Accent ${color}"></button>`;
            }).join("")}</div>

            <h3 class="acc-h3">Profile border ${gold ? "" : '<small class="acc-lock">Gold perk</small>'}</h3>
            <div class="acc-borders">${BORDERS.map((b) => `<button type="button" class="acc-chip${borderFor(p) === b.id ? " active" : ""}" data-act="border" data-border="${b.id}" ${gold || b.id === "none" ? "" : "disabled"}>${b.label}</button>`).join("")}</div>

            <h3 class="acc-h3">Banner ${gold ? "" : '<small class="acc-lock">Gold perk</small>'}</h3>
            <div class="acc-row-actions">
                <button class="text-button" type="button" data-act="pick-banner" ${gold ? "" : "disabled"}>Upload banner</button>
                ${p.banner_url ? '<button class="text-button" type="button" data-act="remove-banner">Remove</button>' : ""}
            </div>

            <h3 class="acc-h3">Profile background ${gold ? "" : '<small class="acc-lock">Gold perk</small>'}</h3>
            ${gold ? `<div class="acc-profile-color-row"><label for="acc-profile-color">Card color</label><input id="acc-profile-color" type="color" value="${profileColorFor(p)}" aria-label="Choose profile card background color"><button class="text-button" type="button" data-act="save-profile-color">Save color</button></div><p class="acc-muted">Choose a custom background color for your profile card.</p>` : '<p class="acc-muted">Custom profile backgrounds are available to Gold supporters.</p>'}

            <h3 class="acc-h3">Bio</h3>
            <textarea id="acc-bio" class="acc-textarea" maxlength="200" rows="3" placeholder="Say something about yourself">${esc(p.bio)}</textarea>
            <div class="confirm-actions"><button class="primary-button" type="button" data-act="save-bio">Save bio</button></div>

            <label class="settings-check"><input id="acc-wall" type="checkbox" ${p.show_on_wall ? "checked" : ""} ${supporter ? "" : "disabled"}> Show me on the supporter wall ${supporter ? "" : '<small class="acc-lock">Supporter perk</small>'}</label>

            <div class="acc-membership">
                <h3 class="acc-h3">Membership: ${esc(tierLabel(p))}</h3>
                <p class="acc-muted">Basic ($5/mo): badge, accent colours, supporter wall. Gold ($10/mo): Gold badge, more colours, borders, banner, roadmap voting, early access.</p>
                <p class="acc-muted">Join a membership tier on Ko-fi using the same email as this account, or write @yourusername in the Ko-fi message, and your tier is applied automatically.</p>
                <a class="secondary-button" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">Support on Ko-fi <span aria-hidden="true">♥</span></a>
            </div>`;
    }

    function resizeImage(file, width, height, preserveWholeImage = false) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const url = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(url);
                // Banners should fit inside the target bounds without cutting off the
                // edges of the user's image. Avatars retain their square center crop.
                if (preserveWholeImage) {
                    const scale = Math.min(width / image.width, height / image.height);
                    const outWidth = Math.max(1, Math.round(image.width * scale));
                    const outHeight = Math.max(1, Math.round(image.height * scale));
                    const canvas = document.createElement("canvas");
                    canvas.width = outWidth;
                    canvas.height = outHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(image, 0, 0, outWidth, outHeight);
                    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn’t process that image."))), "image/jpeg", 0.9);
                    return;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                const scale = Math.max(width / image.width, height / image.height);
                const w = image.width * scale;
                const h = image.height * scale;
                ctx.fillStyle = "#171411";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
                canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn’t process that image."))), "image/jpeg", 0.88);
            };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn’t a valid image.")); };
            image.src = url;
        });
    }

    async function updateProfile(patch) {
        const { data, error } = await sb.from("profiles").update(patch).eq("id", state.user.id).select(PROFILE_COLS).single();
        if (error) throw error;
        state.profile = data;
        view.p = data;
        renderAccountButtons();
        loadWall();
        return data;
    }

    function openBannerCrop(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const dialog = document.createElement("dialog");
            dialog.className = "disclaimer acc-dialog acc-crop-dialog";
            dialog.innerHTML = `
                <div class="disclaimer-content acc-crop-content">
                    <p class="eyebrow">Profile banner</p><h2>Crop your banner</h2>
                    <p class="acc-muted">Drag the zoom and position sliders until it looks right.</p>
                    <div class="acc-crop-preview"><img alt="Banner crop preview"></div>
                    <label class="acc-crop-control">Zoom <input type="range" min="100" max="300" value="100" step="1" id="acc-crop-zoom"></label>
                    <label class="acc-crop-control">Horizontal <input type="range" min="0" max="100" value="50" step="1" id="acc-crop-x"></label>
                    <label class="acc-crop-control">Vertical <input type="range" min="0" max="100" value="50" step="1" id="acc-crop-y"></label>
                    <div class="confirm-actions"><button class="primary-button" type="button" data-crop-save>Use crop</button><button class="grey-button" type="button" data-crop-cancel>Cancel</button></div>
                </div>`;
            document.body.appendChild(dialog);
            const img = dialog.querySelector("img");
            const zoom = dialog.querySelector("#acc-crop-zoom");
            const x = dialog.querySelector("#acc-crop-x");
            const y = dialog.querySelector("#acc-crop-y");
            const preview = dialog.querySelector(".acc-crop-preview");
            img.src = url;
            const updatePreview = () => {
                img.style.width = `${Number(zoom.value)}%`;
                img.style.height = `${Number(zoom.value)}%`;
                img.style.left = `${x.value}%`;
                img.style.top = `${y.value}%`;
                img.style.transform = "translate(-50%, -50%)";
            };
            [zoom,x,y].forEach(input => input.addEventListener("input", updatePreview));
            const cleanup = () => { URL.revokeObjectURL(url); dialog.remove(); };
            dialog.querySelector("[data-crop-cancel]").addEventListener("click", () => { cleanup(); resolve(null); });
            dialog.addEventListener("cancel", event => { event.preventDefault(); cleanup(); resolve(null); }, { once:true });
            dialog.querySelector("[data-crop-save]").addEventListener("click", () => {
                const canvas = document.createElement("canvas");
                canvas.width = 1200; canvas.height = 400;
                const ctx = canvas.getContext("2d");
                const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * (Number(zoom.value) / 100);
                const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
                const dx = (canvas.width - w) * (Number(x.value) / 100);
                const dy = (canvas.height - h) * (Number(y.value) / 100);
                ctx.drawImage(img, dx, dy, w, h);
                canvas.toBlob(blob => { cleanup(); blob ? resolve(blob) : reject(new Error("Couldn’t crop that image.")); }, "image/jpeg", .92);
            });
            img.addEventListener("load", updatePreview, { once:true });
            dialog.showModal();
        });
    }

    async function uploadImage(kind, file, croppedBanner = null) {
        if (!file || !file.type.startsWith("image/")) throw new Error("Please choose an image.");
        if (!view || !view.self || !state.user) throw new Error("You can only change your own profile images.");
        if (kind === "banner" && effTier(view.p) !== "gold") throw new Error("Custom banners require Gold.");
        if (file.size > 8 * 1024 * 1024) throw new Error("Image is too large (max 8 MB).");
        const bucket = kind === "avatar" ? "avatars" : "banners";
        let blob, extension, contentType;
        if (kind === "banner" && file.type === "image/gif") {
            // Keep the original GIF bytes so the animation survives the upload.
            blob = file; extension = "gif"; contentType = "image/gif";
        } else if (kind === "banner") {
            blob = croppedBanner || await openBannerCrop(file);
            if (!blob) return false;
            extension = "jpg"; contentType = "image/jpeg";
        } else {
            blob = await resizeImage(file, 256, 256);
            extension = "jpg"; contentType = "image/jpeg";
        }
        const path = `${state.user.id}/${kind}.${extension}`;
        const { error } = await sb.storage.from(bucket).upload(path, blob, { upsert: true, contentType, cacheControl: "3600" });
        if (error) throw error;
        const url = `${sb.storage.from(bucket).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
        await updateProfile(kind === "avatar" ? { avatar_url: url } : { banner_url: url });
        return true;
    }

    async function onProfileChange(event) {
        const target = event.target;
        if (!view || !view.self) return;
        try {
            if (target.id === "acc-avatar-file" || target.id === "acc-banner-file") {
                const kind = target.id === "acc-avatar-file" ? "avatar" : "banner";
                const file = target.files[0];
                if (!file) return;
                if (kind === "banner" && file.type !== "image/gif") {
                    const cropped = await openBannerCrop(file);
                    if (!cropped) { target.value = ""; return; }
                    panelMessage("Uploading…", true);
                    await uploadImage(kind, file, cropped);
                } else {
                    panelMessage("Uploading…", true);
                    await uploadImage(kind, file);
                }
                renderProfile();
                panelMessage("Saved.", true);
                target.value = "";
            } else if (target.id === "acc-wall") {
                await updateProfile({ show_on_wall: target.checked });
                panelMessage(target.checked ? "You’re on the supporter wall." : "Removed from the supporter wall.", true);
            }
        } catch (error) {
            panelMessage(error.message || "Something went wrong.");
            if (target.id === "acc-wall") target.checked = !target.checked;
        }
    }

    /* ----- Roadmap panel (Gold perk) ----- */
    async function loadRoadmap() {
        const node = $("#road-list");
        if (!node) return;
        const gold = effTier(view.p) === "gold";
        const [features, mine] = await Promise.all([
            sb.from("features").select("id,title,details,feature_votes(count)").order("created_at", { ascending: false }),
            gold ? sb.from("feature_votes").select("feature_id") : Promise.resolve({ data: [] })
        ]);
        const voted = new Set((mine.data || []).map((row) => row.feature_id));
        const rows = (features.data || []).map((f) => ({ ...f, votes: (f.feature_votes && f.feature_votes[0] && f.feature_votes[0].count) || 0 }))
            .sort((a, b) => b.votes - a.votes);
        node.className = "";
        node.innerHTML = `
            ${gold ? "" : `<p class="acc-muted"><span class="acc-lock">Gold perk</span> Gold supporters vote on what gets built next. You can still see the roadmap.</p>`}
            ${rows.length ? rows.map((f) => `
                <div class="acc-feature">
                    <div><strong>${esc(f.title)}</strong>${f.details ? `<p class="acc-muted">${esc(f.details)}</p>` : ""}</div>
                    <button type="button" class="acc-chip${voted.has(f.id) ? " active" : ""}" data-act="vote" data-id="${f.id}" ${gold ? "" : "disabled"}>▲ ${f.votes}</button>
                </div>`).join("") : '<p class="acc-muted">No roadmap items yet.</p>'}`;
    }

  
/* ----- Owner panel ----- */
function ownerPanelHTML() {
    return `
        <p id="acc-panel-msg" class="form-message" role="status"></p>

        <h3 class="acc-h3">Announcements</h3>
        <p class="acc-muted">Create notices for regular members, Gold supporters, or both. Enabled notices appear on the Watch page.</p>
        <input id="own-announcement-id" type="hidden" value="">
        <label class="acc-field-label" for="own-announcement-title">Title</label>
        <input id="own-announcement-title" type="text" maxlength="120" placeholder="Update Version 1.6">
        <label class="acc-field-label" for="own-announcement-body">Message</label>
        <textarea id="own-announcement-body" rows="4" maxlength="2000" placeholder="Write your announcement here…"></textarea>
        <div class="acc-announcement-options">
            <label><input id="own-announcement-normal" type="checkbox" checked> Normal members</label>
            <label><input id="own-announcement-gold" type="checkbox"> Gold members</label>
            <label><input id="own-announcement-enabled" type="checkbox" checked> Enabled</label>
        </div>
        <div class="acc-inline">
            <button class="text-button" type="button" data-act="owner-announcement-save">Save announcement</button>
            <button class="text-button" type="button" data-act="owner-announcement-cancel">Clear form</button>
        </div>
        <div id="own-announcements" class="acc-announcements"><p class="acc-muted">Loading announcements…</p></div>

        <h3 class="acc-h3">Set supporter tier</h3>
        <div class="acc-inline">
            <input id="own-tier-user" type="text" placeholder="username" maxlength="20">
            <select id="own-tier-value">
                <option value="free">Member</option>
                <option value="basic">Basic</option>
                <option value="gold">Gold</option>
            </select>
            <button class="text-button" type="button" data-act="owner-tier">Apply</button>
        </div>

        <h3 class="acc-h3">Manage moderators</h3>
        <div class="acc-inline">
            <input id="own-mod-user" type="text" placeholder="username" maxlength="20">
            <button class="text-button" type="button" data-act="owner-mod" data-flag="true">
                Make moderator
            </button>
            <button class="text-button" type="button" data-act="owner-mod" data-flag="false">
                Remove moderator
            </button>
        </div>

        <h3 class="acc-h3">Ban / unban commenting</h3>
        <div class="acc-inline">
            <input id="own-ban-user" type="text" placeholder="username" maxlength="20">
            <button class="text-button" type="button" data-act="owner-ban" data-flag="true">Ban</button>
            <button class="text-button" type="button" data-act="owner-ban" data-flag="false">Unban</button>
        </div>

        <h3 class="acc-h3">Filter words</h3>
        <div class="acc-inline">
            <input id="own-word" type="text" placeholder="word or phrase" maxlength="40">
            <select id="own-word-kind">
                <option value="word">Whole word</option>
                <option value="contains">Contains</option>
            </select>
            <button class="text-button" type="button" data-act="owner-word-add">Add</button>
        </div>
        <div id="own-words" class="acc-words"></div>

        <h3 class="acc-h3">Roadmap</h3>
        <div class="acc-inline">
            <input id="own-feature" type="text" placeholder="New roadmap item" maxlength="80">
            <button class="text-button" type="button" data-act="owner-feature-add">Add</button>
        </div>

        <h3 class="acc-h3">
            Moderation log
            <button class="text-button" type="button" data-act="owner-log-refresh">Refresh</button>
        </h3>
        <div id="own-log" class="acc-log acc-muted">Loading…</div>
    `;
}

function resetAnnouncementForm() {
    const id = $("#own-announcement-id");
    const title = $("#own-announcement-title");
    const body = $("#own-announcement-body");
    if (id) id.value = "";
    if (title) title.value = "";
    if (body) body.value = "";
    if ($("#own-announcement-normal")) $("#own-announcement-normal").checked = true;
    if ($("#own-announcement-gold")) $("#own-announcement-gold").checked = false;
    if ($("#own-announcement-enabled")) $("#own-announcement-enabled").checked = true;
    const save = document.querySelector('[data-act="owner-announcement-save"]');
    if (save) save.textContent = "Save announcement";
}

async function loadOwnerAnnouncements() {
    const node = $("#own-announcements");
    if (!node) return;
    const { data, error } = await sb.from("announcements")
        .select("id,title,body,show_normal,show_gold,enabled,updated_at")
        .order("updated_at", { ascending: false });
    if (error) {
        node.innerHTML = '<p class="acc-muted">Announcements are unavailable. Run watch/announcements-upgrade.sql in Supabase first.</p>';
        return;
    }
    const rows = (data || []).map((a) => ({
        id: a.id, title: a.title, body: a.body, show_normal: a.show_normal,
        show_gold: a.show_gold, enabled: a.enabled
    }));
    node.dataset.rows = JSON.stringify(rows);
    node.innerHTML = rows.map((a) => `
        <article class="acc-announcement-row">
            <div class="acc-announcement-copy">
                <strong>${esc(a.title)}</strong>
                <p>${esc(a.body)}</p>
                <small>${a.enabled ? "Enabled" : "Disabled"} · ${[a.show_normal ? "Normal" : "", a.show_gold ? "Gold" : ""].filter(Boolean).join(" + ") || "No audience"}</small>
            </div>
            <div class="acc-announcement-actions">
                <button class="text-button" type="button" data-act="owner-announcement-edit" data-id="${a.id}">Edit</button>
                <button class="text-button" type="button" data-act="owner-announcement-delete" data-id="${a.id}">Delete</button>
            </div>
        </article>
    `).join("") || '<p class="acc-muted">No announcements yet.</p>';
}

async function loadOwnerData() {
    const [words, log] = await Promise.all([
        sb.from("banned_words")
            .select("id,word,kind")
            .order("word"),

        sb.from("moderation_log")
            .select("id,created_at,action,actor_name,target_name,media_type,media_id,body,reason")
            .order("created_at", { ascending: false })
            .limit(100)
    ]);

    await loadOwnerAnnouncements();

    const wordsNode = $("#own-words");

    if (wordsNode) {
        wordsNode.innerHTML = (words.data || [])
            .map((w) => `
                <span class="acc-word">
                    ${esc(w.word)}
                    <small>${w.kind === "contains" ? "contains" : "word"}</small>
                    <button
                        type="button"
                        data-act="owner-word-del"
                        data-id="${w.id}"
                        aria-label="Remove ${esc(w.word)}"
                    >×</button>
                </span>
            `)
            .join("") || '<span class="acc-muted">No words yet.</span>';
    }

    const logNode = $("#own-log");

    if (logNode) {
        const rows = log.data || [];
        logNode.className = "acc-log";

        logNode.innerHTML = rows.length
            ? `
                <table>
                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Action</th>
                            <th>By</th>
                            <th>Target</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((r) => `
                            <tr>
                                <td>${esc(ago(r.created_at))}</td>
                                <td>
                                    <span class="acc-act acc-act-${esc(r.action)}">
                                        ${esc(r.action)}
                                    </span>
                                </td>
                                <td>${esc(r.actor_name || "")}</td>
                                <td>${esc(r.target_name || "")}</td>
                                <td>
                                    ${esc(r.reason || "")}
                                    ${r.body ? `<div class="acc-log-body">${esc(r.body)}</div>` : ""}
                                    ${r.media_id ? `<small> ${esc(r.media_type)} #${r.media_id}</small>` : ""}
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `
            : '<p class="acc-muted">Nothing logged yet.</p>';
    }
}

    /* ----- Profile click router ----- */
    async function onProfileClick(event) {
        const target = event.target.closest("[data-act]");
        if (!target || !view) return;
        const act = target.dataset.act;
        const run = async (fn, okText) => {
            try { await fn(); if (okText) panelMessage(okText, true); }
            catch (error) { panelMessage((error && error.message) || "Something went wrong."); }
        };

        if (act === "close-profile") return profileDialog.close();
        if (act === "tab") return setTab(target.dataset.tab);
        if (act === "signout") { await sb.auth.signOut(); return profileDialog.close(); }
        if (act === "wl-open") { profileDialog.close(); return window.dispatchEvent(new CustomEvent("watch:open", { detail: { id: Number(target.dataset.id), type: target.dataset.type } })); }
        if (act === "wl-remove") return run(async () => { await removeFromWatchlist(target.dataset.type, Number(target.dataset.id)); renderProfile(); });
        if (!view.self) return;

        if (act === "pick-avatar") return $("#acc-avatar-file").click();
        if (act === "pick-banner") return $("#acc-banner-file").click();
        if (act === "remove-avatar") return run(async () => { await updateProfile({ avatar_url: null }); renderProfile(); }, "Removed.");
        if (act === "remove-banner") return run(async () => { await updateProfile({ banner_url: null }); renderProfile(); }, "Removed.");
        if (act === "accent") return run(async () => { await updateProfile({ accent: target.dataset.color }); renderProfile(); }, "Saved.");
        if (act === "save-profile-color") return run(async () => {
            if (effTier(view.p) !== "gold") throw new Error("Custom profile backgrounds require Gold.");
            const input = $("#acc-profile-color");
            if (!input || !/^#[0-9a-f]{6}$/i.test(input.value)) throw new Error("Choose a valid color.");
            await updateProfile({ profile_color: input.value.toLowerCase() });
            renderProfile();
        }, "Profile color saved.");
        if (act === "border") return run(async () => { await updateProfile({ border: target.dataset.border }); renderProfile(); }, "Saved.");
        if (act === "save-bio") return run(() => updateProfile({ bio: $("#acc-bio").value.trim().slice(0, 200) }), "Bio saved.");
        if (act === "vote") return run(async () => {
            const id = Number(target.dataset.id);
            if (target.classList.contains("active")) await sb.from("feature_votes").delete().eq("feature_id", id).eq("user_id", state.user.id);
            else { const { error } = await sb.from("feature_votes").insert({ feature_id: id }); if (error) throw error; }
            loadRoadmap();
        });

        if (view.p.role !== "owner" && !isModerator(view.p)) {
            if (act === "owner-log-refresh") return loadModeratorData();
            return;
        }
        if (act === "owner-announcement-cancel") return resetAnnouncementForm();
        if (act === "owner-announcement-edit") {
            const rows = JSON.parse(($("#own-announcements") || {}).dataset?.rows || "[]");
            const item = rows.find((row) => String(row.id) === String(target.dataset.id));
            if (!item) return;
            $("#own-announcement-id").value = item.id;
            $("#own-announcement-title").value = item.title;
            $("#own-announcement-body").value = item.body;
            $("#own-announcement-normal").checked = item.show_normal;
            $("#own-announcement-gold").checked = item.show_gold;
            $("#own-announcement-enabled").checked = item.enabled;
            const save = document.querySelector('[data-act="owner-announcement-save"]');
            if (save) save.textContent = "Update announcement";
            $("#own-announcement-title").focus();
            return;
        }
        if (act === "owner-announcement-save") return run(async () => {
            const id = $("#own-announcement-id").value;
            const title = $("#own-announcement-title").value.trim();
            const body = $("#own-announcement-body").value.trim();
            const show_normal = $("#own-announcement-normal").checked;
            const show_gold = $("#own-announcement-gold").checked;
            const enabled = $("#own-announcement-enabled").checked;
            if (!title) throw new Error("Enter an announcement title.");
            if (!body) throw new Error("Enter an announcement message.");
            if (!show_normal && !show_gold) throw new Error("Select Normal members, Gold members, or both.");
            const row = { title, body, show_normal, show_gold, enabled, updated_at: new Date().toISOString() };
            const query = id
                ? sb.from("announcements").update(row).eq("id", Number(id))
                : sb.from("announcements").insert(row);
            const { error } = await query;
            if (error) throw error;
            resetAnnouncementForm();
            await loadOwnerAnnouncements();
        }, "Announcement saved.");
        if (act === "owner-announcement-delete") return run(async () => {
            if (!window.confirm("Delete this announcement?")) return;
            const { error } = await sb.from("announcements").delete().eq("id", Number(target.dataset.id));
            if (error) throw error;
            await loadOwnerAnnouncements();
        }, "Announcement deleted.");
        if (act === "owner-tier") return run(async () => {
            const { error } = await sb.rpc("set_tier", { target: $("#own-tier-user").value.trim(), new_tier: $("#own-tier-value").value });
            if (error) throw error;
            loadOwnerData();
            loadWall();
        }, "Tier updated.");
        if (act === "owner-ban") return run(async () => {
            const { error } = await sb.rpc("set_banned", { target: $("#own-ban-user").value.trim(), flag: target.dataset.flag === "true" });
            if (error) throw error;
            loadOwnerData();
        }, "Done.");

if (act === "owner-mod") return run(async () => {
    const username = $("#own-mod-user").value.trim();

    if (!username) {
        throw new Error("Enter a username.");
    }

    const { error } = await sb.rpc("set_moderator", {
        target: username,
        flag: target.dataset.flag === "true"
    });

    if (error) throw error;

    loadOwnerData();
}, "Moderator status updated.");

        if (act === "owner-word-add") return run(async () => {
            const word = $("#own-word").value.trim();
            if (word.length < 2) throw new Error("Enter at least 2 characters.");
            const { error } = await sb.from("banned_words").insert({ word, kind: $("#own-word-kind").value });
            if (error) throw error;
            $("#own-word").value = "";
            loadOwnerData();
        }, "Word added.");
        if (act === "owner-word-del") return run(async () => { await sb.from("banned_words").delete().eq("id", Number(target.dataset.id)); loadOwnerData(); });
        if (act === "owner-feature-add") return run(async () => {
            const title = $("#own-feature").value.trim();
            if (title.length < 3) throw new Error("Give it a short title.");
            const { error } = await sb.from("features").insert({ title });
            if (error) throw error;
            $("#own-feature").value = "";
        }, "Roadmap item added.");
        if (act === "owner-log-refresh") return loadOwnerData();
    }

    /* =====================================================================
       Names/avatars anywhere on the page open profiles
       ===================================================================== */
    document.addEventListener("click", (event) => {
        const name = event.target.closest(".acc-name[data-user]");
        if (name) openProfile(name.dataset.user);
    });

    /* =====================================================================
       Watchlist (free for every account)
       ===================================================================== */
    const isSaved = (type, id) => state.watchlist.some((item) => item.media_type === type && item.media_id === id);

    async function addToWatchlist(media) {
        const { error } = await sb.from("watchlist").insert({
            media_type: media.type, media_id: media.id, title: media.title.slice(0, 200), poster_path: media.poster_path || ""
        });
        if (error) throw error;
        await loadWatchlist();
        renderWatchlistRail();
    }
    async function removeFromWatchlist(type, id) {
        const { error } = await sb.from("watchlist").delete().eq("media_type", type).eq("media_id", id);
        if (error) throw error;
        await loadWatchlist();
        renderWatchlistRail();
        updateWatchlistButton();
    }

    const watchlistButton = document.createElement("button");
    watchlistButton.id = "acc-wl-toggle";
    watchlistButton.type = "button";
    watchlistButton.className = "text-button acc-wl-toggle";
    watchlistButton.hidden = true;
    const closePlayerButton = $("#close-player");
    if (closePlayerButton && closePlayerButton.parentNode) closePlayerButton.parentNode.insertBefore(watchlistButton, closePlayerButton);

    function updateWatchlistButton() {
        if (!state.media) { watchlistButton.hidden = true; return; }
        watchlistButton.hidden = false;
        const saved = state.user && isSaved(state.media.type, state.media.id);
        watchlistButton.textContent = saved ? "✓ In watchlist" : "+ Add to watchlist";
        watchlistButton.classList.toggle("is-saved", Boolean(saved));
    }
    watchlistButton.addEventListener("click", async () => {
        if (!state.user) return openAuth("signin");
        watchlistButton.disabled = true;
        try {
            if (isSaved(state.media.type, state.media.id)) await removeFromWatchlist(state.media.type, state.media.id);
            else await addToWatchlist(state.media);
        } catch (error) {
            console.error(error);
        } finally {
            watchlistButton.disabled = false;
            updateWatchlistButton();
        }
    });

    // Home page rail
    const anchorForRail = $("#popular-shows-section");
    const watchlistSection = document.createElement("section");
    watchlistSection.id = "watchlist-section";
    watchlistSection.className = "recommendation-section";
    watchlistSection.hidden = true;
    watchlistSection.innerHTML = `
        <div class="section-heading"><div><p class="eyebrow">Saved for later</p><h2>Your watchlist</h2></div></div>
        <div id="watchlist-results" class="recommendation-grid"></div>`;
    if (anchorForRail && anchorForRail.parentNode) anchorForRail.parentNode.insertBefore(watchlistSection, anchorForRail);

    function renderWatchlistRail() {
        const grid = $("#watchlist-results");
        if (!grid) return;
        watchlistSection.hidden = !state.user || !state.watchlist.length;
        grid.innerHTML = state.watchlist.map((item) => `
            <button class="recommendation-card" type="button" data-id="${item.media_id}" data-type="${esc(item.media_type)}" title="${esc(item.title)}">
                <span class="recommendation-poster">${item.poster_path ? `<img src="${TMDB_POSTER}${esc(item.poster_path)}" alt="" loading="lazy">` : "<span>No poster</span>"}</span>
                <span class="recommendation-copy"><small>${item.media_type === "tv" ? "Show" : "Movie"}</small><strong>${esc(item.title)}</strong></span>
            </button>`).join("");
    }
    watchlistSection.addEventListener("click", (event) => {
        const card = event.target.closest(".recommendation-card");
        if (card) window.dispatchEvent(new CustomEvent("watch:open", { detail: { id: Number(card.dataset.id), type: card.dataset.type } }));
    });

    /* =====================================================================
       Supporter wall (home page, above the footer text)
       ===================================================================== */
    const wallAnchor = $(".attribution");
    const wallSection = document.createElement("section");
    wallSection.id = "supporter-wall";
    wallSection.className = "recommendation-section acc-wall";
    wallSection.hidden = true;
    wallSection.innerHTML = `
        <div class="section-heading"><div><p class="eyebrow">Thank you</p><h2>The people keeping the lights on</h2></div><a class="text-button" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">Support Opie Watch ♥</a></div>
        <div id="supporter-wall-list" class="acc-wall-list"></div>`;
    if (wallAnchor && wallAnchor.parentNode) wallAnchor.parentNode.insertBefore(wallSection, wallAnchor);

    async function loadWall() {
        if (!wallAnchor) return;
        const { data } = await sb.from("profiles")
            .select("username,role,tier,avatar_url,accent,border")
            .eq("show_on_wall", true).in("tier", ["basic", "gold"])
            .order("tier", { ascending: false }).order("created_at", { ascending: true }).limit(60);
        const rows = data || [];
        wallSection.hidden = !rows.length;
        $("#supporter-wall-list").innerHTML = rows.map((p) => `
            <div class="acc-wall-chip${p.tier === "gold" ? " is-spotlight" : ""}">${avatarHTML(p, "sm")}<span class="acc-wall-name">${nameHTML(p)}</span></div>`).join("");
    }

    /* =====================================================================
       Comments (shown inside the player section)
       ===================================================================== */
    const commentsRoot = document.createElement("section");
    commentsRoot.id = "acc-comments";
    commentsRoot.className = "acc-comments";
    commentsRoot.hidden = true;
    const playerSection = $("#player-section");
    if (playerSection) {
        const note = $(".player-note", playerSection);
        playerSection.insertBefore(commentsRoot, note || null);
    }

    function renderCommentsShell() {
        console.log("[accounts] renderCommentsShell", { hasMedia: !!state.media, media: state.media });
        if (!state.media) { commentsRoot.hidden = true; return; }
        commentsRoot.hidden = false;
        const p = state.profile;
        commentsRoot.innerHTML = `
            <h3 class="acc-comments-title">Comments</h3>
            ${p ? (p.banned
                ? '<p class="acc-muted">This account can no longer comment.</p>'
                : `<div class="acc-compose">
                        ${avatarHTML(p, "sm")}
                        <div class="acc-compose-main">
                            <textarea id="acc-comment-input" class="acc-textarea" maxlength="500" rows="2" placeholder="Add a comment about this title… (no links)"></textarea>
                            <div class="acc-compose-bar">
                                <span id="acc-comment-count" class="acc-muted">0 / 500</span>
                                <span id="acc-comment-msg" class="form-message" role="status"></span>
                                <button id="acc-comment-post" class="primary-button" type="button">Post</button>
                            </div>
                        </div>
                   </div>`)
              : '<p class="acc-muted"><button class="text-button" type="button" id="acc-comment-signin">Sign in</button> to join the conversation.</p>'}
            <div id="acc-comment-list" class="acc-comment-list"><p class="acc-muted">Loading comments…</p></div>`;

        const signIn = $("#acc-comment-signin", commentsRoot);
        if (signIn) signIn.addEventListener("click", () => openAuth("signin"));
        const input = $("#acc-comment-input", commentsRoot);
        if (input) input.addEventListener("input", () => { $("#acc-comment-count", commentsRoot).textContent = `${input.value.length} / 500`; });
        const post = $("#acc-comment-post", commentsRoot);
        if (post) post.addEventListener("click", postComment);
        console.log("[accounts] renderCommentsShell: elements found", {
            signIn: !!signIn,
            input: !!input,
            post: !!post,
            list: !!$("#acc-comment-list", commentsRoot)
        });
    }

    async function loadComments() {
        console.log("[accounts] loadComments", { page: state.commentPages, media: state.media });
        if (!state.media) return;
        const media = state.media;
        const limit = state.commentPages * COMMENTS_PER_PAGE;
        let data, error;
        try {
            const result = await sb.from("comments")
                .select("id,body,created_at,hidden,user_id,profiles!comments_user_id_fkey(username,role,tier,avatar_url,accent,border)")
                .eq("media_type", media.type).eq("media_id", media.id)
                .order("created_at", { ascending: false }).limit(limit + 1);
            data = result.data;
            error = result.error;
        } catch (err) {
            console.error("[accounts] loadComments exception:", err);
            const list = $("#acc-comment-list", commentsRoot);
            if (list) list.innerHTML = '<p class="acc-muted">Couldn’t load comments right now.</p>';
            return;
        }
        if (!state.media || state.media.id !== media.id) return; // switched titles meanwhile
        const list = $("#acc-comment-list", commentsRoot);
        if (!list) return;
        if (error) { console.error("[accounts] loadComments error:", error, "status:", error?.status, "message:", error?.message, "details:", error?.details, "hint:", error?.hint, "code:", error?.code); list.innerHTML = '<p class="acc-muted">Couldn’t load comments right now.</p>'; return; }
        console.log("[accounts] loadComments loaded", { total: (data || []).length, shown: Math.min((data || []).length, limit) });
        const rows = data || [];
        const more = rows.length > limit;
        const shown = rows.slice(0, limit);
        const owner = state.profile && state.profile.role === "owner";
        list.innerHTML = shown.length ? shown.map((c) => {
            const author = c.profiles;
            if (!author) return "";
            const mine = state.user && c.user_id === state.user.id;
            return `<article class="acc-comment${c.hidden ? " is-hidden" : ""}">
                ${avatarHTML(author, "sm")}
                <div class="acc-comment-main">
                    <div class="acc-comment-head">${nameHTML(author)}<small class="acc-muted">${esc(ago(c.created_at))}${c.hidden ? " · hidden by reports" : ""}</small></div>
                    <p class="acc-comment-body">${esc(c.body)}</p>
                    <div class="acc-comment-actions">
                        ${state.user && !mine ? `<button class="acc-link" type="button" data-cact="report" data-id="${c.id}">Report</button>` : ""}
                        ${mine || owner || isModerator(state.profile) ? `<button class="acc-link" type="button" data-cact="delete" data-id="${c.id}">Delete</button>` : ""}
                    </div>
                </div>
            </article>`;
        }).join("") + (more ? '<button class="text-button" type="button" data-cact="more">Load more</button>' : "")
            : '<p class="acc-muted">No comments yet. Be the first.</p>';
    }

    async function postComment() {
        console.log("[accounts] postComment called", { media: state.media });
        if (!state.media) {
            const message = $("#acc-comment-msg", commentsRoot);
            if (message) { message.textContent = "No media selected. Open a movie or show first."; message.classList.toggle("is-ok", false); }
            return;
        }
        const input = $("#acc-comment-input", commentsRoot);
        const button = $("#acc-comment-post", commentsRoot);
        const message = $("#acc-comment-msg", commentsRoot);
        if (!input || !button || !message) {
            console.error("[accounts] postComment: comment UI elements not found in commentsRoot");
            return;
        }
        const body = input.value.trim();
        const say = (text, ok = false) => { message.textContent = text; message.classList.toggle("is-ok", ok); };
        if (!body) return say("Write something first.");
        button.disabled = true;
        say("Posting…", true);
        try {
            console.log("[accounts] postComment -> rpc post_comment", { type: state.media.type, id: state.media.id, bodyLen: body.length });
            const { data, error } = await sb.rpc("post_comment", { p_type: state.media.type, p_id: state.media.id, p_body: body });
            console.log("[accounts] postComment <- rpc post_comment", { data, error });
            if (error) throw error;
            if (!data.ok) return say(data.error || "Couldn’t post that.");
            input.value = "";
            $("#acc-comment-count", commentsRoot).textContent = "0 / 500";
            say("");
            state.commentPages = 1;
            console.log("[accounts] postComment: comment posted, reloading comments");
            await loadComments();
        } catch (error) {
            console.error("[accounts] postComment error:", error);
            say("Couldn’t post that. Please try again.");
        } finally {
            setTimeout(() => { button.disabled = false; }, 2000);
        }
    }

    commentsRoot.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-cact]");
        if (!target) return;
        const action = target.dataset.cact;
        if (action === "more") { state.commentPages += 1; return loadComments(); }
        const id = Number(target.dataset.id);
        if (action === "report") {
            if (!confirm("Report this comment to the moderators?")) return;
            const { data } = await sb.rpc("report_comment", { p_comment_id: id });
            alert((data && (data.message || data.error)) || "Thanks.");
            loadComments();
        } else if (action === "delete") {
            if (!confirm("Delete this comment?")) return;
            const { data } = await sb.rpc("delete_comment", { p_comment_id: id });
            if (data && !data.ok) alert(data.error || "Couldn’t delete that.");
            loadComments();
        }
    });

    /* =====================================================================
       Hooks from watching.js
       ===================================================================== */
    window.addEventListener("watch:media-opened", (event) => {
        console.log("[accounts] watch:media-opened", event.detail);
        state.media = event.detail;
        state.commentPages = 1;
        updateWatchlistButton();
        renderCommentsShell();
        loadComments();
    });
    window.addEventListener("watch:media-closed", () => {
        state.media = null;
        updateWatchlistButton();
        renderCommentsShell();
    });

    /* Handy for gating experimental features to Gold supporters:
       if (window.OpieAccount && window.OpieAccount.hasEarlyAccess()) { ... } */
    window.OpieAccount = {
        client: sb,
        openAuth: (mode) => openAuth(mode || "signin"),
        isSignedIn: () => Boolean(state.user),
        getProfile: () => state.profile,
        hasEarlyAccess: () => effTier(state.profile) === "gold",
        isModerator: () => isModerator(state.profile)
    };
    document.documentElement.dataset.accountsReady = "1";

    /* ---------- boot ---------- */
    renderAccountButtons();
    renderWatchlistRail();
    loadWall();
    sb.auth.getSession().then(({ data }) => {
        if (data.session && !state.user) {
            state.user = data.session.user;
            refreshAll();
        }
    });
})();
