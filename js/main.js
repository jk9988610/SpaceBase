/**
 * 太空基地 Spacebase — 主循环与启动
 */

let loopId = null;
let speed = 1;
let ticksPerFrame = 1;

function startSimulation(profile) {
  if (loopId) cancelAnimationFrame(loopId);
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

function runLoop() {
  if (loopId) cancelAnimationFrame(loopId);
  let last = performance.now();
  let acc = 0;
  const interval = 80;

  function frame(now) {
    try {
      if (!gameState || gameState.gameOver) return;
      if (speed === 0) { loopId = requestAnimationFrame(frame); return; }

      if (last === 0) last = now;
      acc += now - last;
      last = now;
      const step = interval / speed;

      while (acc >= step) {
        for (let i = 0; i < ticksPerFrame; i++) {
          if (gameState.gameOver) break;
          simulateTick(gameState);
        }
        acc -= step;
        if (gameState.gameOver) break;
      }

      renderGame(gameState);
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
  speed = s;
  ticksPerFrame = s >= 16 ? 8 : s >= 4 ? 3 : 1;
  updateSpeedLabel(s);
}

/** 极速推演：从种子重置后跑完整路径，与批量推演完全一致 */
async function fastSimulate() {
  if (!gameState) return;
  const profile = gameState.aiProfile;
  if (loopId) cancelAnimationFrame(loopId);
  setSpeed(0);
  document.getElementById('speed-label').textContent = '极速中…';
  gameState = await runProfileSimulationAsync(profile, SIM_MAX_TICKS);
  renderGame(gameState);
  if (gameState.gameOver) showEndScreen(gameState);
  else {
    addLog(gameState, `推演 ${gameState.tick} 日未达结局（上限 ${SIM_MAX_TICKS}）`, 'important');
    renderGame(gameState);
    runLoop();
  }
}

function initUI() {
  document.querySelectorAll('[data-profile]').forEach(btn => {
    btn.onclick = () => startSimulation(btn.dataset.profile);
  });

  document.getElementById('btn-restart').onclick = () => {
    if (loopId) cancelAnimationFrame(loopId);
    showScreen('start-screen');
  };

  document.getElementById('btn-pause').onclick = () => setSpeed(0);
  document.getElementById('btn-speed-1').onclick = () => setSpeed(1);
  document.getElementById('btn-speed-4').onclick = () => setSpeed(4);
  document.getElementById('btn-speed-16').onclick = () => setSpeed(16);
  document.getElementById('btn-fast').onclick = () => fastSimulate();

  document.getElementById('btn-sim-all').onclick = () => {
    runAllEndings(Object.keys(AI_PROFILES));
  };
}

/** 批量推演：与单人格极速共用 runProfileSimulationAsync */
async function runAllEndings(profiles) {
  const container = document.getElementById('sim-results');
  const btn = document.getElementById('btn-sim-all');
  container.hidden = false;
  btn.disabled = true;

  const results = [];
  for (let idx = 0; idx < profiles.length; idx++) {
    const p = profiles[idx];
    container.innerHTML = `<p class="sim-loading">正在推演：${AI_PROFILES[p].name}（${idx + 1}/${profiles.length}）…</p>`;
    const s = await runProfileSimulationAsync(p, SIM_MAX_TICKS);
    results.push(generateReport(s));
    await new Promise(r => setTimeout(r, 0));
  }

  btn.disabled = false;
  container.innerHTML = `
    <h3>全人格推演结果 <span class="sim-note">（同人格可复现）</span></h3>
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
}

document.addEventListener('DOMContentLoaded', initUI);
