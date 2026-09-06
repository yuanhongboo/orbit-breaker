import { CONFIG, UPGRADES } from './config.mjs';
import { createGame, step, dash, chooseUpgrade, safeProfile } from './core.mjs';
import { Renderer } from './renderer.mjs';
import { AudioEngine } from './audio.mjs';

const $ = id => document.getElementById(id);
const formatScore = n => Math.floor(n).toString().padStart(6, '0');
const formatTime = n => `${Math.floor(Math.max(0, n) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, n) % 60).toString().padStart(2, '0')}`;

function initialize() {
  let profile;
  try { profile = safeProfile(localStorage.getItem(CONFIG.storageKey)); }
  catch { profile = safeProfile(null); }
  const renderer = new Renderer($('universe'));
  const audio = new AudioEngine(profile.sound);
  let game = null, accumulator = 0, lastFrame = performance.now(), hudIn = 0;
  let recorded = false, lastUpgradeLevel = 0, toastUntil = 0, lastSector = 0;
  const keys = new Set();
  const stick = { x: 0, y: 0, id: null };
  const dialogs = [...document.querySelectorAll('dialog')];
  const ui = Object.fromEntries([
    'score','combo','timer','time-progress','health-text','health-bar','kills','level',
    'xp-bar','xp-label','dash-label','dash-button','touch-dash','mission-status','boss-hud','boss-percent','boss-bar',
  ].map(id => [id, $(id)]));

  function save() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(profile)); }
    catch { /* The game still works when private browsing disables local storage. */ }
  }

  function updateHome() {
    $('best-score').textContent = profile.best ? profile.best.toLocaleString('en-US') : '— — —';
    $('sound-button').setAttribute('aria-pressed', String(audio.enabled));
    $('sound-button').setAttribute('aria-label', audio.enabled ? '关闭音效' : '开启音效');
    $('sound-button').title = audio.enabled ? '关闭音效' : '开启音效';
  }

  function clearInput() {
    keys.clear(); stick.x = stick.y = 0;
    if (stick.id !== null) {
      try { $('joystick').releasePointerCapture(stick.id); } catch { /* Already released. */ }
    }
    stick.id = null; $('joystick-knob').style.transform = '';
  }

  function closeDialogs() { for (const dialog of dialogs) if (dialog.open) dialog.close(); }

  function notify(message, seconds = 3) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastUntil = performance.now() + seconds * 1000;
  }

  function start() {
    closeDialogs(); clearInput(); audio.unlock(); renderer.reset();
    game = createGame(); recorded = false; lastUpgradeLevel = 0; lastSector = 0;
    accumulator = 0; hudIn = 0;
    document.body.dataset.mode = 'game';
    $('home').hidden = true; $('hud').hidden = false; $('touch-controls').hidden = false;
    $('pause-button').hidden = false;
    document.querySelectorAll('.home-nav').forEach(el => el.hidden = true);
    updateLoadout(); updateHud();
    $('universe').focus({ preventScroll: true });
    notify('保持移动 · 靠近绿色能量可升级', 5);
  }

  function home() {
    closeDialogs(); clearInput(); game = null; accumulator = 0;
    document.body.dataset.mode = 'home';
    $('home').hidden = false; $('hud').hidden = true; $('touch-controls').hidden = true;
    $('pause-button').hidden = true; $('toast').hidden = true;
    document.querySelectorAll('.home-nav').forEach(el => el.hidden = false);
    updateHome(); renderer.reset();
    document.querySelector('[data-start]').focus({ preventScroll: true });
  }

  function pause() {
    if (game?.status !== 'playing') return;
    game.status = 'paused'; clearInput(); accumulator = 0;
    $('pause-dialog').showModal();
  }

  function resume() {
    if (game?.status !== 'paused' || document.hidden) return;
    $('pause-dialog').close(); game.status = 'playing';
    clearInput(); accumulator = 0; lastFrame = performance.now();
    $('universe').focus({ preventScroll: true });
  }

  function movement() {
    return {
      x: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x,
      y: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + stick.y,
    };
  }

  function doDash() {
    if (!game) return;
    const input = movement(); dash(game, input.x, input.y);
  }

  function updateLoadout() {
    const entries = Object.entries(game.upgrades);
    $('loadout-icons').innerHTML = entries.length ? entries.map(([id, count]) => {
      const u = UPGRADES.find(u => u.id === id);
      return `<span class="loadout-icon" title="${u.name} × ${count}" aria-label="${u.name}，${count} 级">${u.icon}<small>${count}</small></span>`;
    }).join('') : '<span class="empty-loadout">收集绿色能量 → 三选一升级</span>';
  }

  function showUpgrade() {
    if (lastUpgradeLevel === game.level) return;
    lastUpgradeLevel = game.level; clearInput();
    $('upgrade-level').textContent = `LEVEL ${String(game.level).padStart(2, '0')}`;
    $('upgrade-options').innerHTML = game.choices.map((id, index) => {
      const u = UPGRADES.find(u => u.id === id);
      return `<button class="upgrade-card ${u.color}" data-upgrade="${id}"><kbd class="choice-key">${index + 1}</kbd><span class="upgrade-icon">${u.icon}</span><span class="upgrade-label">${u.label} · ${(game.upgrades[id] || 0) + 1}/${u.max}</span><h3>${u.name}</h3><p>${u.description}</p></button>`;
    }).join('');
    $('toast').hidden = true;
    if (!$('upgrade-dialog').open) $('upgrade-dialog').showModal();
  }

  function upgrade(id) {
    if (!game || !chooseUpgrade(game, id)) return;
    $('upgrade-dialog').close(); clearInput(); updateLoadout(); updateHud();
    accumulator = 0; $('universe').focus({ preventScroll: true });
    if (game.status === 'upgrade') showUpgrade();
  }

  function updateHud() {
    if (!game) return;
    const p = game.player;
    ui.score.textContent = formatScore(game.score);
    ui.combo.textContent = game.combo >= 3 ? `${game.combo} 连破  /  得分 ×${game.multiplier}` : '锁定目标，保持移动';
    ui.timer.textContent = formatTime(Math.ceil(CONFIG.duration - game.time));
    ui['time-progress'].style.width = `${Math.max(0, 1 - game.time / CONFIG.duration) * 100}%`;
    ui['health-text'].textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    ui['health-bar'].style.width = `${p.hp / p.maxHp * 100}%`;
    ui['health-bar'].style.background = p.hp / p.maxHp < 0.3 ? '#ff9780' : '';
    ui.kills.textContent = `${game.kills} 击破`;
    ui.level.textContent = `LV. ${String(game.level).padStart(2, '0')}`;
    ui['xp-bar'].style.width = `${Math.min(100, game.xp / game.xpNext * 100)}%`;
    ui['xp-label'].textContent = `能量 ${game.xp} / ${game.xpNext}`;
    ui['dash-label'].textContent = p.dashCooldown > 0 ? `${p.dashCooldown.toFixed(1)} s` : '冲刺就绪';
    ui['dash-button'].disabled = p.dashCooldown > 0 || game.status !== 'playing';
    ui['touch-dash'].disabled = p.dashCooldown > 0 || game.status !== 'playing';
    ui['mission-status'].textContent = game.bossSpawned ? '击破母舰，完成突围' : `母舰抵达倒计时 ${formatTime(Math.ceil(CONFIG.bossAt - game.time))}`;
    const boss = game.enemies.find(e => e.kind === 'boss' && e.alive);
    ui['boss-hud'].hidden = !boss;
    if (boss) {
      const percent = Math.max(0, boss.hp / boss.maxHp * 100);
      ui['boss-percent'].textContent = `${Math.ceil(percent)}%`;
      ui['boss-bar'].style.width = `${percent}%`;
    }
    $('hud').setAttribute('aria-label', `剩余 ${ui.timer.textContent}，护盾 ${Math.ceil(p.hp)}，得分 ${game.score}`);
  }

  function result() {
    if (recorded) return;
    recorded = true; clearInput(); closeDialogs(); updateHud();
    const won = game.status === 'won';
    const best = game.score > profile.best;
    profile.runs++; profile.kills += game.kills; if (won) profile.wins++;
    profile.best = Math.max(profile.best, game.score);
    profile.records.unshift({ score: game.score, time: Math.min(CONFIG.duration, game.time), won });
    profile.records = profile.records.slice(0, 5); save();
    $('result-eyebrow').textContent = won ? 'MISSION COMPLETE / 突围成功' : 'FLIGHT COMPLETE / 飞行结束';
    $('result-emblem').textContent = won ? '✳' : '↗';
    $('result-title').textContent = won ? '星环记住了你。' : game.status === 'timeout' ? '再快一点，就能突围。' : '下一次，飞得更远。';
    $('result-description').textContent = won ? '母舰已化为星尘。你为这片宇宙，留出了一点空间。' : game.status === 'timeout'
      ? '母舰完成跃迁。尝试强化弹头与分裂弹道，提高对母舰的火力。' : '护盾耗尽。别停下脚步，冲刺可以穿过危险。';
    $('result-score').textContent = formatScore(game.score);
    $('new-record').hidden = !best;
    $('result-time').textContent = formatTime(Math.min(CONFIG.duration, game.time));
    $('result-kills').textContent = game.kills;
    $('result-level').textContent = game.level;
    $('share-status').textContent = '';
    $('toast').hidden = true;
    $('result-dialog').showModal();
  }

  function records() {
    $('record-runs').textContent = profile.runs;
    $('record-wins').textContent = profile.wins;
    $('record-kills').textContent = profile.kills;
    $('record-list').innerHTML = profile.records.length ? profile.records.map((r, index) =>
      `<div class="record-row"><span>${index === 0 ? '最近一局' : `飞行记录 ${index + 1}`}</span><span>${r.won ? '突围成功' : '未突围'} · ${formatTime(r.time)}</span><strong>${r.score.toLocaleString('en-US')}</strong></div>`).join('')
      : '<p class="empty-record">星图上还没有你的航迹。<br />完成第一局，留下你的纪录。</p>';
    $('records-dialog').showModal();
  }

  document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', start));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('how-to').addEventListener('click', () => $('help-dialog').showModal());
  $('records-button').addEventListener('click', records);
  $('sound-button').addEventListener('click', () => {
    audio.enabled = !audio.enabled; profile.sound = audio.enabled; audio.unlock();
    if (audio.enabled) audio.tone(640, 0.12); save(); updateHome();
  });
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  $('quit-button').addEventListener('click', home);
  $('home-button').addEventListener('click', home);
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault(); if (game) pause(); else home();
  });
  $('dash-button').addEventListener('click', doDash);
  $('touch-dash').addEventListener('pointerdown', event => { event.preventDefault(); doDash(); });
  $('upgrade-options').addEventListener('click', event => {
    const button = event.target.closest('[data-upgrade]'); if (button) upgrade(button.dataset.upgrade);
  });
  $('share-button').addEventListener('click', async () => {
    if (!game) return;
    const url = new URL('./', location.href).href;
    const text = `我在《星环突围》${game.status === 'won' ? '成功突围' : `坚持了 ${formatTime(game.time)}`}，拿到 ${game.score.toLocaleString('en-US')} 分。你能超过我吗？ ${url}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      $('share-status').textContent = '战绩与游戏链接已复制。';
    } catch {
      $('share-status').textContent = `无法访问剪贴板，请选中复制：${text}`;
    }
  });

  window.addEventListener('keydown', event => {
    const isGameKey = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(event.code);
    if (game && isGameKey) event.preventDefault();
    if (event.repeat && ['Space','Escape','KeyP'].includes(event.code)) return;
    if (game?.status === 'upgrade' && /^Digit[123]$/.test(event.code)) {
      const id = game.choices[Number(event.code.at(-1)) - 1]; if (id) upgrade(id); return;
    }
    if (event.code === 'KeyP') { if (game?.status === 'paused') resume(); else pause(); return; }
    if (event.code === 'Escape' && game?.status === 'playing') { event.preventDefault(); pause(); return; }
    if (game?.status !== 'playing') return;
    if (isGameKey) keys.add(event.code);
    if (event.code === 'Space') doDash();
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { clearInput(); pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInput(); pause(); }
    accumulator = 0; lastFrame = performance.now();
  });
  for (const id of ['upgrade-dialog', 'result-dialog']) $(id).addEventListener('cancel', event => event.preventDefault());
  $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resume(); });

  const joystick = $('joystick');
  function moveStick(event) {
    if (event.pointerId !== stick.id) return;
    const rect = joystick.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
    const range = rect.width * 0.32, length = Math.hypot(x, y), divisor = Math.max(range, length);
    stick.x = x / divisor; stick.y = y / divisor;
    $('joystick-knob').style.transform = `translate(${stick.x * range}px,${stick.y * range}px)`;
  }
  joystick.addEventListener('pointerdown', event => {
    if (game?.status !== 'playing' || stick.id !== null) return;
    event.preventDefault(); stick.id = event.pointerId; joystick.setPointerCapture(event.pointerId);
    audio.unlock(); moveStick(event);
  });
  joystick.addEventListener('pointermove', moveStick);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(type, event => {
    if (event.pointerId !== stick.id) return;
    stick.id = null; stick.x = stick.y = 0; $('joystick-knob').style.transform = '';
  });

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1); lastFrame = now;
    if (game?.status === 'playing') {
      accumulator = Math.min(accumulator + dt, CONFIG.step * 6);
      const input = movement();
      while (accumulator >= CONFIG.step && game.status === 'playing') { step(game, input); accumulator -= CONFIG.step; }
      hudIn -= dt;
      if (hudIn <= 0) { updateHud(); hudIn = 0.08; }
      const sector = Math.floor(game.time / 30);
      if (sector > lastSector && !game.bossSpawned) { lastSector = sector; notify(`威胁升级 / 第 ${sector + 1} 波敌舰接近`, 2.5); }
    } else accumulator = 0;
    if (game) {
      renderer.events(game.events);
      for (const event of game.events) {
        audio.play(event);
        if (event.type === 'boss') notify('⚠ 毁灭者母舰抵达 · 40 秒内击破它', 4);
      }
      game.events.length = 0;
      if (game.status === 'upgrade') showUpgrade();
      if (['won','lost','timeout'].includes(game.status)) result();
    }
    if (now > toastUntil) $('toast').hidden = true;
    renderer.frame(game, now / 1000, dt);
    requestAnimationFrame(frame);
  }
  updateHome(); requestAnimationFrame(frame);
}

try { initialize(); }
catch (error) {
  console.error(error);
  $('fatal-error').hidden = false;
  $('fatal-error').textContent = '游戏加载失败。请刷新页面，或使用支持 Canvas 的现代浏览器重新打开。';
}
