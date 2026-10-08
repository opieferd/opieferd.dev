const menuToggle = document.getElementById("menu-toggle");
const menuPanel = document.getElementById("menu-panel");
const socialToggle = document.getElementById("social-toggle");
const socialLinksMenu = document.getElementById("social-links-menu");

menuToggle.addEventListener("click", () => {
    const isOpen = menuPanel.hidden;
    menuPanel.hidden = !isOpen;
    menuToggle.setAttribute("aria-expanded", String(isOpen));
});

socialToggle.addEventListener("click", () => {
    const isOpen = socialLinksMenu.hidden;
    socialLinksMenu.hidden = !isOpen;
    socialToggle.setAttribute("aria-expanded", String(isOpen));
    socialToggle.querySelector("span").textContent = isOpen ? "−" : "+";
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-menu")) {
        menuPanel.hidden = true;
        menuToggle.setAttribute("aria-expanded", "false");
        socialLinksMenu.hidden = true;
        socialToggle.setAttribute("aria-expanded", "false");
        socialToggle.querySelector("span").textContent = "+";
    }
});
