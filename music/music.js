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


  function getYouTubeKey() {
    try { return localStorage.getItem('opwatch-yt-api-key') || ''; }
    catch { return ''; }
  }

  function loadLibrary() {
    try {
      const entries = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
      if (Array.isArray(entries)) for (const data of entries.slice(0, LIBRARY_LIMIT)) {
        if (!data || typeof data.url !== 'string') continue;
        try {
          const parsed = parseLink(data.url);
          if (!['album','playlist'].includes(parsed.kind)) continue;
          library.push({...parsed,title:data.title||parsed.title,artist:data.artist||'',
            artwork:coverUrl(data.artwork)||parsed.artwork,savedAt:data.savedAt||Date.now()});
        } catch {}
      }
    } catch {}
    renderLibrary();
  }

  function saveLibrary() {
    try {
      localStorage.setItem(LIBRARY_KEY,JSON.stringify(library.map(x=>({
        url:x.original,title:x.title,artist:x.artist||'',artwork:x.artwork||'',savedAt:x.savedAt
      }))));
    } catch {}
  }

  function rememberCollection(entry) {
    if (!entry || !['album','playlist'].includes(entry.kind) || entry.source === 'Local file') return;
    const existing = library.find(x=>x.original===entry.original);
    if(existing) {
      existing.title=entry.title||existing.title;
      existing.artist=entry.artist||existing.artist;
      existing.artwork=coverUrl(entry.artwork)||existing.artwork;
    } else {
      library.unshift({...entry,savedAt:Date.now()});
      if(library.length>LIBRARY_LIMIT)library.pop();
    }
    saveLibrary();
    renderLibrary();
  }

  function renderLibrary() {
    const wrap=$('library-list');
    if(!wrap)return;
    wrap.replaceChildren();
    $('clear-library').disabled=!library.length;
    if(!library.length) {
      const p=document.createElement('p');p.className='queue-empty';
      p.textContent='Your playlists and albums will appear here when you import them.';
      wrap.append(p);return;
    }
    library.forEach((entry,index)=>{
      const card=document.createElement('article');card.className='library-card';
      const art=document.createElement('div');art.className='library-art';
      const src=coverUrl(entry.artwork);
      if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';art.append(img);}
      else art.textContent=(sources[entry.source]||{}).icon||'♫';
      const detail=document.createElement('div');detail.className='library-detail';
      const heading=document.createElement('strong');heading.textContent=entry.title;
      const sub=document.createElement('small');sub.textContent=entry.source+' · '+entry.kind+(entry.artist?' · '+entry.artist:'');
      detail.append(heading,sub);
      const actions=document.createElement('div');actions.className='library-actions';
      const open=document.createElement('button');open.type='button';open.className='music-button secondary';
      open.textContent='Play';open.addEventListener('click',()=>{
        if(queue.length>=MAX_ITEMS){setFeedback(importStatus,'Queue is full; remove something first.',true);return;}
        let position=queue.findIndex(x=>x.original===entry.original);
        if(position<0){position=queue.length;queue.push({...parseLink(entry.original),id:newId(),
          title:entry.title,artist:entry.artist,artwork:entry.artwork});save();}
        setCurrent(position,true);document.querySelector('.now-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
      });
      actions.append(open);
      if(entry.playlistId && (entry.source==='YouTube Music'||entry.source==='YouTube')) {
        const expand=document.createElement('button');expand.type='button';expand.className='music-button secondary';
        expand.textContent='Load tracks';
        expand.title='Read this playlist with your YouTube Data API v3 key';
        expand.addEventListener('click',()=>expandYouTubePlaylist(entry,expand));
        actions.append(expand);
      }
      const remove=document.createElement('button');remove.type='button';remove.className='library-delete';
      remove.textContent='×';remove.title='Remove from saved library';remove.setAttribute('aria-label','Remove '+entry.title+' from library');
      remove.addEventListener('click',()=>{library.splice(index,1);saveLibrary();renderLibrary();});
      card.append(art,detail,actions,remove);wrap.append(card);
    });
  }

  async function expandYouTubePlaylist(entry,button) {
    const key=getYouTubeKey();
    if(!key) {
      $('youtube-settings').open=true;
      $('youtube-api-key').focus();
      setFeedback($('api-key-status'),'To load tracks individually, add a YouTube Data API v3 key. The standard playlist embed requires no key.',true);
      return;
    }
    button.disabled=true;button.textContent='Loading…';
    try {
      let token='',found=0,first=-1,requests=0;
      do {
        const p=new URLSearchParams({part:'snippet',playlistId:entry.playlistId,maxResults:'50',key});
        if(token)p.set('pageToken',token);
        const data=await getJson('https://www.googleapis.com/youtube/v3/playlistItems?'+p,10000);
        if(data.error)throw Error(data.error.message);
        for(const result of data.items||[]) {
          if(queue.length>=MAX_ITEMS)break;
          const id=result.snippet?.resourceId?.videoId;
          if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))continue;
          const media=parseLink('https://www.youtube.com/watch?v='+id);
          media.title=result.snippet.title||media.title;
          media.artist=result.snippet.videoOwnerChannelTitle||result.snippet.channelTitle||'';
          media.artwork=coverUrl(result.snippet.thumbnails?.high?.url)||media.artwork;
          if(first<0)first=queue.length;
          queue.push({...media,id:newId()});found++;
        }
        token=data.nextPageToken||'';requests++;
      }while(token&&queue.length<MAX_ITEMS&&requests<4);
      save();
      if(first>=0)setCurrent(first,true);
      setFeedback(importStatus,found?'Loaded '+found+' playlist tracks into the queue.':'The playlist returned no accessible tracks.',!found);
      if(first>=0)document.querySelector('.now-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){setFeedback(importStatus,'Could not load playlist tracks: '+error.message,true);}
    finally{button.disabled=false;button.textContent='Load tracks';}
  }

  $('clear-library').addEventListener('click',()=>{
    if(!confirm('Clear all saved playlists and albums on this browser?'))return;
    library.length=0;saveLibrary();renderLibrary();
  });
  $('youtube-api-key').value=getYouTubeKey();
  $('save-youtube-key').addEventListener('click',()=>{
    const key=$('youtube-api-key').value.trim();
    if(!/^[A-Za-z0-9_-]{20,}$/.test(key)){setFeedback($('api-key-status'),'Enter a valid YouTube Data API key.',true);return;}
    try{localStorage.setItem('opwatch-yt-api-key',key);setFeedback($('api-key-status'),'API key saved in this browser.');}
    catch{setFeedback($('api-key-status'),'Unable to save in this browser.',true);}
  });
  $('forget-youtube-key').addEventListener('click',()=>{
    try{localStorage.removeItem('opwatch-yt-api-key');}catch{}
    $('youtube-api-key').value='';setFeedback($('api-key-status'),'API key removed from this browser.');
  });

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
    $('previous').disabled = current <= 0 && !playedHistory.length;
    $('next').disabled = current < 0 || (queue.length < 2 && repeat === 0);
    $('copy-link').disabled = current < 0 || queue[current]?.source === 'Local file';
    $('show-download').disabled = current < 0;
    $('clear-queue').disabled = queue.length === 0;
  }


  function formatTime(seconds) {
    if(!Number.isFinite(seconds)||seconds<0)return '0:00';
    const num=Math.floor(seconds);
    return Math.floor(num/60)+':'+String(num%60).padStart(2,'0');
  }

  function updatePosition(seconds=0,duration=0) {
    $('elapsed-time').textContent=formatTime(seconds);
    $('total-time').textContent=formatTime(duration);
    if(controller?.seek && duration>0) {
      $('seek').disabled=false;
      $('seek').value=String(Math.round(1000*Math.max(0,Math.min(1,seconds/duration))));
    } else {
      $('seek').disabled=true;
      $('seek').value='0';
    }
  }

  function updateTransport() {
    const item=queue[current];
    const controllable=!!controller;
    $('play-pause').disabled=!controllable;
    $('play-pause').textContent=playState?'Ⅱ':'▶';
    $('play-pause').setAttribute('aria-label',playState?'Pause':'Play');
    $('play-pause').title=playState?'Pause':'Play';
    $('volume').disabled=!controller?.setVolume;
    $('previous').disabled=current<0||(current===0&&!playedHistory.length&&!controller?.prevTrack);
    $('next').disabled=current<0||(queue.length<2&&repeat===0&&!controller?.nextTrack);
    $('shuffle-toggle').disabled=queue.length<2;
    $('repeat-toggle').disabled=current<0;
    $('expand-playlist').hidden=!(item?.playlistId&&(item.source==='YouTube Music'||item.source==='YouTube'));
    $('expand-playlist').disabled=!item?.playlistId;
    $('shuffle-toggle').classList.toggle('is-active',shuffle);
    $('shuffle-toggle').setAttribute('aria-pressed',String(shuffle));
    $('repeat-toggle').classList.toggle('is-active',repeat>0);
    $('repeat-toggle').textContent=repeat===2?'↻₁':'↻';
    $('repeat-toggle').title=['Repeat off','Repeat queue','Repeat one'][repeat];
    $('repeat-toggle').setAttribute('aria-label',['Repeat off','Repeat queue','Repeat one'][repeat]);
    $('queue-mode-label').textContent=shuffle?'Shuffle on':repeat===0?'In order':repeat===1?'Repeat all':'Repeat one';
    $('transport-note').textContent=!item?'Choose a track above to get started':
      controllable?'Controls connected to '+item.source:
      item.mode==='external'?'This album must be opened in YouTube Music':
      'Use the '+item.source+' controls inside the embedded player';
  }

  function stopController() {
    const old=controller;
    controller=null;playState=false;
    if(ticker!==null){clearInterval(ticker);ticker=null;}
    if(old?.destroy)try{old.destroy();}catch{}
    updatePosition();
  }

  function startTicker() {
    if(ticker!==null)clearInterval(ticker);
    ticker=setInterval(()=>{
      if(!controller)return;
      try{
        const duration=Number(controller.duration?.()||0);
        const time=Number(controller.position?.()||0);
        if(duration>0)updatePosition(time,duration);
      }catch{}
    },500);
  }

  function advance(ended=false) {
    if(current<0)return;
    if(ended&&repeat===2) {
      if(controller?.seek){controller.seek(0);controller.play();return;}
      setCurrent(current,true);return;
    }
    if(queue.length<2){
      if(repeat===1&&ended)setCurrent(current,true);
      else{playState=false;updateTransport();}
      return;
    }
    let next;
    if(shuffle){
      const possible=queue.map((_,i)=>i).filter(i=>i!==current);
      next=possible[Math.floor(Math.random()*possible.length)];
    }else if(current+1<queue.length){next=current+1;}
    else if(repeat>0){next=0;}
    else{playState=false;updateTransport();return;}
    playedHistory.push(current);
    if(playedHistory.length>60)playedHistory.shift();
    setCurrent(next,true);
  }

  function updateCurrentSong(title,artist,imageUrl) {
    if(typeof title==='string' && title && $('now-heading').textContent!==title) $('now-heading').textContent=title;
    if(typeof artist==='string' && artist){
      $('track-artist').textContent=artist;
      $('track-artist').hidden=false;
    }
    const art=coverUrl(imageUrl);
    if(art&&$('cover-image').src!==art) {
      $('cover-image').src=art;$('cover-image').hidden=false;
      $('cover-art').classList.remove('is-active');
    }
  }

  function togglePlayback(){
    if(!controller)return;
    try {
      if(playState)controller.pause();
      else {
        const result=controller.play();
        if(result?.catch)result.catch(()=>setFeedback(playerStatus,'Playback was blocked. Try pressing Play in the provider player.',true));
      }
    }catch{setFeedback(playerStatus,'Use the player controls inside the embed.',true);}
  }

  function connectAudio(audio,entry) {
    audio.controls=false;
    audio.volume=Number($('volume').value)/100;
    controller={
      play:()=>audio.play(),pause:()=>audio.pause(),
      seek:(sec)=>{if(Number.isFinite(audio.duration))audio.currentTime=sec;},
      setVolume:(level)=>{audio.volume=level;},
      duration:()=>audio.duration,position:()=>audio.currentTime
    };
    for(const name of ['play','pause','ended'])audio.addEventListener(name,()=>{
      if(queue[current]!==entry)return;
      playState=name==='play';updateTransport();
      if(name==='ended')advance(true);
    });
    audio.addEventListener('timeupdate',()=>{if(queue[current]===entry)updatePosition(audio.currentTime,audio.duration);});
    audio.addEventListener('durationchange',()=>updatePosition(audio.currentTime,audio.duration));
    startTicker();updateTransport();
  }

  function connectSoundCloud(iframe,entry,shouldAutoplay) {
    if(!window.SC?.Widget) {setFeedback(playerStatus,'SoundCloud widget controls could not load. Use the embedded player.',true);return;}
    const widget=window.SC.Widget(iframe);
    controller={
      play:()=>widget.play(),pause:()=>widget.pause(),
      seek:(sec)=>widget.seekTo(sec*1000),
      setVolume:(value)=>widget.setVolume(Math.round(value*100)),
      position:()=>0,duration:()=>0,
      nextTrack:()=>widget.next(),prevTrack:()=>widget.prev()
    };
    widget.bind(window.SC.Widget.Events.READY,()=>{
      if(queue[current]!==entry)return;
      widget.setVolume(Number($('volume').value));
      widget.getDuration(ms=>{if(queue[current]===entry)updatePosition(0,ms/1000);});
      if(shouldAutoplay)widget.play();
      updateTransport();
    });
    widget.bind(window.SC.Widget.Events.PLAY,()=>{
      if(queue[current]!==entry)return;
      playState=true;updateTransport();
      widget.getCurrentSound(sound=>{
        if(queue[current]!==entry || !sound)return;
        updateCurrentSong(sound.title,sound.user?.username,sound.artwork_url?.replace('-large','-t500x500'));
      });
    });
    widget.bind(window.SC.Widget.Events.PAUSE,()=>{if(queue[current]!==entry)return;playState=false;updateTransport();});
    widget.bind(window.SC.Widget.Events.FINISH,()=>{
      if(queue[current]!==entry)return;
      if(entry.kind==='playlist'){
        widget.getSounds(sounds=>widget.getCurrentSoundIndex(i=>{
          if(queue[current]===entry && i >= (sounds?.length||1)-1)advance(true);
        }));
      }else advance(true);
    });
    widget.bind(window.SC.Widget.Events.PLAY_PROGRESS,data=>{
      if(queue[current]!==entry)return;
      widget.getDuration(ms=>updatePosition((data.currentPosition||0)/1000,ms/1000));
    });
    updateTransport();
  }

  function connectYoutube(iframe,entry,shouldAutoplay) {
    // Official YouTube IFrame API. No scraping or media URL extraction.
    if(window.YT?.Player){
      try {
        const yt=new window.YT.Player(iframe,{
          events:{
            onReady:()=>{
              if(queue[current]!==entry)return;
              controller={
                play:()=>yt.playVideo(),pause:()=>yt.pauseVideo(),
                seek:(s)=>yt.seekTo(s,true),
                setVolume:(v)=>yt.setVolume(Math.round(v*100)),
                position:()=>yt.getCurrentTime(),
                duration:()=>yt.getDuration(),
                nextTrack:()=>yt.nextVideo(),prevTrack:()=>yt.previousVideo(),setShuffle:(value)=>yt.setShuffle(value),
                destroy:()=>{try{yt.destroy();}catch{}}
              };
              yt.setVolume(Number($('volume').value));
              startTicker();updateTransport();
              if(shouldAutoplay)yt.playVideo();
            },
            onStateChange:(event)=>{
              if(queue[current]!==entry)return;
              playState=event.data===1;
              if(event.data===1||event.data===3){
                try {
                  const data=yt.getVideoData();
                  if(data?.video_id)updateCurrentSong(data.title,data.author,
                    'https://i.ytimg.com/vi/'+data.video_id+'/hqdefault.jpg');
                }catch{}
              }
              if(event.data===0){
                if(entry.kind==='playlist'){
                  try {
                    const playlist=yt.getPlaylist();
                    if(playlist?.length>1&&yt.getPlaylistIndex()<playlist.length-1){updateTransport();return;}
                  }catch{}
                }
                advance(true);
              }
              updateTransport();
            },
            onError:(event)=>{
              if(queue[current]!==entry)return;
              setFeedback(playerStatus,'YouTube returned a playback error ('+event.data+'). Some YouTube Music content cannot be embedded. Open it on YouTube Music, or use “Load tracks” in Saved Library with an API key.',true);
            }
          }
        });
      }catch(error){setFeedback(playerStatus,'YouTube controls are unavailable: '+error.message,true);}
    }else{
      $('transport-note').textContent='YouTube controls are loading…';
      const version=++controlVersion;
      let attempts=0;
      const wait=setInterval(()=>{
        if(queue[current]!==entry||version!==controlVersion){clearInterval(wait);return;}
        if(window.YT?.Player){clearInterval(wait);connectYoutube(iframe,entry,shouldAutoplay);}
        else if(++attempts>=24){clearInterval(wait);updateTransport();}
      },250);
    }
  }

  function setCurrent(index,shouldAutoplay=false) {
    stopController();
    controlVersion++;
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
      stage.classList.remove('has-audio');
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
      updateTransport();
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
    stage.classList.toggle('has-audio',entry.mode==='audio');
    if (entry.mode === 'audio') {
      const audio = document.createElement('audio');
      audio.src = entry.original;
      audio.controls = false;
      audio.preload = 'metadata';
      audio.playsInline = true;
      audio.addEventListener('error', () => {
        if (current === index && queue[index] === entry) {
          setFeedback(playerStatus, 'The browser could not load this audio. The file may be unavailable or blocked by its host.', true);
        }
      });
      stage.append(audio);
      const visual=document.createElement('div');visual.className='local-visual';
      const visualIcon=document.createElement('span');visualIcon.textContent='♫';
      const visualText=document.createElement('span');visualText.textContent='BROWSER AUDIO / LOCAL PLAYBACK';
      visual.append(visualIcon,visualText);stage.append(visual);
      connectAudio(audio,entry);
      setFeedback(playerStatus,'Ready to play in your browser.');
      if(shouldAutoplay)audio.play().catch(()=>setFeedback(playerStatus,'Press Play to start the audio.'));
    } else if(entry.mode==='external'){
      const fallback=document.createElement('div');fallback.className='player-empty';
      const message=document.createElement('p');message.textContent='This album is available on YouTube Music.';
      const link=document.createElement('a');link.href=entry.original;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Open album on YouTube Music ↗';link.className='music-button primary';
      fallback.append(message,link);stage.append(fallback);
      setFeedback(playerStatus,'YouTube Music album browse links cannot be embedded as regular YouTube playlists.',true);
    }else {
      const iframe = document.createElement('iframe');
      iframe.className = 'is-' + entry.size;
      iframe.src = entry.embed;
      iframe.title = entry.source + ' ' + entry.kind + ' player';
      iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      stage.append(iframe);
      if(entry.source==='SoundCloud')connectSoundCloud(iframe,entry,shouldAutoplay);
      if(entry.source==='YouTube'||entry.source==='YouTube Music')connectYoutube(iframe,entry,shouldAutoplay);
      setFeedback(playerStatus,entry.playlistId?'Loading YouTube playlist. If embedding is refused, try “Load tracks” in Saved Library.':
        'Requested the '+entry.source+' player. Some links may not allow embeds.');

    }
    downloadPanel.hidden = true;
    renderQueue();
    updateTransport();
  }

  function removeAt(index) {
    const entry = queue[index];
    if (!entry) return;
    if (entry.source === 'Local file') {
      URL.revokeObjectURL(entry.original);
      localUrls.delete(entry.id);
    }
    queue.splice(index, 1);
    playedHistory.length=0;
    save();
    if (!queue.length) setCurrent(-1);
    else if (index === current) setCurrent(Math.min(index, queue.length - 1));
    else if (index < current) { current--; playedHistory.length=0; renderQueue(); }
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

  $('previous').addEventListener('click',()=>{
    if(queue[current]?.kind==='playlist'&&controller?.prevTrack){controller.prevTrack();return;}
    if(playedHistory.length){const prev=playedHistory.pop();setCurrent(prev,true);}
    else if(current>0)setCurrent(current-1,true);
  });
  $('next').addEventListener('click',()=>{if(queue[current]?.kind==='playlist'&&controller?.nextTrack){controller.nextTrack();return;}advance(false);});
  $('clear-queue').addEventListener('click',()=>{
    for(const url of localUrls.values())URL.revokeObjectURL(url);
    localUrls.clear();queue.length=0;playedHistory.length=0;
    save();setCurrent(-1);setFeedback(importStatus,'Queue cleared. Your saved albums and playlists are still in your library.');
  });
  $('shuffle-toggle').addEventListener('click',()=>{
    shuffle=!shuffle;
    if(queue[current]?.playlistId&&controller?.setShuffle)controller.setShuffle(shuffle);
    updateTransport();
  });
  $('repeat-toggle').addEventListener('click',()=>{
    repeat=(repeat+1)%3;updateTransport();
  });
  $('play-pause').addEventListener('click',togglePlayback);
  $('expand-playlist').addEventListener('click',()=>{
    const item=queue[current];
    if(item?.playlistId)expandYouTubePlaylist(item,$('expand-playlist'));
  });
  $('seek').addEventListener('change',e=>{
    if(controller?.seek&&controller?.duration){
      const seconds=controller.duration()*Number(e.target.value)/1000;
      if(Number.isFinite(seconds))controller.seek(seconds);
    }
  });
  $('volume').addEventListener('input',e=>{
    if(controller?.setVolume)controller.setVolume(Number(e.target.value)/100);
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
  queue.filter(item=>['album','playlist'].includes(item.kind)).forEach(rememberCollection);
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