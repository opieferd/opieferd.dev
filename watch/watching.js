(function () {
    "use strict";

    const TMDB_API = "https://api.themoviedb.org/3";
    const TMDB_KEY = "54e00466a09676df57ba51c4ca30b1a6";
    const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    const PROVIDERS = [
        {
            id: "vidrock",
            name: "Xero",
            quality: "HD",
            origin: "https://vidrock.ru",
            buildUrl: (type, id, season, episode) => `https://vidrock.ru/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}?autoplay=true&theme=ebaf36&autonext=true`
        },
        {
            id: "vidsrc",
            name: "Nova",
            quality: "HD",
            origin: "https://vidsrc.sh",
            buildUrl: (type, id, season, episode) => `https://vidsrc.sh/embed/${type}/${id}${type === "tv" ? `?season=${season}&episode=${episode}` : ""}`
        },
        {
            id: "vidlink",
            name: "Maze",
            quality: "HD",
            origin: "https://vidlink.pro",
            buildUrl: (type, id, season, episode) => `https://vidlink.pro/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}`
        },
        {
            id: "vaplayer",
            name: "Luci",
            quality: "HD",
            origin: "https://vaplayer.ru",
            buildUrl: (type, id, season, episode) => `https://vaplayer.ru/embed/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}`
        },
        {
            id: "cinesrc",
            name: "Zara",
            quality: "4K",
            origin: "https://cinesrc.st",
            buildUrl: (type, id, season, episode) => `https://cinesrc.st/embed/${type}/${id}${type === "tv" ? `?s=${season}&e=${episode}` : ""}`
        },
        {
            id: "vixsrc",
            name: "Kira",
            quality: "HD",
            origin: "https://vixsrc.to",
            buildUrl: (type, id, season, episode) => `https://vixsrc.to/${type}/${id}${type === "tv" ? `/${season}/${episode}/` : "/"}`
        }
    ];
    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("search-input");
    const searchMessage = document.getElementById("search-message");
    const resultsSection = document.getElementById("results-section");
    const results = document.getElementById("results");
    const resultCount = document.getElementById("result-count");
    const playerSection = document.getElementById("player-section");
    const player = document.getElementById("player");
    const playerHeading = document.getElementById("player-heading");
    const playerMeta = document.getElementById("player-meta");
    const vidvaultLink = document.getElementById("vidvault-link");
    const downloadActionsContent = document.getElementById("download-actions-content");
    const hideDownloadActions = document.getElementById("hide-download-actions");
    const showDownloadActions = document.getElementById("show-download-actions");
    const closePlayer = document.getElementById("close-player");
    const episodeControls = document.getElementById("episode-controls");
    const seasonSelect = document.getElementById("season-select");
    const episodeSelect = document.getElementById("episode-select");
    const serverList = document.getElementById("server-list");
    const serverStatus = document.getElementById("server-status");
    const historySection = document.getElementById("history-section");
    const history = document.getElementById("history");
    const clearHistory = document.getElementById("clear-history");
    const saveHistoryPrompt = document.getElementById("save-history-prompt");
    const saveHistoryButton = document.getElementById("save-history-button");
    const disclaimer = document.getElementById("vidrock-disclaimer");
    const closeDisclaimer = document.getElementById("close-disclaimer");
    let searchType = "multi";
    let activeMedia = null;
    let activeMediaType = null;
    const historyKey = "watch-history";
    const DISCORD_RPC_URL = "http://127.0.0.1:6464/activity";
    let historyEnabled = localStorage.getItem("watch-history-enabled") === "true";
    let activeProviderId = PROVIDERS[0].id;
    let activePlayback = { currentTime: 0, duration: 0 };

    function setDownloadActionsVisible(visible) {
        downloadActionsContent.hidden = !visible;
        hideDownloadActions.hidden = !visible;
        showDownloadActions.hidden = visible;
    }

    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));

    const year = (date) => date ? String(date).slice(0, 4) : "—";
    const mediaTitle = (item) => item.title || item.name || "Untitled";
    const mediaType = (item) => item.media_type || searchType;
    const activeProvider = () => PROVIDERS.find((provider) => provider.id === activeProviderId) || PROVIDERS[0];

    function renderServerList() {
        serverList.innerHTML = PROVIDERS.map((provider) => `
            <button class="server-button${provider.id === activeProviderId ? " active" : ""}" type="button" data-server="${provider.id}" aria-pressed="${provider.id === activeProviderId}">
                <span>${provider.name}</span>
                <small>${provider.quality}</small>
            </button>
        `).join("");
        serverList.querySelectorAll(".server-button").forEach((button) => button.addEventListener("click", () => {
            activeProviderId = button.dataset.server;
            renderServerList();
            updatePlayer();
        }));
    }

    function updatePlayer(season, episode) {
        if (!activeMedia || !activeMediaType) return;
        const currentSeason = Number(season || seasonSelect.value) || 1;
        const currentEpisode = Number(episode || episodeSelect.value) || 1;
        const provider = activeProvider();
        activePlayback = getSavedProgress(currentSeason, currentEpisode);
        player.src = provider.buildUrl(activeMediaType, activeMedia.id, currentSeason, currentEpisode);
        serverStatus.textContent = `Using ${provider.name}`;
        player.addEventListener("load", () => sendResumePosition(), { once: true });
    }

    function getSavedHistoryItem(season, episode) {
        if (!activeMedia) return null;
        return readHistory().find((item) =>
            item.id === activeMedia.id &&
            item.type === activeMediaType &&
            (item.season || 0) === (activeMediaType === "tv" ? Number(season) || 1 : 0) &&
            (item.episode || 0) === (activeMediaType === "tv" ? Number(episode) || 1 : 0)
        ) || null;
    }

    function getSavedProgress(season, episode) {
        const item = getSavedHistoryItem(season, episode);
        return {
            currentTime: Number(item?.progress?.currentTime) || 0,
            duration: Number(item?.progress?.duration) || 0
        };
    }

    function sendResumePosition() {
        if (!activePlayback.currentTime || !player.contentWindow) return;
        player.contentWindow.postMessage({
            type: "watch-progress-resume",
            currentTime: activePlayback.currentTime
        }, activeProvider().origin);
    }

    function formatProgress(progress) {
        if (!progress.currentTime) return "";
        const minutes = Math.floor(progress.currentTime / 60);
        const seconds = Math.floor(progress.currentTime % 60).toString().padStart(2, "0");
        return `Resume at ${minutes}:${seconds}`;
    }

    function handlePlaybackMessage(event) {
        const provider = activeProvider();
        if (event.source !== player.contentWindow || event.origin !== provider.origin || !activeMedia) return;
        const data = typeof event.data === "string" ? (() => {
            try { return JSON.parse(event.data); } catch { return null; }
        })() : event.data;
        if (!data || !["watch-progress", "playback-progress", "timeupdate"].includes(data.type || data.event)) return;
        const payload = data.data || data;
        const currentTime = Number(payload.currentTime ?? payload.position);
        const duration = Number(payload.duration);
        if (!Number.isFinite(currentTime) || currentTime < 0) return;
        activePlayback = {
            currentTime,
            duration: Number.isFinite(duration) && duration > 0 ? duration : activePlayback.duration
        };
        saveCurrentMedia(
            activeMediaType === "tv" ? Number(seasonSelect.value) || 1 : 0,
            activeMediaType === "tv" ? Number(episodeSelect.value) || 1 : 0,
            activePlayback
        );
    }
    function updateDiscordPresence(season, episode) {
        if (!activeMedia) return;
        const title = mediaTitle(activeMedia);
        const episodeLabel = activeMediaType === "tv" ? `S${season} E${episode}` : "Movie";
        const image = activeMedia.poster_path ? `${IMAGE_BASE}${activeMedia.poster_path}` : "";
        fetch(DISCORD_RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, episode: episodeLabel, image })
        }).catch(() => {
            // The helper is optional; playback should work without it.
        });
    }
    const readHistory = () => {
        if (!historyEnabled) return [];
        try {
            const storedItems = JSON.parse(localStorage.getItem(historyKey) || "[]");
            if (!Array.isArray(storedItems)) return [];
            const items = storedItems.filter((item) => item && item.id && item.type);
            const latestByMedia = new Map();
            items.forEach((item) => {
                const key = `${item.type}:${item.id}`;
                if (!latestByMedia.has(key)) latestByMedia.set(key, item);
            });
            const normalizedItems = Array.from(latestByMedia.values());
            if (normalizedItems.length !== items.length) {
                saveHistory(normalizedItems);
            }
            return normalizedItems;
        } catch (error) {
            console.error("Unable to read watch history.", error);
            return [];
        }
    };
    const saveHistory = (items) => localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 24)));

    function renderHistory() {
        const items = readHistory();
        historySection.hidden = !historyEnabled;
        history.innerHTML = items.length ? items.map((item) => {
            const poster = item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : "";
            const episode = item.type === "tv" && item.season ? `S${item.season} · E${item.episode}` : "Movie";
            const progress = item.progress ? formatProgress(item.progress) : "";
            return `<button class="history-card" type="button" data-id="${item.id}" data-type="${item.type}" data-season="${item.season || ""}" data-episode="${item.episode || ""}">
                ${poster ? `<img class="history-poster" src="${poster}" alt="" loading="lazy">` : "<span class=\"history-poster history-poster-placeholder\">No poster</span>"}
                <span class="history-copy"><small>${episode}${progress ? ` · ${progress}` : ""}</small><strong>${escapeHtml(item.title)}</strong></span>
            </button>`;
        }).join("") : "<p class=\"history-empty\">Anything you play will show up here.</p>";
        history.querySelectorAll(".history-card").forEach((card) => card.addEventListener("click", () => {
            openMedia(Number(card.dataset.id), card.dataset.type, Number(card.dataset.season) || 0, Number(card.dataset.episode) || 0);
        }));
    }

    function updateSessionView() {
        saveHistoryPrompt.hidden = historyEnabled;
        renderHistory();
    }

    function saveCurrentMedia(season, episode, progress = activePlayback) {
        if (!historyEnabled || !activeMedia) return;
        const item = {
            id: activeMedia.id,
            type: activeMediaType,
            title: mediaTitle(activeMedia),
            poster_path: activeMedia.poster_path || "",
            season: activeMediaType === "tv" ? season : 0,
            episode: activeMediaType === "tv" ? episode : 0,
            progress: progress.currentTime ? progress : undefined
        };
        const items = readHistory().filter((saved) => !(saved.id === item.id && saved.type === item.type));
        saveHistory([item, ...items]);
        renderHistory();
    }

    function normalizeSearchText(value) {
        return String(value || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function levenshteinDistance(left, right) {
        const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
        for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
            const current = [leftIndex];
            for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
                current[rightIndex] = Math.min(
                    current[rightIndex - 1] + 1,
                    previous[rightIndex] + 1,
                    previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
                );
            }
            for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
        }
        return previous[right.length];
    }

    function fuzzySimilarity(left, right) {
        if (!left || !right) return 0;
        return 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length);
    }

    function scoreSearchResult(item, query) {
        const title = normalizeSearchText(mediaTitle(item));
        const normalizedQuery = normalizeSearchText(query);
        const queryTokens = normalizedQuery.split(" ").filter(Boolean);
        if (!title || !normalizedQuery) return 0;

        let score = 0;
        const titleTokens = title.split(" ");
        const wholeTitleSimilarity = fuzzySimilarity(normalizedQuery, title);
        const tokenSimilarities = queryTokens.map((token) => Math.max(
            ...titleTokens.map((titleToken) => fuzzySimilarity(token, titleToken))
        ));
        const fuzzyTokenMatches = tokenSimilarities.filter((similarity) => similarity >= 0.9).length;
        if (wholeTitleSimilarity >= 0.9) score += 5000;
        score += fuzzyTokenMatches * 700;
        if (fuzzyTokenMatches === queryTokens.length) score += 1800;
        if (title === normalizedQuery) score += 10000;
        else if (title.startsWith(normalizedQuery)) score += 6000;
        else if (title.includes(` ${normalizedQuery}`)) score += 4500;

        const matchingTokens = queryTokens.filter((token) =>
            titleTokens.some((titleToken) => titleToken === token || titleToken.startsWith(token))
        ).length;
        score += matchingTokens * 900;
        if (matchingTokens === queryTokens.length) score += 2500;
        if (title.includes(normalizedQuery)) score += 300;
        return (score || wholeTitleSimilarity >= 0.9 || fuzzyTokenMatches > 0)
            ? score + Math.min(Number(item.popularity) || 0, 100)
            : 0;
    }

    async function search() {
        const query = searchInput.value.trim();
        if (!query) return;
        searchMessage.textContent = "Looking around…";
        resultsSection.hidden = true;
        try {
            const response = await fetch(`${TMDB_API}/search/${searchType}?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}&include_adult=false&page=1`);
            if (!response.ok) throw new Error(`Search failed (${response.status})`);
            const data = await response.json();
            const items = (data.results || [])
                .filter((item) => mediaType(item) === "movie" || mediaType(item) === "tv")
                .map((item) => ({ item, score: scoreSearchResult(item, query) }))
                .filter(({ score }) => score > 0)
                .sort((left, right) => right.score - left.score)
                .map(({ item }) => item);
            renderResults(items);
            searchMessage.textContent = items.length ? "" : "I couldn’t find anything. Try a different search?";
        } catch (error) {
            console.error(error);
            searchMessage.textContent = "Looks like search is taking a break. Try again in a moment?";
        }
    }

    function renderResults(items) {
        resultCount.textContent = `${items.length} result${items.length === 1 ? "" : "s"}`;
        results.innerHTML = items.map((item) => {
            const title = mediaTitle(item);
            const type = mediaType(item);
            const poster = item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : "";
            return `<button class="result-card" type="button" data-id="${item.id}" data-type="${type}">
                <span class="poster">${poster ? `<img src="${poster}" alt="" loading="lazy">` : "<span class=\"poster-placeholder\">No poster</span>"}</span>
                <span class="result-copy"><span class="result-type">${type === "tv" ? "Show" : "Movie"} · ${year(item.release_date || item.first_air_date)}</span><strong>${escapeHtml(title)}</strong><span class="result-overview">${escapeHtml(item.overview || "No description available.")}</span></span>
            </button>`;
        }).join("");
        resultsSection.hidden = false;
        results.querySelectorAll(".result-card").forEach((card) => card.addEventListener("click", () => openMedia(Number(card.dataset.id), card.dataset.type)));
    }

    async function openMedia(id, type, preferredSeason, preferredEpisode) {
        searchMessage.textContent = "Getting the details…";
        try {
            const response = await fetch(`${TMDB_API}/${type}/${id}?api_key=${TMDB_KEY}&language=en-US`);
            if (!response.ok) throw new Error(`Details failed (${response.status})`);
            activeMedia = await response.json();
            activeMediaType = type;
            playerSection.hidden = false;
            playerHeading.textContent = mediaTitle(activeMedia);
            playerMeta.textContent = `${type === "tv" ? "Show" : "Movie"} · ${year(activeMedia.release_date || activeMedia.first_air_date)} · ${activeMedia.overview || "Ready when you are"}`;
            updateVidVaultLink();
            if (type === "tv") {
                setupEpisodes(activeMedia, preferredSeason, preferredEpisode);
            } else {
                episodeControls.hidden = true;
                updatePlayer();
                saveCurrentMedia();
                updateDiscordPresence(0, 0);
            }
            playerSection.scrollIntoView({ behavior: "smooth", block: "start" });
            searchMessage.textContent = "";
        } catch (error) {
            console.error(error);
            searchMessage.textContent = "I couldn’t load that one. Want to try another?";
        }
    }

    function setupEpisodes(show, preferredSeason, preferredEpisode) {
        const seasons = (show.seasons || []).filter((season) => season.season_number > 0);
        seasonSelect.innerHTML = seasons.map((season) => `<option value="${season.season_number}">Season ${season.season_number}</option>`).join("");
        episodeControls.hidden = !seasons.length;
        if (seasons.length) {
            const season = seasons.some((item) => item.season_number === preferredSeason) ? preferredSeason : seasons[0].season_number;
            seasonSelect.value = season;
            loadEpisodes(show.id, season, preferredEpisode);
        }
    }

    async function loadEpisodes(showId, seasonNumber, preferredEpisode) {
        episodeSelect.innerHTML = "<option>Finding episodes…</option>";
        try {
            const response = await fetch(`${TMDB_API}/tv/${showId}/season/${seasonNumber}?api_key=${TMDB_KEY}&language=en-US`);
            if (!response.ok) throw new Error(`Episodes failed (${response.status})`);
            const data = await response.json();
            episodeSelect.innerHTML = (data.episodes || []).map((episode) => `<option value="${episode.episode_number}">Episode ${episode.episode_number} · ${escapeHtml(episode.name)}</option>`).join("");
            if (preferredEpisode && data.episodes.some((episode) => episode.episode_number === preferredEpisode)) episodeSelect.value = preferredEpisode;
            updatePlayer(Number(seasonNumber), Number(episodeSelect.value) || 1);
            updateVidVaultLink(Number(seasonNumber), Number(episodeSelect.value) || 1);
            saveCurrentMedia(Number(seasonNumber), Number(episodeSelect.value) || 1);
            updateDiscordPresence(Number(seasonNumber), Number(episodeSelect.value) || 1);
        } catch (error) {
            console.error(error);
            episodeSelect.innerHTML = "<option>Couldn’t find the episodes</option>";
            updatePlayer(Number(seasonNumber), 1);
        }
    }

    function updateVidVaultLink(season, episode) {
        if (!activeMedia || !activeMediaType) return;
        const path = activeMediaType === "tv" && season && episode
            ? `/tv/${activeMedia.id}/${season}/${episode}`
            : `/${activeMediaType}/${activeMedia.id}`;
        vidvaultLink.href = `https://vidvault.to${path}`;
    }

    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        search();
    });
    document.querySelectorAll(".type-button").forEach((button) => button.addEventListener("click", () => {
        document.querySelector(".type-button.active").classList.remove("active");
        button.classList.add("active");
        searchType = button.dataset.type;
    }));
    seasonSelect.addEventListener("change", () => loadEpisodes(activeMedia.id, seasonSelect.value));
    episodeSelect.addEventListener("change", () => {
        updatePlayer(Number(seasonSelect.value), Number(episodeSelect.value));
        updateVidVaultLink(Number(seasonSelect.value), Number(episodeSelect.value));
        saveCurrentMedia(Number(seasonSelect.value), Number(episodeSelect.value));
        updateDiscordPresence(Number(seasonSelect.value), Number(episodeSelect.value));
    });
    window.addEventListener("message", handlePlaybackMessage);
    closePlayer.addEventListener("click", () => {
        player.src = "";
        playerSection.hidden = true;
        activeMedia = null;
        activeMediaType = null;
        setDownloadActionsVisible(true);
    });
    hideDownloadActions.addEventListener("click", () => setDownloadActionsVisible(false));
    showDownloadActions.addEventListener("click", () => setDownloadActionsVisible(true));
    saveHistoryButton.addEventListener("click", () => {
        historyEnabled = true;
        localStorage.setItem("watch-history-enabled", "true");
        updateSessionView();
    });
    clearHistory.addEventListener("click", () => {
        if (!historyEnabled) return;
        localStorage.removeItem(historyKey);
        renderHistory();
    });
    renderServerList();
    closeDisclaimer.addEventListener("click", () => disclaimer.close());
    disclaimer.showModal();
    updateSessionView();
})();
