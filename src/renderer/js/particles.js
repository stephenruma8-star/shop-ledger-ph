export const AppParticles = (() => {
  const scenes = {
    dashboard:    { color: [96,165,250],   count: 40, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7, repel: true },
    clients:      { color: [251,191,36],   count: 40, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    utang:        { color: [251,146,60],   count: 35, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    transactions: { color: [74,222,128],   count: 45, mode: 'web', speed: 0.35, size: 2.5, opacity: 0.75 },
    inventory:    { color: [45,212,191],   count: 40, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    stocktake:    { color: [52,211,153],   count: 35, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    expenses:     { color: [248,113,113],  count: 35, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    suppliers:    { color: [34,211,238],   count: 35, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    payments:     { color: [192,132,252],  count: 40, mode: 'web', speed: 0.35, size: 2.5, opacity: 0.75 },
    'purchase-orders': { color: [167,139,250], count: 35, mode: 'web', speed: 0.3, size: 2.5, opacity: 0.7 },
    reports:      { color: [129,140,248],  count: 40, mode: 'web', speed: 0.3,  size: 2.5, opacity: 0.7 },
    settings:     { color: [148,163,184],  count: 25, mode: 'web', speed: 0.25, size: 2,   opacity: 0.5 },
  };

  let canvas, ctx, w, h, particles = [], currentScene = null, animId = null;
  const mouse = { x: -1000, y: -1000 };

  function createParticle(scene) {
    return {
      x: Math.random() * (w || 100),
      y: Math.random() * (h || 100),
      vx: 0, vy: 0,
      size: scene.size * (0.6 + Math.random() * 0.4),
      phase: Math.random() * Math.PI * 2,
      life: Math.random() * 100,
      baseX: 0, baseY: 0,
    };
  }

  function resetParticles() {
    if (!currentScene) return;
    particles = [];
    for (let i = 0; i < currentScene.count; i++) particles.push(createParticle(currentScene));
    if (currentScene.mode === 'grid') {
      const cols = Math.ceil(Math.sqrt(currentScene.count * w / (h || 1)));
      const rows = Math.ceil(currentScene.count / cols);
      particles.forEach((p, i) => {
        p.baseX = (i % cols + 0.5) * w / cols;
        p.baseY = (Math.floor(i / cols) + 0.5) * h / rows;
        p.x = p.baseX;
        p.y = p.baseY;
      });
    }
  }

  return {
    init() {
      canvas = document.getElementById('app-particles');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      if (!ctx) return;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      });
      document.addEventListener('mouseleave', () => { mouse.x = -1000; mouse.y = -1000; });
    },

    resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = w;
      canvas.height = h;
    },

    switchScene(route) {
      this.resize();
      const scene = scenes[route] || scenes.dashboard;
      if (currentScene === scene) return;
      currentScene = scene;
      resetParticles();
      if (!animId) {
        const loop = () => {
          animId = requestAnimationFrame(loop);
          if (document.getElementById('app').classList.contains('hidden')) return;
          this.draw();
        };
        animId = requestAnimationFrame(loop);
      }
    },

    draw() {
      if (!ctx || !currentScene || !w || !h) return;
      const scene = currentScene;
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = scene.color;

      for (const p of particles) {
        p.life++;
        this.updateParticle(p, scene);
        this.drawParticle(p, ctx, r, g, b, scene);
      }

      if (scene.mode === 'connected') {
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 130) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / 130) * 0.2})`;
              ctx.stroke();
            }
          }
        }
      }

      if (scene.mode === 'web') {
        const mx = mouse.x, my = mouse.y;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 200) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / 200) * 0.25})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
          const cdx = mx - particles[i].x, cdy = my - particles[i].y;
          const cd = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cd < 250 && cd > 5) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mx, my);
            ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - cd / 250) * 0.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    },

    updateParticle(p, scene) {
      const speed = scene.speed;
      switch (scene.mode) {
        case 'float-up':
          p.vy -= speed * 0.3;
          p.vx += (Math.random() - 0.5) * speed * 0.1;
          break;
        case 'rise':
          p.vy -= speed * 0.35;
          p.vx += Math.sin(p.life * 0.025) * speed * 0.06;
          break;
        case 'web':
          p.vx += (Math.random() - 0.5) * speed * 0.04;
          p.vy += (Math.random() - 0.5) * speed * 0.04;
          break;
        case 'drift':
          p.vx += (Math.random() - 0.5) * speed * 0.12;
          p.vy += (Math.random() - 0.5) * speed * 0.12;
          break;
        case 'fall':
          p.vy += speed * 0.2;
          p.vx += Math.sin(p.life * 0.02) * speed * 0.06;
          break;
        case 'flow':
          p.vx += speed * 0.12;
          p.vy += Math.sin(p.life * 0.03) * speed * 0.08;
          break;
        case 'hover':
          p.vx += (Math.random() - 0.5) * speed * 0.06;
          p.vy += Math.sin(p.life * 0.02) * speed * 0.04;
          break;
        case 'pulse':
          p.vx += (Math.random() - 0.5) * speed * 0.08;
          p.vy += (Math.random() - 0.5) * speed * 0.08;
          p.currentSize = scene.size * (0.5 + 0.5 * Math.sin(p.life * 0.035 + p.phase));
          break;
        case 'orbit': {
          const cx = w / 2, cy = h / 2;
          const dx = p.x - cx, dy = p.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const angle = Math.atan2(dy, dx) + speed * 0.018;
          const targetDist = 40 + (p.phase / (Math.PI * 2)) * Math.min(w, h) * 0.35;
          const nd = dist + (targetDist - dist) * 0.008;
          p.x = cx + Math.cos(angle) * nd;
          p.y = cy + Math.sin(angle) * nd;
          p.x += Math.sin(p.life * 0.015) * 3;
          p.y += Math.cos(p.life * 0.02) * 2;
          return;
        }
        case 'sparkle':
          if (Math.random() < 0.02) { p.vx += (Math.random() - 0.5) * speed * 1.5; p.vy += (Math.random() - 0.5) * speed * 1.5; }
          p.vx *= 0.94; p.vy *= 0.94;
          p.vx += (Math.random() - 0.5) * speed * 0.1;
          p.vy += (Math.random() - 0.5) * speed * 0.1;
          break;
        case 'grid': {
          const dx = p.baseX - p.x, dy = p.baseY - p.y;
          p.vx += dx * 0.005;
          p.vy += dy * 0.005;
          p.vx += (Math.random() - 0.5) * speed * 0.06;
          p.vy += (Math.random() - 0.5) * speed * 0.06;
          break;
        }
        case 'connected':
          p.vx += (Math.random() - 0.5) * speed * 0.1;
          p.vy += (Math.random() - 0.5) * speed * 0.1;
          break;
      }

      p.vx *= 0.96;
      p.vy *= 0.96;

      const mdx = mouse.x - p.x, mdy = mouse.y - p.y;
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mdist < 180 && mdist > 1) {
        const force = (1 - mdist / 180) * 0.04;
        const dir = scene.repel ? -1 : 1;
        p.vx += (mdx / mdist) * force * dir;
        p.vy += (mdy / mdist) * force * dir;
      }

      for (const other of particles) {
        if (other === p) continue;
        const rdx = p.x - other.x, rdy = p.y - other.y;
        const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rdist < 40 && rdist > 1) {
          const repelForce = (1 - rdist / 40) * 0.03;
          p.vx += (rdx / rdist) * repelForce;
          p.vy += (rdy / rdist) * repelForce;
        }
      }

      const maxSp = speed * 2;
      const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (sp > maxSp) { p.vx = (p.vx / sp) * maxSp; p.vy = (p.vy / sp) * maxSp; }

      p.x += p.vx;
      p.y += p.vy;

      if (scene.mode !== 'grid' && scene.mode !== 'orbit') {
        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;
        if (p.y < -30) p.y = h + 30;
        if (p.y > h + 30) p.y = -30;
      }
    },

    drawParticle(p, ctx, r, g, b, scene) {
      const size = p.currentSize || scene.size * (0.6 + 0.4 * Math.sin(p.life * 0.04 + p.phase) * 0.3 + 0.7);
      const alpha = scene.opacity * (0.6 + 0.4 * Math.sin(p.life * 0.015 + p.phase));
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
      if (scene.glow && size > 1.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.2})`;
        ctx.fill();
      }
    },
  };
})();


// expose top-level bindings as globals (inline onclick handlers and legacy code paths rely on them)
Object.defineProperties(window, {
  AppParticles: { get: () => AppParticles, configurable: true }
});
