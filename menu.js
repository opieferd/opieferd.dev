const menuToggle = document.getElementById('menu-toggle');
const menuPanel = document.getElementById('menu-panel');
const socialToggle = document.getElementById('social-toggle');
const socialLinksMenu = document.getElementById('social-links-menu');

if (menuToggle && menuPanel && socialToggle && socialLinksMenu) {
  const closeSocial = () => {
    socialLinksMenu.hidden = true;
    socialToggle.setAttribute('aria-expanded', 'false');
    const icon = socialToggle.querySelector('span');
    if (icon) icon.textContent = '+';
  };
  const closeMenu = () => {
    menuPanel.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    closeSocial();
  };
  menuToggle.addEventListener('click', () => {
    const opening = menuPanel.hidden;
    menuPanel.hidden = !opening;
    menuToggle.setAttribute('aria-expanded', String(opening));
    if (!opening) closeSocial();
  });
  socialToggle.addEventListener('click', () => {
    const opening = socialLinksMenu.hidden;
    socialLinksMenu.hidden = !opening;
    socialToggle.setAttribute('aria-expanded', String(opening));
    const icon = socialToggle.querySelector('span');
    if (icon) icon.textContent = opening ? '−' : '+';
  });
  menuPanel.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-menu')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menuPanel.hidden) {
      closeMenu();
      menuToggle.focus();
    }
  });
}
