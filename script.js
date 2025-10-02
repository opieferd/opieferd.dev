// smooth scrolling
document.addEventListener('DOMContentLoaded', function() {
    // for all links
    const links = document.querySelectorAll('a[href^="#"]');
    
    for (const link of links) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    }
    
    // intersect observer 4 scrolling
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // observ sect 4 anim
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        observer.observe(section);
    });
    
    // opie name type 
    const nameElement = document.querySelector('.name');
    if (nameElement) {
        const originalText = nameElement.textContent;
        nameElement.textContent = '';
        
        let i = 0;
        const typeWriter = () => {
            if (i < originalText.length) {
                nameElement.textContent += originalText.charAt(i);
                i++;
                setTimeout(typeWriter, 100);
            }
        };
        
        // delay 4 type
        setTimeout(typeWriter, 500);
    }
    
    // hover effect
    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.addEventListener('mouseenter', function() {
            this.style.filter = 'brightness(1.2) saturate(1.2)';
        });
        
        avatar.addEventListener('mouseleave', function() {
            this.style.filter = 'brightness(1) saturate(1)';
        });
    }
    
    // clicky click effect 4 skills
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach(tag => {
        tag.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = 'translateY(-3px) scale(1.05)';
            }, 150);
        });
    });
    
    
 //  konami
    let konamiCode = [];
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA

    document.addEventListener('keydown', function(e) {
        konamiCode.push(e.keyCode);

        if (konamiCode.length > konami.length) {
            konamiCode.shift();
        }

        if (konamiCode.join(',') === konami.join(',')) {
            // rainbow anim
            document.body.style.animation = 'rainbow 2s linear infinite';

            // override styles
            if (!document.getElementById('rainbow-style')) {
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes rainbow {
                        0% { filter: hue-rotate(0deg); }
                        100% { filter: hue-rotate(360deg); }
                    }
                    a {
                        animation: rainbow 2s linear infinite;
                    }
                `;
                style.id = 'rainbow-style';
                document.head.appendChild(style);
            }

            // nyans
            summonNyancats(10); // variable for how many nyans

            // nyancan gone after 5 sec
            setTimeout(() => {
                document.querySelectorAll('.nyancat').forEach(nyan => nyan.remove());
                // keep rainbow infinite
            }, 5000);

            konamiCode = []; // reset
        }
    });

    // random pos
    function summonNyancats(count = 5) {
        for (let i = 0; i < count; i++) {
            const nyan = document.createElement("img");
            nyan.src = "https://media.tenor.com/8lR3_1m-i94AAAAi/cat.gif";
            nyan.className = "nyancat";
            // random pos 10%-80% of screen
            const topPercent = 10 + Math.random() * 70;
            nyan.style.top = topPercent + "%";
            nyan.style.left = "-200px";
            nyan.style.position = "fixed";
            nyan.style.width = "150px";
            nyan.style.zIndex = "9999";
            nyan.style.pointerEvents = "none";
            nyan.style.animation = "nyan-fly 5s linear forwards";
            document.body.appendChild(nyan);
        }
    }
});

// utilities
function updateSocialLink(platform, url) {
    const link = document.querySelector(`.${platform}`);
    if (link) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
}

// skill tag cookiecutter
function addSkillTag(skillName) {
    const skillTags = document.querySelector('.skill-tags');
    const newTag = document.createElement('span');
    newTag.className = 'skill-tag';
    newTag.textContent = skillName;
    
    // click effect2
    newTag.addEventListener('click', function() {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = 'translateY(-3px) scale(1.05)';
        }, 150);
    });
    
    skillTags.appendChild(newTag);
}
