/**
 * 太空基地 Spacebase — 主循环与启动
 */

let loopId = null;
let speed = 1;
let ticksPerFrame = 1;

function startSimulation(profile) {
  gameState = createInitialState(profile);
  addLog(gameState, '文明种子计划启动。AI 统筹官接管全部决策权。', 'important');
  addLog(gameState, `决策人格：${AI_PROFILES[profile].name}`, 'important');
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
    if (!gameState || gameState.gameOver) return;
    if (speed === 0) { loopId = requestAnimationFrame(frame); return; }

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
  }
  loopId = requestAnimationFrame(frame);
}

function setSpeed(s) {
  speed = s;
  ticksPerFrame = s >= 16 ? 8 : s >= 4 ? 3 : 1;
  updateSpeedLabel(s);
}

function fastSimulate() {
  if (!gameState || gameState.gameOver) return;
  const before = gameState.tick;
  fastForwardToEnd(gameState, 30000);
  renderGame(gameState);
  if (gameState.gameOver) showEndScreen(gameState);
  else addLog(gameState, `极速推演 ${gameState.tick - before} 日`, 'important');
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
    const profiles = Object.keys(AI_PROFILES);
    runAllEndings(profiles);
  };
}

/** 批量推演全部 AI 人格至结局，结果展示在开始页 */
async function runAllEndings(profiles) {
  const container = document.getElementById('sim-results');
  container.hidden = false;
  container.innerHTML = '<p class="sim-loading">正在推演全部结局路径…</p>';

  const results = [];
  for (const p of profiles) {
    const s = createInitialState(p);
    fastForwardToEnd(s, 40000);
    const r = generateReport(s);
    results.push(r);
    await new Promise(r => setTimeout(r, 10));
  }

  container.innerHTML = `
    <h3>全人格推演结果</h3>
    <div class="sim-grid">
      ${results.map(r => `
        <div class="sim-card">
          <div class="sim-ending">${r.title}</div>
          <div class="sim-profile">${r.aiProfile}</div>
          <div class="sim-detail">${r.years}年 · 人口${r.population} · ${r.diversity}</div>
        </div>`).join('')}
    </div>`;
}

document.addEventListener('DOMContentLoaded', initUI);
