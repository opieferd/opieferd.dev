(function () {
    "use strict";

    const TMDB_API = "https://api.themoviedb.org/3";
    const TMDB_KEY = "54e00466a09676df57ba51c4ca30b1a6";
    const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    const JIKAN_API = "https://api.jikan.moe/v4";
    const PROVIDERS = [
        {
            id: "vidrock",
            name: "Xero",
            quality: "HD",
            origin: "https://vidrock.to",
            buildUrl: (type, id, season, episode) => `https://vidrock.to/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}?autoplay=true&theme=ebaf36&autonext=true`
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
            buildUrl: (type, id, season, episode) => `https://vidlink.pro/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}`,
            // Sub/dub route: takes a MyAnimeList id, not a TMDB id
            anime: {
                buildUrl: (malId, episode, audio) => `https://vidlink.pro/anime/${malId}/${episode}/${audio}`
            }
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
    const audioControls = document.getElementById("audio-controls");
    const audioList = document.getElementById("audio-list");
    const audioStatus = document.getElementById("audio-status");
    const malSelect = document.getElementById("mal-select");
    const historySection = document.getElementById("history-section");
    const history = document.getElementById("history");
    const popularShowsResults = document.getElementById("popular-shows-results");
    const popularMoviesResults = document.getElementById("popular-movies-results");
    const recommendedSection = document.getElementById("recommended-section");
    const recommendedResults = document.getElementById("recommended-results");
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
    let recommendationsTimer = null;
    let searchRequestId = 0;
    let audioMode = "default"; // "default" | "sub" | "dub"
    let malOverride = null;    // index into the matched MyAnimeList entries, or null for auto
    let playerRequestId = 0;
    const animeEntryCache = new Map();

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

    const isAnime = () => Boolean(activeMedia
        && activeMedia.original_language === "ja"
        && (activeMedia.genres || []).some((genre) => genre.id === 16));
    const audioProvider = () => PROVIDERS.find((provider) => provider.anime);
    const normalizeTitle = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    function renderServerList() {
        serverList.innerHTML = PROVIDERS.map((provider) => `
            <button class="server-button${provider.id === activeProviderId ? " active" : ""}" type="button" data-server="${provider.id}" aria-pressed="${provider.id === activeProviderId}">
                <span>${provider.name}</span>
                <small>${provider.quality}</small>
                ${isAnime() && provider.anime ? "<small>SUB/DUB</small>" : ""}
            </button>
        `).join("");
        serverList.querySelectorAll(".server-button").forEach((button) => button.addEventListener("click", () => {
            activeProviderId = button.dataset.server;
            renderServerList();
            updatePlayer();
        }));
    }

    function renderAudioControls() {
        audioControls.hidden = !isAnime();
        audioList.querySelectorAll("button").forEach((button) => {
            const active = button.dataset.audio === audioMode;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    // Look up the title on MyAnimeList (via Jikan) because the sub/dub route is keyed by MAL id
    function fetchAnimeEntries(media, type) {
        const key = `${type}:${media.id}`;
        if (!animeEntryCache.has(key)) {
            const request = (async () => {
                const names = [media.name, media.title, media.original_name, media.original_title].map(normalizeTitle).filter(Boolean);
                const query = media.name || media.title;
                const response = await fetch(`${JIKAN_API}/anime?q=${encodeURIComponent(query)}&type=${type === "tv" ? "tv" : "movie"}&order_by=start_date&sort=asc&limit=25`);
                if (!response.ok) throw new Error(`MyAnimeList lookup failed (${response.status})`);
                const data = await response.json();
                const startYear = Number(String(media.first_air_date || media.release_date || "").slice(0, 4)) || 0;
                const seen = new Set();
                return (data.data || []).filter((entry) => {
                    if (seen.has(entry.mal_id)) return false;
                    seen.add(entry.mal_id);
                    const titles = (entry.titles || []).map((item) => normalizeTitle(item.title)).filter(Boolean);
                    const named = names.some((name) => titles.some((title) => title.includes(name) || (title.length >= 6 && name.includes(title))));
                    const entryYear = Number(entry.aired && entry.aired.prop && entry.aired.prop.from && entry.aired.prop.from.year) || 0;
                    return named && (!startYear || !entryYear || entryYear >= startYear - 1);
                }).map((entry) => ({
                    malId: entry.mal_id,
                    title: entry.title_english || entry.title,
                    year: Number(entry.aired && entry.aired.prop && entry.aired.prop.from && entry.aired.prop.from.year) || 0
                }));
            })();
            request.catch(() => animeEntryCache.delete(key));
            animeEntryCache.set(key, request);
        }
        return animeEntryCache.get(key);
    }

    function pickAnimeTarget(entries, season, episode) {
        if (activeMediaType === "movie") {
            const startYear = Number(String(activeMedia.release_date || "").slice(0, 4)) || 0;
            const entry = startYear
                ? [...entries].sort((a, b) => Math.abs((a.year || startYear) - startYear) - Math.abs((b.year || startYear) - startYear))[0]
                : entries[0];
            return { entry, episode: 1 };
        }
        if (malOverride !== null && entries[malOverride]) return { entry: entries[malOverride], episode };
        const seasons = (activeMedia.seasons || []).filter((item) => item.season_number > 0);
        if (entries.length === 1 && seasons.length > 1) {
            // One long MAL entry (e.g. One Piece) vs. TMDB's per-arc seasons: use the absolute episode number
            const before = seasons.filter((item) => item.season_number < season).reduce((total, item) => total + (item.episode_count || 0), 0);
            return { entry: entries[0], episode: before + episode };
        }
        const index = Math.min(season - 1, entries.length - 1);
        return { entry: entries[index], episode, guessed: season > entries.length };
    }

    function populateMalSelect(entries) {
        malSelect.hidden = activeMediaType !== "tv" || entries.length < 2;
        malSelect.innerHTML = `<option value="auto">Auto-match by season</option>${entries.map((entry, index) => `<option value="${index}">${escapeHtml(entry.title)}${entry.year ? ` (${entry.year})` : ""}</option>`).join("")}`;
        malSelect.value = malOverride === null ? "auto" : String(malOverride);
    }

    async function updatePlayer(season, episode) {
        if (!activeMedia || !activeMediaType) return;
        const currentSeason = Number(season || seasonSelect.value) || 1;
        const currentEpisode = Number(episode || episodeSelect.value) || 1;
        const provider = activeProvider();
        const requestId = ++playerRequestId;
        activePlayback = getSavedProgress(currentSeason, currentEpisode);
        let url = provider.buildUrl(activeMediaType, activeMedia.id, currentSeason, currentEpisode);
        let status = `Using ${provider.name}`;
        audioStatus.textContent = "";

        if (isAnime() && audioMode !== "default") {
            const label = audioMode === "dub" ? "Dub" : "Sub";
            if (provider.anime) {
                serverStatus.textContent = "Matching to MyAnimeList…";
                try {
                    const entries = await fetchAnimeEntries(activeMedia, activeMediaType);
                    if (requestId !== playerRequestId) return;
                    populateMalSelect(entries);
                    const target = entries.length ? pickAnimeTarget(entries, currentSeason, currentEpisode) : null;
                    if (target) {
                        url = provider.anime.buildUrl(target.entry.malId, target.episode, audioMode);
                        status = `Using ${provider.name} · ${label}`;
                        audioStatus.textContent = `Matched to “${target.entry.title}”, episode ${target.episode}.`
                            + (target.guessed ? " This season didn’t line up with MyAnimeList, so that’s a best guess. Use the picker to choose the right entry." : "")
                            + ` If it doesn’t load, that episode may not have a ${label.toLowerCase()} yet.`;
                    } else {
                        audioStatus.textContent = "Couldn’t match this title on MyAnimeList, so the server’s default audio is playing.";
                    }
                } catch (error) {
                    if (requestId !== playerRequestId) return;
                    console.error(error);
                    audioStatus.textContent = "MyAnimeList lookup failed, so the server’s default audio is playing.";
                }
            } else {
                const capable = audioProvider();
                audioStatus.textContent = `${provider.name} plays its own default audio.${capable ? ` Switch to ${capable.name} to pick Sub or Dub.` : ""}`;
            }
        }

        if (requestId !== playerRequestId) return;
        player.src = url;
        serverStatus.textContent = status;
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
            return `<button class="history-card" type="button" title="${escapeHtml(item.title)}" data-id="${item.id}" data-type="${item.type}" data-season="${item.season || ""}" data-episode="${item.episode || ""}">
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
        loadRecommendations();
    }

    function scheduleRecommendationsRefresh() {
        clearTimeout(recommendationsTimer);
        recommendationsTimer = setTimeout(loadRecommendations, 500);
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
        scheduleRecommendationsRefresh();
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
        const requestId = ++searchRequestId;
        searchMessage.textContent = "Looking around…";
        resultsSection.hidden = true;
        try {
            const response = await fetch(`${TMDB_API}/search/${searchType}?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}&include_adult=false&page=1`);
            if (!response.ok) throw new Error(`Search failed (${response.status})`);
            const data = await response.json();
            if (requestId !== searchRequestId) return;
            const items = (data.results || [])
                .filter((item) => mediaType(item) === "movie" || mediaType(item) === "tv")
                .map((item) => ({ item, score: scoreSearchResult(item, query) }))
                .filter(({ score }) => score > 0)
                .sort((left, right) => right.score - left.score)
                .map(({ item }) => item);
            renderResults(items);
            searchMessage.textContent = items.length ? "" : "I couldn’t find anything. Try a different search?";
        } catch (error) {
            if (requestId !== searchRequestId) return;
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

    function renderRecommendationCards(container, items, emptyMessage) {
        if (!items.length) {
            container.innerHTML = `<p class="recommendation-message">${emptyMessage}</p>`;
            return;
        }
        const uniqueItems = [...new Map(items.map((item) => [`${mediaType(item)}:${item.id}`, item])).values()];
        container.innerHTML = uniqueItems.map((item) => {
            const title = mediaTitle(item);
            const type = mediaType(item);
            const poster = item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : "";
            return `<button class="recommendation-card" type="button" title="${escapeHtml(title)}" data-id="${item.id}" data-type="${type}">
                <span class="recommendation-poster">${poster ? `<img src="${poster}" alt="" loading="lazy">` : "<span>No poster</span>"}</span>
                <span class="recommendation-copy"><small>${type === "tv" ? "Show" : "Movie"} · ${year(item.release_date || item.first_air_date)}</small><strong>${escapeHtml(title)}</strong></span>
            </button>`;
        }).join("");
        container.onclick = (event) => {
            const card = event.target.closest(".recommendation-card");
            if (!card || card.getAttribute("aria-hidden") === "true") return;
            openMedia(Number(card.dataset.id), card.dataset.type);
        };
        setupInfiniteRail(container);
    }

    function setupInfiniteRail(container) {
        const cards = [...container.querySelectorAll(".recommendation-card")];
        if (cards.length < 2) return;
        const fragmentBefore = document.createDocumentFragment();
        const fragmentAfter = document.createDocumentFragment();
        cards.forEach((card) => {
            const before = card.cloneNode(true);
            const after = card.cloneNode(true);
            before.setAttribute("aria-hidden", "true");
            after.setAttribute("aria-hidden", "true");
            fragmentBefore.appendChild(before);
            fragmentAfter.appendChild(after);
        });
        container.prepend(fragmentBefore);
        container.append(fragmentAfter);
        const setWidth = cards.reduce((width, card) => width + card.getBoundingClientRect().width, 0) +
            (cards.length - 1) * parseFloat(getComputedStyle(container).gap);
        container.scrollLeft = setWidth;
        let adjusting = false;
        container.addEventListener("scroll", () => {
            if (adjusting || setWidth <= 0) return;
            if (container.scrollLeft < setWidth * .5) {
                adjusting = true;
                container.scrollLeft += setWidth;
                requestAnimationFrame(() => { adjusting = false; });
            } else if (container.scrollLeft > setWidth * 1.5) {
                adjusting = true;
                container.scrollLeft -= setWidth;
                requestAnimationFrame(() => { adjusting = false; });
            }
        }, { passive: true });
    }

    async function loadPopularShows() {
        try {
            const responses = await Promise.all([1, 2, 3].map((page) =>
                fetch(`${TMDB_API}/trending/tv/week?api_key=${TMDB_KEY}&language=en-US&page=${page}`)
            ));
            if (responses.some((response) => !response.ok)) throw new Error("Popular shows request failed");
            const pages = await Promise.all(responses.map((response) => response.json()));
            const shows = pages.flatMap((data) => data.results || [])
                .filter((item) => item.name || item.first_air_date)
                .map((item) => ({ ...item, media_type: "tv" }))
                .slice(0, 30);
            renderRecommendationCards(popularShowsResults, shows, "Popular shows are taking a break. Try searching instead.");
            await loadPopularMovies();
        } catch (error) {
            console.error(error);
            renderRecommendationCards(popularShowsResults, [], "Popular shows are unavailable right now.");
        }
    }

    async function loadPopularMovies() {
        try {
            const responses = await Promise.all([1, 2, 3].map((page) =>
                fetch(`${TMDB_API}/trending/movie/week?api_key=${TMDB_KEY}&language=en-US&page=${page}`)
            ));
            if (responses.some((response) => !response.ok)) throw new Error("Popular movies request failed");
            const pages = await Promise.all(responses.map((response) => response.json()));
            const movies = pages.flatMap((data) => data.results || [])
                .filter((item) => item.title || item.release_date)
                .map((item) => ({ ...item, media_type: "movie" }))
                .slice(0, 30);
            renderRecommendationCards(popularMoviesResults, movies, "Popular movies are taking a break. Try searching instead.");
        } catch (error) {
            console.error(error);
            renderRecommendationCards(popularMoviesResults, [], "Popular movies are unavailable right now.");
        }
    }

    async function loadRecommendations() {
        if (!historyEnabled) {
            recommendedSection.hidden = true;
            return;
        }
        const savedShows = readHistory().filter((item) => item.type === "tv").slice(0, 5);
        if (!savedShows.length) {
            recommendedSection.hidden = true;
            return;
        }
        try {
            const responses = await Promise.all(savedShows.map(async (item) => {
                const response = await fetch(`${TMDB_API}/tv/${item.id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`);
                if (!response.ok) throw new Error(`Recommendations failed (${response.status})`);
                return response.json();
            }));
            const savedIds = new Set(savedShows.map((item) => item.id));
            const recommendations = [];
            const seenIds = new Set();
            responses.flatMap((data) => data.results || []).forEach((item) => {
                if (item.media_type && item.media_type !== "tv") return;
                if (savedIds.has(item.id) || seenIds.has(item.id)) return;
                seenIds.add(item.id);
                recommendations.push({ ...item, media_type: "tv" });
            });
            recommendedSection.hidden = false;
            renderRecommendationCards(recommendedResults, recommendations.slice(0, 30), "Watch a few shows and I’ll find more recommendations.");
        } catch (error) {
            console.error(error);
            recommendedSection.hidden = true;
        }
    }

    async function openMedia(id, type, preferredSeason, preferredEpisode) {
        searchMessage.textContent = "Getting the details…";
        try {
            const response = await fetch(`${TMDB_API}/${type}/${id}?api_key=${TMDB_KEY}&language=en-US`);
            if (!response.ok) throw new Error(`Details failed (${response.status})`);
            activeMedia = await response.json();
            activeMediaType = type;
            malOverride = null;
            malSelect.hidden = true;
            renderServerList();
            renderAudioControls();
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
    // Custom "x" in the search field (the browser's built-in one can't show a tooltip).
    // It clears the query and closes the results.
    const searchField = document.createElement("div");
    searchField.className = "search-field";
    searchInput.parentNode.insertBefore(searchField, searchInput);
    searchField.appendChild(searchInput);
    const clearSearchButton = document.createElement("button");
    clearSearchButton.type = "button";
    clearSearchButton.className = "search-clear";
    clearSearchButton.textContent = "×";
    clearSearchButton.title = "Clear search";
    clearSearchButton.setAttribute("aria-label", "Clear search");
    clearSearchButton.hidden = !searchInput.value;
    searchField.appendChild(clearSearchButton);
    searchInput.addEventListener("input", () => {
        clearSearchButton.hidden = !searchInput.value;
    });
    clearSearchButton.addEventListener("click", () => {
        searchInput.value = "";
        // Keep the button visible just long enough for the quick spin, then hide it
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) {
            clearSearchButton.hidden = true;
        } else {
            clearSearchButton.classList.remove("is-spinning");
            void clearSearchButton.offsetWidth; // restart the animation on rapid clicks
            clearSearchButton.classList.add("is-spinning");
            setTimeout(() => {
                clearSearchButton.classList.remove("is-spinning");
                clearSearchButton.hidden = !searchInput.value;
            }, 260);
        }
        searchRequestId += 1;
        resultsSection.hidden = true;
        results.innerHTML = "";
        resultCount.textContent = "";
        searchMessage.textContent = "";
        searchInput.focus();
    });
    document.querySelectorAll(".type-button").forEach((button) => button.addEventListener("click", () => {
        document.querySelector(".type-button.active").classList.remove("active");
        button.classList.add("active");
        searchType = button.dataset.type;
    }));
    seasonSelect.addEventListener("change", () => {
        malOverride = null;
        loadEpisodes(activeMedia.id, seasonSelect.value);
    });
    malSelect.addEventListener("change", () => {
        malOverride = malSelect.value === "auto" ? null : Number(malSelect.value);
        updatePlayer();
    });
    audioList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        audioMode = button.dataset.audio;
        const capable = audioProvider();
        // Only some servers can honour Sub/Dub, so hop to one that can
        if (audioMode !== "default" && capable && !activeProvider().anime) {
            activeProviderId = capable.id;
            renderServerList();
        }
        renderAudioControls();
        updatePlayer();
    }));
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
        playerRequestId += 1;
        renderServerList();
        renderAudioControls();
        setDownloadActionsVisible(true);
    });
    hideDownloadActions.addEventListener("click", () => setDownloadActionsVisible(false));
    showDownloadActions.addEventListener("click", () => setDownloadActionsVisible(true));
    saveHistoryButton.addEventListener("click", () => {
        historyEnabled = true;
        localStorage.setItem("watch-history-enabled", "true");
        updateSessionView();
    });
    // "Are you sure?" prompt for the Clear these button (built here so it reuses the disclaimer dialog styling)
    const clearDialog = document.createElement("dialog");
    clearDialog.id = "clear-history-dialog";
    clearDialog.className = "disclaimer";
    clearDialog.setAttribute("aria-labelledby", "clear-history-dialog-heading");
    clearDialog.innerHTML = `
        <div class="disclaimer-content">
            <h2 id="clear-history-dialog-heading">Are you sure?</h2>
            <div class="confirm-actions">
                <button id="confirm-clear-history" class="primary-button" type="button">Confirm</button>
                <button id="cancel-clear-history" class="grey-button" type="button" autofocus>Go back</button>
            </div>
        </div>`;
    document.body.appendChild(clearDialog);
    clearDialog.addEventListener("click", (event) => {
        if (event.target === clearDialog) clearDialog.close();
    });
    clearDialog.querySelector("#cancel-clear-history").addEventListener("click", () => clearDialog.close());
    clearDialog.querySelector("#confirm-clear-history").addEventListener("click", () => {
        clearDialog.close();
        if (!historyEnabled) return;
        localStorage.removeItem(historyKey);
        renderHistory();
        loadRecommendations();
    });
    clearHistory.addEventListener("click", () => {
        if (!historyEnabled) return;
        clearDialog.showModal();
    });
    renderServerList();
    // "Don't show again" option for the heads-up (remembered in this browser)
    const DISCLAIMER_HIDDEN_KEY = "watch-disclaimer-hidden";
    const dismissDisclaimerForever = document.createElement("button");
    dismissDisclaimerForever.type = "button";
    dismissDisclaimerForever.className = "grey-button";
    dismissDisclaimerForever.textContent = "Don’t show again";
    const disclaimerActions = document.createElement("div");
    disclaimerActions.className = "confirm-actions";
    closeDisclaimer.parentNode.insertBefore(disclaimerActions, closeDisclaimer);
    disclaimerActions.append(closeDisclaimer, dismissDisclaimerForever);
    closeDisclaimer.addEventListener("click", () => disclaimer.close());
    dismissDisclaimerForever.addEventListener("click", () => {
        try {
            localStorage.setItem(DISCLAIMER_HIDDEN_KEY, "true");
        } catch (error) {
            console.error(error);
        }
        disclaimer.close();
    });
    let disclaimerHidden = false;
    try {
        disclaimerHidden = localStorage.getItem(DISCLAIMER_HIDDEN_KEY) === "true";
    } catch (error) {
        console.error(error);
    }
    if (!disclaimerHidden) disclaimer.showModal();
    updateSessionView();
    loadPopularShows();
})();
