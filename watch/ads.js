/* OPwatch optional ad tab (A-ADS). */
(function () {
    "use strict";
    const AADS_UNIT = "2459572";
    const WATCH_SECONDS = 15;
    const DISMISS_KEY = "opwatch:ad-tab-dismissed";

    if (/\/party\//.test(location.pathname)) return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch (e) { /* storage blocked */ }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text) n.textContent = text;
        return n;
    }

    const tab = el("aside", "ad-tab");
    tab.setAttribute("aria-label", "Optional ad");
    tab.hidden = true;

    function dismiss() {
        try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch (e) { /* storage blocked */ }
        tab.remove();
    }

    function showAd() {
        tab.replaceChildren();
        tab.classList.add("is-open");
        const slot = el("div", "ad-slot");
        const holder = document.getElementById("aads-unit");
        const frame = (holder && holder.querySelector("iframe")) || document.createElement("iframe");
        frame.dataset.aa = AADS_UNIT;
        frame.src = `https://acceptable.a-ads.com/${AADS_UNIT}/?size=Adaptive&background_color=transparent`;
        frame.style.cssText = "border:0;padding:0;width:100%;height:250px;overflow:hidden;display:block;margin:auto";
        slot.appendChild(frame);
        const status = el("p", "ad-status", `Thanks for supporting OPwatch! You can close this in ${WATCH_SECONDS}s.`);
        const close = el("button", "secondary-button", "Close");
        close.type = "button";
        close.disabled = true;
        close.addEventListener("click", dismiss);
        tab.append(slot, status, close);

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

    function build() {
        tab.appendChild(el("p", "ad-prompt-text", "Watch an ad to support OPwatch? This is completely optional. Your support helps keep OPwatch running."));
        const actions = el("div", "ad-actions");
        const yes = el("button", "primary-button", "Watch an ad");
        const no = el("button", "secondary-button", "No thanks");
        yes.type = no.type = "button";
        yes.addEventListener("click", showAd);
        no.addEventListener("click", dismiss);
        actions.append(yes, no);
        tab.appendChild(actions);
        document.body.appendChild(tab);
        tab.hidden = false;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();
