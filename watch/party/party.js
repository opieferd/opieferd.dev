(function () {
  "use strict";

  /* =====================================================================
     Opie Watch — Watch Parties
     Syncs playback state and presence across viewers using Supabase
     Realtime (Broadcast + Presence). No separate WebSocket server.

     Rules implemented here:
     - Only signed-in visitors can create or join parties ("You must be
       signed in to use this feature.").
     - The creator picks the party size (2–12 people, host included).
     - The party host controls the player for everyone: streaming server,
       Sub/Dub, and play/pause/seek. Everyone else follows along.
     - Members can chat and leave the party; they can't change the player.
     - The host can close the party for everyone, and copy an invite link.
     - When the host leaves the tab: with others still present the
       earliest-joined member becomes host (elected via presence); alone,
       the party closes.
     - Party chat is filtered against the blacklist; only flagged
       messages are written to the owner's moderation log.
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
    joinedAt: 0,
    presence: [],
    presenceSeen: false,
    claimTimer: null,
    providerId: null,
    audioMode: "default",
    malOverride: null,
    malEntries: [],
    mediaInfo: null,
  };

  function sb() { return window.OpieAccount && window.OpieAccount.client; }
  function isSignedIn() { return window.OpieAccount && window.OpieAccount.isSignedIn(); }
  function getProfile() { return window.OpieAccount && window.OpieAccount.getProfile(); }

  /* TMDB (same key used by watching.js) + MyAnimeList for Sub/Dub matching */
  const TMDB_API = "https://api.themoviedb.org/3";
  const TMDB_KEY = "54e00466a09676df57ba51c4ca30b1a6";
  const TMDB_IMAGE = "https://image.tmdb.org/t/p/w342";
  const JIKAN_API = "https://api.jikan.moe/v4";

  /* Same provider list as watching.js, so a party can start on whatever
     server the host was using and viewers can switch freely afterwards. */
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

  const STALE_PARTY_MS = 3 * 60 * 1000;
  const AUTH_DISCLAIMER = "You must be signed in to use this feature.";

  const partySize = (party) => Math.min(12, Math.max(2, Math.floor(Number(party && party.max_members) || 12)));
  const normalizeAudioMode = (value) => (value === "sub" || value === "dub" || value === "default" ? value : null);
  const omitKeys = (source, keys) => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
  const isMissingColumnError = (error) => {
    const text = `${(error && error.message) || ""} ${(error && error.details) || ""}`;
    return error && (error.code === "PGRST204" || /column|schema cache|does not exist|Could not find/i.test(text));
  };

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
  const snapBtn = $("#snap-btn");
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
  const lobbyNotice = $("#lobby-notice");
  const roomNotice = $("#room-notice");
  const authNotice = $("#party-auth-notice");
  const signInButton = $("#party-signin-btn");
  const roomCode = $("#room-code");
  const copyInviteBtn = $("#copy-invite-btn");
  const closePartyBtn = $("#close-party-btn");
  const serverList = $("#server-list");
  const serverStatus = $("#server-status");
  const audioControls = $("#audio-controls");
  const audioList = $("#audio-list");
  const audioStatus = $("#audio-status");
  const malSelect = $("#mal-select");
  /* The current form only surfaces the party title; these optional fields are
     auto-filled internally when present (and are read defensively when not). */
  const tmdbIdInput = $("#party-tmdb-id");
  const posterPreview = $("#party-media-poster-preview");
  const mediaUrlInput = $("#party-media-url");
  const mediaTypeSelect = $("#party-media-type");

  function showMessage(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "#30c48d" : "#e5484d";
  }
  const showLobbyNotice = (text, ok) => showMessage(lobbyNotice, text, ok);
  const showRoomNotice = (text, ok) => showMessage(roomNotice, text, ok);

  function formatTime(sec) {
    if (!sec && sec !== 0) return "0:00";
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = (total % 60).toString().padStart(2, "0");
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  function generateCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function clampPartySize(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return 12;
    return Math.min(12, Math.max(2, number));
  }

  /* ---------- signed-in gate ---------- */
  function updateAuthGate() {
    if (authNotice) authNotice.hidden = Boolean(isSignedIn());
  }

  function requireSignIn(messageEl) {
    if (isSignedIn()) return true;
    updateAuthGate();
    if (messageEl) showMessage(messageEl, AUTH_DISCLAIMER);
    return false;
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

  /* ---------- lobby ---------- */
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
    // The host updates the row every second while in the room, so a party
    // that stopped updating means its host left and the cleanup didn't land.
    const now = Date.now();
    const parties = (data || []).filter((party) => {
      const stamp = new Date(party.updated_at || party.created_at || 0).getTime();
      return !stamp || now - stamp < STALE_PARTY_MS;
    });
    publicCount.textContent = parties.length;
    publicEmpty.hidden = parties.length > 0;
    publicList.innerHTML = "";
    if (parties.length === 0) return;
    for (const party of parties) {
      const el = document.createElement("div");
      el.className = `party-item is-${party.kind}`;
      el.innerHTML = `
        <div class="item-info">
          <div class="item-title">${esc(party.title)}</div>
          <div class="item-media">${esc(party.media_title)} · ${esc(party.media_type)}</div>
          <div class="item-meta">${esc(party.kind)} party · up to ${partySize(party)} people</div>
        </div>
        <span class="badge kind ${party.kind}">${party.kind}</span>
        <button type="button" class="join-btn">Join</button>
      `;
      el.querySelector("button").addEventListener("click", () => enterParty(party));
      publicList.appendChild(el);
    }
  }

  /* ---------- membership ---------- */
  async function addMembership(partyId) {
    const client = sb();
    const profile = getProfile();
    if (!client || !profile || !partyId) return;
    try {
      await client
        .from("watch_party_members")
        .upsert({ party_id: partyId, user_id: profile.id }, { onConflict: "party_id,user_id", ignoreDuplicates: true });
    } catch (error) {
      // Already a member (or offline): joining the room still works.
    }
  }

  async function removeMembership(partyId) {
    const client = sb();
    const profile = getProfile();
    if (!client || !profile || !partyId) return;
    try {
      await client.from("watch_party_members").delete().eq("party_id", partyId).eq("user_id", profile.id);
    } catch (error) {
      // Best effort — capacity and hosting are decided by presence, not this row.
    }
  }

  function fireAndForget(builder) {
    try { Promise.resolve(builder).catch(() => {}); } catch (error) {}
  }

  /* ---------- create / join ---------- */
  async function handleCreateParty(event) {
    event.preventDefault();
    if (!requireSignIn(createMessage)) return;
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
    const maxInput = $("#party-max-members");
    const isTv = media.media_type === "tv";
    const base = {
      host_id: profile.id,
      title: partyTitle,
      media_type: media.media_type,
      media_id: media.id,
      media_title: media.title,
      media_poster: media.poster_path || null,
      kind,
      code,
      media_url: embedUrlFor(media),
    };
    const full = {
      ...base,
      max_members: clampPartySize(maxInput ? maxInput.value : 12),
      season: isTv ? Math.max(1, media.season || 1) : 1,
      episode: isTv ? Math.max(1, media.episode || 1) : 1,
    };
    // Fall back gracefully when the database hasn't been migrated yet.
    const variants = [
      full,
      omitKeys(full, ["season", "episode"]),
      omitKeys(full, ["max_members"]),
      base,
    ];
    let result = null;
    for (const variant of variants) {
      result = await client.from("watch_parties").insert(variant).select().single();
      if (!result.error) break;
      if (!isMissingColumnError(result.error)) break;
    }
    const { data, error } = result || {};
    if (error) { showMessage(createMessage, error.message || "Failed to create party."); return; }
    await addMembership(data.id);
    showMessage(createMessage, "Party created.", true);
    createForm.reset();
    state.selectedMedia = null;
    enterParty(data);
  }

  async function joinPrivateParty(code, messageEl) {
    const client = sb();
    if (!client) { showMessage(messageEl, "Couldn't reach the party service. Try again in a moment."); return false; }
    let party = null;
    try {
      const { data, error } = await client.rpc("join_watch_party_by_code", { p_code: code });
      if (error) throw error;
      if (!data || !data.ok) {
        showMessage(messageEl, (data && data.error) || "Invalid party code.");
        return false;
      }
      party = data.party;
    } catch (error) {
      // Schema not migrated yet: fall back to a direct lookup (which only
      // finds private parties under your own account because of the read
      // policy).
      console.warn("[party] Code lookup via RPC failed, trying a direct lookup:", error && error.message);
      const { data } = await client.from("watch_parties").select("*").eq("code", code).maybeSingle();
      if (!data) { showMessage(messageEl, "Invalid party code."); return false; }
      party = data;
    }
    await addMembership(party.id);
    enterParty(party);
    return true;
  }

  async function handleJoinPrivate(event) {
    event.preventDefault();
    if (!requireSignIn(joinMessage)) return;
    const code = ($("#party-code").value || "").trim().toUpperCase();
    if (!code) { showMessage(joinMessage, "Enter a party code."); return; }
    joinForm.reset();
    showMessage(joinMessage, "");
    await joinPrivateParty(code, joinMessage);
  }

  /* ---------- party room ---------- */
  async function enterParty(party) {
    if (!requireSignIn(lobbyNotice)) return;
    const profile = getProfile();
    if (state.party) teardownRoom();
    state.party = party;
    state.isHost = party.host_id === profile.id;
    state.me = { user_id: profile.id, username: profile.username, avatar_url: profile.avatar_url };
    state.joinedAt = Date.now();
    state.audioMode = normalizeAudioMode(party.audio_mode) || "default";
    state.malOverride = null;
    state.malEntries = [];
    state.mediaInfo = null;
    state.providerId = (providerForUrl(party.media_url) || PROVIDERS[0]).id;
    state.playback = {
      type: "idle",
      currentTime: Number(party.current_position) || 0,
      isPlaying: Boolean(party.is_playing),
      mediaUrl: party.media_url || null,
      localReal: null,   // real position reported by the embedded player (VidLink)
      duration: 0,
    };
    state.connStatus = "connecting";
    state.chatKeys = new Set();
    renderRoom(party);
    setupVidlinkListener();
    const entered = await joinPartyChannel(party.id);
    if (!entered) return;
    setView("room");
    loadMediaInfo(party);
  }

  function mediaMetaText() {
    const party = state.party;
    if (!party) return "";
    const episode = party.media_type === "tv" ? ` · S${Math.max(1, Number(party.season) || 1)} E${Math.max(1, Number(party.episode) || 1)}` : "";
    return `${party.media_type}${episode}${state.isHost ? " · your party" : ""}`;
  }

  function renderRoom(party) {
    roomTitle.textContent = party.title;
    roomKindBadge.textContent = party.kind;
    roomKindBadge.className = `kind-badge ${party.kind}`;
    roomMediaTitle.textContent = party.media_title;
    roomMediaMeta.textContent = mediaMetaText();
    if (party.media_poster) {
      roomMediaPoster.hidden = false;
      roomMediaPoster.innerHTML = `<img src="${TMDB_IMAGE}${party.media_poster}" alt="${esc(party.media_title)}">`;
    } else {
      roomMediaPoster.hidden = true;
    }
    if (roomCode) {
      const hasCode = party.kind === "private" && Boolean(party.code);
      roomCode.hidden = !hasCode;
      roomCode.textContent = hasCode ? `Code ${party.code}` : "";
    }
    partyPlayer.src = partySourceUrl(party, party.media_url);
    roomVidVault.href = "https://vidvault.to";
    roomDownload.hidden = !party.media_url;
    renderServerList();
    renderAudioControls();
    const startProvider = providerForUrl(party.media_url) || PROVIDERS[0];
    if (serverStatus) {
      const label = state.audioMode === "default" ? "" : ` · ${state.audioMode === "dub" ? "Dub" : "Sub"}`;
      serverStatus.textContent = `Using ${startProvider.name}${label}`;
    }
    updateRoleUI();
    showRoomNotice("");
  }

  function teardownRoom() {
    if (state.claimTimer) { clearTimeout(state.claimTimer); state.claimTimer = null; }
    if (state.reloadTimer) { clearInterval(state.reloadTimer); state.reloadTimer = null; }
    if (state.channel) { try { state.channel.unsubscribe(); } catch (e) {} state.channel = null; }
    if (state.vidlinkListener) { window.removeEventListener("message", state.vidlinkListener); state.vidlinkListener = null; }
    state.party = null;
    state.isHost = false;
    state.me = null;
    state.presence = [];
    state.presenceSeen = false;
    state.joinedAt = 0;
    state.providerId = null;
    state.audioMode = "default";
    state.malOverride = null;
    state.malEntries = [];
    state.mediaInfo = null;
    state.chat = [];
    state.playback = { type: "idle", currentTime: 0, isPlaying: false, mediaUrl: null, localReal: null, duration: 0 };
    state.connStatus = "idle";
    if (snapBtn) snapBtn.hidden = true;
    if (partyPlayer) partyPlayer.src = "about:blank";
    if (serverStatus) serverStatus.textContent = "";
    if (audioStatus) audioStatus.textContent = "";
    if (audioControls) audioControls.hidden = true;
    if (malSelect) { malSelect.hidden = true; malSelect.innerHTML = ""; }
    if (roomCode) { roomCode.hidden = true; roomCode.textContent = ""; }
    if (presenceList) presenceList.innerHTML = "";
    if (presenceCount) presenceCount.textContent = "0";
    renderServerList();
    renderChat();
    showRoomNotice("");
    updatePlaybackUI();
  }

  async function leaveParty() {
    const party = state.party;
    if (!party) { setView("lobby"); return; }
    const partyId = party.id;
    const entries = state.channel ? normalizePresence(state.channel.presenceState()) : [];
    const others = entries.filter((entry) => entry.user_id !== (state.me && state.me.user_id));
    // Last one out closes the party; otherwise the remaining viewers elect a
    // new host from presence. Without a synced presence list we can't tell,
    // so the party is left for the election/stale cleanup instead.
    if (state.isHost && others.length === 0 && state.presenceSeen) {
      const client = sb();
      try {
        if (client) await client.from("watch_parties").delete().eq("id", partyId);
      } catch (error) {
        console.warn("[party] Couldn't close the party:", error);
      }
    }
    removeMembership(partyId);
    teardownRoom();
    setView("lobby");
    loadPublicParties();
  }

  function handlePageHide(event) {
    if (!state.party || !state.me || (event && event.persisted)) return;
    const client = sb();
    const partyId = state.party.id;
    const entries = state.channel ? normalizePresence(state.channel.presenceState()) : [];
    const others = entries.filter((entry) => entry.user_id !== state.me.user_id);
    if (client && state.isHost && others.length === 0 && state.presenceSeen) {
      // Best effort — the tab is going away, so this may not reach the server.
      // The lobby hides parties whose host stopped updating as a fallback.
      fireAndForget(client.from("watch_parties").delete().eq("id", partyId));
    }
    if (client) fireAndForget(client.from("watch_party_members").delete().eq("party_id", partyId).eq("user_id", state.me.user_id));
    if (state.channel) { try { state.channel.unsubscribe(); } catch (e) {} }
  }

  async function closeParty() {
    const party = state.party;
    if (!party || !state.isHost) return;
    if (!window.confirm("Close this party for everyone?")) return;
    const client = sb();
    if (client) {
      const { error } = await client.from("watch_parties").delete().eq("id", party.id);
      if (error) { showRoomNotice(error.message || "Couldn't close the party."); return; }
    }
    if (state.channel) {
      try {
        await state.channel.send({ type: "broadcast", event: "party", payload: { action: "closed", by: state.me.username } });
      } catch (error) {
        // The deleted row is the source of truth; members will notice too.
      }
    }
    teardownRoom();
    showLobbyNotice("Party closed.");
    setView("lobby");
    loadPublicParties();
  }

  function closedByHost() {
    if (!state.party) return;
    teardownRoom();
    showLobbyNotice("The host closed the party.");
    setView("lobby");
    loadPublicParties();
  }

  function partyEnded() {
    if (!state.party) return;
    removeMembership(state.party.id);
    teardownRoom();
    showLobbyNotice("That party has ended.");
    setView("lobby");
    loadPublicParties();
  }

  function bumpFromFullParty(max) {
    const partyId = state.party && state.party.id;
    if (partyId) removeMembership(partyId);
    teardownRoom();
    showLobbyNotice(`That party is full — it allows ${max} people max.`);
    setView("lobby");
    loadPublicParties();
  }

  /* ---------- Supabase Realtime: channel + presence + broadcast ---------- */
  async function joinPartyChannel(partyId) {
    const client = sb();
    // self: true means the sender also receives their own broadcasts. Without
    // it, chat messages never appear in the sender's own list (and other
    // local-first UI would silently do nothing until someone else acted).
    const channel = client.channel(`party:${partyId}`, { config: { broadcast: { self: true } } });
    state.channel = channel;
    state.connStatus = "connecting";
    renderSyncStatus();
    let resolveFirstSync = null;
    const firstSync = new Promise((resolve) => { resolveFirstSync = resolve; });
    let trackedOnce = false;
    const trackPayload = () => ({ ...state.me, joined_at: state.joinedAt });

    channel.on("presence", { event: "sync" }, () => {
      if (resolveFirstSync) { const resolve = resolveFirstSync; resolveFirstSync = null; resolve(); }
      onPresenceSync(channel.presenceState());
    });

    channel.on("broadcast", { event: "playback" }, (event) => {
      handlePlaybackBroadcast(event.payload);
    });

    channel.on("broadcast", { event: "chat" }, (event) => {
      handleChatBroadcast(event.payload);
    });

    channel.on("broadcast", { event: "audio" }, (event) => {
      handleAudioBroadcast(event.payload);
    });

    channel.on("broadcast", { event: "source" }, (event) => {
      handleSourceBroadcast(event.payload);
    });

    channel.on("broadcast", { event: "host" }, (event) => {
      handleHostBroadcast(event.payload);
    });

    channel.on("broadcast", { event: "party" }, (event) => {
      const action = event && event.payload && event.payload.action;
      if (action === "closed") closedByHost();
    });

    try {
      await channel.subscribe((status) => {
        // Reflect the realtime connection so problems are visible in the UI.
        if (status === "SUBSCRIBED") {
          state.connStatus = "connected";
          renderSyncStatus();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          state.connStatus = "reconnecting";
          renderSyncStatus();
          console.warn("[party] Realtime channel status:", status);
        }
        // Re-track after reconnects so presence stays accurate.
        if (status === "SUBSCRIBED" && trackedOnce) channel.track(trackPayload()).catch(() => {});
      });
    } catch (error) {
      state.channel = null;
      teardownRoom();
      showLobbyNotice("Couldn't reach the party. Check your connection and try again.");
      setView("lobby");
      return false;
    }

    // Give the initial presence snapshot a moment to arrive, then check
    // capacity before announcing ourselves (the host is never turned away).
    await Promise.race([firstSync, new Promise((resolve) => setTimeout(resolve, 2500))]);
    const before = normalizePresence(channel.presenceState());
    const max = partySize(state.party);
    const joiningHost = state.party.host_id === state.me.user_id;
    if (!joiningHost && before.length >= max && !before.some((entry) => entry.user_id === state.me.user_id)) {
      try { channel.unsubscribe(); } catch (error) {}
      state.channel = null;
      teardownRoom();
      showLobbyNotice(`That party is full — it allows ${max} people max.`);
      setView("lobby");
      loadPublicParties();
      return false;
    }

    trackedOnce = true;
    try { await channel.track(trackPayload()); } catch (error) {}
    onPresenceSync(channel.presenceState());
    startPlaybackLoop();
    return true;
  }

  function normalizePresence(presenceMap) {
    const byUser = new Map();
    for (const presences of Object.values(presenceMap || {})) {
      for (const entry of presences || []) {
        if (!entry || !entry.user_id) continue;
        const next = {
          user_id: entry.user_id,
          username: entry.username || "?",
          avatar_url: entry.avatar_url || "",
          joined_at: Number(entry.joined_at) || Number.MAX_SAFE_INTEGER,
        };
        const existing = byUser.get(next.user_id);
        if (!existing || next.joined_at < existing.joined_at) byUser.set(next.user_id, next);
      }
    }
    return [...byUser.values()].sort((left, right) =>
      left.joined_at - right.joined_at || String(left.user_id).localeCompare(String(right.user_id))
    );
  }

  function onPresenceSync(presenceMap) {
    if (!state.party || !state.me) return;
    state.presence = normalizePresence(presenceMap);
    state.presenceSeen = true;
    renderPresence(state.presence);
    enforcePartyRules(state.presence);
  }

  function renderPresence(entries) {
    presenceCount.textContent = entries.length;
    presenceList.innerHTML = "";
    for (const entry of entries) {
      const el = document.createElement("li");
      const isMe = entry.user_id === (state.me && state.me.user_id);
      const isHost = state.party && entry.user_id === state.party.host_id;
      el.className = `presence-item ${isMe ? "presence-me" : ""}`;
      const initial = (entry.username || "?")[0].toUpperCase();
      el.innerHTML = `<div class="presence-avatar">${esc(initial)}</div><div class="presence-name">${esc(entry.username)}</div>${isHost ? '<span class="presence-host-badge">host</span>' : ""}`;
      presenceList.appendChild(el);
    }
  }

  function enforcePartyRules(entries) {
    const party = state.party;
    if (!party || !state.me) return;
    // Capacity: earliest-joined stay, the host is never bumped.
    const max = partySize(party);
    const rank = entries.findIndex((entry) => entry.user_id === state.me.user_id);
    if (rank >= max && !state.isHost) {
      bumpFromFullParty(max);
      return;
    }
    // Host gone? The earliest-joined remaining member takes over.
    if (entries.some((entry) => entry.user_id === party.host_id)) {
      if (state.claimTimer) { clearTimeout(state.claimTimer); state.claimTimer = null; }
      return;
    }
    if (entries.length && entries[0].user_id === state.me.user_id) scheduleHostClaim();
  }

  function scheduleHostClaim() {
    if (state.claimTimer) return;
    // Small debounce so a presence blip doesn't crown a new host.
    state.claimTimer = setTimeout(async () => {
      state.claimTimer = null;
      const party = state.party;
      if (!party || !state.channel || !state.me) return;
      const entries = normalizePresence(state.channel.presenceState());
      const winner = entries[0];
      if (!winner || winner.user_id !== state.me.user_id) return; // someone else takes over
      if (entries.some((entry) => entry.user_id === party.host_id)) return; // host came back
      const client = sb();
      if (!client) return;
      let data = null;
      let error = null;
      try {
        ({ data, error } = await client.rpc("transfer_party_host", { p_party: party.id }));
      } catch (rpcError) {
        error = rpcError;
      }
      if (error) {
        console.warn("[party] Host transfer failed:", error.message || error);
        return;
      }
      if (data === true) {
        applyHost(state.me.user_id);
        broadcastHost();
        showRoomNotice("The host left — you’re the host now.");
        return;
      }
      // false: the party row is gone (or we're no longer a member).
      const { data: row } = await client.from("watch_parties").select("id").eq("id", party.id).maybeSingle();
      if (!row) partyEnded();
    }, 2500);
  }

  function broadcastHost() {
    if (!state.channel || !state.party) return;
    try {
      state.channel.send({
        type: "broadcast",
        event: "host",
        payload: { host_id: state.party.host_id, username: state.me.username },
      });
    } catch (error) {}
  }

  function applyHost(hostId) {
    if (!state.party) return;
    state.party.host_id = hostId;
    state.isHost = Boolean(state.me && hostId === state.me.user_id);
    updateRoleUI();
    renderPresence(state.presence);
  }

  function handleHostBroadcast(payload) {
    const hostId = payload && payload.host_id;
    if (!hostId || !state.party || hostId === state.party.host_id) return;
    const mine = state.me && hostId === state.me.user_id;
    applyHost(hostId);
    showRoomNotice(mine
      ? "The previous host left — you’re the host now."
      : `${(payload && payload.username) || "Someone"} is now the party host.`);
  }

  function updateRoleUI() {
    if (closePartyBtn) closePartyBtn.hidden = !state.isHost;
    if (roomMediaMeta && state.party) roomMediaMeta.textContent = mediaMetaText();
    renderAudioControls();
    renderServerList();
    updatePlaybackUI();
  }

  /* ---------- invite links ---------- */
  function partyInviteUrl(party) {
    const base = new URL("./", window.location.href);
    base.search = "";
    if (party.kind === "private" && party.code) base.searchParams.set("code", party.code);
    else base.searchParams.set("party", party.id);
    return base.href;
  }

  async function copyInviteLink() {
    if (!state.party) return;
    const url = partyInviteUrl(state.party);
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (error) { copied = false; }
    if (!copied) {
      try {
        const helper = document.createElement("textarea");
        helper.value = url;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        copied = document.execCommand("copy");
        helper.remove();
      } catch (error) { copied = false; }
    }
    if (copied) showRoomNotice("Invite link copied — send it to your friends.", true);
    else window.prompt("Copy this invite link:", url);
  }

  let inviteJoinInFlight = false;
  function readInviteParams() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (error) { return null; }
    const code = (params.get("code") || "").trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) return { code };
    const party = (params.get("party") || "").trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(party)) return { party };
    return null;
  }
  function stashInvite(invite) { try { sessionStorage.setItem("opie:pendingPartyInvite", JSON.stringify(invite)); } catch (error) {} }
  function readStashedInvite() {
    try {
      const raw = sessionStorage.getItem("opie:pendingPartyInvite");
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }
  function clearStashedInvite() { try { sessionStorage.removeItem("opie:pendingPartyInvite"); } catch (error) {} }

  async function tryJoinFromInvite() {
    const invite = readInviteParams();
    if (!invite) return;
    if (!isSignedIn()) {
      stashInvite(invite);
      if (invite.code) {
        const codeInput = $("#party-code");
        if (codeInput) codeInput.value = invite.code;
      }
      showLobbyNotice(`${AUTH_DISCLAIMER} Sign in to join the party you were invited to, then press Join Party.`);
      return;
    }
    joinFromInvite(invite);
  }

  async function joinFromInvite(invite) {
    if (inviteJoinInFlight || state.party || !isSignedIn()) return;
    inviteJoinInFlight = true;
    clearStashedInvite();
    showMessage(lobbyNotice, "");
    try {
      if (invite.code) {
        await joinPrivateParty(invite.code, lobbyNotice);
      } else {
        const client = sb();
        const { data } = await client.from("watch_parties").select("*").eq("id", invite.party).maybeSingle();
        if (!data) { showLobbyNotice("That party doesn't exist or has already ended."); return; }
        await addMembership(data.id);
        enterParty(data);
      }
      if (window.history && history.replaceState) history.replaceState(null, "", window.location.pathname);
    } finally {
      inviteJoinInFlight = false;
    }
  }

  /* ---------- playback ---------- */
  function renderSyncStatus() {
    if (!syncStatus) return;
    const conn = state.connStatus || "connecting";
    let text;
    if (conn === "connecting") text = "Connecting…";
    else if (conn !== "connected") text = "Reconnecting…";
    else text = state.isHost ? "Host · synced" : "Synced";
    syncStatus.textContent = text;
    syncStatus.className = conn === "connected" ? "sync-status" : "sync-status warn";
  }

  // True drift UI: compares the party timeline to the viewer's own VidLink
  // player. Other providers report nothing, so we can only show it there.
  function renderSyncMeta() {
    if (snapBtn) {
      const mine = state.playback.localReal;
      const hostTime = state.playback.currentTime;
      const drift = state.isHost || mine == null ? 0 : Math.abs(mine - hostTime);
      const show = !state.isHost && mine != null && drift > 20;
      snapBtn.hidden = !show;
      if (show) snapBtn.textContent = `Video out of sync — jump to ${formatTime(hostTime)}`;
    }
    if (timeDisplay) {
      const dur = state.playback.duration;
      timeDisplay.textContent = `${formatTime(state.playback.currentTime)} / ${dur ? formatTime(dur) : "--:--"}`;
    }
  }

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
    renderSyncMeta();
    renderSyncStatus();
  }

  function handlePlaybackBroadcast(payload) {
    const { type, currentTime, isPlaying } = payload || {};
    if (type === "play") { state.playback.isPlaying = true; state.playback.type = "playing"; }
    else if (type === "pause") { state.playback.isPlaying = false; state.playback.type = "paused"; }
    else if (type === "seek") { state.playback.currentTime = Number(currentTime) || 0; }
    else if (type === "tick") {
      state.playback.currentTime = Number(currentTime) || 0;
      if (typeof isPlaying === "boolean") state.playback.isPlaying = isPlaying;
    }
    updatePlaybackUI();
  }

  function broadcastPlayback(type, extra = {}) {
    if (!state.channel || !state.isHost) return;
    const payload = { type, ...extra, at: Date.now() };
    state.channel.send({ type: "broadcast", event: "playback", payload });
    handlePlaybackBroadcast(payload);
    // Providers like VidLink may accept commands via postMessage. This is
    // best effort — unsupported providers simply ignore these messages and
    // members realign with the Sync button instead.
    if (type === "play") tryPlayerCommand({ type: "play" });
    else if (type === "pause") tryPlayerCommand({ type: "pause" });
    else if (type === "seek") tryPlayerCommand({ type: "seekTo", currentTime: extra.currentTime });
  }

  function broadcastTick() {
    if (!state.channel || !state.party) return;
    try {
      state.channel.send({
        type: "broadcast",
        event: "playback",
        payload: { type: "tick", currentTime: state.playback.currentTime, isPlaying: state.playback.isPlaying, at: Date.now() },
      });
    } catch (error) {}
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
      // Advance the timeline every second. When the provider reports real
      // positions (VidLink PLAYER_EVENTs) that timestamp is authoritative;
      // otherwise we estimate by ticking the clock forward.
      if (state.playback.isPlaying && state.playback.localReal == null) {
        state.playback.currentTime += 1;
      }
      broadcastTick();
      updatePlaybackUI();
      await updatePartyRow();
    }, 1000);
  }

  /* ---------- embedded player sync (VidLink only) ---------- */
  function tryPlayerCommand(payload) {
    const provider = providerForUrl(state.playback.mediaUrl || "");
    if (!partyPlayer || !partyPlayer.contentWindow || !provider || provider.id !== "vidlink") return;
    try {
      partyPlayer.contentWindow.postMessage(payload, "https://vidlink.pro");
    } catch (error) {}
  }

  function onVidlinkEvent(data) {
    if (!state.party || !data || typeof data !== "object") return;
    if (data.currentTime == null) return;
    const provider = providerForUrl(state.playback.mediaUrl || "");
    if (!provider || provider.id !== "vidlink") return;
    if (Number(data.duration)) state.playback.duration = Number(data.duration);
    state.playback.localReal = Number(data.currentTime) || 0;
    if (data.event === "play") state.playback.isPlaying = true;
    else if (data.event === "pause") state.playback.isPlaying = false;
    if (state.isHost) state.playback.currentTime = state.playback.localReal;
    updatePlaybackUI();
  }

  function setupVidlinkListener() {
    if (state.vidlinkListener) window.removeEventListener("message", state.vidlinkListener);
    state.vidlinkListener = (event) => {
      // Only accept player events from VidLink's own origin.
      if (!event || event.origin !== "https://vidlink.pro") return;
      const payload = event.data;
      if (!payload || payload.type !== "PLAYER_EVENT" || !payload.data) return;
      onVidlinkEvent(payload.data);
    };
    window.addEventListener("message", state.vidlinkListener);
  }

  function withStartAt(url, seconds) {
    const cleaned = String(url || "").replace(/startAt=\d+(&|$)/, "").replace(/[?&]$/, "");
    if (!cleaned) return cleaned;
    const join = cleaned.includes("?") ? "&" : "?";
    return `${cleaned}${join}startAt=${Math.max(0, Math.floor(seconds))}`;
  }

  // The stored/embedded URL for a party entry — catch the viewer up to the
  // host's position when VidLink is the source.
  function partySourceUrl(party, url) {
    if (!url) return "about:blank";
    const provider = providerForUrl(url);
    const position = Number(state.playback.currentTime) || 0;
    if (provider && provider.id === "vidlink" && position > 10) {
      return `${withStartAt(url, position)}${url.includes("autoplay") ? "" : "&autoplay=true"}`;
    }
    return url;
  }

  function reloadAtPartyTime() {
    if (state.isHost || !partyPlayer || !state.party) return;
    const url = state.playback.mediaUrl || partyPlayer.src;
    if (!url || url === "about:blank") return;
    state.playback.localReal = null;
    partyPlayer.src = `${partySourceUrl(state.party, url)}${url.includes("autoplay") ? "" : "&autoplay=true"}`;
    showRoomNotice("Realigning your player to the party's position… If it doesn't resume, press play on the video.");
  }

  /* ---------- streaming servers (per viewer) + Sub/Dub (host) ---------- */
  function providerForUrl(url) {
    if (!url) return null;
    try {
      const host = new URL(url).hostname.replace(/^www\./i, "");
      return PROVIDERS.find((provider) => {
        try { return new URL(provider.origin).hostname.replace(/^www\./i, "") === host; } catch (error) { return false; }
      }) || null;
    } catch (error) { return null; }
  }

  function activeProvider() {
    return PROVIDERS.find((provider) => provider.id === state.providerId) || PROVIDERS[0];
  }

  function normalizeTitle(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function isAnime() {
    const info = state.mediaInfo;
    return Boolean(info && info.original_language === "ja" && (info.genres || []).some((genre) => genre.id === 16));
  }

  function renderServerList() {
    if (!serverList) return;
    const title = state.isHost ? "Set the server for the whole party" : "Only the party host can change the server";
    serverList.innerHTML = PROVIDERS.map((provider) => `
      <button class="server-button${provider.id === state.providerId ? " active" : ""}" type="button" data-server="${provider.id}" aria-pressed="${provider.id === state.providerId}"${state.isHost ? "" : " disabled"} title="${title}">
        <span>${provider.name}</span>
        <small>${provider.quality}</small>
        ${isAnime() && provider.anime ? "<small>SUB/DUB</small>" : ""}
      </button>
    `).join("");
  }

  function renderAudioControls() {
    if (!audioControls || !audioList) return;
    audioControls.hidden = !isAnime();
    audioList.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.audio === state.audioMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = !state.isHost;
      button.title = state.isHost ? "Set the party audio" : "Only the party host can change audio";
    });
    if (malSelect) malSelect.disabled = !state.isHost;
  }

  const animeEntryCache = new Map();
  function fetchAnimeEntries(type) {
    const info = state.mediaInfo || {};
    const mediaId = state.party.media_id;
    const key = `${type}:${mediaId}`;
    if (!animeEntryCache.has(key)) {
      const request = (async () => {
        const names = [info.name, info.title, info.original_name, info.original_title, state.party.media_title].map(normalizeTitle).filter(Boolean);
        const query = info.name || info.title || state.party.media_title;
        const response = await fetch(`${JIKAN_API}/anime?q=${encodeURIComponent(query)}&type=${type === "tv" ? "tv" : "movie"}&order_by=start_date&sort=asc&limit=25`);
        if (!response.ok) throw new Error(`MyAnimeList lookup failed (${response.status})`);
        const data = await response.json();
        const startYear = Number(String(info.first_air_date || info.release_date || "").slice(0, 4)) || 0;
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
    const info = state.mediaInfo || {};
    if (state.party.media_type === "movie") {
      const startYear = Number(String(info.release_date || "").slice(0, 4)) || 0;
      const entry = startYear
        ? [...entries].sort((left, right) => Math.abs((left.year || startYear) - startYear) - Math.abs((right.year || startYear) - startYear))[0]
        : entries[0];
      return { entry, episode: 1 };
    }
    if (state.malOverride !== null && entries[state.malOverride]) return { entry: entries[state.malOverride], episode };
    const seasons = (info.seasons || []).filter((item) => item.season_number > 0);
    if (entries.length === 1 && seasons.length > 1) {
      const before = seasons.filter((item) => item.season_number < season).reduce((total, item) => total + (item.episode_count || 0), 0);
      return { entry: entries[0], episode: before + episode };
    }
    const index = Math.min(season - 1, entries.length - 1);
    return { entry: entries[index], episode, guessed: season > entries.length };
  }

  function populateMalSelect(entries) {
    if (!malSelect || !state.party) return;
    malSelect.hidden = state.party.media_type !== "tv" || entries.length < 2;
    malSelect.innerHTML = `<option value="auto">Auto-match by season</option>${entries.map((entry, index) => `<option value="${index}">${esc(entry.title)}${entry.year ? ` (${entry.year})` : ""}</option>`).join("")}`;
    malSelect.value = state.malOverride === null ? "auto" : String(state.malOverride);
    malSelect.disabled = !state.isHost;
  }

  async function updatePartySource() {
    // Host-only: the host picks the server/audio, and everyone follows via
    // the "source" broadcast (late joiners use the stored media_url).
    if (!state.party || !partyPlayer || !state.isHost) return;
    const partyId = state.party.id;
    const type = state.party.media_type;
    const season = Math.max(1, Number(state.party.season) || 1);
    const episode = Math.max(1, Number(state.party.episode) || 1);
    const provider = activeProvider();
    let url = provider.buildUrl(type, state.party.media_id, season, episode);
    let status = `Using ${provider.name}`;
    if (audioStatus) audioStatus.textContent = "";

    if (isAnime() && state.audioMode !== "default") {
      const label = state.audioMode === "dub" ? "Dub" : "Sub";
      if (provider.anime) {
        if (serverStatus) serverStatus.textContent = "Matching to MyAnimeList…";
        try {
          const entries = await fetchAnimeEntries(type);
          if (!state.party || state.party.id !== partyId) return;
          state.malEntries = entries;
          populateMalSelect(entries);
          const target = entries.length ? pickAnimeTarget(entries, season, episode) : null;
          if (target) {
            url = provider.anime.buildUrl(target.entry.malId, target.episode, state.audioMode);
            status = `Using ${provider.name} · ${label}`;
            if (audioStatus) {
              audioStatus.textContent = `Matched to “${target.entry.title}”, episode ${target.episode}.`
                + (target.guessed ? " This season didn’t line up with MyAnimeList, so that’s a best guess. The host can use the picker to choose the right entry." : "")
                + ` If it doesn’t load, that episode may not have a ${label.toLowerCase()} yet.`;
            }
          } else if (audioStatus) {
            audioStatus.textContent = "Couldn’t match this title on MyAnimeList, so the server’s default audio is playing.";
          }
        } catch (error) {
          if (!state.party || state.party.id !== partyId) return;
          console.error("[party] MyAnimeList lookup failed", error);
          if (audioStatus) audioStatus.textContent = "MyAnimeList lookup failed, so the server’s default audio is playing.";
        }
      } else if (audioStatus) {
        const capable = PROVIDERS.find((item) => item.anime);
        audioStatus.textContent = `${provider.name} plays its own default audio.${capable ? ` Switch to ${capable.name} to pick Sub or Dub.` : ""}`;
      }
    }

    if (!state.party || state.party.id !== partyId || !state.isHost) return;
    // Continue the party timeline on the new server: VidLink can resume at
    // the host's position with startAt; other providers start from zero.
    if (provider.id === "vidlink" && state.playback.currentTime > 10) {
      url = withStartAt(url, state.playback.currentTime);
    }
    applySourceUrl(url, provider, status);
    broadcastSource(status);
    savePartySource();
  }

  function applySourceUrl(url, provider, status) {
    state.playback.mediaUrl = url;
    state.playback.localReal = null;
    state.playback.duration = 0;
    if (provider) state.providerId = provider.id;
    partyPlayer.src = url;
    if (serverStatus) serverStatus.textContent = status || `Using ${provider ? provider.name : "server"}`;
    renderServerList();
  }

  function broadcastSource(status) {
    if (!state.channel || !state.party) return;
    try {
      state.channel.send({
        type: "broadcast",
        event: "source",
        payload: { mediaUrl: state.playback.mediaUrl, providerId: state.providerId, status },
      });
    } catch (error) {}
  }

  function handleSourceBroadcast(payload) {
    if (!state.party || state.isHost) return;
    const url = payload && payload.mediaUrl;
    if (!url) return;
    const provider = providerForUrl(url);
    const changedServer = Boolean(provider && provider.id !== state.providerId);
    if (provider) state.providerId = provider.id;
    state.playback.mediaUrl = url;
    // A new player instance resets what we know about the viewer's local time.
    state.playback.localReal = null;
    state.playback.duration = 0;
    if (partyPlayer.src !== url) partyPlayer.src = url;
    if (serverStatus) serverStatus.textContent = (payload && payload.status) || `Using ${provider ? provider.name : "server"}`;
    renderServerList();
    if (changedServer) showRoomNotice(`The host switched the server to ${provider.name}.`);
  }

  function setAudioMode(mode) {
    if (!state.party || !state.isHost) return;
    const next = normalizeAudioMode(mode);
    if (!next || next === state.audioMode) return;
    state.audioMode = next;
    state.malOverride = null;
    if (malSelect) malSelect.hidden = true;
    renderAudioControls();
    updatePartySource();
    if (state.channel) {
      state.channel.send({ type: "broadcast", event: "audio", payload: { audioMode: next } });
    }
  }

  async function savePartySource() {
    if (!state.isHost || !state.party) return;
    const client = sb();
    if (!client) return;
    try {
      await client.from("watch_parties").update({ media_url: state.playback.mediaUrl, audio_mode: state.audioMode }).eq("id", state.party.id);
    } catch (error) {
      // Pre-migration schema: live viewers still follow the broadcasts.
    }
  }

  function handleAudioBroadcast(payload) {
    const next = normalizeAudioMode(payload && payload.audioMode);
    if (!next || !state.party || next === state.audioMode) return;
    state.audioMode = next;
    renderAudioControls();
    showRoomNotice(next === "default"
      ? "The host reset the party audio to the server default."
      : `The host switched the party audio to ${next === "dub" ? "Dub" : "Sub"}.`);
  }

  async function loadMediaInfo(party) {
    try {
      const response = await fetch(`${TMDB_API}/${party.media_type}/${party.media_id}?api_key=${TMDB_KEY}&language=en-US`);
      if (!response.ok) throw new Error(`Details failed (${response.status})`);
      const data = await response.json();
      if (!state.party || state.party.id !== party.id) return;
      state.mediaInfo = data;
    } catch (error) {
      console.warn("[party] Couldn't load media details:", error);
      return;
    }
    renderAudioControls();
    renderServerList();
  }

  /* ---------- chat (with blacklist filter for the owner log) ---------- */
  async function handleChatSubmit(event) {
    event.preventDefault();
    const body = chatInput.value.trim();
    if (!body || !state.me) return;
    const client = sb();
    if (client) {
      try {
        const { data, error } = await client.rpc("moderate_chat_message", { p_party: state.party.id, p_body: body });
        if (!error && data && data.ok === false) {
          // Flagged messages are blocked and written to the owner's log.
          showMessage(chatMessage, data.error || "That message was blocked by the content filter.");
          return;
        }
      } catch (error) {
        console.warn("[party] Chat filter unavailable:", error);
      }
    }
    chatInput.value = "";
    showMessage(chatMessage, "");
    // Render your own message immediately, before the network round trip.
    // The echo of self:true is deduped by the user_id:at key, so it appears once.
    const payload = { body, user_id: state.me.user_id, username: state.me.username, at: Date.now() };
    handleChatBroadcast(payload);
    if (!state.channel) return;
    try {
      await state.channel.send({ type: "broadcast", event: "chat", payload });
    } catch (error) {
      console.warn("[party] Chat send failed:", error);
      showMessage(chatMessage, "Couldn't reach the party — your message may not have been delivered.");
    }
  }

  function handleChatBroadcast(payload) {
    const key = `${(payload && payload.user_id) || "?"}:${payload && payload.at}`;
    if (state.chatKeys && state.chatKeys.has(key)) return;
    if (state.chatKeys) state.chatKeys.add(key);
    const msg = {
      sender: payload.username || "?",
      body: String(payload.body || ""),
      at: payload.at,
      me: payload.user_id === (state.me && state.me.user_id),
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
      season: Math.max(0, Math.floor(Number(raw.season) || 0)),
      episode: Math.max(0, Math.floor(Number(raw.episode) || 0)),
      media_url: mediaUrl,
      // Matches the media_poster check constraint in supabase-schema.sql.
      poster_path: /^\/[A-Za-z0-9_.-]{1,80}$/.test(poster) ? poster : "",
    };
  }

  function embedUrlFor(media) {
    if (media.media_url) return media.media_url;
    // Auto-generate an embed URL using the default provider (vidsrc.sh).
    if (media.media_type === "tv") {
      const season = Math.max(1, Number(media.season) || 1);
      const episode = Math.max(1, Number(media.episode) || 1);
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

  /* ---------- boot ---------- */
  createForm.addEventListener("submit", handleCreateParty);
  joinForm.addEventListener("submit", handleJoinPrivate);
  leaveBtn.addEventListener("click", leaveParty);
  if (copyInviteBtn) copyInviteBtn.addEventListener("click", copyInviteLink);
  if (closePartyBtn) closePartyBtn.addEventListener("click", closeParty);
  if (signInButton) {
    signInButton.addEventListener("click", () => {
      if (window.OpieAccount && window.OpieAccount.openAuth) window.OpieAccount.openAuth("signin");
    });
  }
  if (serverList) {
    serverList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-server]");
      if (!button || !state.party) return;
      if (!state.isHost) { showRoomNotice("Only the party host can change the server."); return; }
      state.providerId = button.dataset.server;
      state.malOverride = null;
      if (malSelect) malSelect.hidden = true;
      updatePartySource();
    });
  }
  if (audioList) {
    audioList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-audio]");
      if (!button || !state.party) return;
      if (!state.isHost) { showRoomNotice("Only the party host can change the audio."); return; }
      setAudioMode(button.dataset.audio);
    });
  }
  if (malSelect) {
    malSelect.addEventListener("change", () => {
      if (!state.isHost) return;
      state.malOverride = malSelect.value === "auto" ? null : Number(malSelect.value);
      updatePartySource();
    });
  }
  playPauseBtn.addEventListener("click", () => {
    broadcastPlayback(state.playback.isPlaying ? "pause" : "play");
  });
  seekBackBtn.addEventListener("click", () => {
    broadcastPlayback("seek", { currentTime: Math.max(0, state.playback.currentTime - 10) });
  });
  seekForwardBtn.addEventListener("click", () => {
    broadcastPlayback("seek", { currentTime: state.playback.currentTime + 10 });
  });
  if (snapBtn) snapBtn.addEventListener("click", reloadAtPartyTime);
  chatForm.addEventListener("submit", handleChatSubmit);
  mediaSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchTMDB(mediaSearchInput.value.trim()), 300);
  });
  mediaSearchBtn.addEventListener("click", () => searchTMDB(mediaSearchInput.value.trim()));
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("account:changed", () => {
    updateAuthGate();
    if (!isSignedIn() || state.party) return;
    loadPublicParties();
    if (!inviteJoinInFlight) {
      const stashed = readStashedInvite();
      if (stashed) joinFromInvite(stashed);
    }
  });

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

  // Invite links: stash immediately so a later sign-in can finish the join,
  // and surface the disclaimer for signed-out visitors even when the accounts
  // service is slow to load. A signed-in visitor joins via tryJoinFromInvite.
  const bootInvite = readInviteParams();
  if (bootInvite) {
    stashInvite(bootInvite);
    if (bootInvite.code) {
      const codeInput = $("#party-code");
      if (codeInput) codeInput.value = bootInvite.code;
    }
    setTimeout(() => {
      if (!isSignedIn()) showLobbyNotice(`${AUTH_DISCLAIMER} Sign in to join the party you were invited to, then press Join Party.`);
    }, 600);
  }

  // The disclaimer shows right away for signed-out visitors (even when the
  // accounts service never loads); accounts.js re-fires account:changed when
  // the session is ready.
  updateAuthGate();

  waitForAccounts(() => {
    updateAuthGate();
    loadPublicParties();
    tryJoinFromInvite();
  });

})();
