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
    playback: { type: "idle", currentTime: 0, isPlaying: false, mediaUrl: null },
  };

  function sb() { return window.OpieAccount && window.OpieAccount.client; }
  function isSignedIn() { return window.OpieAccount && window.OpieAccount.isSignedIn(); }
  function getProfile() { return window.OpieAccount && window.OpieAccount.getProfile(); }

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
    const client = sb();
    const profile = getProfile();
    const kind = $("#party-kind").value;
    const code = kind === "private" ? generateCode() : null;
    const { data, error } = await client
      .from("watch_parties")
      .insert({
        host_id: profile.id,
        title: $("#party-title").value.trim(),
        media_type: $("#party-media-type").value,
        media_id: Number($("#party-tmdb-id").value) || null,
        media_title: $("#party-media-title").value.trim(),
        media_poster: null,
        kind,
        code,
        media_url: $("#party-media-url").value.trim(),
      })
      .select()
      .single();
    if (error) { showMessage(createMessage, error.message || "Failed to create party."); return; }
    await client.from("watch_party_members").insert({ party_id: data.id, user_id: profile.id });
    showMessage(createMessage, "Party created.", true);
    createForm.reset();
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

  /* ---------- boot ---------- */
  waitForAccounts(() => {
    loadPublicParties();
  });

})();
