(function () {
    "use strict";
    const section = document.getElementById("player-section");
    if (!section) return;
    const key = "watch-discord-sharing";
    const readEnabled = () => {
        try { return localStorage.getItem(key) === "true"; } catch { return false; }
    };
    let enabled = readEnabled();
    let media = null;
    let playback = null;
    const controls = document.createElement("div");
    controls.className = "download-actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary-button";
    const help = document.createElement("a");
    help.className = "secondary-button";
    help.textContent = "Set up Discord activity";
    // Resolve against this file so every player subpage uses the same setup URL.
    help.href = new URL("discord/", document.currentScript.src).href;
    controls.append(toggle, help);
    section.append(controls);

    function publish() {
        toggle.textContent = `Discord sharing: ${enabled ? "on" : "off"}`;
        toggle.setAttribute("aria-pressed", String(enabled));
        section.dataset.discordPresence = JSON.stringify(enabled && media
            ? { version: 1, enabled: true, active: true, ...media, playback }
            : { version: 1, enabled, active: false });
    }
    toggle.addEventListener("click", () => {
        enabled = !enabled;
        try { localStorage.setItem(key, String(enabled)); } catch { /* Still works for this tab. */ }
        publish();
    });
    window.addEventListener("storage", (event) => {
        if (event.key === key || event.key === null) {
            enabled = readEnabled();
            publish();
        }
    });
    window.addEventListener("pagehide", () => {
        section.dataset.discordPresence = JSON.stringify({ version: 1, enabled, active: false });
    });
    window.addEventListener("pageshow", publish);
    window.OpwatchDiscord = {
        update(value) {
            media = value;
            playback = null;
            publish();
        },
        playback(value) {
            playback = { ...value, updatedAt: Date.now() };
            publish();
        },
        clear() {
            media = null;
            playback = null;
            publish();
        }
    };
    publish();
})();
