# opieferd.dev - Personal Website

A modern, responsive personal website showcasing your skills, experience, and social media presence.

## 🚀 Features

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern Aesthetics**: Glassmorphism effects, gradients, and smooth animations
- **Interactive Elements**: Hover effects, typing animation, and click interactions
- **Social Media Integration**: Links to Discord, X (Twitter), TikTok, GitHub, and Reddit
- **Performance Optimized**: Fast loading with efficient CSS and JavaScript
- **Easter Egg**: Hidden Konami code surprise! (↑↑↓↓←→←→BA)

## 📁 Project Structure

```
opieferd-website/
│
├── index.html          # Main HTML file
├── style.css           # CSS styles and animations
├── script.js           # JavaScript functionality
└── README.md           # This file
```

## 🛠️ Setup Instructions

### 1. Customize Your Social Links

Edit the `index.html` file and replace the `#` placeholders in the social links section with your actual profile URLs:

```html
<!-- Update these links with your actual social media profiles -->
<a href="https://discord.gg/your-invite" class="social-link discord">
<a href="https://x.com/your-username" class="social-link twitter">
<a href="https://tiktok.com/@your-username" class="social-link tiktok">
<a href="https://github.com/your-username" class="social-link github">
<a href="https://reddit.com/u/your-username" class="social-link reddit">
```

### 2. Update Your Information

- **About Me Section**: Modify the text in the `<section class="about">` to reflect your personal story
- **Skills**: Add or remove skill tags in the `<div class="skill-tags">` section
- **Tagline**: Update the description under your name in the hero section

### 3. Deploy to GitHub Pages

1. **Create a new repository** on GitHub (name it whatever you'd like)
2. **Upload all files** to the repository
3. **Enable GitHub Pages**:
   - Go to repository Settings
   - Scroll down to "Pages"
   - Select "Deploy from a branch"
   - Choose "main" branch and "/ (root)" folder
   - Save

### 4. Custom Domain Setup (opieferd.dev)

1. **Add a CNAME file** to your repository:
   ```
   opieferd.dev
   ```

2. **Configure DNS** with your domain provider:
   - Add CNAME record: `www` → `your-username.github.io`
   - Add A records for apex domain:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```

3. **Update GitHub Pages settings**:
   - Go to repository Settings → Pages
   - Add your custom domain: `opieferd.dev`
   - Enable "Enforce HTTPS"

## 🎨 Customization Options

### Colors and Theming

The website uses CSS custom properties for easy theming. Main colors are defined in the gradient backgrounds:

```css
/* Main background gradient */
background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);

/* Accent gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Adding New Skills

Use the JavaScript function to dynamically add skills:

```javascript
addSkillTag('Python');
addSkillTag('React');
addSkillTag('Node.js');
```

### Modifying Animations

Adjust animation timing in the CSS:

```css
section {
    animation: fadeInUp 0.8s ease-out forwards;
}
```

## 🔧 Advanced Features

### Social Link Management

Use the JavaScript utility function to update social links:

```javascript
updateSocialLink('github', 'https://github.com/your-username');
updateSocialLink('discord', 'https://discord.gg/your-invite');
```

### Performance Tips

- All animations are CSS-based for optimal performance
- Images are not required (uses CSS gradients and icons)
- Font Awesome icons are loaded from CDN for reliability
- Mobile-first responsive design ensures fast loading on all devices

## 🌐 Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers

## 📱 Mobile Optimization

The website is fully responsive with:
- Flexible grid layouts
- Optimized font sizes
- Touch-friendly interactive elements
- Reduced motion for performance on mobile devices

## 🎮 Easter Eggs

Try entering the Konami code (↑↑↓↓←→←→BA) for a colorful surprise!

## 📝 License

Feel free to use this template for your own personal website. No attribution required, but appreciated!

---

**Built with ❤️ by opieferd**
