/**
 * 太空基地 Spacebase — 观战 UI
 */

let gameState = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function resClass(val, threshold = 30) {
  if (val <= threshold * 0.3) return 'critical';
  if (val <= threshold) return 'low';
  return '';
}

function renderGame(state) {
  if (!state) return;
  const stats = aggregateStats(state);

  document.getElementById('date-display').textContent = formatDate(state);
  document.getElementById('phase-badge').textContent = state.phase === 1 ? '地球纪元' : '太空纪元';
  document.getElementById('phase-badge').className = `phase-badge ${state.phase === 1 ? 'earth' : 'space'}`;
  document.getElementById('ai-profile-badge').textContent = state.gameMode === 'player'
    ? '玩家执政'
  : `AI：${AI_PROFILES[state.aiProfile].name}`;

  const modeBadge = document.getElementById('mode-badge');
  if (modeBadge) {
    modeBadge.textContent = state.gameMode === 'player' ? '玩家执政' : 'AI 观战';
    modeBadge.className = `mode-badge ${state.gameMode === 'player' ? 'player' : 'ai'}`;
  }

  const stationEl = document.getElementById('station-name');
  if (stationEl) {
    stationEl.textContent = `${state.baseName || '太空基地'} ${state.baseCode || 'Ω-1'}`;
  }

  const pauseBanner = document.getElementById('event-pause-banner');
  if (pauseBanner) pauseBanner.hidden = !state.pendingEvent;

  const fastBtn = document.getElementById('btn-fast');
  if (fastBtn) fastBtn.hidden = state.gameMode === 'player';

  const countdown = state.phase === 1
    ? `撞击倒计时 ${Math.max(0, EARTH_COUNTDOWN_YEARS - getYear(state))} 年`
    : `太空纪元第 ${getYear(state) - EARTH_COUNTDOWN_YEARS} 年`;
  document.getElementById('countdown').textContent = countdown;

  RESOURCES.forEach(r => {
    const el = document.getElementById(`res-${r}`);
    if (!el) return;
    const v = Math.floor(state.resources[r]);
    el.textContent = v;
    el.closest('.resource')?.classList.remove('low', 'critical');
    const cls = resClass(v, stats.total * 0.05 || 30);
    if (cls) el.closest('.resource')?.classList.add(cls);
  });

  document.getElementById('stat-pop').textContent = stats.total;
  const peakEl = document.getElementById('stat-peak');
  if (peakEl) peakEl.textContent = state.peakPopulation || stats.total;
  document.getElementById('stat-diversity').textContent = (stats.diversity * 100).toFixed(0) + '%';
  document.getElementById('stat-stability').textContent = stats.stability.toFixed(0);
  document.getElementById('stat-research').textContent = (state.research * 100).toFixed(0) + '%';
  document.getElementById('stat-ship').textContent = (state.shipProgress * 100).toFixed(0);
  document.getElementById('stat-morale').textContent = stats.morale.toFixed(0);
  document.getElementById('stat-political').textContent = Math.floor(state.political);

  renderPops(state);
  renderLaws(state);
  renderCompartments(state);
  renderNarrative(state);
  renderLog(state);
  renderArchive(state);
}

function renderPops(state) {
  const container = document.getElementById('pops-list');
  container.innerHTML = state.pops.map(p => {
    const prof = PROFESSIONS[p.profession];
    return `
      <div class="pop-card">
        <div class="pop-header">
          <span class="pop-name">${prof.name}</span>
          <span class="pop-count">${p.count} 人</span>
        </div>
        <div class="pop-meta">基因组 ${p.geneGroup} · ${p.ideology} · 资质 ${p.skillTier}</div>
        <div class="stat-bars">
          ${statBar('士气', p.morale, 'mood')}
          ${statBar('忠诚', p.loyalty, 'health')}
          ${statBar('激进', p.radicalism, 'hunger')}
        </div>
      </div>`;
  }).join('');
}

function statBar(label, value, type) {
  const cls = value <= 25 ? 'critical' : value <= 50 ? 'low' : '';
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <div class="stat-bar"><div class="stat-fill ${type} ${cls}" style="width:${value}%"></div></div>
      <span class="stat-value">${Math.floor(value)}</span>
    </div>`;
}

function renderLaws(state) {
  const container = document.getElementById('laws-list');
  container.innerHTML = Object.entries(state.laws).map(([group, key]) => {
    const g = LAW_GROUPS[group];
    const opt = g.options[key];
    return `
      <div class="law-item">
        <span class="law-group">${g.name}</span>
        <span class="law-value">${opt.name}</span>
      </div>`;
  }).join('');
}

function renderCompartments(state) {
  const el = document.getElementById('compartments-list');
  if (!el) return;
  el.innerHTML = Object.entries(state.compartments).map(([id, n]) => {
    const c = COMPARTMENTS[id];
    if (!n) return '';
    return `<div class="comp-item"><span>${c.name}</span><span class="comp-count">×${n}</span></div>`;
  }).filter(Boolean).join('') || '<span class="empty-comp">无</span>';
}

function renderNarrative(state) {
  const title = document.getElementById('scene-title');
  const body = document.getElementById('narrative-text');
  const aiBox = document.getElementById('ai-decision');

  if (state.currentEvent?.awaitingChoice) {
    title.textContent = state.currentEvent.title;
    body.innerHTML = `<p>${state.currentEvent.text}</p><p class="event-await-hint">请在弹窗中做出抉择…</p>`;
    aiBox.hidden = true;
  } else if (state.currentEvent?.resolved) {
    title.textContent = state.currentEvent.title;
    body.innerHTML = `<p>${state.currentEvent.text}</p>`;
  } else if (state.lastAIDecision) {
    title.textContent = '基地运转';
    const who = state.gameMode === 'player' ? '你' : 'AI 统筹官';
    body.innerHTML = `<p>基地在 ${formatDate(state)} 继续运转。${who}监控着每一个舱室与群体。</p>`;
  } else {
    title.textContent = '文明种子计划';
    body.innerHTML = `<p>地球联盟启动太空基地计划。AI 统筹官接管决策权，带领人类文明种子走向未知结局。</p>`;
  }

  if (state.lastAIDecision && !state.currentEvent?.awaitingChoice) {
    aiBox.hidden = false;
    const label = state.gameMode === 'player' ? '最近决策' : 'AI 决策';
    aiBox.innerHTML = `
      <div class="ai-label">${label}</div>
      <div class="ai-event">${state.lastAIDecision.event}</div>
      <div class="ai-choice">→ ${state.lastAIDecision.choice}</div>
      <div class="ai-reason">${state.lastAIDecision.reason}</div>`;
  } else if (!state.currentEvent?.awaitingChoice) {
    aiBox.hidden = true;
  }
}

function renderLog(state) {
  const container = document.getElementById('log-entries');
  container.innerHTML = state.log.map(e =>
    `<div class="log-entry ${e.type}">[${e.date}] ${e.text}</div>`
  ).join('');
}

function renderArchive(state) {
  const snaps = state.archive.snapshots;
  const container = document.getElementById('archive-mini');
  if (!snaps.length) {
    container.textContent = '档案累积中…';
    return;
  }
  const recent = snaps.slice(-8);
  const maxPop = Math.max(...recent.map(s => s.population ?? s.total ?? 0), 1);
  const bars = recent.map(s => {
    const pop = s.population ?? s.total ?? 0;
    const h = Math.round((pop / maxPop) * 40);
    return `<div class="archive-bar" style="height:${h}px" title="Y${s.year} 人口${pop}"></div>`;
  }).join('');
  const latest = recent[recent.length - 1];
  container.innerHTML = `<div class="archive-chart">${bars}</div>
    <div class="archive-caption">人口时序 · 稳定 ${(latest.stability ?? 0).toFixed(0)} · 科研 ${((latest.research ?? 0) * 100).toFixed(0)}%</div>`;
}

function renderTimelineChart(chartData, field, label, color) {
  if (!chartData || !chartData[field] || chartData[field].length < 2) return '';
  const vals = chartData[field];
  const max = Math.max(...vals, 1);
  const bars = vals.slice(-24).map((v, i) => {
    const h = Math.max(2, Math.round((v / max) * 48));
    return `<div class="timeline-bar" style="height:${h}px;background:${color}" title="${label} ${Math.round(v)}"></div>`;
  }).join('');
  return `<div class="timeline-chart-wrap"><span class="timeline-label">${label}</span><div class="timeline-chart">${bars}</div></div>`;
}

function showEndScreen(state) {
  const report = generateReport(state);
  document.getElementById('end-title').textContent = report.title;
  document.getElementById('end-message').textContent = report.desc;

  const factorList = report.contributingFactors.map(f => `<li>${f}</li>`).join('');
  const changeRows = report.stateChanges.map(r => {
    if (r.isPeak) {
      return `<tr class="row-peak"><td>${r.label}</td><td colspan="2">${r.final}${r.unit ? ' ' + r.unit : ''}</td><td>—</td></tr>`;
    }
    if (r.isAnchor) {
      return `<tr><td>${r.label}</td><td>${r.initial}${r.unit}</td><td colspan="2">基准</td></tr>`;
    }
    const init = r.isText ? r.initial : r.initial;
    const fin = r.isText ? r.final : r.final;
    const delta = r.isText ? '' : (typeof r.final === 'number' && typeof r.initial === 'number'
      ? `<span class="delta ${r.final >= r.initial ? 'up' : 'down'}">${r.final >= r.initial ? '+' : ''}${r.final - r.initial}</span>` : '');
    return `<tr><td>${r.label}</td><td>${init}${r.unit}</td><td>${fin}${r.unit}</td><td>${delta}</td></tr>`;
  }).join('');

  const timelineItems = report.timeline.slice(-20).map(m => `
    <div class="timeline-item cat-${m.category}">
      <span class="tl-date">${m.date}</span>
      <span class="tl-title">${m.title}</span>
      ${m.detail ? `<span class="tl-detail">${m.detail}</span>` : ''}
    </div>`).join('');

  const charts = [
    renderTimelineChart(report.chartData, 'population', '人口', 'var(--accent-cyan)'),
    renderTimelineChart(report.chartData, 'food', '食物', 'var(--accent-amber)'),
    renderTimelineChart(report.chartData, 'stability', '稳定', 'var(--safe)'),
  ].join('');

  const resourceWarn = (report.finalResources?.food <= 0 || report.finalResources?.energy <= 0)
    ? `<div class="resource-warning">⚠ 终局资源枯竭：食物 ${Math.floor(report.finalResources?.food || 0)} · 能源 ${Math.floor(report.finalResources?.energy || 0)}</div>`
    : '';

  document.getElementById('end-stats').innerHTML = `
    <div class="report-block">
      <p>${state.gameMode === 'player' ? '玩家执政' : `AI 人格：${report.aiProfile}`} · ${report.baseName ? report.baseName + ' · ' : ''}${report.phase} · 存续 ${report.years} 年 · 种子 ${report.simSeed}</p>
      <p>人口 初始→峰值→终局：${report.stateChanges.find(r => r.isAnchor)?.initial || '?'} → ${report.peakPopulation}（Y${report.peakPopulationYear}）→ ${report.population}</p>
      <p>多样性 ${report.diversity} · 社会稳定 ${report.stability} · 生态健康 ${report.resourceHealth} · 科研 ${report.research}</p>
    </div>
    ${resourceWarn}

    <section class="report-section">
      <h3 class="report-heading">结局原因</h3>
      <div class="cause-primary">
        <strong>${report.causeTitle}</strong>
        <p>${report.causeDesc}</p>
      </div>
      <ul class="cause-factors">${factorList}</ul>
    </section>

    <section class="report-section">
      <h3 class="report-heading">基地数据变化（初态 → 终态）</h3>
      <table class="state-table">
        <thead><tr><th>指标</th><th>初始</th><th>终局</th><th>变化</th></tr></thead>
        <tbody>${changeRows}</tbody>
      </table>
      <div class="timeline-charts">${charts}</div>
    </section>

    <section class="report-section">
      <h3 class="report-heading">太空基地状态变化记录</h3>
      <div class="timeline-list">${timelineItems || '<p class="empty">无记录</p>'}</div>
    </section>

    <p class="report-laws">终局法律：${report.finalLaws}</p>

    <details class="report-details">
      <summary>关键决策记录</summary>
      <pre>${report.decisions || '无'}</pre>
    </details>
    <details class="report-details">
      <summary>法律修订年表</summary>
      <pre>${report.lawHistory || '无修订'}</pre>
    </details>`;
  showScreen('end-screen');
}

function updateSpeedLabel(speed) {
  const labels = { 0: '暂停', 1: '1×', 4: '4×', 16: '16×' };
  const el = document.getElementById('speed-label');
  if (el) el.textContent = labels[speed] || `${speed}×`;
}

function renderBaseSelection(selectedId) {
  const grid = document.getElementById('base-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(STARTING_BASES).map(([id, b]) => `
    <button type="button" class="base-card ${id === selectedId ? 'selected' : ''}" data-base="${id}">
      <div class="base-card-header">
        <span class="base-card-name">${b.name}</span>
        <span class="base-card-code">${b.code}</span>
      </div>
      <div class="base-card-tag">${b.tagline}</div>
      <p class="base-card-desc">${b.desc}</p>
      <span class="base-card-diff">难度：${b.difficulty}</span>
    </button>`).join('');
}

function showEventChoiceModal(state, onChoose) {
  const event = state.pendingEvent;
  if (!event) return;
  const modal = document.getElementById('event-modal');
  document.getElementById('event-modal-title').textContent = event.title;
  document.getElementById('event-modal-text').textContent = event.text;
  const choicesEl = document.getElementById('event-modal-choices');
  choicesEl.innerHTML = event.choices.map(c => `
    <button type="button" class="event-choice-btn" data-choice-id="${c.id}">${c.label}</button>
  `).join('');
  choicesEl.querySelectorAll('[data-choice-id]').forEach(btn => {
    btn.onclick = () => {
      const choice = event.choices.find(c => c.id === btn.dataset.choiceId);
      if (choice) onChoose(choice);
    };
  });
  modal.hidden = false;
}

function hideEventChoiceModal() {
  const modal = document.getElementById('event-modal');
  if (modal) modal.hidden = true;
}
