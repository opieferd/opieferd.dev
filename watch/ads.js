/* OPwatch optional ad prompt (A-ADS). */
(function () {
    "use strict";
    const AADS_UNIT = "2459572";
    const WATCH_SECONDS = 15;
    const PROMPT_DELAY_MS = 20000;
    const SEEN_KEY = "opwatch:ad-prompt-seen";

    if (/\/party\//.test(location.pathname)) return;
    try { if (sessionStorage.getItem(SEEN_KEY)) return; } catch (e) { /* storage blocked */ }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text) n.textContent = text;
        return n;
    }

    function openModal(content) {
        const overlay = el("div", "ad-overlay");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        const box = el("div", "ad-modal");
        box.appendChild(content);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        return () => overlay.remove();
    }

    function showAd() {
        const wrap = el("div");
        const slot = el("div", "ad-slot");
        const frame = document.createElement("iframe");
        frame.dataset.aa = AADS_UNIT;
        frame.src = `https://acceptable.a-ads.com/${AADS_UNIT}/?size=Adaptive&background_color=transparent`;
        frame.style.cssText = "border:0;padding:0;width:100%;height:250px;overflow:hidden;display:block;margin:auto";
        slot.appendChild(frame);
        const status = el("p", "ad-status", `Thanks for supporting OPwatch! You can close this in ${WATCH_SECONDS}s.`);
        const close = el("button", "secondary-button", "Close");
        close.type = "button";
        close.disabled = true;
        wrap.append(slot, status, close);
        const remove = openModal(wrap);
        close.addEventListener("click", remove);

        let left = WATCH_SECONDS;
        const timer = setInterval(() => {
            left -= 1;
            if (left > 0) {
                status.textContent = `Thanks for supporting OPwatch! You can close this in ${left}s.`;
            } else {
                clearInterval(timer);
                status.textContent = "Thank you for supporting OPwatch!";
                close.disabled = false;
            }
        }, 1000);
    }

    function showPrompt() {
        try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* storage blocked */ }
        const wrap = el("div");
        wrap.appendChild(el("p", "ad-prompt-text", "Watch an ad to support OPwatch? This is completely optional. Your support helps keep OPwatch running."));
        const actions = el("div", "ad-actions");
        const yes = el("button", "primary-button", "Watch an ad");
        const no = el("button", "secondary-button", "No thanks");
        yes.type = no.type = "button";
        actions.append(yes, no);
        wrap.appendChild(actions);
        const remove = openModal(wrap);
        no.addEventListener("click", remove);
        yes.addEventListener("click", () => { remove(); showAd(); });
    }

    setTimeout(showPrompt, PROMPT_DELAY_MS);
})();
