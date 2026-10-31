(() => {
  'use strict';

  const STORAGE_KEY = 'opie-music-queue-v1';
  const MAX_ITEMS = 60;
  const LIBRARY_KEY = 'opie-music-collections-v1';
  const library = [];
  const LIBRARY_LIMIT = 100;
  const $ = (id) => document.getElementById(id);
  const queue = [];
  const localUrls = new Map();
  let current = -1;
  let shuffle = false;
  let repeat = 0;
  let controller = null;
  let ticker = null;
  let playState = false;
  const playedHistory = [];

  const form = $('import-form');
  const input = $('music-url');
  const importStatus = $('import-status');
  const stage = $('player-stage');
  const playerStatus = $('player-status');
  const downloadPanel = $('download-panel');
  const directDownload = $('direct-download');
  const ofaButton = $('external-download');

  const sources = {
    Spotify: { icon: '◉', hint: 'Spotify controls playback inside its own player. Full tracks may require signing in.' },
    'Apple Music': { icon: '♫', hint: 'Apple Music embeds may play previews until you sign in with an eligible account.' },
    'YouTube Music': { icon: '▶', hint: 'This uses the official YouTube player. Embedding and playback restrictions still apply.' },
    YouTube: { icon: '▶', hint: 'This uses the official YouTube player. Embedding and playback restrictions still apply.' },
    SoundCloud: { icon: '☁', hint: 'SoundCloud controls playback and its own collection tracks inside the embedded player.' },
    Deezer: { icon: '◈', hint: 'The official Deezer widget may only allow previews, depending on the music and your account.' },
    'Audio file': { icon: '♪', hint: 'Direct audio plays in your browser. The remote host must allow access to the file.' },
    'Local file': { icon: '♪', hint: 'Your local audio is played only in this browser. It is not uploaded to any server.' }
  };

  function hostIs(host, allowed) {
    return host === allowed || host.endsWith('.' + allowed);
  }

  function prettify(slug) {
    try {
      return decodeURIComponent(slug).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    } catch {
      return slug.replace(/[_-]+/g, ' ').slice(0, 90);
    }
  }

  function safeUrl(raw) {
    let value = String(raw || '').trim();
    if (/^(www\.|open\.spotify\.com|music\.apple\.com|music\.youtube\.com|soundcloud\.com|deezer\.com)/i.test(value)) {
      value = 'https://' + value;
    }
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw Error('Only HTTP(S) links are supported.');
    }
    if (url.username || url.password) throw Error('Links with embedded passwords are not supported.');
    return url;
  }

  function parseLink(value) {
    let u;
    try { u = safeUrl(value); }
    catch { throw Error('Please paste a complete music link (starting with https://).'); }
    const host = u.hostname.toLowerCase();
    const segments = u.pathname.split('/').filter(Boolean);
    const base = u.origin + u.pathname;

    if (host === 'open.spotify.com') {
      const idx = segments[0] === 'intl' || /^intl-[a-z]{2}$/i.test(segments[0] || '') ? 1 : 0;
      const kind = segments[idx];
      const id = segments[idx + 1];
      if (!['track', 'album', 'playlist'].includes(kind) || !/^[A-Za-z0-9]{15,32}$/.test(id || '')) {
        throw Error('Use a public Spotify song, album, or playlist URL (not a profile or short link).');
      }
      return {
        original: 'https://open.spotify.com/' + kind + '/' + id,
        source: 'Spotify', kind: kind === 'track' ? 'track' : kind,
        title: 'Spotify ' + kind, mode: 'embed', size: 'expanded',
        embed: 'https://open.spotify.com/embed/' + kind + '/' + id + '?utm_source=opieferd'
      };
    }

    if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
      const type = segments.find((s) => ['album', 'playlist', 'song'].includes(s));
      if (!type || segments.length < 3) throw Error('Use an Apple Music song, album, or playlist URL.');
      const itemId = u.searchParams.get('i');
      const kind = type === 'song' || (type === 'album' && itemId) ? 'track' : type;
      const path = u.pathname.replace(/\/+$/, '');
      const search = itemId && /^\d+$/.test(itemId) ? '?i=' + itemId : '';
      const slugIndex = segments.indexOf(type) + 1;
      const slug = prettify(segments[slugIndex] || type);
      return {
        original: 'https://music.apple.com' + path + search,
        source: 'Apple Music', kind, title: slug || 'Apple Music ' + kind,
        mode: 'embed', size: kind === 'track' ? 'compact' : 'expanded',
        embed: 'https://embed.music.apple.com' + path + search
      };
    }

    if (hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com') || host === 'youtu.be') {
      const browseList = host === 'music.youtube.com' && segments[0] === 'browse'
        && /^VL[A-Za-z0-9_-]{8,}$/.test(segments[1] || '') ? segments[1].slice(2) : null;
      const list = u.searchParams.get('list') || browseList;
      const id = host === 'youtu.be' ? segments[0] :
        u.pathname === '/watch' ? u.searchParams.get('v') :
        ['shorts', 'live', 'embed'].includes(segments[0]) ? segments[1] : null;
      const isMusic = host === 'music.youtube.com';
      const source = isMusic ? 'YouTube Music' : 'YouTube';
      if (list && /^[A-Za-z0-9_-]{8,}$/.test(list)) {
        const firstVideo = /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
        const params = new URLSearchParams({listType:'playlist',list,playsinline:'1',enablejsapi:'1',origin:location.origin});
        return {
          original: (isMusic ? 'https://music.youtube.com/' : 'https://www.youtube.com/') + 'playlist?list=' + encodeURIComponent(list),
          source,kind:'playlist',title:source+' playlist',mode:'embed',size:'video',
          playlistId:list,artwork:firstVideo?'https://i.ytimg.com/vi/'+firstVideo+'/hqdefault.jpg':null,
          embed:'https://www.youtube.com'+(firstVideo?'/embed/'+firstVideo:'/embed')+'?'+params.toString()
        };
      }
      if (isMusic && segments[0] === 'browse' && /^MPRE[A-Za-z0-9_-]+$/.test(segments[1] || '')) {
        return {original:'https://music.youtube.com/browse/'+segments[1],source,kind:'album',
          title:'YouTube Music album',mode:'external',size:'compact'};
      }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return {
          original: (isMusic ? 'https://music.youtube.com/watch?v=' : 'https://www.youtube.com/watch?v=') + id,
          source, kind: 'track', title: source + ' track', mode: 'embed', size: 'video',
          artwork: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
          embed: 'https://www.youtube.com/embed/' + id + '?playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin)
        };
      }
      throw Error('Use a YouTube/YouTube Music watch or playlist link. Music album browse links cannot be embedded directly.');
    }

    if (hostIs(host, 'soundcloud.com')) {
      if (segments.length < 2 || segments[0] === 'discover' || segments[0] === 'you') {
        throw Error('Use a public SoundCloud track or set/album URL.');
      }
      const kind = segments[1] === 'sets' ? 'playlist' : 'track';
      if (kind === 'playlist' && !segments[2]) throw Error('This SoundCloud set link is incomplete.');
      const link = 'https://soundcloud.com/' + segments.slice(0, kind === 'playlist' ? 3 : 2).join('/');
      const title = prettify(segments[kind === 'playlist' ? 2 : 1]) || 'SoundCloud track';
      const url = new URL('https://w.soundcloud.com/player/');
      url.searchParams.set('url', link);
      url.searchParams.set('color', '#ebaf36');
      url.searchParams.set('auto_play', 'false');
      url.searchParams.set('show_comments', 'false');
      url.searchParams.set('show_reposts', 'false');
      url.searchParams.set('hide_related', 'true');
      url.searchParams.set('visual', 'true');
      return { original: link, source: 'SoundCloud', kind, title, mode: 'embed', size: 'expanded', embed: url.href };
    }

    if (hostIs(host, 'deezer.com') || host === 'deezer.page.link') {
      const index = segments.findIndex((s) => ['track', 'album', 'playlist'].includes(s));
      const kind = segments[index];
      const id = segments[index + 1];
      if (index === -1 || !/^\d+$/.test(id || '')) {
        throw Error('Use a full Deezer song, album, or playlist URL (not a deezer.page.link short link).');
      }
      return {
        original: 'https://www.deezer.com/' + kind + '/' + id,
        source: 'Deezer', kind, title: 'Deezer ' + kind, mode: 'embed',
        size: kind === 'track' ? 'compact' : 'expanded',
        embed: 'https://widget.deezer.com/widget/dark/' + kind + '/' + id
      };
    }

    if (/\.(mp3|m4a|wav|ogg|oga|flac|opus|aac)(?:$)/i.test(u.pathname)) {
      const title = prettify(segments[segments.length - 1].replace(/\.[^.]+$/, '')) || 'Audio file';
      return { original: u.href, source: 'Audio file', kind: 'track', title, mode: 'audio', size: 'audio' };
    }

    throw Error('Unsupported link. Try Spotify, Apple Music, YouTube Music, YouTube, SoundCloud, Deezer, or a direct audio file.');
  }


  // Metadata comes from each provider's actual track/album identifier.
  // Never guess an album cover from a fuzzy music search.
  const metadataInFlight = new Set();
  function coverUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const safeHosts = ['scdn.co', 'sndcdn.com', 'mzstatic.com', 'ytimg.com', 'youtube.com', 'dzcdn.net'];
      return url.protocol === 'https:' && safeHosts.some((allowed) => hostIs(host, allowed)) ? url.href : null;
    } catch { return null; }
  }

  async function getJson(url, timeoutMs = 6500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!result.ok) throw Error('Metadata HTTP ' + result.status);
      return await result.json();
    } finally { clearTimeout(timeout); }
  }

  async function metadataFor(entry) {
    if (entry.source === 'Local file' || entry.source === 'Audio file') return null;
    if (entry.source === 'Spotify') {
      const json = await getJson('https://open.spotify.com/oembed?url=' + encodeURIComponent(entry.original));
      return { title: json.title, artwork: json.thumbnail_url };
    }
    if (entry.source === 'SoundCloud') {
      const json = await getJson('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(entry.original));
      return { title: json.title, artwork: json.thumbnail_url, artist: json.author_name };
    }
    if (entry.source === 'YouTube Music' || entry.source === 'YouTube') {
      if (entry.playlistId) {
        const key = getYouTubeKey();
        if (!key) return null;
        const params = new URLSearchParams({part:'snippet',id:entry.playlistId,key});
        const result = await getJson('https://www.googleapis.com/youtube/v3/playlists?' + params);
        const sn = result.items?.[0]?.snippet;
        return sn ? {title:sn.title,artist:sn.channelTitle,
          artwork:sn.thumbnails?.maxres?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url} : null;
      }
      const u = new URL(entry.original);
      const id = u.searchParams.get('v');
      const oembedUrl = id ? 'https://www.youtube.com/watch?v=' + id : entry.original.replace('music.youtube.com', 'www.youtube.com');
      const json = await getJson('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(oembedUrl));
      return { title: json.title, artist: json.author_name, artwork: json.thumbnail_url };
    }
    if (entry.source === 'Apple Music') {
      const url = new URL(entry.original);
      const itemId = url.searchParams.get('i');
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      const id = itemId && /^\d+$/.test(itemId) ? itemId : last;
      if (!/^\d+$/.test(id)) return null;
      const json = await getJson('https://itunes.apple.com/lookup?id=' + id + '&country=' + encodeURIComponent(segments[0] || 'us'));
      const match = (json.results || []).find((r) => String(r.trackId || r.collectionId) === id) || json.results?.[0];
      if (!match) return null;
      const artwork = (match.artworkUrl100 || '').replace(/100x100(bb|cc)\.(jpg|png)/i, '600x600bb.jpg');
      return { title: entry.kind === 'track' ? (match.trackName || match.collectionName) : match.collectionName,
        artist: match.artistName, artwork };
    }
    if (entry.source === 'Deezer') {
      const parts = entry.original.split('/').filter(Boolean);
      const id = parts[parts.length - 1], kind = parts[parts.length - 2];
      if (!/^\d+$/.test(id) || !['track', 'album', 'playlist'].includes(kind)) return null;
      // Deezer's API does not send browser CORS headers; only its exact, public read-only metadata URL is proxied.
      return null; // Deezer metadata is displayed by its own embed, avoiding an unrelated CORS proxy.
      /* const data = await getJson('https://api.deezer.com/' + kind + '/' + id);
      if (data.error) return null;
      return {
        title: data.title || data.title_short,
        artist: data.artist?.name || data.creator?.name,
        artwork: kind === 'track' ? data.album?.cover_xl || data.album?.cover_big :
          kind === 'album' ? data.cover_xl || data.cover_big : data.picture_xl || data.picture_big
      }; */
    }
    return null;
  }

  function refreshDetails() {
    const item = queue[current];
    if (!item) return;
    $('now-heading').textContent = item.title;
    $('track-artist').textContent = item.artist || '';
    $('track-artist').hidden = !item.artist;
    const image = $('cover-image');
    const url = coverUrl(item.artwork);
    if (url) {
      image.src = url;
      image.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
    }
    $('cover-symbol').textContent = (sources[item.source] || {}).icon || '♪';
    $('cover-art').classList.toggle('is-active', !url);
  }

  async function loadMetadata(entry) {
    if (!entry || entry.metaLoaded || metadataInFlight.has(entry.id) || entry.mode === 'audio') return;
    metadataInFlight.add(entry.id);
    try {
      const data = await metadataFor(entry);
      if (data && queue.includes(entry)) {
        if (typeof data.title === 'string' && data.title.trim()) entry.title = data.title.trim().slice(0, 160);
        if (typeof data.artist === 'string' && data.artist.trim()) entry.artist = data.artist.trim().slice(0, 100);
        entry.artwork = coverUrl(data.artwork);
        renderQueue();
        if (queue[current] === entry) refreshDetails();
        rememberCollection(entry);
        save();
      }
    } catch (error) {
      // Access or CORS failures leave the real provider widget in place without fake cover art.
      console.info('[music] Metadata unavailable from ' + entry.source, error.message);
    } finally {
      entry.metaLoaded = true;
      metadataInFlight.delete(entry.id);
    }
  }

  function newId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.filter((item) => item.source !== 'Local file')
        .map((item) => ({url:item.original,title:item.title,artist:item.artist||'',artwork:item.artwork||''}))));
    } catch { /* Private mode and storage quota must not break playback. */ }
  }

  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(data)) return;
      for (const item of data.slice(0, MAX_ITEMS)) {
        try { const parsed=parseLink(item.url); queue.push({...parsed,id:newId(),title:item.title||parsed.title,artist:item.artist||'',artwork:coverUrl(item.artwork)||parsed.artwork}); }
        catch { /* Ignore invalid or obsolete provider links. */ }
      }
    } catch { /* Malformed saved data. */ }
  }

  function setFeedback(el, message, isError = false) {
    el.textContent = message;
    el.classList.toggle('is-error', isError);
  }

  function renderQueue() {
    const list = $('queue-list');
    list.replaceChildren();
    $('queue-count').textContent = queue.length + (queue.length === 1 ? ' item' : ' items');
    if (!queue.length) {
      const empty = document.createElement('p');
      empty.className = 'queue-empty';
      empty.textContent = "It's pretty quiet in here. Add something above. ♫";
      list.append(empty);
    }
    queue.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'queue-item' + (current === index ? ' is-current' : '');
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'queue-select';
      select.setAttribute('aria-label', 'Play ' + entry.title);
      if (index === current) select.setAttribute('aria-current', 'true');
      const thumb = document.createElement('span');
      thumb.className = 'queue-thumb';
      thumb.textContent = (sources[entry.source] || {}).icon || '♫';
      const textWrap = document.createElement('span');
      textWrap.className = 'queue-text';
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const detail = document.createElement('small');
      detail.textContent = entry.source + ' · ' + entry.kind;
      textWrap.append(title, detail);
      const art = coverUrl(entry.artwork);
      if (art) {
        const image = document.createElement('img');
        image.src = art;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => image.remove());
        thumb.replaceChildren(image);
      }
      select.append(thumb, textWrap);
      select.addEventListener('click', () => setCurrent(index));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'queue-remove';
      remove.textContent = '×';
      remove.title = 'Remove from queue';
      remove.setAttribute('aria-label', 'Remove ' + entry.title);
      remove.addEventListener('click', () => removeAt(index));
      item.append(select, remove);
      list.append(item);
    });
    $('previous').disabled = current <= 0;
    $('next').disabled = current < 0 || current >= queue.length - 1;
    $('copy-link').disabled = current < 0 || queue[current]?.source === 'Local file';
    $('show-download').disabled = current < 0;
    $('clear-queue').disabled = queue.length === 0;
  }

  function setCurrent(index) {
    if (index < 0 || index >= queue.length) {
      current = -1;
      $('now-heading').textContent = 'Nothing playing yet';
      $('track-source').textContent = 'READY WHEN YOU ARE';
      $('track-kind').textContent = 'Add a link above to start listening.';
      $('source-link').hidden = true;
      $('cover-art').classList.remove('is-active');
      $('cover-symbol').textContent = '♪';
      $('cover-image').hidden = true;
      $('track-artist').hidden = true;
      stage.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'player-empty';
      const symbol = document.createElement('span'); symbol.textContent = '♫';
      const label = document.createElement('p'); label.textContent = 'Your listening space is ready.';
      const sub = document.createElement('small'); sub.textContent = 'Paste a link or choose a local audio file to begin.';
      empty.append(symbol, label, sub);
      stage.append(empty);
      $('player-hint').textContent = 'Each streaming provider controls its own playback. Some require you to sign in or only allow previews.';
      setFeedback(playerStatus, '');
      downloadPanel.hidden = true;
      renderQueue();
      return;
    }

    current = index;
    const entry = queue[current];
    $('now-heading').textContent = entry.title;
    $('track-source').textContent = entry.source.toUpperCase();
    $('track-kind').textContent = entry.kind === 'track' ? 'Single track' :
      entry.kind === 'album' ? 'Album · tracks play inside the provider' : 'Playlist · tracks play inside the provider';
    $('cover-art').classList.add('is-active');
    $('cover-symbol').textContent = (sources[entry.source] || {}).icon || '♪';
    refreshDetails();
    loadMetadata(entry);
    $('player-hint').textContent = sources[entry.source]?.hint || '';

    const sourceLink = $('source-link');
    if (entry.source === 'Local file') {
      sourceLink.hidden = true;
    } else {
      sourceLink.href = entry.original;
      sourceLink.textContent = 'Open on ' + entry.source + ' ↗';
      sourceLink.hidden = false;
    }

    stage.replaceChildren();
    if (entry.mode === 'audio') {
      const audio = document.createElement('audio');
      audio.src = entry.original;
      audio.controls = true;
      audio.preload = 'metadata';
      audio.playsInline = true;
      audio.addEventListener('error', () => {
        if (current === index && queue[index] === entry) {
          setFeedback(playerStatus, 'The browser could not load this audio. The file may be unavailable or blocked by its host.', true);
        }
      });
      audio.addEventListener('ended', () => {
        if (queue[current] === entry && current + 1 < queue.length) {
          setCurrent(current + 1);
          const upcoming = stage.querySelector('audio');
          if (upcoming) upcoming.play().catch(() => {});
        }
      });
      stage.append(audio);
      setFeedback(playerStatus, 'Ready to play using your browser audio player.');
    } else {
      const iframe = document.createElement('iframe');
      iframe.className = 'is-' + entry.size;
      iframe.src = entry.embed;
      iframe.title = entry.source + ' ' + entry.kind + ' player';
      iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      stage.append(iframe);
      setFeedback(playerStatus, 'Requested the ' + entry.source + ' player. Use its controls to start listening; some links may not allow embeds.');
    }
    downloadPanel.hidden = true;
    renderQueue();
  }

  function removeAt(index) {
    const entry = queue[index];
    if (!entry) return;
    if (entry.source === 'Local file') {
      URL.revokeObjectURL(entry.original);
      localUrls.delete(entry.id);
    }
    queue.splice(index, 1);
    save();
    if (!queue.length) setCurrent(-1);
    else if (index === current) setCurrent(Math.min(index, queue.length - 1));
    else if (index < current) { current--; renderQueue(); }
    else renderQueue();
  }

  function addLinks(rawLines) {
    const links = rawLines.map((line) => line.trim()).filter(Boolean);
    if (!links.length) { setFeedback(importStatus, 'Paste a music link first.', true); return; }
    let added = 0;
    const errors = [];
    let firstIndex = queue.length;
    for (const link of links) {
      if (queue.length >= MAX_ITEMS) { errors.push('Queue is full (60 items).'); break; }
      try {
        const item = { ...parseLink(link), id: newId() };
        queue.push(item);
        rememberCollection(item);
        added++;
      } catch (error) { errors.push(error.message); }
    }
    if (added) {
      save();
      setCurrent(firstIndex);
      queue.slice(firstIndex, firstIndex + 4).forEach(loadMetadata);
      input.value = '';
    }
    const message = (added ? 'Added ' + added + (added === 1 ? ' link.' : ' links.') : 'No links added.') +
      (errors.length ? ' ' + errors.length + ' skipped: ' + errors[0] : '');
    setFeedback(importStatus, message, !!errors.length);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addLinks(input.value.split(/\r?\n/));
  });

  $('local-files').addEventListener('change', (event) => {
    const files = [...(event.target.files || [])];
    let added = 0;
    const firstIndex = queue.length;
    for (const file of files) {
      if (queue.length >= MAX_ITEMS) break;
      if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|oga|flac|opus|aac)$/i.test(file.name)) continue;
      const id = newId();
      const url = URL.createObjectURL(file);
      localUrls.set(id, url);
      queue.push({ id, original: url, title: file.name.replace(/\.[^.]+$/, ''), source: 'Local file', kind: 'track', mode: 'audio', size: 'audio' });
      added++;
    }
    if (added) setCurrent(firstIndex);
    setFeedback(importStatus, added ? 'Added ' + added + ' local audio file(s). These stay on this device.' : 'No supported audio files were selected.', !added);
    event.target.value = '';
  });

  $('previous').addEventListener('click', () => { if (current > 0) setCurrent(current - 1); });
  $('next').addEventListener('click', () => { if (current >= 0 && current + 1 < queue.length) setCurrent(current + 1); });
  $('clear-queue').addEventListener('click', () => {
    for (const url of localUrls.values()) URL.revokeObjectURL(url);
    localUrls.clear();
    queue.length = 0;
    save();
    setCurrent(-1);
    setFeedback(importStatus, 'Queue cleared.');
  });
  $('shuffle-queue').addEventListener('click', () => {
    if (queue.length < 2) return;
    const playing = queue[current]?.id;
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    current = queue.findIndex((item) => item.id === playing);
    save();
    renderQueue();
    setFeedback(importStatus, 'Your queue is shuffled.');
  });

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const temp = document.createElement('textarea');
    temp.value = value;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.append(temp);
    temp.select();
    const success = document.execCommand('copy');
    temp.remove();
    if (!success) throw Error('Clipboard access was denied.');
  }

  $('copy-link').addEventListener('click', async () => {
    const entry = queue[current];
    if (!entry || entry.source === 'Local file') return;
    try { await copyText(entry.original); setFeedback(playerStatus, 'Music link copied.'); }
    catch { setFeedback(playerStatus, 'Unable to copy automatically. Use “Open on provider” to copy the link.', true); }
  });

  $('show-download').addEventListener('click', () => {
    const entry = queue[current];
    if (!entry) return;
    downloadPanel.hidden = !downloadPanel.hidden;
    if (downloadPanel.hidden) return;
    const isAudio = entry.mode === 'audio';
    directDownload.hidden = !isAudio;
    ofaButton.hidden = entry.source === 'Local file';
    if (isAudio) {
      directDownload.href = entry.original;
      directDownload.setAttribute('download', entry.source === 'Local file' ? entry.title : '');
      $('download-description').textContent = 'This is an audio file. Download it from the source; external servers may open the file instead of saving it.';
    } else {
      $('download-description').textContent = 'Streaming audio is controlled by ' + entry.source + '. Copy this link and open OneForAllDownloader to check whether a permitted download is available.';
    }
  });
  $('close-download').addEventListener('click', () => { downloadPanel.hidden = true; });
  ofaButton.addEventListener('click', async () => {
    const entry = queue[current];
    if (!entry || entry.source === 'Local file') return;
    // Open while inside the user gesture so popup blockers do not intercept the handoff.
    window.open('https://oneforalldownloader.com/', '_blank', 'noopener,noreferrer');
    try {
      await copyText(entry.original);
      setFeedback(playerStatus, 'Link copied. Paste it into OFA Downloader in the new tab.');
    } catch {
      setFeedback(playerStatus, 'OFA Downloader opened. Copy your source link manually if clipboard access was blocked.', true);
    }
  });

  loadLibrary();
  restore();
  if (queue.length) setCurrent(0);
  else setCurrent(-1);

  const params = new URLSearchParams(location.search);
  const shared = params.get('url');
  const oldVideo = params.get('v');
  if (shared) addLinks([shared]);
  else if (oldVideo && /^[A-Za-z0-9_-]{11}$/.test(oldVideo)) {
    addLinks(['https://www.youtube.com/watch?v=' + oldVideo]);
  }
})();