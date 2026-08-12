/**
 * 太空基地 Spacebase — 主循环与启动
 */

let loopId = null;
let speed = 1;
let ticksPerFrame = 1;
let speedBeforeEventPause = 1;
let pausedForEvent = false;
let selectedBaseId = null;

function startPlayerGame(baseId) {
  if (loopId) cancelAnimationFrame(loopId);
  pausedForEvent = false;
  gameState = createPlayerState(baseId);
  addLog(gameState, '文明种子计划启动。理事会授予你最高决策权。', 'important');
  addLog(gameState, `执政基地：${gameState.baseName}（${gameState.baseCode}）`, 'important');
  showScreen('game-screen');
  renderGame(gameState);
  speed = 1;
  ticksPerFrame = 1;
  updateSpeedLabel(speed);
  runLoop();
}

function startWatchMode(profile) {
  if (loopId) cancelAnimationFrame(loopId);
  pausedForEvent = false;
  gameState = createInitialState(profile);
  addLog(gameState, '文明种子计划启动。AI 统筹官接管全部决策权。', 'important');
  addLog(gameState, `决策人格：${AI_PROFILES[profile].name} · 种子 ${gameState.simSeed}`, 'important');
  showScreen('game-screen');
  renderGame(gameState);
  speed = 1;
  ticksPerFrame = 1;
  updateSpeedLabel(speed);
  runLoop();
}

/** 单人格极速推演：与批量推演共用同一路径 */
async function startFastSimulation(profile) {
  if (loopId) cancelAnimationFrame(loopId);
  const container = document.getElementById('sim-results');
  const buttons = document.querySelectorAll('[data-profile], #btn-sim-all, #btn-watch, #btn-start-player');
  container.hidden = false;
  container.innerHTML = `<p class="sim-loading">正在推演：${AI_PROFILES[profile].name}…</p>`;
  buttons.forEach(b => { b.disabled = true; });

  try {
    gameState = await runProfileSimulationAsync(profile, SIM_MAX_TICKS);
    container.hidden = true;
    if (gameState.gameOver) showEndScreen(gameState);
    else {
      addLog(gameState, `推演 ${gameState.tick} 日未达结局（上限 ${SIM_MAX_TICKS}）`, 'important');
      showScreen('game-screen');
      renderGame(gameState);
      runLoop();
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="sim-error">推演失败：${err.message}</p>`;
  } finally {
    buttons.forEach(b => { b.disabled = false; });
  }
}

function handlePendingEvent() {
  if (!gameState?.pendingEvent || pausedForEvent) return;
  pausedForEvent = true;
  speedBeforeEventPause = speed || 1;
  setSpeed(0);
  document.getElementById('speed-label').textContent = '事件暂停';
  renderGame(gameState);
  showEventChoiceModal(gameState, (choice) => {
    resolveEventWithChoice(gameState, gameState.pendingEvent, choice, { actor: 'player' });
    hideEventChoiceModal();
    pausedForEvent = false;
    checkEnding(gameState);
    renderGame(gameState);
    if (gameState.gameOver) {
      showEndScreen(gameState);
      return;
    }
    const resume = speedBeforeEventPause || 1;
    setSpeed(resume);
    runLoop();
  });
}

function runLoop() {
  if (loopId) cancelAnimationFrame(loopId);
  let last = performance.now();
  let acc = 0;
  const interval = 80;

  function frame(now) {
    try {
      if (!gameState || gameState.gameOver) return;

      if (gameState.pendingEvent) {
        const pop = gameState.pops.reduce((s, p) => s + p.count, 0);
        if (pop <= 0) {
          gameState.pendingEvent = null;
          checkEnding(gameState);
          renderGame(gameState);
          if (gameState.gameOver) {
            showEndScreen(gameState);
            return;
          }
        }
        handlePendingEvent();
        loopId = requestAnimationFrame(frame);
        return;
      }

      if (speed === 0) {
        loopId = requestAnimationFrame(frame);
        return;
      }

      if (last === 0) last = now;
      acc += now - last;
      last = now;
      const step = interval / speed;

      while (acc >= step) {
        if (gameState.pendingEvent || gameState.gameOver) break;
        for (let i = 0; i < ticksPerFrame; i++) {
          if (gameState.gameOver || gameState.pendingEvent) break;
          simulateTick(gameState);
          if (!gameState.gameOver && !gameState.pendingEvent) checkEnding(gameState);
        }
        acc -= step;
        if (gameState.gameOver || gameState.pendingEvent) break;
      }

      renderGame(gameState);

      if (gameState.pendingEvent) {
        handlePendingEvent();
        loopId = requestAnimationFrame(frame);
        return;
      }

      if (gameState.gameOver) {
        showEndScreen(gameState);
        return;
      }
      loopId = requestAnimationFrame(frame);
    } catch (err) {
      console.error(err);
      addLog(gameState, `模拟错误：${err.message}`, 'danger');
      renderGame(gameState);
    }
  }
  last = 0;
  loopId = requestAnimationFrame(frame);
}

function setSpeed(s) {
  if (pausedForEvent) return;
  speed = s;
  ticksPerFrame = s >= 16 ? 8 : s >= 4 ? 3 : 1;
  updateSpeedLabel(speed);
}

async function fastSimulate() {
  if (!gameState || gameState.gameMode === 'player') return;
  const profile = gameState.aiProfile;
  if (loopId) cancelAnimationFrame(loopId);
  setSpeed(0);
  document.getElementById('speed-label').textContent = '极速中…';
  gameState = await runProfileSimulationAsync(profile, SIM_MAX_TICKS);
  renderGame(gameState);
  if (gameState.gameOver) showEndScreen(gameState);
  else {
    addLog(gameState, `推演 ${gameState.tick} 日未达结局`, 'important');
    renderGame(gameState);
    runLoop();
  }
}

function showWatchProfilePicker() {
  const container = document.getElementById('sim-results');
  container.hidden = false;
  container.innerHTML = `
    <p class="profile-label">观战模式：选择人格</p>
    <div class="profile-grid profile-grid-compact">
      ${Object.keys(AI_PROFILES).map(p =>
        `<button class="btn btn-profile btn-profile-sm" data-watch="${p}">${AI_PROFILES[p].name}</button>`
      ).join('')}
    </div>`;
  container.querySelectorAll('[data-watch]').forEach(btn => {
    btn.onclick = () => {
      container.hidden = true;
      startWatchMode(btn.dataset.watch);
    };
  });
}

function initModeTabs() {
  const tabs = document.querySelectorAll('[data-mode-tab]');
  const panels = { player: document.getElementById('panel-player'), ai: document.getElementById('panel-ai') };
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p?.classList.remove('active'));
      panels[tab.dataset.modeTab]?.classList.add('active');
    };
  });
}

function initBaseSelection() {
  const ids = Object.keys(STARTING_BASES);
  selectedBaseId = ids[0];
  renderBaseSelection(selectedBaseId);
  const grid = document.getElementById('base-grid');
  const startBtn = document.getElementById('btn-start-player');

  grid?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-base]');
    if (!card) return;
    selectedBaseId = card.dataset.base;
    renderBaseSelection(selectedBaseId);
    if (startBtn) startBtn.disabled = false;
  });

  if (startBtn) {
    startBtn.disabled = false;
    startBtn.onclick = () => {
      if (selectedBaseId) startPlayerGame(selectedBaseId);
    };
  }
}

function initUI() {
  const verEl = document.getElementById('build-version');
  if (verEl && typeof BUILD_VERSION !== 'undefined') {
    verEl.textContent = `版本 ${BUILD_VERSION}`;
  }

  initModeTabs();
  initBaseSelection();

  document.querySelectorAll('[data-profile]').forEach(btn => {
    btn.onclick = () => startFastSimulation(btn.dataset.profile);
  });

  document.getElementById('btn-watch')?.addEventListener('click', showWatchProfilePicker);

  document.getElementById('btn-restart').onclick = () => {
    if (loopId) cancelAnimationFrame(loopId);
    pausedForEvent = false;
    hideEventChoiceModal();
    document.getElementById('sim-results').hidden = true;
    showScreen('start-screen');
  };

  document.getElementById('btn-pause').onclick = () => {
    if (!pausedForEvent) setSpeed(0);
  };
  document.getElementById('btn-speed-1').onclick = () => setSpeed(1);
  document.getElementById('btn-speed-4').onclick = () => setSpeed(4);
  document.getElementById('btn-speed-16').onclick = () => setSpeed(16);
  document.getElementById('btn-fast').onclick = () => fastSimulate();
  document.getElementById('btn-sim-all')?.addEventListener('click', () => {
    runAllEndings(Object.keys(AI_PROFILES));
  });
}

async function runAllEndings(profiles) {
  const container = document.getElementById('sim-results');
  const btn = document.getElementById('btn-sim-all');
  const profileBtns = document.querySelectorAll('[data-profile], #btn-watch, #btn-start-player');
  container.hidden = false;
  btn.disabled = true;
  profileBtns.forEach(b => { b.disabled = true; });

  try {
    const results = [];
    for (let idx = 0; idx < profiles.length; idx++) {
      const p = profiles[idx];
      container.innerHTML = `<p class="sim-loading">正在推演：${AI_PROFILES[p].name}（${idx + 1}/${profiles.length}）…</p>`;
      const s = await runProfileSimulationAsync(p, SIM_MAX_TICKS);
      results.push(generateReport(s));
      await new Promise(r => setTimeout(r, 0));
    }

    container.innerHTML = `
      <h3>全人格推演结果 <span class="sim-note">（${BUILD_VERSION}）</span></h3>
      <div class="sim-grid">
        ${results.map(r => `
          <div class="sim-card">
            <div class="sim-ending">${r.title}</div>
            <div class="sim-cause">${r.causeTitle || ''}</div>
            <div class="sim-profile">${r.aiProfile}</div>
            <div class="sim-detail">${r.years}年 · 人口${r.population} · ${r.diversity}</div>
            <div class="sim-seed">种子 ${r.simSeed}</div>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="sim-error">批量推演失败：${err.message}</p>`;
  } finally {
    btn.disabled = false;
    profileBtns.forEach(b => { b.disabled = false; });
  }
}

document.addEventListener('DOMContentLoaded', initUI);
