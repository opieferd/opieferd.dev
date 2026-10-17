/* Keeps every donation progress bar on the page current.
   goal + currency come from donations.json; "raised" comes live from Ko-fi
   payments (via accounts.js -> Supabase). If donations.json lists a LARGER
   amount for the month (e.g. money received outside Ko-fi), that wins.
   Works with: .donation-progress-fill, .donation-progress-label span,
   [data-donation-raised], [data-donation-goal], [data-donation-percent].
   Load it AFTER accounts.js. If the JSON lives elsewhere:
   <script src="donations-live.js" data-json="/watch/donations.json"></script> */
(function () {
    "use strict";
    var tag = document.currentScript;
    var JSON_URL = (tag && tag.dataset.json) || "/watch/donations.json";

    async function load() {
        var cfg = { goal: 0, currency: "$", raised: {} };
        try {
            var res = await fetch(JSON_URL, { cache: "no-store" });
            if (res.ok) cfg = Object.assign(cfg, await res.json());
        } catch (e) { /* keep defaults */ }

        var live = 0;
        var acc = window.OpieAccount;
        if (acc && acc.client) {
            try {
                var out = await acc.client.rpc("donation_progress");
                if (out.data) live = Number(out.data.raised) || 0;
            } catch (e) { /* fall back to JSON */ }
        }

        var month = new Date().toISOString().slice(0, 7); // YYYY-MM, matches the JSON keys
        var manual = Number(cfg.raised && cfg.raised[month]) || 0;
        var raised = Math.max(live, manual);
        var goal = Number(cfg.goal) || 0;
        var pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
        var money = function (n) { return cfg.currency + (Number.isInteger(n) ? n : n.toFixed(2)); };

        document.querySelectorAll(".donation-progress-fill").forEach(function (el) { el.style.width = pct + "%"; });
        document.querySelectorAll("[data-donation-raised]").forEach(function (el) { el.textContent = money(raised); });
        document.querySelectorAll("[data-donation-goal]").forEach(function (el) { el.textContent = money(goal); });
        document.querySelectorAll("[data-donation-percent]").forEach(function (el) { el.textContent = pct + "%"; });
        // Existing banner label with no data- hooks: update its first <span> (the amount)
        document.querySelectorAll(".donation-progress-label").forEach(function (label) {
            if (label.querySelector("[data-donation-raised]")) return;
            var span = label.querySelector("span");
            if (span) span.textContent = money(raised);
        });

        window.dispatchEvent(new CustomEvent("donations:loaded", { detail: { raised: raised, goal: goal, percent: pct, currency: cfg.currency } }));
    }

    window.addEventListener("load", load);
})();
