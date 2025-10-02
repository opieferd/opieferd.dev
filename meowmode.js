let typedKeys = [];

document.addEventListener('keydown', function(e) {
    const key = e.key.toLowerCase();
    typedKeys.push(key);

    // Keep only the last 4 keys
    if (typedKeys.length > 4) {
        typedKeys.shift();
    }

    if (typedKeys.join('') === 'meow') {
        activateMeowMode(); // triggers meow mode permanently until refresh
        typedKeys = []; // reset after activation
    }
});

function activateMeowMode() {
    // Prevent multiple activations
    if (window.__meowModeActivated) return;
    window.__meowModeActivated = true;

    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, div');

    elements.forEach(el => {
        // Replace with meow variants
        const original = el.textContent;
        const words = original.split(/\s+/).map(() => {
            const rand = Math.random();
            if (rand < 0.3) return 'meow';
            if (rand < 0.6) return 'mew';
            return 'moew';
        });
        el.textContent = words.join(' ');
    });

    // No revert logic: meow mode stays on until refresh
}
