(function () {
    "use strict";

    const TMDB_API = "https://api.themoviedb.org/3";
    const TMDB_KEY = "54e00466a09676df57ba51c4ca30b1a6";
    const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    const VIDROCK_URL = "https://vidrock.ru";
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
    const closePlayer = document.getElementById("close-player");
    const episodeControls = document.getElementById("episode-controls");
    const seasonSelect = document.getElementById("season-select");
    const episodeSelect = document.getElementById("episode-select");
    const historySection = document.getElementById("history-section");
    const history = document.getElementById("history");
    const clearHistory = document.getElementById("clear-history");
    const saveHistoryPrompt = document.getElementById("save-history-prompt");
    const saveHistoryButton = document.getElementById("save-history-button");
    let searchType = "multi";
    let activeMedia = null;
    let activeMediaType = null;
    const historyKey = "watch-history";
    let historyEnabled = localStorage.getItem("watch-history-enabled") === "true";

    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));

    const year = (date) => date ? String(date).slice(0, 4) : "—";
    const mediaTitle = (item) => item.title || item.name || "Untitled";
    const mediaType = (item) => item.media_type || searchType;
    const readHistory = () => {
        if (!historyEnabled) return [];
        try {
            return JSON.parse(localStorage.getItem(historyKey) || "[]");
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
            return `<button class="history-card" type="button" data-id="${item.id}" data-type="${item.type}" data-season="${item.season || ""}" data-episode="${item.episode || ""}">
                ${poster ? `<img class="history-poster" src="${poster}" alt="" loading="lazy">` : "<span class=\"history-poster history-poster-placeholder\">No poster</span>"}
                <span class="history-copy"><small>${episode}</small><strong>${escapeHtml(item.title)}</strong></span>
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

    function saveCurrentMedia(season, episode) {
        if (!historyEnabled || !activeMedia) return;
        const item = {
            id: activeMedia.id,
            type: activeMediaType,
            title: mediaTitle(activeMedia),
            poster_path: activeMedia.poster_path || "",
            season: activeMediaType === "tv" ? season : 0,
            episode: activeMediaType === "tv" ? episode : 0
        };
        const items = readHistory().filter((saved) => !(saved.id === item.id && saved.type === item.type));
        saveHistory([item, ...items]);
        renderHistory();
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
            const items = (data.results || []).filter((item) => mediaType(item) === "movie" || mediaType(item) === "tv");
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
            if (type === "tv") {
                setupEpisodes(activeMedia, preferredSeason, preferredEpisode);
            } else {
                episodeControls.hidden = true;
                setPlayerUrl(`/movie/${id}`);
                saveCurrentMedia();
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
            setPlayerUrl(`/tv/${showId}/${seasonNumber}/${episodeSelect.value || 1}`);
            saveCurrentMedia(Number(seasonNumber), Number(episodeSelect.value) || 1);
        } catch (error) {
            console.error(error);
            episodeSelect.innerHTML = "<option>Couldn’t find the episodes</option>";
            setPlayerUrl(`/tv/${showId}/${seasonNumber}/1`);
        }
    }

    function setPlayerUrl(path) {
        const params = new URLSearchParams({ autoplay: "true", theme: "ebaf36", autonext: "true" });
        player.src = `${VIDROCK_URL}${path}?${params.toString()}`;
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
        setPlayerUrl(`/tv/${activeMedia.id}/${seasonSelect.value}/${episodeSelect.value}`);
        saveCurrentMedia(Number(seasonSelect.value), Number(episodeSelect.value));
    });
    closePlayer.addEventListener("click", () => {
        player.src = "";
        playerSection.hidden = true;
        activeMedia = null;
        activeMediaType = null;
    });
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
    updateSessionView();
})();
