let typedKeys = [];

document.addEventListener('keydown', function(e) {
    const key = e.key.toLowerCase();
    typedKeys.push(key);

    // Keep only the last 4 keys
    if (typedKeys.length > 4) {
        typedKeys.shift();
    }

    if (typedKeys.join('') === 'meow') {
        activateMeowMode(1000000000000000000000000000000000000000000000000000000); // triggers meow mode for 10 seconds
        typedKeys = []; // reset after activation
    }
});

function activateMeowMode(duration = 10000000000000000000000000000000000000000000000) {
    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, div');
    const originalTexts = [];

    elements.forEach(el => {
        const original = el.textContent;
        originalTexts.push({ el, original });

        // Replace with meow variants
        const words = original.split(/\s+/).map(() => {
            const rand = Math.random();
            if (rand < 0.3) return 'meow';
            if (rand < 0.6) return 'mew';
            return 'moew';
        });
        el.textContent = words.join(' ');
    });

    // Revert after duration
    setTimeout(() => {
        originalTexts.forEach(({ el, original }) => {
            el.textContent = original;
        });
    }, duration);
}
