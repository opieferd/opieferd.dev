/* OPwatch optional ad tab (A-ADS; the ad itself lives on /ad/). */
(function () {
    "use strict";
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

    function openAd() {
        window.open("/ad/", "_blank", "noopener");
        dismiss();
    }

    function build() {
        tab.appendChild(el("p", "ad-prompt-text", "Watch an ad to support OPwatch? This is completely optional. Your support helps keep OPwatch running."));
        const actions = el("div", "ad-actions");
        const yes = el("button", "primary-button", "Watch an ad");
        const no = el("button", "secondary-button", "No thanks");
        yes.type = no.type = "button";
        yes.addEventListener("click", openAd);
        no.addEventListener("click", dismiss);
        actions.append(yes, no);
        tab.appendChild(actions);
        document.body.appendChild(tab);
        tab.hidden = false;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();
