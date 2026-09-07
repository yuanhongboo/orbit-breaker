import { CONFIG, UPGRADES, TOUCH } from './config.mjs';
import { createGame, step, dash, chooseUpgrade, safeProfile } from './core.mjs';
import { encodeCheckpoint, decodeCheckpoint, settleRun, readProfile } from './checkpoint.mjs';
import { setViewport } from './view.mjs';
import { FlightGesture } from './touch-input.mjs';
import { Renderer } from './renderer.mjs';
import { AudioEngine } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const formatScore = (n) => Math.floor(n).toString().padStart(6, '0');
const formatTime = (n) =>
  `${Math.floor(Math.max(0, n) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(Math.max(0, n) % 60)
    .toString()
    .padStart(2, '0')}`;
const newId = () =>
  window.crypto?.randomUUID?.() || `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function initialize() {
  const owner = newId();
  let storageUnavailable = false,
    storageWarningShown = false;
  let profile = loadProfile();
  const renderer = new Renderer($('universe'));
  const audio = new AudioEngine(profile.sound);
  const gesture = new FlightGesture();
  let game = null,
    accumulator = 0,
    lastFrame = performance.now(),
    hudIn = 0,
    checkpointIn = 0;
  let recorded = false,
    lastUpgradeLevel = 0,
    toastUntil = 0,
    lastSector = 0,
    ownershipLost = false;
  let savedInfo = summaryOf(loadSaved());
  const keys = new Set();
  const stick = { x: 0, y: 0, id: null, target: null };
  const dialogs = [...document.querySelectorAll('dialog')];
  const ui = Object.fromEntries(
    [
      'score',
      'combo',
      'timer',
      'time-progress',
      'health-text',
      'health-bar',
      'kills',
      'level',
      'xp-bar',
      'xp-label',
      'dash-label',
      'dash-button',
      'touch-dash',
      'mission-status',
      'boss-hud',
      'boss-percent',
      'boss-bar',
    ].map((id) => [id, $(id)]),
  );

  function loadProfile() {
    try {
      return readProfile(localStorage);
    } catch {
      storageUnavailable = true;
      return safeProfile(null);
    }
  }
  function loadSaved() {
    try {
      const saved = decodeCheckpoint(localStorage.getItem(CONFIG.checkpointKey));
      return saved && !profile.settledRunIds.includes(saved.game.runId) ? saved : null;
    } catch {
      storageUnavailable = true;
      return null;
    }
  }
  function summaryOf(saved) {
    return saved
      ? { time: saved.game.time, level: saved.game.level, runId: saved.game.runId }
      : null;
  }
  function saveProfile() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(profile));
    } catch {
      storageUnavailable = true;
    }
  }
  function saveCheckpoint() {
    if (!game || ownershipLost || !['playing', 'paused', 'upgrade'].includes(game.status)) return;
    checkpointIn = CONFIG.checkpointInterval;
    try {
      const raw = encodeCheckpoint(game, Date.now(), owner);
      if (!raw) throw new Error('Invalid checkpoint');
      localStorage.setItem(CONFIG.checkpointKey, raw);
      savedInfo = { time: game.time, level: game.level, runId: game.runId };
      checkpointIn = CONFIG.checkpointInterval;
    } catch {
      storageUnavailable = true;
      if (!storageWarningShown) {
        storageWarningShown = true;
        notify('本机存档暂不可用，本局仍可继续', 4);
      }
    }
  }
  function discardCheckpoint() {
    try {
      const saved = decodeCheckpoint(localStorage.getItem(CONFIG.checkpointKey));
      if (!saved || saved.owner === owner) localStorage.removeItem(CONFIG.checkpointKey);
    } catch {
      storageUnavailable = true;
    }
    savedInfo = summaryOf(loadSaved());
  }
  function updateHome() {
    $('best-score').textContent = profile.best ? profile.best.toLocaleString('en-US') : '— — —';
    $('sound-button').setAttribute('aria-pressed', String(audio.enabled));
    $('sound-button').setAttribute('aria-label', audio.enabled ? '关闭音效' : '开启音效');
    $('sound-button').title = audio.enabled ? '关闭音效' : '开启音效';
    $('launch-title').textContent = savedInfo ? '继续上次飞行' : '开始突围';
    $('launch-subtitle').textContent = savedInfo
      ? `剩余 ${formatTime(Math.ceil(CONFIG.duration - savedInfo.time))} · 等级 ${savedInfo.level}`
      : '三分钟 · 即开即玩';
    $('new-run-button').hidden = !savedInfo;
    $('save-state-hint').textContent = storageUnavailable
      ? '本机存档暂不可用'
      : savedInfo
        ? '飞行进度已保存在本机'
        : '支持中断续局 · 进度保存在本机';
  }
  function stopSteering(preserveTap = false) {
    const target = stick.target,
      id = stick.id;
    stick.id = null;
    stick.target = null;
    stick.x = stick.y = 0;
    if (!preserveTap) gesture.end();
    if (target && id !== null) {
      try {
        target.releasePointerCapture(id);
      } catch {
        /* Already released. */
      }
    }
    $('joystick').classList.remove('steering');
    $('joystick').style.left = '';
    $('joystick').style.top = '';
    $('joystick').style.bottom = '';
    $('joystick-knob').style.transform = '';
  }
  function clearInput() {
    keys.clear();
    stopSteering();
  }
  function closeDialogs() {
    for (const dialog of dialogs) if (dialog.open) dialog.close();
  }
  function notify(message, seconds = 3) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastUntil = performance.now() + seconds * 1000;
  }
  function updateViewport() {
    if (!game) return;
    const safeTop = parseFloat(getComputedStyle(document.querySelector('.topbar')).paddingTop) || 0;
    const safeBottom = Math.max(
      0,
      (parseFloat(getComputedStyle(document.querySelector('.xp-row')).bottom) || 20) - 20,
    );
    setViewport(game, innerWidth, innerHeight, { top: safeTop, bottom: safeBottom });
  }
  function mount(next, restored = false) {
    closeDialogs();
    clearInput();
    audio.unlock();
    renderer.reset();
    game = next;
    if (game.status === 'paused') game.status = 'playing';
    ownershipLost = false;
    recorded = false;
    lastUpgradeLevel = 0;
    lastSector = Math.floor(game.time / 30);
    accumulator = 0;
    hudIn = 0;
    checkpointIn = 0;
    lastFrame = performance.now();
    document.body.dataset.mode = 'game';
    document.body.dataset.runId = game.runId;
    $('home').hidden = true;
    $('hud').hidden = false;
    $('touch-controls').hidden = false;
    $('pause-button').hidden = false;
    document.querySelectorAll('.home-nav').forEach((el) => (el.hidden = true));
    updateViewport();
    updateLoadout();
    updateHud();
    saveCheckpoint();
    $('universe').focus({ preventScroll: true });
    if (game.status === 'upgrade') showUpgrade();
    else
      notify(
        restored ? '飞行已恢复，战场进度保持不变' : '拖动飞行 · 快划或双击冲刺 · 靠近绿光升级',
        restored ? 2.5 : 5,
      );
  }
  function start() {
    const next = createGame();
    next.runId = newId();
    mount(next);
  }
  function continueSaved() {
    profile = loadProfile();
    const saved = loadSaved();
    if (saved) mount(saved.game, true);
    else {
      home();
      notify('没有可恢复的飞行，可以新开一局', 3);
    }
  }
  function home() {
    if (game && !ownershipLost) saveCheckpoint();
    closeDialogs();
    clearInput();
    game = null;
    accumulator = 0;
    ownershipLost = false;
    document.body.dataset.mode = 'home';
    delete document.body.dataset.runId;
    $('home').hidden = false;
    $('hud').hidden = true;
    $('touch-controls').hidden = true;
    $('pause-button').hidden = true;
    $('toast').hidden = true;
    document.querySelectorAll('.home-nav').forEach((el) => (el.hidden = false));
    savedInfo = summaryOf(loadSaved());
    updateHome();
    renderer.reset();
    $('launch-button').focus({ preventScroll: true });
  }
  function ensurePauseDialog() {
    if (game?.status !== 'paused') return;
    $('pause-description').textContent = ownershipLost
      ? '另一页面接管了飞行。继续时将载入最近保存的进度。'
      : storageUnavailable
        ? '游戏已暂停。本机存档暂不可用，请保持当前页面。'
        : '进度已保存。准备好后，继续你的突围。';
    if (!$('pause-dialog').open) {
      try {
        $('pause-dialog').showModal();
      } catch {
        /* A navigating document can be inactive. */
      }
    }
  }
  function pause() {
    if (game?.status !== 'playing') return;
    game.status = 'paused';
    clearInput();
    accumulator = 0;
    saveCheckpoint();
    ensurePauseDialog();
  }

  function resume() {
    if (document.hidden) return;
    if (ownershipLost) {
      continueSaved();
      return;
    }
    if (game?.status !== 'paused') return;
    $('pause-dialog').close();
    game.status = 'playing';
    audio.unlock();
    clearInput();
    accumulator = 0;
    lastFrame = performance.now();
    saveCheckpoint();
    $('universe').focus({ preventScroll: true });
  }
  function movement() {
    return {
      x:
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
        stick.x,
      y:
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) +
        stick.y,
    };
  }
  function doDash(direction) {
    if (!game) return;
    const input = direction || movement();
    if (dash(game, input.x, input.y)) {
      document.body.dataset.lastDashInput = direction ? 'flick' : 'button-or-key';
      updateHud();
      return true;
    }
    return false;
  }
  function updateLoadout() {
    const entries = Object.entries(game.upgrades);
    $('loadout-icons').innerHTML = entries.length
      ? entries
          .map(([id, count]) => {
            const u = UPGRADES.find((u) => u.id === id);
            return `<span class="loadout-icon" title="${u.name} × ${count}" aria-label="${u.name}，${count} 级">${u.icon}<small>${count}</small></span>`;
          })
          .join('')
      : '<span class="empty-loadout">收集绿光，选择改装</span>';
  }
  function showUpgrade() {
    if (lastUpgradeLevel === game.level) return;
    lastUpgradeLevel = game.level;
    clearInput();
    updateHud();
    saveCheckpoint();
    $('upgrade-level').textContent = `LEVEL ${String(game.level).padStart(2, '0')}`;
    $('upgrade-options').innerHTML = game.choices
      .map((id, index) => {
        const u = UPGRADES.find((u) => u.id === id);
        return `<button class="upgrade-card ${u.color}" data-upgrade="${id}"><kbd class="choice-key">${index + 1}</kbd><span class="upgrade-icon">${u.icon}</span><span class="upgrade-label">${u.label} · ${(game.upgrades[id] || 0) + 1}/${u.max}</span><h3>${u.name}</h3><p>${u.description}</p></button>`;
      })
      .join('');
    $('toast').hidden = true;
    if (!$('upgrade-dialog').open) $('upgrade-dialog').showModal();
  }
  function upgrade(id) {
    if (!game || !chooseUpgrade(game, id)) return;
    $('upgrade-dialog').close();
    clearInput();
    updateLoadout();
    updateHud();
    saveCheckpoint();
    accumulator = 0;
    $('universe').focus({ preventScroll: true });
    if (game.status === 'upgrade') showUpgrade();
    else notify(`${UPGRADES.find((u) => u.id === id).name}已装配`, 1.8);
  }
  function updateHud() {
    if (!game) return;
    const p = game.player;
    ui.score.textContent = formatScore(game.score);
    ui.combo.textContent =
      game.combo >= 3 ? `${game.combo} 连破 · ×${game.multiplier}` : '保持移动';
    ui.timer.textContent = formatTime(Math.ceil(CONFIG.duration - game.time));
    ui['time-progress'].style.width = `${Math.max(0, 1 - game.time / CONFIG.duration) * 100}%`;
    ui['health-text'].textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    ui['health-bar'].style.width = `${(p.hp / p.maxHp) * 100}%`;
    ui['health-bar'].style.background = p.hp / p.maxHp < 0.3 ? '#ff9780' : '';
    ui.kills.textContent = `${game.kills} 击破`;
    ui.level.textContent = `LV. ${String(game.level).padStart(2, '0')}`;
    ui['xp-bar'].style.width = `${Math.min(100, (game.xp / game.xpNext) * 100)}%`;
    ui['xp-label'].textContent = `能量 ${game.xp} / ${game.xpNext}`;
    ui['dash-label'].textContent =
      p.dashCooldown > 0 ? `${p.dashCooldown.toFixed(1)} s` : '冲刺就绪';
    $('touch-dash-label').textContent =
      p.dashCooldown > 0 ? `${p.dashCooldown.toFixed(1)}s` : '冲刺';
    ui['dash-button'].disabled = p.dashCooldown > 0 || game.status !== 'playing';
    ui['touch-dash'].disabled = p.dashCooldown > 0 || game.status !== 'playing';
    ui['mission-status'].textContent = game.bossSpawned
      ? '击破母舰'
      : `母舰 ${formatTime(Math.ceil(CONFIG.bossAt - game.time))}`;
    const boss = game.enemies.find((e) => e.kind === 'boss' && e.alive);
    ui['boss-hud'].hidden = !boss;
    if (boss) {
      const percent = Math.max(0, (boss.hp / boss.maxHp) * 100);
      ui['boss-percent'].textContent = `${Math.ceil(percent)}%`;
      ui['boss-bar'].style.width = `${percent}%`;
    }
    $('hud').setAttribute(
      'aria-label',
      `剩余 ${ui.timer.textContent}，护盾 ${Math.ceil(p.hp)}，得分 ${game.score}`,
    );
  }
  function result() {
    if (recorded) return;
    recorded = true;
    clearInput();
    closeDialogs();
    updateHud();
    const won = game.status === 'won';
    profile = loadProfile();
    const best = game.score > profile.best;
    if (settleRun(profile, game)) saveProfile();
    discardCheckpoint();
    $('result-eyebrow').textContent = won
      ? 'MISSION COMPLETE / 突围成功'
      : 'FLIGHT COMPLETE / 飞行结束';
    $('result-emblem').textContent = won ? '✳' : '↗';
    $('result-title').textContent = won
      ? '星环记住了你。'
      : game.status === 'timeout'
        ? '再快一点，就能突围。'
        : '下一次，飞得更远。';
    $('result-description').textContent = won
      ? '母舰已化为星尘。你为这片宇宙，留出了一点空间。'
      : game.status === 'timeout'
        ? '母舰完成跃迁。尝试强化弹头与分裂弹道，提高对母舰的火力。'
        : '护盾耗尽。保持移动，快划或双击可以冲出危险。';
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
    profile = loadProfile();
    $('record-runs').textContent = profile.runs;
    $('record-wins').textContent = profile.wins;
    $('record-kills').textContent = profile.kills;
    $('record-list').innerHTML = profile.records.length
      ? profile.records
          .map(
            (r, index) =>
              `<div class="record-row"><span>${index === 0 ? '最近一局' : `飞行记录 ${index + 1}`}</span><span>${r.won ? '突围成功' : '未突围'} · ${formatTime(r.time)}</span><strong>${r.score.toLocaleString('en-US')}</strong></div>`,
          )
          .join('')
      : '<p class="empty-record">星图上还没有你的航迹。<br />完成第一局，留下你的纪录。</p>';
    $('records-dialog').showModal();
  }

  document.querySelectorAll('[data-start]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.id === 'launch-button' && savedInfo) continueSaved();
      else start();
    }),
  );
  $('new-run-button').addEventListener('click', start);
  document
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $('how-to').addEventListener('click', () => $('help-dialog').showModal());
  $('records-button').addEventListener('click', records);
  $('sound-button').addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    profile = loadProfile();
    profile.sound = audio.enabled;
    audio.unlock();
    if (audio.enabled) audio.tone(640, 0.12);
    saveProfile();
    updateHome();
  });
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  $('quit-button').addEventListener('click', () => {
    if (!ownershipLost) {
      discardCheckpoint();
      game = null;
    }
    home();
  });
  $('save-home-button').addEventListener('click', home);
  $('home-button').addEventListener('click', home);
  document.querySelector('.brand').addEventListener('click', (event) => {
    event.preventDefault();
    if (game) pause();
    else home();
  });
  $('dash-button').addEventListener('click', () => doDash());
  $('touch-dash').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    audio.unlock();
    doDash();
  });
  $('upgrade-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade]');
    if (button) upgrade(button.dataset.upgrade);
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

  window.addEventListener('keydown', (event) => {
    const isGameKey = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
    ].includes(event.code);
    if (game && isGameKey) event.preventDefault();
    if (event.repeat && ['Space', 'Escape', 'KeyP'].includes(event.code)) return;
    if (game?.status === 'upgrade' && /^Digit[123]$/.test(event.code)) {
      const id = game.choices[Number(event.code.at(-1)) - 1];
      if (id) upgrade(id);
      return;
    }
    if (event.code === 'KeyP') {
      if (game?.status === 'paused') resume();
      else pause();
      return;
    }
    if (event.code === 'Escape' && game?.status === 'playing') {
      event.preventDefault();
      pause();
      return;
    }
    if (game?.status !== 'playing') return;
    if (isGameKey) keys.add(event.code);
    if (event.code === 'Space') doDash();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    clearInput();
    pause();
    saveCheckpoint();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInput();
      pause();
      saveCheckpoint();
    } else ensurePauseDialog();
    accumulator = 0;
    lastFrame = performance.now();
  });
  window.addEventListener('pagehide', () => {
    if (game?.status === 'playing') game.status = 'paused';
    clearInput();
    saveCheckpoint();
  });
  window.addEventListener('pageshow', () => {
    accumulator = 0;
    lastFrame = performance.now();
    if (game?.status === 'paused') {
      const latest = loadSaved();
      if (latest && latest.owner !== owner) ownershipLost = true;
      updateViewport();
      ensurePauseDialog();
    }
  });
  window.addEventListener('resize', () => {
    clearInput();
    updateViewport();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== CONFIG.checkpointKey) return;
    const saved = decodeCheckpoint(event.newValue);
    if (
      game &&
      ['playing', 'paused', 'upgrade'].includes(game.status) &&
      saved &&
      saved.owner !== owner
    ) {
      ownershipLost = true;
      clearInput();
      if (game.status === 'upgrade') {
        $('upgrade-dialog').close();
        game.status = 'playing';
      }
      if (game.status === 'paused') game.status = 'playing';
      pause();
    }
    if (!game) {
      savedInfo = summaryOf(loadSaved());
      updateHome();
    }
  });
  for (const id of ['upgrade-dialog', 'result-dialog'])
    $(id).addEventListener('cancel', (event) => event.preventDefault());
  $('pause-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    resume();
  });

  function renderStick(state) {
    stick.x = state.x;
    stick.y = state.y;
    const joystick = $('joystick');
    joystick.classList.add('steering');
    joystick.style.left = `${state.anchor.x - 64}px`;
    joystick.style.top = `${state.anchor.y - 64}px`;
    joystick.style.bottom = 'auto';
    $('joystick-knob').style.transform =
      `translate(${state.x * TOUCH.radius}px,${state.y * TOUCH.radius}px)`;
  }
  function pointerDown(event) {
    if (game?.status !== 'playing' || stick.id !== null || event.button !== 0) return;
    event.preventDefault();
    audio.unlock();
    stick.id = event.pointerId;
    stick.target = event.currentTarget;
    stick.target.setPointerCapture(event.pointerId);
    renderStick(gesture.begin(event.clientX, event.clientY, event.timeStamp));
  }
  function pointerMove(event) {
    if (event.pointerId !== stick.id || game?.status !== 'playing') return;
    const state = gesture.move(event.clientX, event.clientY, event.timeStamp);
    if (!state) return;
    renderStick(state);
    if (state.flick) doDash(state.flick);
  }
  for (const target of [$('universe'), $('joystick')]) {
    target.addEventListener('pointerdown', pointerDown);
    target.addEventListener('pointermove', pointerMove);
    target.addEventListener('pointerup', (event) => {
      if (event.pointerId !== stick.id) return;
      const result = gesture.finish(event.clientX, event.clientY, event.timeStamp);
      stopSteering(true);
      if (result.doubleTap && doDash()) document.body.dataset.lastDashInput = 'double-tap';
    });
    for (const name of ['pointercancel', 'lostpointercapture'])
      target.addEventListener(name, (event) => {
        if (event.pointerId === stick.id) stopSteering();
      });
    target.addEventListener('dblclick', (event) => {
      if (game?.status === 'playing') {
        event.preventDefault();
        if (doDash()) document.body.dataset.lastDashInput = 'double-tap';
      }
    });
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (game?.status === 'playing') {
      accumulator = Math.min(accumulator + dt, CONFIG.step * 6);
      const input = movement();
      while (accumulator >= CONFIG.step && game.status === 'playing') {
        step(game, input);
        accumulator -= CONFIG.step;
      }
      hudIn -= dt;
      if (hudIn <= 0) {
        updateHud();
        hudIn = 0.08;
      }
      checkpointIn -= dt;
      if (checkpointIn <= 0) saveCheckpoint();
      const sector = Math.floor(game.time / 30);
      if (sector > lastSector && !game.bossSpawned) {
        lastSector = sector;
        notify(`第 ${sector + 1} 波敌舰接近`, 2);
      }
    } else accumulator = 0;
    if (game) {
      renderer.events(game.events);
      for (const event of game.events) {
        audio.play(event);
        if (event.type === 'boss') notify('⚠ 母舰抵达 · 40 秒内击破', 4);
      }
      game.events.length = 0;
      if (game.status === 'upgrade') showUpgrade();
      if (['won', 'lost', 'timeout'].includes(game.status)) result();
    }
    if (now > toastUntil) $('toast').hidden = true;
    renderer.frame(game, now / 1000, dt);
    requestAnimationFrame(frame);
  }
  updateHome();
  requestAnimationFrame(frame);
}

try {
  initialize();
} catch (error) {
  console.error(error);
  $('fatal-error').hidden = false;
  $('fatal-error').textContent =
    '游戏加载失败。请刷新页面，或使用支持 Canvas 的现代浏览器重新打开。';
}
