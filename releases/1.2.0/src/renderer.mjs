import { CONFIG, ENEMIES } from './config.mjs';
import { random } from './core.mjs';
import { SpaceArt } from './space-art.mjs';
import { getViewMetrics } from './view.mjs';

const TAU = Math.PI * 2;
const LIME = '#d4f97b';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');
    this.width = 0;
    this.height = 0;
    this.camera = { x: CONFIG.worldWidth / 2, y: CONFIG.worldHeight / 2 };
    this.particles = [];
    this.rings = [];
    this.trail = [];
    this.damageIndicators = [];
    this.shake = 0;
    this.flash = 0;
    this.motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.spaceArt = new SpaceArt();
    this.shipyard = null;
    document.body.dataset.visualMode = 'preparing';
    import('./shipyard.mjs')
      .then(async ({ Shipyard }) => {
        const shipyard = await new Shipyard().prepare();
        this.shipyard = shipyard;
        document.body.dataset.visualMode = '3d-sprites';
        document.body.dataset.artBakeMs = String(shipyard.metrics.bakeMs);
      })
      .catch(() => {
        // Unsupported WebGL keeps the complete Canvas game playable.
        document.body.dataset.visualMode = 'canvas-fallback';
      });
    const rng = random(4201);
    this.stars = Array.from({ length: 180 }, () => ({
      x: rng(),
      y: rng(),
      r: rng() > 0.95 ? 1.7 : 0.5 + rng() * 0.6,
      a: 0.12 + rng() * 0.55,
    }));
    this.rocks = Array.from({ length: 26 }, () => ({
      x: rng() * CONFIG.worldWidth,
      y: rng() * CONFIG.worldHeight,
      r: 15 + rng() * 42,
      angle: rng() * TAU,
      edges: 5 + Math.floor(rng() * 3),
    }));
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.width === width && this.height === height && this.dpr === dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  reset() {
    this.particles.length = this.trail.length = this.rings.length = 0;
    this.damageIndicators.length = 0;
    this.shake = this.flash = 0;
    this.camera = { x: CONFIG.worldWidth / 2, y: CONFIG.worldHeight / 2 };
  }

  events(events) {
    for (const event of events) {
      if (event.type === 'kill') {
        this.burst(event.x, event.y, event.color, event.boss ? 75 : 15);
        this.rings.push({
          x: event.x,
          y: event.y,
          radius: event.boss ? 170 : 48,
          life: event.boss ? 0.85 : 0.35,
          max: event.boss ? 0.85 : 0.35,
          color: event.color,
        });
        this.shake = Math.max(this.shake, event.boss ? 12 : 1.5);
        if (event.boss) this.shake = 12;
      }
      if (event.type === 'impact') this.burst(event.x, event.y, '#e1f7ff', 4);
      if (event.type === 'damage') {
        this.shake = 8;
        this.flash = 0.18;
        if (Number.isFinite(event.sourceAngle))
          this.damageIndicators.push({ angle: event.sourceAngle, life: 0.8 });
        this.burst(event.x, event.y, '#ff7863', 20);
      }
      if (event.type === 'dash') {
        this.rings.push({ x: event.x, y: event.y, radius: 75, life: 0.4, max: 0.4, color: LIME });
      }
      if (event.type === 'nova') {
        this.rings.push({ ...event, life: 0.6, max: 0.6, color: '#b7c7ff' });
        this.shake = 3;
      }
    }
  }

  burst(x, y, color, count) {
    for (let i = 0; i < count && this.particles.length < 450; i++) {
      const angle = Math.random() * TAU;
      const speed = 40 + Math.random() * 170;
      const life = 0.2 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        color,
        size: 1.5 + Math.random() * 2.5,
        angle,
        spin: (Math.random() - 0.5) * 7,
      });
    }
  }

  backdrop(time, home) {
    const c = this.ctx,
      w = this.width,
      h = this.height;
    this.spaceArt.drawSky(c, w, h);
    if (!home)
      this.spaceArt.drawPlanet(
        c,
        w * 0.83 + (CONFIG.worldWidth / 2 - this.camera.x) * 0.09,
        h * 0.23 + (CONFIG.worldHeight / 2 - this.camera.y) * 0.07,
        Math.min(w, h) * 0.52,
        0.13,
      );
    for (const star of this.stars) {
      const x = (((star.x * w - this.camera.x * star.r * 0.04) % w) + w) % w;
      const y = (((star.y * h - this.camera.y * star.r * 0.04) % h) + h) % h;
      c.fillStyle = `rgba(225,239,207,${star.a})`;
      c.fillRect(x, y, star.r, star.r);
      if (star.r > 1.5) {
        c.fillStyle = '#b0c7a340';
        c.fillRect(x - 3, y + 0.5, 7, 0.5);
        c.fillRect(x + 0.5, y - 3, 0.5, 7);
      }
    }
    if (home) this.heroArt(this.motion ? time : 0);
  }

  heroArt(time) {
    const c = this.ctx,
      w = this.width,
      h = this.height,
      mobile = w < 760;
    const cx = w * 0.73,
      cy = h * (mobile ? 0.54 : 0.5);
    const radius = Math.min(w * (mobile ? 0.49 : 0.25), h * 0.3);
    this.spaceArt.drawPlanet(c, cx + radius * 0.23, cy - radius * 0.18, radius, 1, true);
    const shade = c.createLinearGradient(0, 0, w * (mobile ? 0.92 : 0.7), 0);
    shade.addColorStop(0, '#0c1211ee');
    shade.addColorStop(mobile ? 0.55 : 0.48, '#0c1211aa');
    shade.addColorStop(1, '#0c121100');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = '#bad4df17';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(0, 0, radius * 1.9, radius * 1.43, -0.32, 0, TAU);
    c.stroke();
    const craftSize = radius * (mobile ? 1.55 : 1.95);
    const craftX = -radius * (mobile ? 0.3 : 0.44),
      craftY = radius * (mobile ? 0.14 : 0.44) + Math.sin(time * 0.62) * 8;
    this.spaceArt.glow(c, craftX - radius * 0.28, craftY + radius * 0.13, radius * 0.8, 0.15);
    if (this.shipyard?.ready) {
      c.save();
      c.translate(craftX, craftY);
      c.rotate(-0.22);
      c.shadowColor = '#00000066';
      c.shadowBlur = 22;
      c.shadowOffsetY = 12;
      this.shipyard.draw(c, 'player', 0, 0, 0, craftSize, true);
      c.restore();
    } else if (document.body.dataset.visualMode === 'canvas-fallback')
      this.ship(craftX, craftY, -0.32, craftSize / 95, true, time);
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.43 + 0.4;
      const r = radius * (i % 2 ? 1.54 : 1.2);
      this.asteroid(
        Math.cos(angle) * r,
        Math.sin(angle) * r * 0.75,
        8 + i * 3,
        angle + time * 0.015,
        6,
      );
    }
    if (!mobile) {
      c.font = '10px ui-monospace,monospace';
      c.fillStyle = '#a2b7b3';
      c.fillText('KESTREL—01 / INTERCEPTOR', -radius * 0.72, radius * 1.01);
      c.fillText('THE QUIET BELT / SECTOR 07', radius * 0.15, -radius * 0.96);
      c.strokeStyle = '#b5d9bd55';
      c.beginPath();
      c.moveTo(-radius * 0.72, radius * 0.94);
      c.lineTo(-radius * 0.5, radius * 0.74);
      c.stroke();
      c.fillStyle = LIME;
      c.fillRect(-radius * 0.51, radius * 0.73, 3, 3);
    }
    c.restore();
  }

  asteroid(x, y, radius, angle, edges) {
    const c = this.ctx;
    if (this.shipyard?.ready) {
      this.shipyard.draw(c, 'asteroid', x, y, angle, radius * 4.1);
      return;
    }
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.beginPath();
    for (let i = 0; i < edges; i++) {
      const a = (i / edges) * TAU;
      const r = radius * (i % 2 ? 0.82 : 1);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = '#23322a';
    c.fill();
    c.strokeStyle = '#4d6046';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.moveTo(-radius * 0.7, -radius * 0.4);
    c.lineTo(0, radius * 0.25);
    c.lineTo(radius * 0.7, radius * 0.2);
    c.strokeStyle = '#485b3f';
    c.stroke();
    c.restore();
  }

  ship(x, y, angle, scale = 1, home = false, time = 0) {
    const c = this.ctx;
    if (this.shipyard?.ready) {
      if (!home) {
        c.save();
        c.translate(x, y);
        c.rotate(angle);
        c.scale(scale, scale);
        for (const offset of [-9, 9]) {
          const length = 21 + Math.sin(time * 33 + offset) * 3;
          const glow = c.createLinearGradient(-20, 0, -20 - length, 0);
          glow.addColorStop(0, '#efffff');
          glow.addColorStop(0.15, '#baf3ffdd');
          glow.addColorStop(0.45, '#65cfff66');
          glow.addColorStop(1, '#44aaff00');
          c.fillStyle = glow;
          c.beginPath();
          c.moveTo(-20, offset - 2.5);
          c.lineTo(-20 - length, offset);
          c.lineTo(-20, offset + 2.5);
          c.fill();
        }
        c.restore();
      }
      c.save();
      c.shadowColor = '#00000088';
      c.shadowBlur = home ? 22 : 6;
      c.shadowOffsetY = home ? 12 : 3;
      this.shipyard.draw(c, 'player', x, y, angle, CONFIG.playerSpriteSize * scale, home);
      c.restore();
      return;
    }
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(scale, scale);
    c.shadowColor = '#d4f97b66';
    c.shadowBlur = home ? 16 : 10;
    c.fillStyle = '#e0fca3';
    c.beginPath();
    c.moveTo(-16, -4);
    c.lineTo(-29 - Math.sin(time * 29) * 6, 0);
    c.lineTo(-16, 4);
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.moveTo(30, 0);
    c.lineTo(-20, -20);
    c.lineTo(-12, -4);
    c.lineTo(-19, 0);
    c.lineTo(-12, 4);
    c.lineTo(-20, 20);
    c.closePath();
    c.fillStyle = '#c9d3bb';
    c.fill();
    c.strokeStyle = '#f0f4de';
    c.lineWidth = 0.85;
    c.stroke();
    c.beginPath();
    c.moveTo(30, 0);
    c.lineTo(-12, 4);
    c.lineTo(-20, 20);
    c.closePath();
    c.fillStyle = '#62775b';
    c.fill();
    c.beginPath();
    c.moveTo(30, 0);
    c.lineTo(-10, -4);
    c.lineTo(-13, 0);
    c.lineTo(-10, 4);
    c.closePath();
    c.fillStyle = '#22372d';
    c.fill();
    c.beginPath();
    c.moveTo(11, 0);
    c.lineTo(-3, -3);
    c.lineTo(-7, 0);
    c.lineTo(-3, 3);
    c.closePath();
    c.fillStyle = LIME;
    c.fill();
    c.fillStyle = '#182b21';
    c.fillRect(-10, -13, 7, 2);
    c.fillRect(-10, 11, 7, 2);
    c.restore();
  }

  enemy(enemy, time) {
    const c = this.ctx,
      spec = ENEMIES[enemy.kind],
      r = enemy.radius;
    if (this.shipyard?.ready) {
      const size = r * (enemy.kind === 'boss' ? 3.15 : CONFIG.enemySpriteScale);
      c.save();
      c.shadowColor = spec.color + '55';
      c.shadowBlur = 5;
      c.shadowOffsetY = 3;
      this.shipyard.draw(c, enemy.kind, enemy.x, enemy.y, enemy.angle, size);
      c.restore();
      if (enemy.flash > 0) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.65;
        this.shipyard.draw(c, enemy.kind, enemy.x, enemy.y, enemy.angle, size);
        c.restore();
      }
      if (enemy.kind === 'boss') {
        const a = enemy.angle,
          x = enemy.x - Math.cos(a) * r * 0.76,
          y = enemy.y - Math.sin(a) * r * 0.76;
        this.spaceArt.glow(c, x, y, 90, 0.16 + 0.04 * Math.sin(time * 4));
      }
      if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
        c.fillStyle = '#18252a';
        c.fillRect(enemy.x - r, enemy.y - r - 12, r * 2, 2);
        c.fillStyle = spec.color;
        c.fillRect(enemy.x - r, enemy.y - r - 12, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 2);
      }
      return;
    }
    c.save();
    c.translate(enemy.x, enemy.y);
    c.rotate(enemy.kind === 'boss' ? time * 0.3 : enemy.angle);
    c.lineWidth = 1.6;
    c.fillStyle = enemy.flash > 0 ? '#f1f6df' : '#1e2422';
    c.strokeStyle = spec.color;
    c.shadowColor = spec.color + '66';
    c.shadowBlur = 7;
    c.beginPath();
    if (enemy.kind === 'scout' || enemy.kind === 'hunter') {
      c.moveTo(r + 4, 0);
      c.lineTo(-r, -r * 0.8);
      c.lineTo(-r * 0.38, 0);
      c.lineTo(-r, r * 0.8);
    } else {
      const n = enemy.kind === 'boss' ? 8 : enemy.kind === 'tank' ? 6 : 4;
      for (let i = 0; i < n; i++)
        c.lineTo(Math.cos((i * TAU) / n) * r, Math.sin((i * TAU) / n) * r);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(0, 0, r * 0.28, 0, TAU);
    c.fillStyle = spec.color;
    c.fill();
    if (enemy.kind === 'boss') {
      c.beginPath();
      c.arc(0, 0, r * 0.66, 0, TAU);
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        c.fillRect(Math.cos(a) * r - 4, Math.sin(a) * r - 4, 8, 8);
      }
    }
    c.restore();
    if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
      c.fillStyle = '#3b4740';
      c.fillRect(enemy.x - r, enemy.y - r - 9, r * 2, 2);
      c.fillStyle = spec.color;
      c.fillRect(enemy.x - r, enemy.y - r - 9, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 2);
    }
  }

  frame(game, time, dt) {
    this.resize();
    const c = this.ctx,
      w = this.width,
      h = this.height;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (game) {
      this.camera.x = game.camera.x;
      this.camera.y = game.camera.y;
    }
    this.backdrop(time, !game);
    if (!game) return;
    const activeDt = game.status === 'playing' ? dt : 0;
    const scale = getViewMetrics(w, h).scale;
    const p = game.player;
    c.save();
    const shake = this.motion ? this.shake : 0;
    c.translate(w / 2 + Math.sin(time * 83) * shake, h / 2 + Math.cos(time * 91) * shake);
    c.scale(scale, scale);
    c.translate(-this.camera.x, -this.camera.y);
    // Navigable field. These rings and rocks are scenery, not collision geometry.
    c.strokeStyle = '#8baf6709';
    c.lineWidth = 1;
    const grid = 120;
    const left = this.camera.x - w / scale / 2,
      top = this.camera.y - h / scale / 2;
    for (let x = Math.floor(left / grid) * grid; x < left + w / scale; x += grid) {
      for (let y = Math.floor(top / grid) * grid; y < top + h / scale; y += grid) {
        c.beginPath();
        c.moveTo(x - 3, y);
        c.lineTo(x + 3, y);
        c.moveTo(x, y - 3);
        c.lineTo(x, y + 3);
        c.stroke();
      }
    }
    c.save();
    c.globalAlpha = 0.12;
    for (const rock of this.rocks) this.asteroid(rock.x, rock.y, rock.r, rock.angle, rock.edges);
    c.restore();
    for (const radius of [420, 800, 1180]) {
      c.beginPath();
      c.arc(CONFIG.worldWidth / 2, CONFIG.worldHeight / 2, radius, 0, TAU);
      c.strokeStyle = '#a0ba7910';
      c.lineWidth = 1;
      c.stroke();
    }
    c.strokeStyle = '#f4b66f66';
    c.setLineDash([12, 12]);
    c.strokeRect(20, 20, CONFIG.worldWidth - 40, CONFIG.worldHeight - 40);
    c.setLineDash([]);
    c.font = '11px ui-monospace, monospace';
    c.fillStyle = '#a0b08933';
    c.fillText(
      'SECTOR 07  /  THE QUIET BELT',
      CONFIG.worldWidth / 2 - 120,
      CONFIG.worldHeight / 2 - 260,
    );

    for (const orb of game.orbs) {
      c.save();
      c.translate(orb.x, orb.y);
      c.rotate(Math.PI / 4);
      c.shadowColor = orb.heal ? '#ff8b78' : LIME;
      c.shadowBlur = 8;
      c.fillStyle = orb.heal ? '#ff8b78' : LIME;
      c.fillRect(-4.5, -4.5, 9, 9);
      c.shadowBlur = 0;
      c.fillStyle = '#f8ffe7';
      c.beginPath();
      c.moveTo(-4.5, -4.5);
      c.lineTo(4.5, -4.5);
      c.lineTo(-4.5, 4.5);
      c.fill();
      c.restore();
    }
    for (const ring of this.rings) {
      ring.life -= activeDt;
      const progress = 1 - ring.life / ring.max;
      c.beginPath();
      c.arc(ring.x, ring.y, Math.max(0, ring.radius * progress), 0, TAU);
      c.globalAlpha = Math.max(0, 1 - progress);
      c.strokeStyle = ring.color;
      c.lineWidth = 3;
      c.stroke();
      c.globalAlpha = 1;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    if (activeDt && (!this.trail.length || distanceSquared(p, this.trail.at(-1)) > 9))
      this.trail.push({ x: p.x, y: p.y, life: 0.35, dash: p.dashLeft > 0 });
    for (const dot of this.trail) dot.life -= activeDt;
    this.trail = this.trail.filter((dot) => dot.life > 0);
    if (this.trail.length > 1) {
      const first = this.trail[0],
        last = this.trail.at(-1),
        isDash = this.trail.some((dot) => dot.dash);
      const gradient = c.createLinearGradient(first.x, first.y, last.x, last.y);
      gradient.addColorStop(0, isDash ? '#d4f97b00' : '#9fddff00');
      gradient.addColorStop(1, isDash ? '#d4f97b60' : '#9fddff40');
      c.save();
      c.strokeStyle = gradient;
      c.lineWidth = isDash ? 10 : 2.5;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(first.x, first.y);
      for (const dot of this.trail.slice(1)) c.lineTo(dot.x, dot.y);
      c.stroke();
      c.restore();
    }
    for (const bullet of game.bullets) {
      c.beginPath();
      c.moveTo(bullet.x, bullet.y);
      c.lineTo(bullet.x - Math.cos(bullet.angle) * 19, bullet.y - Math.sin(bullet.angle) * 19);
      c.strokeStyle = '#bcf78b33';
      c.lineWidth = 8;
      c.stroke();
      c.strokeStyle = '#d4ff9e';
      c.lineWidth = 2.5;
      c.stroke();
      c.fillStyle = '#fcffe8';
      c.beginPath();
      c.arc(bullet.x, bullet.y, 2.2, 0, TAU);
      c.fill();
    }
    for (const bullet of game.hostileBullets) {
      c.beginPath();
      c.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      c.fillStyle = '#ff786366';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = '#ffac8b';
      c.stroke();
      c.beginPath();
      c.arc(bullet.x, bullet.y, bullet.radius * 0.35, 0, TAU);
      c.fillStyle = '#fff0c7';
      c.fill();
    }
    for (const enemy of game.enemies) if (enemy.alive) this.enemy(enemy, game.time);
    if (p.orbitCount) {
      c.beginPath();
      c.arc(p.x, p.y, 90, 0, TAU);
      c.strokeStyle = '#b7c7ff30';
      c.lineWidth = 1;
      c.stroke();
      for (let i = 0; i < p.orbitCount; i++) {
        const a = game.time * 2.6 + (i * TAU) / p.orbitCount;
        const x = p.x + Math.cos(a) * 90,
          y = p.y + Math.sin(a) * 90;
        if (this.shipyard?.ready) this.shipyard.draw(c, 'gunner', x, y, a, 25);
        else {
          c.save();
          c.translate(x, y);
          c.rotate(a + Math.PI / 4);
          c.fillStyle = '#b7c7ff';
          c.fillRect(-6, -6, 12, 12);
          c.restore();
        }
      }
    }
    if (p.invulnerable > 0) {
      c.beginPath();
      c.arc(p.x, p.y, 36 + Math.sin(time * 7) * 2, 0, TAU);
      c.strokeStyle = p.dashLeft > 0 ? '#d4f97baa' : '#c0e8d355';
      c.lineWidth = 1.5;
      c.stroke();
    }
    c.globalAlpha = p.invulnerable > 0 && Math.sin(time * 22) < 0 ? 0.65 : 1;
    this.ship(p.x, p.y, p.angle, 0.87, false, game.time);
    c.globalAlpha = 1;
    for (const indicator of this.damageIndicators) {
      indicator.life -= activeDt;
      c.save();
      c.globalAlpha = Math.max(0, indicator.life / 0.8);
      c.strokeStyle = '#ff9d80';
      c.lineWidth = 4 / scale;
      c.beginPath();
      c.arc(p.x, p.y, 44 / scale, indicator.angle - 0.45, indicator.angle + 0.45);
      c.stroke();
      c.restore();
    }
    this.damageIndicators = this.damageIndicators.filter((indicator) => indicator.life > 0);
    for (const particle of this.particles) {
      particle.life -= activeDt;
      particle.x += particle.vx * activeDt;
      particle.y += particle.vy * activeDt;
      c.globalAlpha = Math.max(0, particle.life / particle.max);
      particle.angle += particle.spin * activeDt;
      c.save();
      c.translate(particle.x, particle.y);
      c.rotate(particle.angle);
      c.fillStyle = particle.color;
      c.fillRect(-particle.size, -particle.size * 0.3, particle.size * 2, particle.size * 0.6);
      c.restore();
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    c.globalAlpha = 1;
    c.restore();
    // A visible boss bearing prevents narrow screens from hiding the objective.
    const boss = game.enemies.find((e) => e.kind === 'boss' && e.alive);
    if (boss) {
      const bx = (boss.x - this.camera.x) * scale,
        by = (boss.y - this.camera.y) * scale;
      if (Math.abs(bx) > w / 2 - 65 || Math.abs(by) > h / 2 - 100) {
        const k = Math.min(
          (w / 2 - 42) / Math.max(1, Math.abs(bx)),
          (h / 2 - 130) / Math.max(1, Math.abs(by)),
        );
        const x = w / 2 + bx * k,
          y = h / 2 + by * k;
        c.save();
        c.translate(x, y);
        c.rotate(Math.atan2(by, bx));
        c.fillStyle = '#ff9d84';
        c.beginPath();
        c.moveTo(12, 0);
        c.lineTo(-7, -7);
        c.lineTo(-7, 7);
        c.fill();
        c.restore();
        c.fillStyle = '#ff9d84';
        c.font = '10px ui-monospace, monospace';
        c.textAlign = 'center';
        c.fillText('母舰', x, y + 23);
        c.textAlign = 'left';
      }
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(255,83,62,${this.flash * 0.32})`;
      c.fillRect(0, 0, w, h);
    }
    this.shake = Math.max(0, this.shake - activeDt * 30);
    this.flash = Math.max(0, this.flash - activeDt);
  }
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
