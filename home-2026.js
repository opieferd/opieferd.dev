const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = document.querySelectorAll('.editorial-card, .project-card, .connect-section');
if ('IntersectionObserver' in window && !reducedMotion) {
  document.documentElement.classList.add('has-motion');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  revealTargets.forEach((target) => observer.observe(target));
}

const progress = document.createElement('div');
progress.className = 'page-progress';
progress.setAttribute('aria-hidden', 'true');
document.body.appendChild(progress);
let progressScheduled = false;
function updateProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
  progressScheduled = false;
}
window.addEventListener('scroll', () => {
  if (!progressScheduled) {
    progressScheduled = true;
    requestAnimationFrame(updateProgress);
  }
}, { passive: true });
updateProgress();

const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let keys = [];
document.addEventListener('keydown', (event) => {
  keys.push(event.key);
  keys = keys.slice(-konami.length);
  if (keys.join('|') === konami.join('|')) {
    keys = [];
    const cat = document.createElement('div');
    cat.className = 'easter-cat';
    cat.setAttribute('role', 'status');
    cat.textContent = 'meow! ฅ^•ﻌ•^ฅ';
    document.body.appendChild(cat);
    setTimeout(() => cat.remove(), 4500);
  }
});

const orangeCopyButton = document.getElementById('copy-opie-orange');
if (orangeCopyButton) {
  let copyReset;
  orangeCopyButton.addEventListener('click', async () => {
    const status = document.getElementById('orange-copy-status');
    try {
      await navigator.clipboard.writeText('#EBAF36');
      document.getElementById('orange-copy-label').textContent = 'Copied';
      status.textContent = 'Opie Orange hex color copied.';
      clearTimeout(copyReset);
      copyReset = setTimeout(() => {
        document.getElementById('orange-copy-label').textContent = '#EBAF36';
        status.textContent = '';
      }, 2000);
    } catch {
      status.textContent = 'Copy this color: #EBAF36';
    }
  });
}
