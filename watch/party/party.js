(function () {
  "use strict";

  /* =====================================================================
     Opie Watch — Watch Parties
     Syncs playback state and presence across viewers using Supabase
     Realtime (Broadcast + Presence). No separate WebSocket server.
     ===================================================================== */

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[c]);

  const state = {
    view: "lobby",
    party: null,
    channel: null,
    isHost: false,
    me: null,
    chat: [],
    selectedMedia: null,
    playback: { type: "idle", currentTime: 0, isPlaying: false, mediaUrl: null },
  };

  function sb() { return window.OpieAccount && window.OpieAccount.client; }
  function isSignedIn() { return window.OpieAccount && window.OpieAccount.isSignedIn(); }
  function getProfile() { return window.OpieAccount && window.OpieAccount.getProfile(); }

  /* TMDB (same key used by watching.js) */
  const TMDB_API = "https://api.themoviedb.org/3";
  const TMDB_KEY = "54e00466a09676df57ba51c4ca30b1a6";
  const TMDB_IMAGE = "https://image.tmdb.org/t/p/w342";

  function waitForAccounts(ready) {
    if (document.documentElement.dataset.accountsReady === "1") return ready();
    setTimeout(() => waitForAccounts(ready), 60);
  }

  const lobbySection = $("#party-lobby");
  const roomSection = $("#party-room");
  const createForm = $("#create-party-form");
  const createMessage = $("#create-message");
  const joinForm = $("#join-private-form");
  const joinMessage = $("#join-message");
  const publicList = $("#public-parties-list");
  const publicCount = $("#public-count");
  const publicEmpty = $("#public-empty");
  const leaveBtn = $("#leave-party-btn");
  const roomTitle = $("#room-title");
  const roomKindBadge = $("#room-kind-badge");
  const roomMediaTitle = $("#room-media-title");
  const roomMediaMeta = $("#room-media-meta");
  const roomMediaPoster = $("#room-media-poster");
  const partyPlayer = $("#party-player");
  const playPauseBtn = $("#party-play-pause");
  const seekBackBtn = $("#party-seek-back");
  const seekForwardBtn = $("#party-seek-forward");
  const timeDisplay = $("#party-time");
  const syncStatus = $("#sync-status");
  const presenceCount = $("#presence-count");
  const presenceList = $("#presence-list");
  const chatMessages = $("#chat-messages");
  const chatForm = $("#chat-form");
  const chatInput = $("#chat-input");
  const chatMessage = $("#chat-message");
  const roomDownload = $("#room-download");
  const roomVidVault = $("#room-vidvault-link");
  const mediaSearchInput = $("#party-media-search");
  const mediaSearchBtn = $("#party-media-search-btn");
  const mediaResults = $("#party-media-results");
  /* The current form only surfaces the party title; these optional fields are
     auto-filled internally when present (and are read defensively when not). */
  const tmdbIdInput = $("#party-tmdb-id");
  const posterPreview = $("#party-media-poster-preview");
  const mediaUrlInput = $("#party-media-url");
  const mediaTypeSelect = $("#party-media-type");

  function showMessage(el, text, ok) {
    el.textContent = text;
    el.style.color = ok ? "#30c48d" : "#e5484d";
  }

  function formatTime(sec) {
    if (!sec && sec !== 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function generateCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function setView(view) {
    state.view = view;
    if (view === "lobby") {
      lobbySection.hidden = false;
      roomSection.hidden = true;
      if (state.channel) { try { state.channel.unsubscribe(); } catch (e) {} state.channel = null; }
      window.scrollTo(0, 0);
    } else {
      lobbySection.hidden = true;
      roomSection.hidden = false;
    }
  }
  async function loadPublicParties() {
    const client = sb();
    if (!client) return;
    const { data, error } = await client
      .from("watch_parties")
      .select("*")
      .eq("kind", "public")
      .order("created_at", { ascending: false });
    if (error) {
      publicList.innerHTML = `<p class="empty-msg">Couldn't load parties.</p>`;
      return;
    }
    const parties = data || [];
    publicCount.textContent = parties.length;
    publicEmpty.hidden = parties.length > 0;
    publicList.innerHTML = "";
    if (parties.length === 0) return;
    for (const p of parties) {
      const el = document.createElement("div");
      el.className = `party-item is-${p.kind}`;
      el.innerHTML = `
        <div class="item-info">
          <div class="item-title">${esc(p.title)}</div>
          <div class="item-media">${esc(p.media_title)} · ${esc(p.media_type)}</div>
          <div class="item-meta">${esc(p.kind)} party</div>
        </div>
        <span class="badge kind ${p.kind}">${p.kind}</span>
        <button type="button" class="join-btn">Join</button>
      `;
      el.querySelector("button").addEventListener("click", () => enterParty(p));
      publicList.appendChild(el);
    }
  }

  async function handleCreateParty(event) {
    event.preventDefault();
    if (!isSignedIn()) { showMessage(createMessage, "Sign in to host a party."); return; }
    const media = state.selectedMedia;
    if (!media) {
      showMessage(createMessage, "Pick a movie or TV show from the search results so the party knows what to play.");
      return;
    }
    const client = sb();
    const profile = getProfile();
    const kind = $("#party-kind").value;
    const code = kind === "private" ? generateCode() : null;
    const titleInput = $("#party-title");
    const partyTitle = (titleInput && titleInput.value.trim()) || media.title;
    const { data, error } = await client
      .from("watch_parties")
      .insert({
        host_id: profile.id,
        title: partyTitle,
        media_type: media.media_type,
        media_id: media.id,
        media_title: media.title,
        media_poster: media.poster_path || null,
        kind,
        code,
        media_url: embedUrlFor(media),
      })
      .select()
      .single();
    if (error) { showMessage(createMessage, error.message || "Failed to create party."); return; }
    await client.from("watch_party_members").insert({ party_id: data.id, user_id: profile.id });
    showMessage(createMessage, "Party created.", true);
    createForm.reset();
    state.selectedMedia = null;
    enterParty(data);
  }

  async function handleJoinPrivate(event) {
    event.preventDefault();
    if (!isSignedIn()) { showMessage(joinMessage, "Sign in to join a party."); return; }
    const client = sb();
    const profile = getProfile();
    const code = $("#party-code").value.trim().toUpperCase();
    const { data, error } = await client.from("watch_parties").select("*").eq("code", code).maybeSingle();
    if (error || !data) { showMessage(joinMessage, "Invalid party code."); return; }
    try {
      await client.from("watch_party_members").insert({ party_id: data.id, user_id: profile.id });
    } catch (e) {
      // ignore "already a member" errors — the user is in the party either way
    }
    showMessage(joinMessage, "Joined party.", true);
    joinForm.reset();
    enterParty(data);
  }

  async function enterParty(party) {
    if (!isSignedIn()) { showMessage(createMessage, "Sign in to join a party."); return; }
    const client = sb();
    const profile = getProfile();
    state.party = party;
    state.isHost = party.host_id === profile.id;
    state.me = { user_id: profile.id, username: profile.username, avatar_url: profile.avatar_url };

    roomTitle.textContent = party.title;
    roomKindBadge.textContent = party.kind;
    roomKindBadge.className = `kind-badge ${party.kind}`;
    roomMediaTitle.textContent = party.media_title;
    roomMediaMeta.textContent = `${party.media_type}${state.isHost ? " · your party" : ""}`;
    if (party.media_poster) {
      roomMediaPoster.hidden = false;
      roomMediaPoster.innerHTML = `<img src="${TMDB_IMAGE}${party.media_poster}" alt="${esc(party.media_title)}">`;
    } else {
      roomMediaPoster.hidden = true;
    }
    partyPlayer.src = party.media_url || "about:blank";
    roomVidVault.href = "https://vidvault.to";
    roomDownload.hidden = !party.media_url;

    state.playback = {
      type: "idle",
      currentTime: Number(party.current_position) || 0,
      isPlaying: Boolean(party.is_playing),
      mediaUrl: party.media_url,
    };
    updatePlaybackUI();

    setView("room");
    await joinPartyChannel(party.id);
  }

  createForm.addEventListener("submit", handleCreateParty);
  joinForm.addEventListener("submit", handleJoinPrivate);
  leaveBtn.addEventListener("click", () => setView("lobby"));

  function updatePlaybackUI() {
    const host = state.isHost;
    playPauseBtn.disabled = !host;
    seekBackBtn.disabled = !host;
    seekForwardBtn.disabled = !host;
    playPauseBtn.textContent = state.playback.isPlaying ? "⏸" : "▶";
    const title = host ? (state.playback.isPlaying ? "Pause" : "Play") : "Host controls playback";
    playPauseBtn.title = title;
    seekBackBtn.title = host ? "Seek back 10s" : "Host controls playback";
    seekForwardBtn.title = host ? "Seek forward 10s" : "Host controls playback";
    timeDisplay.textContent = `${formatTime(state.playback.currentTime)} / --:--`;
    syncStatus.textContent = host ? "Host · synced" : "Synced";
    syncStatus.className = "sync-status";
  }

  /* ---------- Supabase Realtime: channel + presence + broadcast ---------- */
  async function joinPartyChannel(partyId) {
    const client = sb();
    const channel = client.channel(`party:${partyId}`);
    state.channel = channel;

    channel.on("presence", { event: "sync" }, () => {
      renderPresence(channel.presenceState());
    });

    channel.on("broadcast", { event: "playback" }, (event) => {
      handlePlaybackBroadcast(event.payload);
      syncStatus.textContent = "Synced";
      syncStatus.className = "sync-status";
    });

    channel.on("broadcast", { event: "chat" }, (event) => {
      handleChatBroadcast(event.payload);
    });

    await channel.subscribe();
    await channel.track(state.me);
    renderPresence(channel.presenceState());
    startPlaybackLoop();
  }

  function renderPresence(presenceMap) {
    const entries = [];
    for (const [userId, presences] of Object.entries(presenceMap || {})) {
      for (const p of presences || []) entries.push(p);
    }
    state.presence = entries;
    presenceCount.textContent = entries.length;
    presenceList.innerHTML = "";
    for (const p of entries) {
      const el = document.createElement("li");
      el.className = `presence-item ${p.user_id === state.me?.user_id ? "presence-me" : ""}`;
      const initial = (p.username || "?")[0].toUpperCase();
      el.innerHTML = `<div class="presence-avatar">${esc(initial)}</div><div class="presence-name">${esc(p.username)}</div>`;
      presenceList.appendChild(el);
    }
  }

  function handlePlaybackBroadcast(payload) {
    const { type, currentTime, isPlaying, mediaUrl } = payload || {};
    if (mediaUrl && mediaUrl !== state.playback.mediaUrl) {
      state.playback.mediaUrl = mediaUrl;
      partyPlayer.src = mediaUrl;
    }
    if (type === "play") { state.playback.isPlaying = true; state.playback.type = "playing"; }
    else if (type === "pause") { state.playback.isPlaying = false; state.playback.type = "paused"; }
    else if (type === "seek") { state.playback.currentTime = Number(currentTime) || 0; }
    updatePlaybackUI();
  }

  function broadcastPlayback(type, extra = {}) {
    if (!state.channel) return;
    const payload = { type, ...extra, at: Date.now() };
    state.channel.send({ type: "broadcast", event: "playback", payload });
    handlePlaybackBroadcast(payload);
  }

  async function updatePartyRow() {
    if (!state.isHost || !state.party) return;
    const client = sb();
    await client
      .from("watch_parties")
      .update({
        current_position: Math.floor(state.playback.currentTime),
        is_playing: state.playback.isPlaying,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.party.id);
  }

  function startPlaybackLoop() {
    if (state.reloadTimer) clearInterval(state.reloadTimer);
    state.reloadTimer = setInterval(async () => {
      if (!state.isHost || !state.channel) return;
      if (state.playback.isPlaying) state.playback.currentTime += 1;
      updatePlaybackUI();
      await updatePartyRow();
    }, 1000);
  }

  /* ---------- host playback controls ---------- */
  playPauseBtn.addEventListener("click", () => {
    broadcastPlayback(state.playback.isPlaying ? "pause" : "play");
  });
  seekBackBtn.addEventListener("click", () => {
    broadcastPlayback("seek", { currentTime: Math.max(0, state.playback.currentTime - 10) });
  });
  seekForwardBtn.addEventListener("click", () => {
    broadcastPlayback("seek", { currentTime: state.playback.currentTime + 10 });
  });

  /* ---------- chat via broadcast ---------- */
  async function handleChatSubmit(event) {
    event.preventDefault();
    const body = chatInput.value.trim();
    if (!body || !state.channel) return;
    await state.channel.send({
      type: "broadcast",
      event: "chat",
      payload: { body, user_id: state.me.user_id, username: state.me.username, at: Date.now() },
    });
    chatInput.value = "";
    showMessage(chatMessage, "");
  }

  function handleChatBroadcast(payload) {
    const msg = {
      sender: payload.username || "?",
      body: esc(payload.body),
      at: payload.at,
      me: payload.user_id === state.me?.user_id,
    };
    state.chat.push(msg);
    if (state.chat.length > 100) state.chat.shift();
    renderChat();
  }

  function renderChat() {
    chatMessages.innerHTML = "";
    for (const m of state.chat) {
      const el = document.createElement("div");
      el.className = `chat-msg ${m.me ? "me" : "other"}`;
      el.innerHTML = `<div class="sender">${esc(m.sender)}</div><div class="body">${esc(m.body)}</div>`;
      chatMessages.appendChild(el);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatForm.addEventListener("submit", handleChatSubmit);

  /* ---------- TMDB media search ---------- */
  let searchDebounce = null;
  async function searchTMDB(query) {
    if (!query || query.length < 2) { mediaResults.hidden = true; return; }
    try {
      const res = await fetch(`${TMDB_API}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&include_adult=false`);
      if (!res.ok) throw new Error(`TMDB search failed (${res.status})`);
      const data = await res.json();
      const results = (data.results || []).filter(item =>
        item.media_type === "movie" || item.media_type === "tv"
      ).slice(0, 20);
      renderMediaResults(results);
    } catch (e) {
      console.error("[party] TMDB search error", e);
      mediaResults.hidden = true;
    }
  }

  function renderMediaResults(results) {
    mediaResults.innerHTML = "";
    if (!results || results.length === 0) {
      mediaResults.hidden = true;
      return;
    }
    mediaResults.hidden = false;
    for (const item of results) {
      const el = document.createElement("div");
      el.className = "media-card";
      el.dataset.type = item.media_type;
      el.dataset.id = item.id;
      el.dataset.title = item.title || item.name || "";
      const year = (item.release_date || item.first_air_date || "").slice(0, 4);
      const poster = item.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : "";
      el.innerHTML = `
        ${poster ? `<img class="media-poster" src="${poster}" alt="${esc(item.title || item.name)}">` : `<div class="media-poster" style="display:flex;align-items:center;justify-content:center;color:#666;font-size:.7rem;">No poster</div>`}
        <div class="media-title">${esc(item.title || item.name)}</div>
        <div class="media-year">${year}</div>
        <div class="media-type">${item.media_type === "tv" ? "TV" : "Movie"}</div>
      `;
      el.addEventListener("click", () => selectMedia(item));
      mediaResults.appendChild(el);
    }
  }

  /* Media handed over from a player page ("Start Watch Party") or picked from
     the TMDB search results. Both funnel through normalizeMedia + selectMedia. */
  function normalizeMedia(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = Number(raw.id);
    const title = String(raw.title || raw.name || "").trim();
    if (!Number.isFinite(id) || id <= 0 || !title) return null;
    const type = raw.media_type === "tv" || raw.type === "tv" ? "tv" : "movie";
    const poster = String(raw.poster_path || "");
    const mediaUrl = typeof raw.media_url === "string" && /^https:\/\//i.test(raw.media_url) ? raw.media_url : "";
    return {
      ...raw,
      id,
      media_type: type,
      type,
      title,
      media_url: mediaUrl,
      // Matches the media_poster check constraint in supabase-schema.sql.
      poster_path: /^\/[A-Za-z0-9_.-]{1,80}$/.test(poster) ? poster : "",
    };
  }

  function embedUrlFor(media) {
    if (media.media_url) return media.media_url;
    // Auto-generate an embed URL using the default provider (vidsrc.sh).
    if (media.media_type === "tv") {
      const season = Number(media.season) || 1;
      const episode = Number(media.episode) || 1;
      return `https://vidsrc.sh/embed/tv/${media.id}?season=${season}&episode=${episode}`;
    }
    return `https://vidsrc.sh/embed/movie/${media.id}`;
  }

  function selectMedia(rawMedia) {
    const media = normalizeMedia(rawMedia);
    if (!media) return;
    state.selectedMedia = media;
    const type = media.media_type;
    if (mediaTypeSelect) mediaTypeSelect.value = type;
    if (tmdbIdInput) tmdbIdInput.value = media.id;
    const title = media.title;
    const year = (media.release_date || media.first_air_date || "").slice(0, 4);
    if (posterPreview) {
      posterPreview.innerHTML = media.poster_path
        ? `<img src="${TMDB_IMAGE}${media.poster_path}" alt="${esc(title)}">`
        : `<div style="color:var(--muted);font-size:.8rem;">No poster available</div>`;
    }
    media.media_url = embedUrlFor(media);
    if (mediaUrlInput) mediaUrlInput.value = media.media_url;

    // Auto-fill party title
    const titleInput = $("#party-title");
    if (titleInput) titleInput.value = title;

    mediaResults.hidden = true;
    mediaSearchInput.value = `${title}${year ? ` (${year})` : ""}`;
    showMessage(createMessage, `Selected: ${title} · ${type.toUpperCase()} — party title filled in`, true);
  }

  mediaSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchTMDB(mediaSearchInput.value.trim()), 300);
  });
  mediaSearchBtn.addEventListener("click", () => searchTMDB(mediaSearchInput.value.trim()));

  /* ---------- boot ---------- */
  // Prefill first: the title handoff from a player page must not depend on
  // Supabase/accounts being available.
  try {
    const pending = sessionStorage.getItem("opie:pendingPartyMedia");
    if (pending) {
      sessionStorage.removeItem("opie:pendingPartyMedia");
      selectMedia(JSON.parse(pending));
    }
  } catch (error) {
    console.warn("[party] Couldn't read pending media:", error);
  }

  waitForAccounts(() => {
    loadPublicParties();
  });

})();
