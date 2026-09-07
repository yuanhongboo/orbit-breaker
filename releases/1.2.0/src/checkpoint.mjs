import { CONFIG, ENEMIES, UPGRADES } from './config.mjs';
import { createGame, random, safeProfile } from './core.mjs';

export function readProfile(storage) {
  const current = storage.getItem(CONFIG.storageKey);
  const legacy = storage.getItem(CONFIG.legacyProfileKey);
  const profile = safeProfile(current ?? legacy);
  // A still-open older release may finish later; its high score must not overwrite v2 run IDs.
  if (current !== null && legacy !== null)
    profile.best = Math.max(profile.best, safeProfile(legacy).best);
  return profile;
}

const activeStates = new Set(['playing', 'paused', 'upgrade']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const numberIn = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const integerIn = (value, low, high) =>
  Number.isSafeInteger(value) && value >= low && value <= high;
const knownUpgrade = (id) => UPGRADES.find((upgrade) => upgrade.id === id);
const idValid = (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);

function finiteTree(root) {
  const pending = [root];
  let visited = 0;
  while (pending.length) {
    if (++visited > 20000) return false;
    const value = pending.pop();
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (value && typeof value === 'object') pending.push(...Object.values(value));
  }
  return true;
}

export function encodeCheckpoint(game, savedAt = Date.now(), owner = '') {
  if (!game || !activeStates.has(game.status) || game.player.hp <= 0) return null;
  const { rng, events, ...state } = game;
  if (typeof rng?.getState !== 'function' || !finiteTree(state)) return null;
  const text = JSON.stringify({
    schema: CONFIG.checkpointSchema,
    savedAt,
    owner,
    rngState: rng.getState(),
    state,
  });
  return text.length <= CONFIG.checkpointMaxChars ? text : null;
}

/** Restore only validated data; never trust local storage to supply executable behavior. */
export function decodeCheckpoint(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > CONFIG.checkpointMaxChars) return null;
    const saved = JSON.parse(raw),
      s = saved?.state;
    if (saved?.schema !== CONFIG.checkpointSchema || !isRecord(s) || !finiteTree(saved))
      return null;
    if (
      !integerIn(saved.rngState, 0, 0xffffffff) ||
      !integerIn(saved.savedAt, 0, Number.MAX_SAFE_INTEGER)
    )
      return null;
    if (saved.owner !== undefined && saved.owner !== '' && !idValid(saved.owner)) return null;
    if (
      !activeStates.has(s.status) ||
      !idValid(s.runId) ||
      !integerIn(s.seed, 0, Number.MAX_SAFE_INTEGER)
    )
      return null;
    const base = createGame(s.seed);
    for (const [key, value] of Object.entries(base)) {
      if (typeof value === 'number' && !Number.isFinite(s[key])) return null;
      if (typeof value === 'boolean' && typeof s[key] !== 'boolean') return null;
    }
    if (
      !numberIn(s.time, 0, CONFIG.duration) ||
      s.bossDefeated ||
      !integerIn(s.score, 0, 1e12) ||
      !integerIn(s.id, 0, 1e7) ||
      !integerIn(s.kills, 0, 1e7) ||
      !integerIn(s.level, 1, 1000) ||
      !integerIn(s.xp, 0, 1e8) ||
      !integerIn(s.xpNext, 1, 1e8) ||
      !integerIn(s.combo, 0, 1e7) ||
      !integerIn(s.multiplier, 1, 5)
    )
      return null;
    if (!isRecord(s.player) || !isRecord(s.stats) || !isRecord(s.camera) || !isRecord(s.upgrades))
      return null;
    for (const key of Object.keys(base.player)) if (!Number.isFinite(s.player[key])) return null;
    for (const key of Object.keys(base.stats)) if (!integerIn(s.stats[key], 0, 1e12)) return null;
    const p = s.player;
    if (
      !numberIn(p.x, 0, CONFIG.worldWidth) ||
      !numberIn(p.y, 0, CONFIG.worldHeight) ||
      !numberIn(p.hp, 0.001, p.maxHp) ||
      !numberIn(p.maxHp, 100, 300) ||
      !numberIn(p.speed, 1, 1500) ||
      !numberIn(p.damage, 1, 10000) ||
      !numberIn(p.fireInterval, 0.01, 2) ||
      !integerIn(p.projectiles, 1, 4) ||
      !integerIn(p.orbitCount, 0, 3) ||
      !integerIn(p.novaLevel, 0, 3) ||
      !numberIn(p.magnet, 1, 2000) ||
      !numberIn(p.dashLeft, 0, CONFIG.dashDuration) ||
      !numberIn(p.dashCooldown, 0, CONFIG.dashCooldown) ||
      !numberIn(p.dashMax, 0.1, CONFIG.dashCooldown) ||
      !numberIn(p.invulnerable, 0, 5) ||
      !numberIn(p.radius, 1, 40)
    )
      return null;
    if (!numberIn(s.camera.x, 0, CONFIG.worldWidth) || !numberIn(s.camera.y, 0, CONFIG.worldHeight))
      return null;
    if (
      Object.entries(s.upgrades).some(
        ([id, count]) => !knownUpgrade(id) || !integerIn(count, 1, knownUpgrade(id).max),
      )
    )
      return null;
    if (
      !Array.isArray(s.choices) ||
      s.choices.length > 3 ||
      new Set(s.choices).size !== s.choices.length ||
      s.choices.some((id) => !knownUpgrade(id) || (s.upgrades[id] || 0) >= knownUpgrade(id).max) ||
      (s.status === 'upgrade' ? s.choices.length === 0 : s.choices.length !== 0)
    )
      return null;
    const lists = [
      [
        'enemies',
        CONFIG.maxEnemies + 1,
        [
          'id',
          'x',
          'y',
          'hp',
          'maxHp',
          'radius',
          'speed',
          'angle',
          'shotIn',
          'orbitHitAt',
          'flash',
          'age',
        ],
      ],
      ['bullets', CONFIG.maxBullets, ['x', 'y', 'vx', 'vy', 'life', 'damage', 'angle']],
      ['hostileBullets', 180, ['x', 'y', 'vx', 'vy', 'life', 'radius']],
      ['orbs', CONFIG.maxOrbs, ['x', 'y', 'xp']],
    ];
    for (const [key, max, required] of lists) {
      if (!Array.isArray(s[key]) || s[key].length > max) return null;
      for (const item of s[key]) {
        if (
          !isRecord(item) ||
          required.some((field) => !Number.isFinite(item[field])) ||
          Math.abs(item.x) > 20000 ||
          Math.abs(item.y) > 20000
        )
          return null;
      }
    }
    if (
      s.enemies.some(
        (e) =>
          !Object.hasOwn(ENEMIES, e.kind) ||
          typeof e.alive !== 'boolean' ||
          !integerIn(e.id, 1, s.id) ||
          !numberIn(e.maxHp, 1, 1e6) ||
          e.hp > e.maxHp ||
          (e.alive && e.hp <= 0) ||
          !numberIn(e.radius, 1, 100) ||
          !numberIn(e.speed, 0, 1000),
      )
    )
      return null;
    if (new Set(s.enemies.map((e) => e.id)).size !== s.enemies.length) return null;
    if (
      s.orbs.some(
        (o) =>
          typeof o.heal !== 'boolean' ||
          typeof o.magnetized !== 'boolean' ||
          !integerIn(o.xp, 0, 1e7),
      )
    )
      return null;
    if (s.bullets.some((b) => !numberIn(b.life, 0, 2) || !numberIn(b.damage, 1, 10000)))
      return null;
    if (s.hostileBullets.some((b) => !numberIn(b.life, 0, 6) || !numberIn(b.radius, 1, 20)))
      return null;
    if (s.view !== null) {
      if (
        !isRecord(s.view) ||
        !isRecord(s.view.bounds) ||
        !numberIn(s.view.width, 1, 10000) ||
        !numberIn(s.view.height, 1, 10000) ||
        !numberIn(s.view.scale, 0.001, 30) ||
        typeof s.view.mobile !== 'boolean' ||
        ['left', 'right', 'top', 'bottom'].some((k) => !Number.isFinite(s.view.bounds[k]))
      )
        return null;
    }
    for (const key of Object.keys(base)) if (key !== 'rng' && key !== 'events') base[key] = s[key];
    base.rng = random(saved.rngState);
    base.events = [];
    return { game: base, savedAt: saved.savedAt, owner: saved.owner || '' };
  } catch {
    return null;
  }
}

export function settleRun(profile, game) {
  if (
    !game ||
    !['won', 'lost', 'timeout'].includes(game.status) ||
    profile.settledRunIds.includes(game.runId)
  )
    return false;
  const won = game.status === 'won';
  profile.runs++;
  profile.kills += game.kills;
  if (won) profile.wins++;
  profile.best = Math.max(profile.best, game.score);
  profile.records.unshift({ score: game.score, time: Math.min(CONFIG.duration, game.time), won });
  profile.records = profile.records.slice(0, 5);
  profile.settledRunIds.unshift(game.runId);
  profile.settledRunIds = profile.settledRunIds.slice(0, 20);
  return true;
}
