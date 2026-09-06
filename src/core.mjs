import { CONFIG, ENEMIES, UPGRADES } from './config.mjs';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed = Date.now()) {
  return {
    status: 'playing', seed, rng: random(seed), time: 0, score: 0, kills: 0,
    level: 1, xp: 0, xpNext: 28, combo: 0, comboUntil: 0, multiplier: 1,
    spawnIn: 0.7, shotIn: 0, novaIn: 4, id: 0, bossSpawned: false, bossDefeated: false,
    choices: [], upgrades: {}, events: [], enemies: [], bullets: [], hostileBullets: [], orbs: [],
    player: {
      x: CONFIG.worldWidth / 2, y: CONFIG.worldHeight / 2, angle: -Math.PI / 2,
      radius: 13, hp: 100, maxHp: 100, speed: CONFIG.playerSpeed,
      damage: 24, fireInterval: 0.31, projectiles: 1, magnet: 115,
      dashLeft: 0, dashCooldown: 0, dashMax: CONFIG.dashCooldown,
      dashX: 0, dashY: -1, invulnerable: 1.6, orbitCount: 0, novaLevel: 0,
    },
    stats: { shots: 0, hits: 0, dashes: 0, damageTaken: 0, bestCombo: 0 },
  };
}

function emit(game, type, data = {}) {
  // The caller consumes events every rendered frame. A bounded queue also supports headless runs.
  if (game.events.length < 160) game.events.push({ type, ...data });
}

export function spawnEnemy(game, kind, position) {
  const spec = ENEMIES[kind];
  const angle = game.rng() * Math.PI * 2;
  const radius = 680 + game.rng() * 100;
  const x = clamp(position?.x ?? game.player.x + Math.cos(angle) * radius, 60, CONFIG.worldWidth - 60);
  const y = clamp(position?.y ?? game.player.y + Math.sin(angle) * radius, 60, CONFIG.worldHeight - 60);
  const hp = spec.hp * (kind === 'boss' ? 1 : 1 + game.time / 300);
  const enemy = {
    id: ++game.id, kind, x, y, hp, maxHp: hp, radius: spec.radius,
    speed: spec.speed, angle: 0, shotIn: 1.5 + game.rng(),
    orbitHitAt: -10, flash: 0, age: 0, alive: true,
  };
  game.enemies.push(enemy);
  return enemy;
}

export function hurtPlayer(game, damage) {
  const p = game.player;
  if (game.status !== 'playing' || p.invulnerable > 0 || p.dashLeft > 0) return false;
  p.hp = Math.max(0, p.hp - damage);
  p.invulnerable = 1.15;
  game.combo = 0;
  game.stats.damageTaken += damage;
  emit(game, 'damage', { x: p.x, y: p.y, amount: damage });
  if (p.hp === 0) finish(game, 'lost');
  return true;
}

function finish(game, status) {
  if (game.status !== 'playing') return;
  game.status = status;
  if (status === 'won') game.score += Math.round(game.player.hp * 30) + 10000;
  emit(game, status);
}

function hitEnemy(game, enemy, amount) {
  if (!enemy.alive) return;
  enemy.hp -= amount;
  enemy.flash = 0.085;
  game.stats.hits++;
  if (enemy.hp > 0) return;
  enemy.alive = false;
  const spec = ENEMIES[enemy.kind];
  game.combo = game.time < game.comboUntil ? game.combo + 1 : 1;
  game.comboUntil = game.time + 3;
  game.multiplier = Math.min(5, 1 + Math.floor(game.combo / 8));
  game.stats.bestCombo = Math.max(game.stats.bestCombo, game.combo);
  game.score += spec.score * game.multiplier;
  game.kills++;
  emit(game, 'kill', { x: enemy.x, y: enemy.y, color: spec.color, boss: enemy.kind === 'boss', score: spec.score * game.multiplier });
  if (enemy.kind === 'boss') {
    game.bossDefeated = true;
    for (const other of game.enemies) if (other !== enemy) other.alive = false;
    game.hostileBullets.length = 0;
    finish(game, 'won');
    return;
  }
  const heal = game.rng() < 0.045;
  game.orbs.push({ x: enemy.x, y: enemy.y, xp: spec.xp, heal, magnetized: false });
  // Merge old energy instead of silently deleting earned experience when the field is busy.
  if (game.orbs.length > CONFIG.maxOrbs) {
    const old = game.orbs.shift();
    game.orbs[0].xp += old.xp;
    game.orbs[0].heal ||= old.heal;
  }
}

function checkLevel(game) {
  if (game.status !== 'playing' || game.xp < game.xpNext) return;
  game.xp -= game.xpNext;
  game.level++;
  game.xpNext = Math.round(28 + game.level * 17 + game.level ** 1.45 * 2);
  const candidates = UPGRADES.filter(u => (game.upgrades[u.id] ?? 0) < u.max);
  if (candidates.length === 0) {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 25);
    game.score += 1000;
    return;
  }
  game.choices = [];
  while (game.choices.length < 3 && candidates.length) {
    const index = Math.floor(game.rng() * candidates.length);
    game.choices.push(candidates.splice(index, 1)[0].id);
  }
  game.status = 'upgrade';
  emit(game, 'level');
}

export function chooseUpgrade(game, id) {
  if (game.status !== 'upgrade' || !game.choices.includes(id)) return false;
  const p = game.player;
  game.upgrades[id] = (game.upgrades[id] ?? 0) + 1;
  if (id === 'rapid') p.fireInterval *= 0.82;
  if (id === 'power') p.damage *= 1.3;
  if (id === 'spread') p.projectiles++;
  if (id === 'orbit') p.orbitCount++;
  if (id === 'magnet') {
    p.magnet += 90;
    for (const orb of game.orbs) if (distance(orb, p) < 600) orb.magnetized = true;
  }
  if (id === 'shield') {
    p.maxHp += 20;
    p.hp = Math.min(p.maxHp, p.hp + 45);
  }
  if (id === 'speed') { p.speed *= 1.12; p.dashMax *= 0.88; }
  if (id === 'nova') { p.novaLevel++; game.novaIn = 0.3; }
  p.invulnerable = Math.max(0.9, p.invulnerable);
  game.choices = [];
  game.status = 'playing';
  checkLevel(game);
  return true;
}

export function dash(game, dx, dy) {
  const p = game.player;
  if (game.status !== 'playing' || p.dashCooldown > 0) return false;
  const length = Math.hypot(dx, dy);
  p.dashX = length > 0.01 ? dx / length : Math.cos(p.angle);
  p.dashY = length > 0.01 ? dy / length : Math.sin(p.angle);
  p.dashLeft = CONFIG.dashDuration;
  p.dashCooldown = p.dashMax;
  p.invulnerable = Math.max(p.invulnerable, CONFIG.dashDuration + 0.08);
  game.stats.dashes++;
  emit(game, 'dash', { x: p.x, y: p.y });
  return true;
}

function shoot(game) {
  const p = game.player;
  let target;
  let bestDistance = 740;
  for (const enemy of game.enemies) {
    const d = distance(enemy, p);
    if (enemy.alive && d < bestDistance) { target = enemy; bestDistance = d; }
  }
  if (!target) return;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  p.angle = angle;
  for (let i = 0; i < p.projectiles && game.bullets.length < CONFIG.maxBullets; i++) {
    const spread = (i - (p.projectiles - 1) / 2) * 0.105;
    const a = angle + spread;
    game.bullets.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24,
      vx: Math.cos(a) * 780, vy: Math.sin(a) * 780, life: 1.15, damage: p.damage, angle: a });
    game.stats.shots++;
  }
  emit(game, 'shot');
}

function enemyShot(game, enemy) {
  const angle = Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x);
  const boss = enemy.kind === 'boss';
  const count = boss ? 14 : 3;
  for (let i = 0; i < count && game.hostileBullets.length < 180; i++) {
    const a = boss ? game.time * 0.65 + i * Math.PI * 2 / count : angle + (i - 1) * 0.18;
    const speed = boss ? 145 : 155;
    game.hostileBullets.push({ x: enemy.x + Math.cos(a) * enemy.radius,
      y: enemy.y + Math.sin(a) * enemy.radius,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 5, radius: boss ? 6 : 5 });
  }
}

function segmentHits(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy) < radius;
}

export function step(game, input, dt = CONFIG.step) {
  if (game.status !== 'playing') return;
  dt = clamp(dt, 0, 0.05);
  game.time += dt;
  const p = game.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.dashLeft = Math.max(0, p.dashLeft - dt);
  const dx = input.x || 0, dy = input.y || 0;
  const length = Math.hypot(dx, dy);
  const divisor = Math.max(1, length);
  p.x += (p.dashLeft > 0 ? p.dashX * CONFIG.dashSpeed : dx / divisor * p.speed) * dt;
  p.y += (p.dashLeft > 0 ? p.dashY * CONFIG.dashSpeed : dy / divisor * p.speed) * dt;
  p.x = clamp(p.x, 36, CONFIG.worldWidth - 36);
  p.y = clamp(p.y, 36, CONFIG.worldHeight - 36);
  if (length > 0.1 && !game.enemies.length) p.angle = Math.atan2(dy, dx);
  if (game.time > game.comboUntil) { game.combo = 0; game.multiplier = 1; }

  if (!game.bossSpawned && game.time >= CONFIG.bossAt) {
    game.bossSpawned = true;
    spawnEnemy(game, 'boss');
    emit(game, 'boss');
  }
  if (game.time >= CONFIG.duration) {
    finish(game, game.bossDefeated ? 'won' : 'timeout');
    return;
  }

  game.spawnIn -= dt;
  if (game.spawnIn <= 0 && game.enemies.length < CONFIG.maxEnemies) {
    const r = game.rng();
    const kind = game.time > 75 && r < 0.13 ? 'tank'
      : game.time > 45 && r < 0.28 ? 'gunner'
      : game.time > 20 && r < 0.52 ? 'hunter' : 'scout';
    spawnEnemy(game, kind);
    game.spawnIn = 1 / (1.4 + game.time / 36) * (game.bossSpawned ? 1.7 : 1);
  }
  game.shotIn -= dt;
  if (game.shotIn <= 0) { shoot(game); game.shotIn = p.fireInterval; }

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    const d = distance(enemy, p);
    let speed = enemy.speed;
    if (enemy.kind === 'gunner' && d < 335) speed *= d < 230 ? -0.45 : 0.05;
    if (enemy.kind === 'boss' && d < 290) speed = 0;
    const weave = enemy.kind === 'hunter' ? Math.sin(enemy.age * 3 + enemy.id) * 0.45 : 0;
    enemy.x += Math.cos(enemy.angle + weave) * speed * dt;
    enemy.y += Math.sin(enemy.angle + weave) * speed * dt;
    if (d < enemy.radius + p.radius) {
      hurtPlayer(game, enemy.kind === 'boss' ? 35 : enemy.kind === 'tank' ? 28 : 16);
      if (game.status !== 'playing') return;
      if (p.dashLeft <= 0) {
        enemy.x -= Math.cos(enemy.angle) * 50 * dt;
        enemy.y -= Math.sin(enemy.angle) * 50 * dt;
      }
    }
    if (enemy.kind === 'gunner' || enemy.kind === 'boss') {
      enemy.shotIn -= dt;
      if (enemy.shotIn <= 0) { enemyShot(game, enemy); enemy.shotIn = enemy.kind === 'boss' ? 1.4 : 2.8; }
    }
    if (p.orbitCount && game.time - enemy.orbitHitAt > 0.34) {
      for (let i = 0; i < p.orbitCount; i++) {
        const a = game.time * 2.6 + i * Math.PI * 2 / p.orbitCount;
        if (Math.hypot(enemy.x - p.x - Math.cos(a) * 90, enemy.y - p.y - Math.sin(a) * 90) < enemy.radius + 12) {
          hitEnemy(game, enemy, 28);
          enemy.orbitHitAt = game.time;
          break;
        }
      }
    }
  }

  if (game.status !== 'playing') return;
  for (const bullet of game.bullets) {
    const oldX = bullet.x, oldY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    for (const enemy of game.enemies) {
      if (enemy.alive && segmentHits(oldX, oldY, bullet.x, bullet.y, enemy.x, enemy.y, enemy.radius + 4)) {
        hitEnemy(game, enemy, bullet.damage);
        bullet.life = 0;
        break;
      }
    }
    if (game.status !== 'playing') return;
  }
  for (const bullet of game.hostileBullets) {
    const oldX = bullet.x, oldY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (segmentHits(oldX, oldY, bullet.x, bullet.y, p.x, p.y, bullet.radius + p.radius)) {
      hurtPlayer(game, 13);
      bullet.life = 0;
    }
    if (game.status !== 'playing') return;
  }
  game.bullets = game.bullets.filter(b => b.life > 0);
  game.hostileBullets = game.hostileBullets.filter(b => b.life > 0);
  game.enemies = game.enemies.filter(e => e.alive);

  if (p.novaLevel) {
    game.novaIn -= dt;
    if (game.novaIn <= 0) {
      const radius = 180 + p.novaLevel * 30;
      emit(game, 'nova', { x: p.x, y: p.y, radius });
      for (const enemy of game.enemies) if (distance(enemy, p) < radius + enemy.radius) hitEnemy(game, enemy, 50 * p.novaLevel);
      game.novaIn = 4;
    }
  }
  if (game.status !== 'playing') return;
  game.orbs = game.orbs.filter(orb => {
    const d = distance(orb, p);
    if (d < p.magnet) orb.magnetized = true;
    if (d < 23) {
      game.xp += orb.xp;
      if (orb.heal) p.hp = Math.min(p.maxHp, p.hp + 15);
      emit(game, 'pickup', { x: orb.x, y: orb.y, heal: orb.heal });
      return false;
    }
    if (orb.magnetized) {
      const speed = Math.min(d / dt, 220 + 26000 / (d + 40));
      orb.x += (p.x - orb.x) / d * speed * dt;
      orb.y += (p.y - orb.y) / d * speed * dt;
    }
    return true;
  });
  checkLevel(game);
}

export function safeProfile(raw) {
  const empty = { best: 0, runs: 0, wins: 0, kills: 0, sound: true, records: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    for (const key of ['best', 'runs', 'wins', 'kills']) {
      if (Number.isSafeInteger(parsed[key]) && parsed[key] >= 0) empty[key] = parsed[key];
    }
    if (typeof parsed.sound === 'boolean') empty.sound = parsed.sound;
    if (Array.isArray(parsed.records)) empty.records = parsed.records.filter(r =>
      r && Number.isSafeInteger(r.score) && r.score >= 0 && Number.isFinite(r.time)
      && r.time >= 0 && typeof r.won === 'boolean').slice(0, 5);
  } catch { /* A corrupt or unavailable local save starts a fresh profile. */ }
  return empty;
}
