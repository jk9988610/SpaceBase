/**
 * 太空基地 Spacebase — Canvas 可视化层（只读，独立于 simulateTick）
 * Phase 1：舰桥截面 + 星图占位 + 资源 HUD
 */

const VIZ_MODULE_ORDER = [
  'habitat', 'agriculture', 'reactor', 'shipyard', 'lab', 'medical', 'archive', 'immigration',
];

const VIZ_MODULE_COLORS = {
  habitat: '#6a8caf',
  agriculture: '#4a9e6e',
  reactor: '#e0a030',
  shipyard: '#8a7a99',
  lab: '#4a7ec9',
  medical: '#3a9e9e',
  archive: '#7a8499',
  immigration: '#c9a227',
};

const VIZ_MODULE_SHORT = {
  habitat: '人居',
  agriculture: '农业',
  reactor: '能源',
  shipyard: '船坞',
  lab: '科研',
  medical: '医疗',
  archive: '档案',
  immigration: '移民',
};

let vizRunning = false;
let vizFrameId = null;
let vizLastTime = 0;
let vizElapsed = 0;
let vizView = 'bridge';
let vizGetState = () => null;
let vizStars = null;

function initBaseViz(getState) {
  vizGetState = getState || (() => null);
  const canvas = document.getElementById('base-viz-canvas');
  if (!canvas) return;

  document.querySelectorAll('[data-viz-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-viz-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      vizView = btn.dataset.vizView || 'bridge';
    });
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => resizeVizCanvas(canvas));
    const stage = document.getElementById('viz-stage');
    if (stage) ro.observe(stage);
  }
  window.addEventListener('resize', () => resizeVizCanvas(canvas));

  if (!vizRunning) {
    vizRunning = true;
    vizLastTime = performance.now();
    vizLoop(vizLastTime);
  }
}

function stopBaseViz() {
  vizRunning = false;
  if (vizFrameId) {
    cancelAnimationFrame(vizFrameId);
    vizFrameId = null;
  }
}

function resizeVizCanvas(canvas) {
  const stage = canvas.parentElement;
  if (!stage) return;
  const w = Math.max(stage.clientWidth, 1);
  const h = Math.max(stage.clientHeight, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

function getVizStress(state) {
  const stats = typeof aggregateStats === 'function' ? aggregateStats(state) : { total: 0 };
  const total = stats.total || 1;
  const hasEmergency = (state.modifiers || []).some(m => m.id?.startsWith('emergency_'));
  return {
    agriculture: state.netFood < 0 || state.resources.food < total * 0.05,
    reactor: state.netEnergy < 0 || state.resources.energy < total * 0.04,
    shipyard: state.resources.ore < 15,
    hasEmergency,
  };
}

function drawSky(ctx, w, h, state, time) {
  const phase = state.phase === 1;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (phase) {
    g.addColorStop(0, '#0a1628');
    g.addColorStop(0.55, '#142238');
    g.addColorStop(1, '#1a3a2a');
  } else {
    g.addColorStop(0, '#020408');
    g.addColorStop(0.7, '#0a0e17');
    g.addColorStop(1, '#0d1321');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  if (!vizStars || vizStars.length < 40) {
    vizStars = Array.from({ length: 60 }, (_, i) => ({
      x: ((i * 97) % 1000) / 1000,
      y: ((i * 53) % 1000) / 1000,
      r: 0.5 + (i % 3) * 0.4,
      a: 0.2 + (i % 5) * 0.12,
    }));
  }
  vizStars.forEach(s => {
    const tw = 0.7 + 0.3 * Math.sin(time * 1.5 + s.x * 20);
    ctx.globalAlpha = s.a * tw;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h * 0.65, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if (phase) {
    const horizonY = h * 0.78;
    const earthG = ctx.createLinearGradient(0, horizonY - 40, 0, h);
    earthG.addColorStop(0, 'rgba(60,120,80,0)');
    earthG.addColorStop(0.4, 'rgba(40,90,60,0.35)');
    earthG.addColorStop(1, 'rgba(20,50,35,0.7)');
    ctx.fillStyle = earthG;
    ctx.fillRect(0, horizonY - 40, w, h - horizonY + 40);
  }
}

function drawPulseRing(ctx, x, y, r, time, color, intensity) {
  const pulse = 0.88 + 0.12 * Math.sin(time * 2.2);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.25 + 0.35 * intensity;
  ctx.beginPath();
  ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBridgeView(ctx, w, h, state, time) {
  drawSky(ctx, w, h, state, time);
  const stress = getVizStress(state);
  const counts = state.compartments || {};
  const cx = w / 2;
  const cy = h * 0.46;
  const ringW = Math.min(w * 0.82, 520);
  const ringH = Math.min(h * 0.38, 120);

  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = 'rgba(138,160,200,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, ringW / 2, ringH / 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  const modules = VIZ_MODULE_ORDER
    .map(id => ({ id, count: counts[id] || 0 }))
    .filter(m => m.count > 0 && !(m.id === 'immigration' && state.phase !== 1));

  const totalUnits = modules.reduce((s, m) => s + m.count, 0) || 1;
  const innerW = ringW * 0.88;
  let x = -innerW / 2;

  modules.forEach(mod => {
    const segW = (mod.count / totalUnits) * innerW;
    const color = VIZ_MODULE_COLORS[mod.id] || '#888';
    const isStress = stress[mod.id] || (stress.hasEmergency && (mod.id === 'agriculture' || mod.id === 'reactor'));
    const blockH = ringH * 0.55;
    const by = -blockH / 2;

    const grd = ctx.createLinearGradient(x, by, x, by + blockH);
    grd.addColorStop(0, color);
    grd.addColorStop(1, shadeColor(color, -30));
    ctx.fillStyle = grd;
    roundRect(ctx, x + 2, by, segW - 4, blockH, 4);
    ctx.fill();

    if (isStress) {
      drawPulseRing(ctx, x + segW / 2, 0, Math.max(segW * 0.35, 18), time, stress.hasEmergency ? '#ffc44d' : '#e05555', 1);
    }

    ctx.fillStyle = 'rgba(232,240,255,0.9)';
    ctx.font = `${Math.max(9, Math.min(11, segW * 0.14))}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = VIZ_MODULE_SHORT[mod.id] || mod.id;
    if (segW > 28) {
      ctx.fillText(label, x + segW / 2, 0);
      if (segW > 42) {
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = 'rgba(200,210,230,0.7)';
        ctx.fillText(`×${mod.count}`, x + segW / 2, blockH * 0.28);
      }
    }

    x += segW;
  });

  ctx.restore();

  const label = state.phase === 1 ? '轨道基地 · 地球纪元' : '深空基地 · 太空纪元';
  ctx.fillStyle = 'rgba(138,160,200,0.75)';
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, h * 0.12);

  if (state.phase === 2 && state.shipProgress > 0.02) {
    const barY = cy + ringH / 2 + 22;
    const barW = ringW * 0.7;
    ctx.fillStyle = 'rgba(8,12,20,0.65)';
    roundRect(ctx, cx - barW / 2, barY, barW, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#58a6ff';
    roundRect(ctx, cx - barW / 2, barY, barW * state.shipProgress, 8, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(138,160,200,0.8)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(`世代飞船 ${(state.shipProgress * 100).toFixed(0)}%`, cx, barY - 8);
  }

  drawVizHud(ctx, w, h, state);
}

function drawStarMapView(ctx, w, h, state, time) {
  ctx.fillStyle = '#020408';
  ctx.fillRect(0, 0, w, h);

  if (!vizStars) {
    vizStars = Array.from({ length: 60 }, (_, i) => ({
      x: ((i * 97) % 1000) / 1000,
      y: ((i * 53) % 1000) / 1000,
      r: 0.5 + (i % 3) * 0.4,
      a: 0.2 + (i % 5) * 0.12,
    }));
  }
  vizStars.forEach(s => {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const cx = w / 2;
  const cy = h * 0.48;
  const stats = typeof aggregateStats === 'function' ? aggregateStats(state) : { total: 0 };

  if (state.phase === 1) {
    const earthR = Math.min(w, h) * 0.14;
    const earthG = ctx.createRadialGradient(cx - earthR * 0.3, cy - earthR * 0.3, 0, cx, cy, earthR);
    earthG.addColorStop(0, '#5a9ec9');
    earthG.addColorStop(0.6, '#2a6a8a');
    earthG.addColorStop(1, '#143850');
    ctx.fillStyle = earthG;
    ctx.beginPath();
    ctx.arc(cx, cy, earthR, 0, Math.PI * 2);
    ctx.fill();

    const yearsLeft = Math.max(0, EARTH_COUNTDOWN_YEARS - getYear(state));
    const progress = 1 - yearsLeft / EARTH_COUNTDOWN_YEARS;
    const arcR = earthR + 28;
    ctx.strokeStyle = 'rgba(255,100,80,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();

    const stationAngle = -Math.PI / 2 + progress * Math.PI * 2;
    const sx = cx + Math.cos(stationAngle) * (arcR + 14);
    const sy = cy + Math.sin(stationAngle) * (arcR + 14);
    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    drawPulseRing(ctx, sx, sy, 12, time, '#58a6ff', 0.8);

    ctx.fillStyle = 'rgba(232,240,255,0.85)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`撞击倒计时 ${yearsLeft} 年`, cx, h * 0.82);
  } else {
    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    drawPulseRing(ctx, cx, cy, 18, time, '#58a6ff', 0.6);

    const orbitR = Math.min(w, h) * 0.22;
    ctx.strokeStyle = 'rgba(90,120,180,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
    ctx.stroke();

    if (state.shipProgress > 0.01) {
      const endAngle = -Math.PI / 2 + state.shipProgress * Math.PI * 1.8;
      ctx.strokeStyle = '#7ddea8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, -Math.PI / 2, endAngle);
      ctx.stroke();

      const shipAngle = endAngle;
      const shipX = cx + Math.cos(shipAngle) * orbitR;
      const shipY = cy + Math.sin(shipAngle) * orbitR;
      ctx.fillStyle = '#7ddea8';
      ctx.beginPath();
      ctx.arc(shipX, shipY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(232,240,255,0.85)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`人口 ${stats.total} · 科研 ${(state.research * 100).toFixed(0)}% · 飞船 ${(state.shipProgress * 100).toFixed(0)}%`, cx, h * 0.82);
  }

  ctx.fillStyle = 'rgba(138,160,200,0.6)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('星图模式', cx, h * 0.1);

  drawVizHud(ctx, w, h, state);
}

function drawVizHud(ctx, w, h, state) {
  const stats = typeof aggregateStats === 'function' ? aggregateStats(state) : { total: 0, stability: 0 };
  const pad = 10;
  const barH = 5;
  const rowH = 14;
  const maxRes = 600;
  const rows = [
    { label: '能源', key: 'energy', color: '#e0a030' },
    { label: '食物', key: 'food', color: '#4a9e6e' },
    { label: '矿石', key: 'ore', color: '#8a7a99' },
    { label: '挥发', key: 'volatiles', color: '#3a9e9e' },
  ];

  const hudH = rows.length * rowH + pad * 2;
  const hudY = h - hudH;
  ctx.fillStyle = 'rgba(8,12,20,0.78)';
  roundRect(ctx, pad, hudY, w - pad * 2, hudH, 6);
  ctx.fill();

  rows.forEach((row, i) => {
    const y = hudY + pad + i * rowH;
    const val = state.resources[row.key] || 0;
    const pct = clamp(val / maxRes, 0, 1);
    const barX = pad + 36;
    const barW = w - pad * 2 - 36 - 34;

    ctx.fillStyle = 'rgba(138,160,200,0.85)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, pad + 6, y + barH / 2);

    ctx.fillStyle = 'rgba(30,40,55,0.9)';
    roundRect(ctx, barX, y, barW, barH, 2);
    ctx.fill();

    const low = val < (stats.total * 0.03 || 20);
    ctx.fillStyle = low ? '#e05555' : row.color;
    if (pct > 0) {
      roundRect(ctx, barX, y, Math.max(barW * pct, 2), barH, 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(200,210,230,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.floor(val)), w - pad - 4, y + barH / 2);
  });

  if (state.pendingEvent) {
    ctx.fillStyle = 'rgba(255,196,77,0.9)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⏸ 时间暂停', w / 2, hudY - 6);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 0xff) + amount, 0, 255);
  const g = clamp(((n >> 8) & 0xff) + amount, 0, 255);
  const b = clamp((n & 0xff) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function vizLoop(now) {
  if (!vizRunning) return;
  vizFrameId = requestAnimationFrame(vizLoop);

  const canvas = document.getElementById('base-viz-canvas');
  const gameScreen = document.getElementById('game-screen');
  if (!canvas || !gameScreen?.classList.contains('active')) return;

  const state = vizGetState();
  if (!state) return;

  const rawDt = Math.min((now - vizLastTime) / 1000, 0.05);
  vizLastTime = now;
  const frozen = state.pendingEvent || state.gameOver;
  if (!frozen) vizElapsed += rawDt;

  resizeVizCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (vizView === 'starmap') drawStarMapView(ctx, w, h, state, vizElapsed);
  else drawBridgeView(ctx, w, h, state, vizElapsed);
}
