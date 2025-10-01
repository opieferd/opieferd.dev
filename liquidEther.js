// LiquidEther effect for vanilla JS, adapted from React version
// Requires: Three.js (see instructions above)
// Usage: initLiquidEther(document.querySelector('.liquid-ether-container'), { ...options });

(function () {
  // --- CONFIG ---
  const defaultOptions = {
    mouseForce: 20,
    cursorSize: 100,
    isViscous: false,
    viscous: 30,
    iterationsViscous: 32,
    iterationsPoisson: 32,
    dt: 0.014,
    BFECC: true,
    resolution: 0.5,
    isBounce: false,
    colors: ['#5227FF', '#FF9FFC', '#B19EEF'],
    autoDemo: true,
    autoSpeed: 0.5,
    autoIntensity: 2.2,
    takeoverDuration: 0.25,
    autoResumeDelay: 1000,
    autoRampDuration: 0.6,
    style: {}
  };

  // --- UTILS ---
  function makePaletteTexture(colors) {
    // Uses THREE.DataTexture to create a palette from color stops
    const arr = colors.length === 1 ? [colors[0], colors[0]] : colors;
    const w = arr.length;
    const data = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
      const c = new THREE.Color(arr[i]);
      data[i * 4 + 0] = Math.round(c.r * 255);
      data[i * 4 + 1] = Math.round(c.g * 255);
      data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // --- MAIN ---
  window.initLiquidEther = function (container, opts = {}) {
    if (!container) return;
    const options = Object.assign({}, defaultOptions, opts);
    const paletteTex = makePaletteTexture(options.colors);
    const bgVec4 = new THREE.Vector4(0, 0, 0, 0); // always transparent

    // -- Common --
    const Common = {
      width: 0,
      height: 0,
      aspect: 1,
      pixelRatio: 1,
      renderer: null,
      clock: null,
      resize: function () {
        const rect = container.getBoundingClientRect();
        this.width = Math.max(1, Math.floor(rect.width));
        this.height = Math.max(1, Math.floor(rect.height));
        this.aspect = this.width / this.height;
        if (this.renderer) this.renderer.setSize(this.width, this.height, false);
      },
      init: function () {
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.resize();
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new THREE.Color(0x000000), 0);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.clock = new THREE.Clock();
        this.clock.start();
        container.prepend(this.renderer.domElement);
      },
      update: function () {
        this.delta = this.clock.getDelta();
        this.time = (this.time || 0) + this.delta;
      }
    };

    // -- Mouse --
    const Mouse = {
      coords: new THREE.Vector2(),
      coords_old: new THREE.Vector2(),
      diff: new THREE.Vector2(),
      mouseMoved: false,
      timer: null,
      isHoverInside: false,
      hasUserControl: false,
      setCoords: function (x, y) {
        if (this.timer) clearTimeout(this.timer);
        const rect = container.getBoundingClientRect();
        const nx = (x - rect.left) / rect.width;
        const ny = (y - rect.top) / rect.height;
        this.coords.set(nx * 2 - 1, -(ny * 2 - 1));
        this.mouseMoved = true;
        this.timer = setTimeout(() => { this.mouseMoved = false; }, 100);
      },
      update: function () {
        this.diff.subVectors(this.coords, this.coords_old);
        this.coords_old.copy(this.coords);
        if (this.coords_old.x === 0 && this.coords_old.y === 0) this.diff.set(0, 0);
      }
    };

    container.addEventListener('mousemove', e => {
      Mouse.setCoords(e.clientX, e.clientY);
      Mouse.hasUserControl = true;
    });
    container.addEventListener('mouseenter', () => Mouse.isHoverInside = true);
    container.addEventListener('mouseleave', () => Mouse.isHoverInside = false);

    // -- Shaders --
    const face_vert = `
      attribute vec3 position;
      uniform vec2 px;
      uniform vec2 boundarySpace;
      varying vec2 uv;
      precision highp float;
      void main(){
        vec3 pos = position;
        vec2 scale = 1.0 - boundarySpace * 2.0;
        pos.xy = pos.xy * scale;
        uv = vec2(0.5)+(pos.xy)*0.5;
        gl_Position = vec4(pos, 1.0);
      }
    `;
    const color_frag = `
      precision highp float;
      uniform sampler2D velocity;
      uniform sampler2D palette;
      uniform vec4 bgColor;
      varying vec2 uv;
      void main(){
        vec2 vel = texture2D(velocity, uv).xy;
        float lenv = clamp(length(vel), 0.0, 1.0);
        vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
        vec3 outRGB = mix(bgColor.rgb, c, lenv);
        float outA = mix(bgColor.a, 1.0, lenv);
        gl_FragColor = vec4(outRGB, outA);
      }
    `;
    // ... (add other shader strings as needed, see your React code)

    // -- Output --
    class Output {
      constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.Camera();
        this.output = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.RawShaderMaterial({
            vertexShader: face_vert,
            fragmentShader: color_frag,
            transparent: true,
            depthWrite: false,
            uniforms: {
              velocity: { value: null }, // TODO: connect velocity texture from simulation
              boundarySpace: { value: new THREE.Vector2() },
              palette: { value: paletteTex },
              bgColor: { value: bgVec4 }
            }
          })
        );
        this.scene.add(this.output);
      }
      render() {
        Common.renderer.setRenderTarget(null);
        Common.renderer.render(this.scene, this.camera);
      }
    }

    // -- MAIN LOOP --
    Common.init();
    const output = new Output();
    function animate() {
      Mouse.update();
      Common.update();
      output.render();
      requestAnimationFrame(animate);
    }
    animate();

    // -- Resize Observer --
    window.addEventListener('resize', () => Common.resize());
    // You may want to add IntersectionObserver for pausing if offscreen, see your React code.
  };
})();
