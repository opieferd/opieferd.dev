(function () {
    "use strict";

    const pageOrigin = window.location.origin;
    const storageKey = "opieferd.currentlyWatching";
    const status = document.getElementById("status");
    const details = document.getElementById("show-details");
    const updated = document.getElementById("updated");
    const bookmarklet = document.getElementById("bookmarklet");
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

    function render(data) {
        if (!data || !data.title) {
            return;
        }

        const episode = data.episode ? `Episode ${data.episode}` : "Episode not detected";
        status.textContent = "Currently watching";
        details.className = "show-details";
        details.innerHTML = `<h2>${escapeHtml(data.title)}</h2><p class="episode">${escapeHtml(episode)}</p>`;
        updated.textContent = `Last shared ${new Date(data.updatedAt || Date.now()).toLocaleString()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            title: data.title,
            episode: data.episode || "",
            updatedAt: data.updatedAt || Date.now()
        }));
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
        try {
            render(JSON.parse(localStorage.getItem(storageKey)));
        } catch {
            localStorage.removeItem(storageKey);
        }
    }

    // The bookmarklet can post data back after this page opens the streaming site.
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
            render(event.data);
            status.textContent = `Updated from ${event.data.site || hostname}`;
        }
    });

    const bookmarkletCode = `javascript:(()=>{const host=location.hostname.toLowerCase();const nova=/novashow\\.live$/.test(host);const values=[];const add=v=>{if(v&&typeof v==='string')values.push(v.trim())};const read=o=>{try{Object.keys(o).forEach(k=>add(o.getItem(k)))}catch{}};read(localStorage);read(sessionStorage);document.querySelectorAll('script[type="application/ld+json"]').forEach(e=>add(e.textContent));const text=(document.title+' '+document.body.innerText+' '+values.join(' ')).replace(/\\s+/g,' ');const episode=text.match(/(?:season\\s*\\d+\\s*[,:-]?\\s*)?episode\\s*\\d+|\\bS\\d{1,2}\\s*E\\d{1,3}\\b|\\b\\d{1,2}x\\d{1,3}\\b/i);const selectors=nova?'h1,h2,[class*="episode"],[class*="show-title"],[class*="series-title"],[class*="anime-title"]':'h1,h2,[data-testid*="title"],[class*="show-title"],[class*="series-title"],[class*="video-title"],[class*="episode-title"],[class*="program-title"]';const el=[...document.querySelectorAll(selectors)].find(e=>e.textContent.trim().length>1);let title=(el?.textContent||'').trim();if(!title){title=document.title.replace(/\\s*[|–-]\\s*(?:Netflix|Hulu|Disney\\+|Max|Prime Video|Paramount\\+|Peacock|Crunchyroll|NovaShow).*$/i,'').trim()}title=title.replace(/\\s*(?:season\\s*\\d+\\s*)?(?:episode\\s*\\d+|S\\d{1,2}\\s*E\\d{1,3}|\\d{1,2}x\\d{1,3}).*$/i,'').trim();const d={type:'novashow-watching',title:title||'Unknown show',episode:episode?episode[0].replace(/\\s+/g,' '):'',updatedAt:Date.now(),site:host};if(window.opener){window.opener.postMessage(d,'${pageOrigin}');alert('Sent to opieferd.dev');}else{alert('Open the streaming site from the opieferd.dev/watching page first.');}})()`;
    bookmarklet.href = bookmarkletCode;

    loadSaved();
}());
