/* Lightweight elemental corner glows for successful seal casts.
 * One fixed overlay, no canvas effects, no animation loops or dependencies.
 */
const ELEMENT_PALETTE = Object.freeze({
  fire: ["255,73,41", "248,154,48"],
  water: ["46,155,244", "100,207,248"],
  earth: ["182,124,66", "223,174,101"],
  wind: ["240,247,255", "190,215,233"]
});

export function castColors(elements = []) {
  const unique = [...new Set(elements)].filter(id => Object.hasOwn(ELEMENT_PALETTE, id));
  if (!unique.length) return ["235,175,54", "243,227,194", "235,175,54", "243,227,194"];
  const palettes = unique.map(id => ELEMENT_PALETTE[id]);
  if (palettes.length === 1) {
    const [a,b] = palettes[0];
    return [a,b,b,a];
  }
  if (palettes.length === 2) {
    return [palettes[0][0],palettes[1][0],palettes[0][1],palettes[1][1]];
  }
  if (palettes.length === 3) {
    return [palettes[0][0],palettes[1][0],palettes[2][0],palettes[0][1]];
  }
  return palettes.slice(0,4).map(p => p[0]);
}

export function createCastEffects() {
  const overlay = document.createElement("div");
  overlay.className = "magic-cast-fx";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  return {
    play(elements = [], power = 50) {
      const colors = castColors(elements);
      ["tl", "tr", "bl", "br"].forEach((corner, i) =>
        overlay.style.setProperty("--cast-" + corner, colors[i])
      );
      const strength = Math.max(0.16, Math.min(0.28, 0.16 + (Number(power) || 0) / 850));
      overlay.style.setProperty("--cast-alpha", strength.toFixed(3));
      // Re-trigger only when a valid spell is cast, never during pen input.
      overlay.classList.remove("is-active");
      void overlay.offsetWidth;
      overlay.classList.add("is-active");
    }
  };
}
