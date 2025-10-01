const logos = [
    {
        href: "https://x.com/Opieferd",
        html: '<i class="fab fa-x-twitter"></i>'
    },
    {
        href: "https://www.tiktok.com/@opieferd",
        html: '<i class="fab fa-tiktok"></i>'
    },
    {
        href: "https://github.com/opieferd",
        html: '<i class="fab fa-github"></i>'
    },
    {
        href: "https://www.reddit.com/user/Opieferd/",
        html: '<i class="fab fa-reddit"></i>'
    },
    {
        href: "https://mastodon.social/@opieferd",
        html: '<i class="fab fa-mastodon"></i>'
    },
    {
        href: "https://bsky.app/profile/opieferd.dev",
        html: '<i class="fab fa-bluesky"></i>'
    },
    {
        href: "https://discord.com/users/931745609252233257",
        html: '<i class="fab fa-discord"></i>'
    },
    {
        href: "https://open.spotify.com/user/31qbysm2dpyr7rfur5ljkunpyt34?si=5e59c724a3c246ee",
        html: '<i class="fab fa-spotify"></i>'
    }
];

function createLogoLoop({logos, speed = 50, logoHeight = 140, gap = 100}) {
    const root = document.getElementById('logo-loop-root');
    if (!root) return;

    root.className = 'logoloop logoloop--fade logoloop--scale-hover';
    root.style.setProperty('--logoloop-gap', `${gap}px`);
    root.style.setProperty('--logoloop-logoHeight', `${logoHeight}px`);

    const track = document.createElement('div');
    track.className = 'logoloop__track';

    function makeItem(item) {
        const li = document.createElement('li');
        li.className = 'logoloop__item';

        let content;
        if (item.html) {
            content = document.createElement('span');
            content.className = 'logoloop__icon';
            content.innerHTML = item.html;
            content.style.fontSize = `${logoHeight}px`;
            content.style.display = "inline-flex";
            content.style.alignItems = "center";
        }

        if (item.href) {
            const link = document.createElement('a');
            link.className = 'logoloop__link';
            link.href = item.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.appendChild(content);
            li.appendChild(link);
        }
        return li;
    }

    function makeList() {
        const ul = document.createElement('ul');
        ul.className = 'logoloop__list';
        logos.forEach(item => ul.appendChild(makeItem(item)));
        return ul;
    }

    const list1 = makeList();
    const list2 = makeList();

    track.appendChild(list1);
    track.appendChild(list2);
    root.appendChild(track);

    // animation
    let offset = 0;
    let lastTimestamp;
    let currentSpeed = speed;

    function animate(ts) {
        if (!lastTimestamp) lastTimestamp = ts;
        const dt = (ts - lastTimestamp) / 1000;
        lastTimestamp = ts;
        offset += currentSpeed * dt;
        const listWidth = list1.offsetWidth;
        if (offset >= listWidth) offset -= listWidth;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    const SLOW_SPEED = 10;
    root.addEventListener('mouseenter', () => currentSpeed = SLOW_SPEED);
    root.addEventListener('mouseleave', () => currentSpeed = speed);
}

document.addEventListener('DOMContentLoaded', function() {
    createLogoLoop({
      logos,
      speed: 75,
      logoHeight: 100,
      gap: 100
    });
});
