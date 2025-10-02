let typedKeys = [];

document.addEventListener('keydown', function(e) {
    const key = e.key.toLowerCase();
    typedKeys.push(key);

    if (typedKeys.length > 4) {
        typedKeys.shift();
    }

    if (typedKeys.join('') === 'meow') {
        activateMeowMode(); 
        typedKeys = []; 
    }
});

function activateMeowMode() {
    
    if (window.__meowModeActivated) return;
    window.__meowModeActivated = true;

    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, div');

    elements.forEach(el => {
       
        const original = el.textContent;
        const words = original.split(/\s+/).map(() => {
            const rand = Math.random();
            if (rand < 0.3) return 'meow';
            if (rand < 0.6) return 'mew';
            return 'moew';
        });
        el.textContent = words.join(' ');
    });

}
