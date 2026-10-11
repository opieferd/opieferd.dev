(function () {
    "use strict";

    const pageOrigin = window.location.origin;
    const storageKey = "opieferd.currentlyWatching";
    const showsStorageKey = "opieferd.currentlyWatching.shows";
    const editorPassword = "142376088";
    const status = document.getElementById("status");
    const details = document.getElementById("show-details");
    const updated = document.getElementById("updated");
    const bookmarklet = document.getElementById("bookmarklet");
    const unlockForm = document.getElementById("unlock-form");
    const passwordInput = document.getElementById("editor-password");
    const manualShowForm = document.getElementById("manual-show-form");
    const showTitleInput = document.getElementById("show-title");
    const showEpisodeInput = document.getElementById("show-episode");
    const editMessage = document.getElementById("edit-message");
    const streamingDomains = [
        "novashow.live",
        "netflix.com",
        "hulu.com",
        "disneyplus.com",
        "disney.com",
        "max.com",
        "primevideo.com",
        "paramountplus.com",
        "peacocktv.com",
        "crunchyroll.com"
    ];

    function normalizeShow(data) {
        if (!data || typeof data.title !== "string" || !data.title.trim()) {
            return null;
        }
        return {
            title: data.title.trim(),
            episode: typeof data.episode === "string" ? data.episode.trim() : "",
            updatedAt: data.updatedAt || Date.now(),
            site: typeof data.site === "string" ? data.site : ""
        };
    }

    function readShows() {
        try {
            const saved = JSON.parse(localStorage.getItem(showsStorageKey));
            if (Array.isArray(saved)) {
                return saved.map(normalizeShow).filter(Boolean);
            }
            const legacy = normalizeShow(JSON.parse(localStorage.getItem(storageKey)));
            return legacy ? [legacy] : [];
        } catch {
            return [];
        }
    }

    function saveShows(shows) {
        localStorage.setItem(showsStorageKey, JSON.stringify(shows));
        localStorage.removeItem(storageKey);
    }

    function render() {
        const shows = readShows();
        if (!shows.length) {
            status.textContent = "Waiting for streaming site data";
            details.className = "show-details empty-state";
            details.innerHTML = "<p>Open a streaming site and use the bookmarklet below to share a show and episode.</p>";
            updated.textContent = "";
            return;
        }

        status.textContent = shows.length === 1 ? "Currently watching" : `Currently watching ${shows.length} shows`;
        details.className = "show-details";
        details.innerHTML = shows.map((show, index) => {
            const episode = show.episode ? `Episode ${show.episode}` : "Episode not detected";
            const site = show.site ? `<p class="site">${escapeHtml(show.site)}</p>` : "";
            return `<article class="show-entry"><div><p class="show-number">${index + 1}</p><h2>${escapeHtml(show.title)}</h2><p class="episode">${escapeHtml(episode)}</p>${site}</div><button class="remove-show" type="button" data-index="${index}" hidden>Remove</button></article>`;
        }).join("");
        const latest = Math.max(...shows.map((show) => new Date(show.updatedAt).getTime()));
        updated.textContent = `Last shared ${new Date(latest).toLocaleString()}`;
        document.querySelectorAll(".remove-show").forEach((button) => {
            button.addEventListener("click", () => {
                const nextShows = readShows();
                nextShows.splice(Number(button.dataset.index), 1);
                saveShows(nextShows);
                render();
            });
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[character]));
    }

    function loadSaved() {
        render();
    }

    window.addEventListener("message", (event) => {
        let hostname = "";
        try {
            hostname = new URL(event.origin).hostname;
        } catch {
            return;
        }
        if (!streamingDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
            return;
        }
        if (event.data && event.data.type === "novashow-watching" && typeof event.data.title === "string") {
            const incoming = normalizeShow(event.data);
            if (!incoming) {
                return;
            }
            const shows = readShows();
            const existingIndex = shows.findIndex((show) => show.title.toLowerCase() === incoming.title.toLowerCase());
            if (existingIndex >= 0) {
                shows[existingIndex] = incoming;
            } else {
                shows.push(incoming);
            }
            saveShows(shows);
            render();
            status.textContent = `Updated from ${event.data.site || hostname}`;
        }
    });

    unlockForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (passwordInput.value !== editorPassword) {
            editMessage.textContent = "Incorrect editor password.";
            return;
        }
        unlockForm.hidden = true;
        manualShowForm.hidden = false;
        document.querySelectorAll(".remove-show").forEach((button) => {
            button.hidden = false;
        });
        editMessage.textContent = "Editing unlocked.";
        passwordInput.value = "";
    });

    manualShowForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const show = normalizeShow({
            title: showTitleInput.value,
            episode: showEpisodeInput.value,
            updatedAt: Date.now(),
        
        });
        const shows = readShows();
        const existingIndex = shows.findIndex((item) => item.title.toLowerCase() === show.title.toLowerCase());
        if (existingIndex >= 0) {
            shows[existingIndex] = show;
        } else {
            shows.push(show);
        }
        saveShows(shows);
        render();
        document.querySelectorAll(".remove-show").forEach((button) => {
            button.hidden = false;
        });
        manualShowForm.reset();
        editMessage.textContent = "Show saved.";
    });

    const bookmarkletCode = `javascript:(()=>{const host=location.hostname.toLowerCase();const nova=/novashow\\.live$/.test(host);const values=[];const add=v=>{if(v&&typeof v==='string')values.push(v.trim())};const read=o=>{try{Object.keys(o).forEach(k=>add(o.getItem(k)))}catch{}};read(localStorage);read(sessionStorage);document.querySelectorAll('script[type="application/ld+json"]').forEach(e=>add(e.textContent));const text=(document.title+' '+document.body.innerText+' '+values.join(' ')).replace(/\\s+/g,' ');const episode=text.match(/(?:season\\s*\\d+\\s*[,:-]?\\s*)?episode\\s*\\d+|\\bS\\d{1,2}\\s*E\\d{1,3}\\b|\\b\\d{1,2}x\\d{1,3}\\b/i);const selectors=nova?'h1,h2,[class*="episode"],[class*="show-title"],[class*="series-title"],[class*="anime-title"]':'h1,h2,[data-testid*="title"],[class*="show-title"],[class*="series-title"],[class*="video-title"],[class*="episode-title"],[class*="program-title"]';const el=[...document.querySelectorAll(selectors)].find(e=>e.textContent.trim().length>1);let title=(el?.textContent||'').trim();if(!title){title=document.title.replace(/\\s*[|–-]\\s*(?:Netflix|Hulu|Disney\\+|Max|Prime Video|Paramount\\+|Peacock|Crunchyroll|NovaShow).*$/i,'').trim()}title=title.replace(/\\s*(?:season\\s*\\d+\\s*)?(?:episode\\s*\\d+|S\\d{1,2}\\s*E\\d{1,3}|\\d{1,2}x\\d{1,3}).*$/i,'').trim();const d={type:'novashow-watching',title:title||'Unknown show',episode:episode?episode[0].replace(/\\s+/g,' '):'',updatedAt:Date.now(),site:host};if(window.opener){window.opener.postMessage(d,'${pageOrigin}');alert('Sent to opieferd.dev');}else{alert('Open the streaming site from the opieferd.dev/watching page first.');}})()`;
    bookmarklet.href = bookmarkletCode;

    loadSaved();
}());
