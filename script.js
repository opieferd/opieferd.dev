// Smooth scrolling for any future anchor links
document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scrolling to all links
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
    
    // Add intersection observer for scroll animations
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
    
    // Observe all sections for animation
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        observer.observe(section);
    });
    
    // Add typing effect to the name (optional enhancement)
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
        
        // Start typing effect after a short delay
        setTimeout(typeWriter, 500);
    }
    
    // Add particle effect on hover for avatar
    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.addEventListener('mouseenter', function() {
            this.style.filter = 'brightness(1.2) saturate(1.2)';
        });
        
        avatar.addEventListener('mouseleave', function() {
            this.style.filter = 'brightness(1) saturate(1)';
        });
    }
    
    // Add click effect for skill tags
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach(tag => {
        tag.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = 'translateY(-3px) scale(1.05)';
            }, 150);
        });
    });
    
    // Placeholder for social media links - you'll need to update these with your actual profiles
    const socialLinks = {
        twitter: '#', // Replace with your X/Twitter profile URL
        tiktok: '#', // Replace with your TikTok profile URL
        github: '#', // Replace with your GitHub profile URL
        reddit: '#', // Replace with your Reddit profile URL
        kofi: '#' // Replace with your Ko-fi profile URL
    };
    
    // Update social links (uncomment and modify as needed)
    /*
    document.querySelector('.twitter').href = socialLinks.twitter;
    document.querySelector('.tiktok').href = socialLinks.tiktok;
    document.querySelector('.github').href = socialLinks.github;
    document.querySelector('.reddit').href = socialLinks.reddit;
    document.querySelector('.kofi').href = socialLinks.kofi;
    */
    
// Konami code Easter egg
let konamiCode = [];
const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA

document.addEventListener('keydown', function(e) {
    konamiCode.push(e.keyCode);

    if (konamiCode.length > konami.length) {
        konamiCode.shift();
    }

    if (konamiCode.join(',') === konami.join(',')) {
        // 🌈 Rainbow animation for body and links
        document.body.style.animation = 'rainbow 2s linear infinite';

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

        // 🐱 Summon Nyancat (fly animation is in CSS)
        summonNyancat();

        // Reset everything after 5 seconds
        setTimeout(() => {
            document.body.style.animation = '';
            if (style.parentNode) style.parentNode.removeChild(style);
            const nyan = document.getElementById("nyancat");
            if (nyan) nyan.remove();
        }, 5000);

        konamiCode = []; // Reset
    }
});

// Nyancat function
function summonNyancat() {
    const nyan = document.createElement("img");
    nyan.src = "https://media.tenor.com/8lR3_1m-i94AAAAi/cat.gif";
    nyan.id = "nyancat";
    document.body.appendChild(nyan);

    setTimeout(() => {
        nyan.remove();
    }, 5000);
}
// Add some utility functions
function updateSocialLink(platform, url) {
    const link = document.querySelector(`.${platform}`);
    if (link) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
}

// Function to add new skill tags dynamically
function addSkillTag(skillName) {
    const skillTags = document.querySelector('.skill-tags');
    const newTag = document.createElement('span');
    newTag.className = 'skill-tag';
    newTag.textContent = skillName;
    
    // Add click effect
    newTag.addEventListener('click', function() {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = 'translateY(-3px) scale(1.05)';
        }, 150);
    });
    
    skillTags.appendChild(newTag);
}
