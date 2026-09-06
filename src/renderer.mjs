import { CONFIG, ENEMIES } from './config.mjs';
import { clamp, random } from './core.mjs';

const TAU = Math.PI * 2;
const LIME = '#d4f97b';
const INK = '#101815';

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
    this.shake = 0;
    this.flash = 0;
    this.motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rng = random(4201);
    this.stars = Array.from({ length: 180 }, () => ({
      x: rng(), y: rng(), r: rng() > 0.95 ? 1.7 : 0.5 + rng() * 0.6, a: 0.12 + rng() * 0.55,
    }));
    this.rocks = Array.from({ length: 26 }, () => ({
      x: rng() * CONFIG.worldWidth, y: rng() * CONFIG.worldHeight,
      r: 15 + rng() * 42, angle: rng() * TAU, edges: 5 + Math.floor(rng() * 3),
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
    this.shake = this.flash = 0;
    this.camera = { x: CONFIG.worldWidth / 2, y: CONFIG.worldHeight / 2 };
  }

  events(events) {
    for (const event of events) {
      if (event.type === 'kill') {
        this.burst(event.x, event.y, event.color, event.boss ? 75 : 15);
        if (event.boss) this.shake = 12;
      }
      if (event.type === 'damage') { this.shake = 8; this.flash = 0.28; this.burst(event.x, event.y, '#ff7863', 20); }
      if (event.type === 'dash') { this.rings.push({ x: event.x, y: event.y, radius: 75, life: 0.4, max: 0.4, color: LIME }); }
      if (event.type === 'nova') { this.rings.push({ ...event, life: 0.6, max: 0.6, color: '#b7c7ff' }); this.shake = 3; }
    }
  }

  burst(x, y, color, count) {
    for (let i = 0; i < count && this.particles.length < 450; i++) {
      const angle = Math.random() * TAU;
      const speed = 40 + Math.random() * 170;
      const life = 0.2 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, max: life, color, size: 1.5 + Math.random() * 2.5 });
    }
  }

  backdrop(time, home) {
    const c = this.ctx, w = this.width, h = this.height;
    c.fillStyle = '#0c1211';
    c.fillRect(0, 0, w, h);
    const nebula = c.createRadialGradient(w * (home ? 0.72 : 0.6), h * 0.44, 0, w * 0.65, h * 0.4, w * 0.7);
    nebula.addColorStop(0, home ? '#27392b' : '#152721');
    nebula.addColorStop(0.45, '#141f1a');
    nebula.addColorStop(1, '#0c1211');
    c.fillStyle = nebula;
    c.fillRect(0, 0, w, h);
    for (const star of this.stars) {
      const x = ((star.x * w - this.camera.x * star.r * 0.04) % w + w) % w;
      const y = ((star.y * h - this.camera.y * star.r * 0.04) % h + h) % h;
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
    const c = this.ctx, w = this.width, h = this.height;
    const mobile = w < 760;
    const cx = w * (mobile ? 0.67 : 0.71), cy = h * (mobile ? 0.54 : 0.45);
    const size = Math.min(w * (mobile ? 0.48 : 0.31), h * 0.43);
    c.save();
    c.translate(cx, cy);
    // An engraved orbital chart sits behind the spacecraft.
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(0, 0, size * (0.63 + i * 0.2), size * (0.39 + i * 0.15), -0.42, 0, TAU);
      c.strokeStyle = i === 2 ? '#d4f97b35' : '#9aaa811a';
      c.lineWidth = 1;
      c.stroke();
    }
    c.save();
    c.rotate(-0.4);
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * TAU;
      const r = size * 1.035;
      c.beginPath();
      c.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.78);
      c.lineTo(Math.cos(a) * (r + (i % 5 ? 4 : 10)), Math.sin(a) * (r + (i % 5 ? 4 : 10)) * 0.78);
      c.strokeStyle = i % 5 ? '#9aa8812b' : '#a6bd8f55';
      c.stroke();
    }
    c.restore();
    // Lit, stippled planet: generated entirely with Canvas, no image dependencies.
    const px = size * 0.18, py = -size * 0.04, pr = size * 0.63;
    c.save();
    c.beginPath(); c.arc(px, py, pr, 0, TAU); c.clip();
    const planet = c.createRadialGradient(px - pr * 0.5, py - pr * 0.55, 0, px + pr * 0.1, py + pr * 0.05, pr * 1.5);
    planet.addColorStop(0, '#658066'); planet.addColorStop(0.4, '#344d3b');
    planet.addColorStop(0.7, '#16291f'); planet.addColorStop(1, '#0b1511');
    c.fillStyle = planet; c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    for (let i = 0; i < 20; i++) {
      const y = py - pr + i / 20 * pr * 2;
      c.beginPath();
      c.ellipse(px + Math.sin(i * 2) * 30, y, pr * 1.3, 14 + i % 4 * 6, -0.31, 0, TAU);
      c.strokeStyle = i % 3 ? '#acc4920b' : '#a4c99012'; c.lineWidth = 8; c.stroke();
    }
    c.restore();
    c.beginPath(); c.arc(px, py, pr + 1, 0.7 * Math.PI, 1.9 * Math.PI);
    c.strokeStyle = '#bfd79d66'; c.lineWidth = 1.5; c.stroke();
    c.save();
    c.rotate(-0.43);
    c.beginPath(); c.ellipse(0, 0, size * 1.15, size * 0.31, 0, 0, Math.PI);
    c.strokeStyle = '#899a6c'; c.lineWidth = 13; c.stroke();
    c.beginPath(); c.ellipse(0, 0, size * 1.15 + 11, size * 0.31 + 5, 0, 0, Math.PI);
    c.strokeStyle = '#d4f97b66'; c.lineWidth = 1; c.stroke();
    c.restore();
    const shipX = -size * 0.2, shipY = size * 0.2 + Math.sin(time * 0.6) * 9;
    c.save();
    c.translate(shipX, shipY);
    c.rotate(-0.38);
    const flame = c.createLinearGradient(-size * 0.85, 0, 0, 0);
    flame.addColorStop(0, '#d4f97b00'); flame.addColorStop(0.65, '#d4f97b38'); flame.addColorStop(1, '#d4f97bcc');
    c.fillStyle = flame;
    c.beginPath(); c.moveTo(-size * 0.95, 5); c.lineTo(-25, -14); c.lineTo(-25, 14); c.closePath(); c.fill();
    this.ship(0, 0, 0, size / 80, true, time);
    c.restore();
    for (let i = 0; i < 6; i++) {
      const a = i * 1.13 + 0.13 * Math.sin(time * 0.12);
      const r = size * (i % 2 ? 1.18 : 0.89);
      this.asteroid(Math.cos(a) * r, Math.sin(a) * r * 0.65, 8 + i * 2.5, a + time * 0.03, 5);
    }
    c.font = '10px ui-monospace, monospace'; c.fillStyle = '#a6b19a';
    if (!mobile) {
      c.fillText('KESTREL—01', -size * 0.56, size * 0.64);
      c.fillText('轨道高度  /  384,400 KM', size * 0.29, -size * 0.67);
      c.strokeStyle = '#a6b19a55'; c.beginPath();
      c.moveTo(-size * 0.55, size * 0.59); c.lineTo(-size * 0.35, size * 0.41); c.stroke();
      c.fillStyle = LIME; c.fillRect(-size * 0.36, size * 0.40, 3, 3);
    }
    c.restore();
    // Keep the reading area quiet without dimming the illustrated side.
    const shade = c.createLinearGradient(0, 0, w * 0.7, 0);
    shade.addColorStop(0, '#0c1211d9'); shade.addColorStop(0.5, '#0c121188'); shade.addColorStop(1, '#0c121100');
    c.fillStyle = shade; c.fillRect(0, 0, w, h);
  }

  asteroid(x, y, radius, angle, edges) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(angle);
    c.beginPath();
    for (let i = 0; i < edges; i++) {
      const a = i / edges * TAU;
      const r = radius * (i % 2 ? 0.82 : 1);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = '#23322a'; c.fill(); c.strokeStyle = '#4d6046'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(-radius * 0.7, -radius * 0.4); c.lineTo(0, radius * 0.25); c.lineTo(radius * 0.7, radius * 0.2);
    c.strokeStyle = '#485b3f'; c.stroke(); c.restore();
  }

  ship(x, y, angle, scale = 1, home = false, time = 0) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale);
    c.shadowColor = '#d4f97b66'; c.shadowBlur = home ? 16 : 10;
    c.fillStyle = '#e0fca3';
    c.beginPath(); c.moveTo(-16, -4); c.lineTo(-29 - Math.sin(time * 29) * 6, 0); c.lineTo(-16, 4); c.fill();
    c.shadowBlur = 0;
    c.beginPath(); c.moveTo(30, 0); c.lineTo(-20, -20); c.lineTo(-12, -4);
    c.lineTo(-19, 0); c.lineTo(-12, 4); c.lineTo(-20, 20); c.closePath();
    c.fillStyle = '#c9d3bb'; c.fill(); c.strokeStyle = '#f0f4de'; c.lineWidth = 0.85; c.stroke();
    c.beginPath(); c.moveTo(30, 0); c.lineTo(-12, 4); c.lineTo(-20, 20); c.closePath(); c.fillStyle = '#62775b'; c.fill();
    c.beginPath(); c.moveTo(30, 0); c.lineTo(-10, -4); c.lineTo(-13, 0); c.lineTo(-10, 4); c.closePath();
    c.fillStyle = '#22372d'; c.fill();
    c.beginPath(); c.moveTo(11, 0); c.lineTo(-3, -3); c.lineTo(-7, 0); c.lineTo(-3, 3); c.closePath();
    c.fillStyle = LIME; c.fill();
    c.fillStyle = '#182b21'; c.fillRect(-10, -13, 7, 2); c.fillRect(-10, 11, 7, 2);
    c.restore();
  }

  enemy(enemy, time) {
    const c = this.ctx, spec = ENEMIES[enemy.kind], r = enemy.radius;
    c.save(); c.translate(enemy.x, enemy.y); c.rotate(enemy.kind === 'boss' ? time * 0.3 : enemy.angle);
    c.lineWidth = 1.6;
    c.fillStyle = enemy.flash > 0 ? '#f1f6df' : '#1e2422';
    c.strokeStyle = spec.color;
    c.shadowColor = spec.color + '66'; c.shadowBlur = 7;
    c.beginPath();
    if (enemy.kind === 'scout' || enemy.kind === 'hunter') {
      c.moveTo(r + 4, 0); c.lineTo(-r, -r * 0.8); c.lineTo(-r * 0.38, 0); c.lineTo(-r, r * 0.8);
    } else {
      const n = enemy.kind === 'boss' ? 8 : enemy.kind === 'tank' ? 6 : 4;
      for (let i = 0; i < n; i++) c.lineTo(Math.cos(i * TAU / n) * r, Math.sin(i * TAU / n) * r);
    }
    c.closePath(); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.beginPath(); c.arc(0, 0, r * 0.28, 0, TAU); c.fillStyle = spec.color; c.fill();
    if (enemy.kind === 'boss') {
      c.beginPath(); c.arc(0, 0, r * 0.66, 0, TAU); c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        c.fillRect(Math.cos(a) * r - 4, Math.sin(a) * r - 4, 8, 8);
      }
    }
    c.restore();
    if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
      c.fillStyle = '#3b4740'; c.fillRect(enemy.x - r, enemy.y - r - 9, r * 2, 2);
      c.fillStyle = spec.color; c.fillRect(enemy.x - r, enemy.y - r - 9, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 2);
    }
  }

  frame(game, time, dt) {
    this.resize();
    const c = this.ctx, w = this.width, h = this.height;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.backdrop(time, !game);
    if (!game) return;
    const activeDt = game.status === 'playing' ? dt : 0;
    const scale = w < 760 ? w / 680 : Math.min(w / 1350, h / 850);
    const p = game.player;
    const smooth = 1 - Math.exp(-dt * 7);
    this.camera.x += (p.x - this.camera.x) * smooth;
    this.camera.y += (p.y - this.camera.y) * smooth;
    c.save();
    const shake = this.motion ? this.shake : 0;
    c.translate(w / 2 + Math.sin(time * 83) * shake, h / 2 + Math.cos(time * 91) * shake);
    c.scale(scale, scale); c.translate(-this.camera.x, -this.camera.y);
    // Navigable field. These rings and rocks are scenery, not collision geometry.
    c.strokeStyle = '#8baf6710'; c.lineWidth = 1;
    const grid = 120;
    const left = this.camera.x - w / scale / 2, top = this.camera.y - h / scale / 2;
    for (let x = Math.floor(left / grid) * grid; x < left + w / scale; x += grid) {
      for (let y = Math.floor(top / grid) * grid; y < top + h / scale; y += grid) {
        c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke();
      }
    }
    c.save(); c.globalAlpha = 0.33;
    for (const rock of this.rocks) this.asteroid(rock.x, rock.y, rock.r, rock.angle, rock.edges);
    c.restore();
    for (const radius of [420, 800, 1180]) {
      c.beginPath(); c.arc(CONFIG.worldWidth / 2, CONFIG.worldHeight / 2, radius, 0, TAU);
      c.strokeStyle = '#a0ba7930'; c.lineWidth = 1; c.stroke();
    }
    c.strokeStyle = '#f4b66f66'; c.setLineDash([12, 12]);
    c.strokeRect(20, 20, CONFIG.worldWidth - 40, CONFIG.worldHeight - 40); c.setLineDash([]);
    c.font = '11px ui-monospace, monospace'; c.fillStyle = '#a0b08933';
    c.fillText('SECTOR 07  /  THE QUIET BELT', CONFIG.worldWidth / 2 - 120, CONFIG.worldHeight / 2 - 260);

    for (const orb of game.orbs) {
      c.save(); c.translate(orb.x, orb.y); c.rotate(Math.PI / 4);
      c.shadowColor = orb.heal ? '#ff8b78' : LIME; c.shadowBlur = 10;
      c.fillStyle = orb.heal ? '#ff8b78' : LIME; c.fillRect(-3.5, -3.5, 7, 7); c.restore();
    }
    for (const ring of this.rings) {
      ring.life -= activeDt;
      const progress = 1 - ring.life / ring.max;
      c.beginPath(); c.arc(ring.x, ring.y, Math.max(0, ring.radius * progress), 0, TAU);
      c.globalAlpha = Math.max(0, 1 - progress); c.strokeStyle = ring.color; c.lineWidth = 3; c.stroke(); c.globalAlpha = 1;
    }
    this.rings = this.rings.filter(r => r.life > 0);
    if (activeDt && (!this.trail.length || distanceSquared(p, this.trail.at(-1)) > 9)) this.trail.push({ x: p.x, y: p.y, life: 0.35, dash: p.dashLeft > 0 });
    for (const dot of this.trail) {
      dot.life -= activeDt;
      c.globalAlpha = Math.max(0, dot.life) * 0.7;
      c.fillStyle = LIME; c.beginPath(); c.arc(dot.x, dot.y, dot.dash ? 11 : 3, 0, TAU); c.fill();
    }
    c.globalAlpha = 1; this.trail = this.trail.filter(t => t.life > 0);
    for (const bullet of game.bullets) {
      c.beginPath(); c.moveTo(bullet.x, bullet.y); c.lineTo(bullet.x - Math.cos(bullet.angle) * 19, bullet.y - Math.sin(bullet.angle) * 19);
      c.strokeStyle = LIME; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#f5ffe7'; c.fillRect(bullet.x - 2, bullet.y - 2, 4, 4);
    }
    for (const bullet of game.hostileBullets) {
      c.beginPath(); c.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      c.fillStyle = '#ff786335'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#ff9680'; c.stroke();
    }
    for (const enemy of game.enemies) if (enemy.alive) this.enemy(enemy, game.time);
    if (p.orbitCount) {
      c.beginPath(); c.arc(p.x, p.y, 90, 0, TAU); c.strokeStyle = '#b7c7ff30'; c.lineWidth = 1; c.stroke();
      for (let i = 0; i < p.orbitCount; i++) {
        const a = game.time * 2.6 + i * TAU / p.orbitCount;
        const x = p.x + Math.cos(a) * 90, y = p.y + Math.sin(a) * 90;
        c.save(); c.translate(x, y); c.rotate(a + Math.PI / 4); c.fillStyle = '#b7c7ff'; c.fillRect(-6, -6, 12, 12); c.restore();
      }
    }
    if (p.invulnerable > 0) {
      c.beginPath(); c.arc(p.x, p.y, 36 + Math.sin(time * 7) * 2, 0, TAU);
      c.strokeStyle = p.dashLeft > 0 ? '#d4f97baa' : '#c0e8d355'; c.lineWidth = 1.5; c.stroke();
    }
    c.globalAlpha = p.invulnerable > 0 && Math.sin(time * 22) < 0 ? 0.65 : 1;
    this.ship(p.x, p.y, p.angle, 0.87, false, game.time); c.globalAlpha = 1;
    for (const particle of this.particles) {
      particle.life -= activeDt;
      particle.x += particle.vx * activeDt; particle.y += particle.vy * activeDt;
      c.globalAlpha = Math.max(0, particle.life / particle.max);
      c.fillStyle = particle.color; c.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    this.particles = this.particles.filter(particle => particle.life > 0); c.globalAlpha = 1;
    c.restore();
    // A visible boss bearing prevents narrow screens from hiding the objective.
    const boss = game.enemies.find(e => e.kind === 'boss' && e.alive);
    if (boss) {
      const bx = (boss.x - this.camera.x) * scale, by = (boss.y - this.camera.y) * scale;
      if (Math.abs(bx) > w / 2 - 65 || Math.abs(by) > h / 2 - 100) {
        const k = Math.min((w / 2 - 42) / Math.max(1, Math.abs(bx)), (h / 2 - 130) / Math.max(1, Math.abs(by)));
        const x = w / 2 + bx * k, y = h / 2 + by * k;
        c.save(); c.translate(x, y); c.rotate(Math.atan2(by, bx));
        c.fillStyle = '#ff9d84'; c.beginPath(); c.moveTo(12, 0); c.lineTo(-7, -7); c.lineTo(-7, 7); c.fill(); c.restore();
        c.fillStyle = '#ff9d84'; c.font = '10px ui-monospace, monospace'; c.textAlign = 'center';
        c.fillText('母舰', x, y + 23); c.textAlign = 'left';
      }
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(255,83,62,${this.flash * 0.32})`; c.fillRect(0, 0, w, h);
    }
    this.shake = Math.max(0, this.shake - activeDt * 30);
    this.flash = Math.max(0, this.flash - activeDt);
  }
}

function distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
