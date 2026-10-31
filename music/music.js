(() => {
  'use strict';

  const STORAGE_KEY = 'opie-music-queue-v1';
  const MAX_ITEMS = 60;
  const $ = (id) => document.getElementById(id);
  const queue = [];
  const localUrls = new Map();
  let current = -1;

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
        title: 'Spotify ' + kind, mode: 'embed', size: kind === 'track' ? 'compact' : 'expanded',
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
      const list = u.searchParams.get('list');
      const id = host === 'youtu.be' ? segments[0] :
        u.pathname === '/watch' ? u.searchParams.get('v') :
        ['shorts', 'live', 'embed'].includes(segments[0]) ? segments[1] : null;
      const isMusic = host === 'music.youtube.com';
      const source = isMusic ? 'YouTube Music' : 'YouTube';
      if (list && /^[A-Za-z0-9_-]{10,}$/.test(list)) {
        return {
          original: (isMusic ? 'https://music.youtube.com/' : 'https://www.youtube.com/') + 'playlist?list=' + encodeURIComponent(list),
          source, kind: 'playlist', title: source + ' playlist', mode: 'embed', size: 'video',
          embed: 'https://www.youtube-nocookie.com/embed/videoseries?list=' + encodeURIComponent(list) + '&rel=0'
        };
      }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return {
          original: (isMusic ? 'https://music.youtube.com/watch?v=' : 'https://www.youtube.com/watch?v=') + id,
          source, kind: 'track', title: source + ' track', mode: 'embed', size: 'video',
          embed: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1'
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

  function newId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.filter((item) => item.source !== 'Local file')
        .map((item) => ({ id: item.id, url: item.original }))));
    } catch { /* Private mode and storage quota must not break playback. */ }
  }

  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(data)) return;
      for (const item of data.slice(0, MAX_ITEMS)) {
        try { queue.push({ ...parseLink(item.url), id: newId() }); }
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
    $('shuffle-queue').disabled = queue.length < 2;
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
      setFeedback(playerStatus, 'Embedded ' + entry.source + ' player loaded. Use its controls to start listening.');
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
    else if (index < current) setCurrent(current - 1);
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
        added++;
      } catch (error) { errors.push(error.message); }
    }
    if (added) {
      save();
      setCurrent(firstIndex);
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