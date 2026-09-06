export const CONFIG = Object.freeze({
  title: '星环突围',
  version: '1.0.0',
  duration: 180,
  bossAt: 140,
  worldWidth: 2600,
  worldHeight: 2200,
  step: 1 / 60,
  maxEnemies: 85,
  maxBullets: 220,
  maxOrbs: 180,
  playerSpeed: 245,
  dashSpeed: 860,
  dashDuration: 0.21,
  dashCooldown: 3.2,
  storageKey: 'orbit-breaker:profile:v1',
});

export const UPGRADES = Object.freeze([
  { id: 'rapid', icon: '↯', name: '超频脉冲', label: 'FIRE RATE', description: '射击间隔缩短 18%', max: 5, color: 'lime' },
  { id: 'power', icon: '✳', name: '高能弹头', label: 'DAMAGE', description: '子弹伤害提高 30%', max: 5, color: 'coral' },
  { id: 'spread', icon: '⋔', name: '分裂弹道', label: 'MULTISHOT', description: '每次射击多发一枚子弹', max: 3, color: 'lime' },
  { id: 'orbit', icon: '◎', name: '护航卫星', label: 'ORBITAL', description: '增加一颗环绕卫星，碰撞伤敌', max: 3, color: 'blue' },
  { id: 'magnet', icon: '⊕', name: '引力收集', label: 'MAGNET', description: '拾取半径增加 90，立即收集附近能量', max: 3, color: 'blue' },
  { id: 'shield', icon: '◇', name: '纳米装甲', label: 'REPAIR', description: '护盾上限增加 20，恢复 45 护盾', max: 5, color: 'blue' },
  { id: 'speed', icon: '»', name: '矢量引擎', label: 'MOBILITY', description: '移速提高 12%，冲刺冷却缩短 12%', max: 3, color: 'lime' },
  { id: 'nova', icon: '✺', name: '新星发生器', label: 'AREA DAMAGE', description: '每 4 秒释放冲击波，伤害周围敌人', max: 3, color: 'coral' },
]);

export const ENEMIES = Object.freeze({
  scout: { hp: 25, speed: 86, radius: 15, score: 100, xp: 8, color: '#ff7863' },
  hunter: { hp: 38, speed: 130, radius: 17, score: 180, xp: 12, color: '#ce94f5' },
  tank: { hp: 145, speed: 49, radius: 29, score: 350, xp: 22, color: '#ffa557' },
  gunner: { hp: 62, speed: 66, radius: 20, score: 250, xp: 16, color: '#84baff' },
  boss: { hp: 2800, speed: 39, radius: 70, score: 15000, xp: 0, color: '#ff725e' },
});
