/**
 * 太空基地 Spacebase — 模拟引擎：Pop、法律、AI、档案
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createPop(profession, count, opts = {}) {
  return {
    id: `${profession}_${opts.geneGroup || 'A'}_${opts.ideology || 'technocrat'}_${Date.now()}_${Math.random()}`,
    profession,
    geneGroup: opts.geneGroup || pick(GENE_GROUPS),
    habitat: opts.habitat || 'habitat',
    ideology: opts.ideology || pick(IDEOLOGIES),
    skillTier: opts.skillTier || rand(2, 4),
    count,
    laborForce: Math.floor(count * 0.75),
    dependents: count - Math.floor(count * 0.75),
    morale: opts.morale ?? rand(50, 70),
    radicalism: opts.radicalism ?? rand(5, 20),
    loyalty: opts.loyalty ?? rand(55, 75),
  };
}

function createInitialState(aiProfile = 'survival') {
  const laws = {};
  Object.entries(LAW_GROUPS).forEach(([k, g]) => { laws[k] = g.default; });

  const pops = [
    createPop('eco_engineer', 180, { geneGroup: 'A', skillTier: 4 }),
    createPop('nuclear_ops', 120, { geneGroup: 'B', skillTier: 4 }),
    createPop('miner', 200, { geneGroup: 'C', ideology: 'frontier' }),
    createPop('scholar', 80, { geneGroup: 'D', ideology: 'technocrat', skillTier: 5 }),
    createPop('medic', 60, { geneGroup: 'A', skillTier: 4 }),
    createPop('admin', 40, { geneGroup: 'E' }),
    createPop('colonist', 520, { geneGroup: pick(GENE_GROUPS), morale: 55 }),
  ];

  const compartments = {
    habitat: 2, agriculture: 1, reactor: 1, shipyard: 1,
    lab: 1, medical: 1, archive: 1, immigration: 1,
  };

  return {
    tick: 0,
    phase: 1,
    aiProfile,
    laws,
    pops,
    compartments,
    resources: { energy: 80, food: 120, ore: 60, volatiles: 100 },
    research: 0,
    political: 50,
    flags: {},
    triggeredEvents: new Set(),
    modifiers: [],
    leakRate: 0.15,
    outputPenalty: 1,
    outputPenaltyTicks: 0,
    meltdownRisk: 0,
    inbreedRisk: 1,
    immigrationClosed: false,
    ending: null,
    archive: { snapshots: [], decisions: [], laws: [] },
    currentEvent: null,
    lastAIDecision: null,
    log: [],
    gameOver: false,
    shipProgress: 0,
  };
}

function getYear(state) { return Math.floor(state.tick / TICKS_PER_YEAR); }
function getDay(state) { return state.tick % TICKS_PER_YEAR; }
function formatDate(state) {
  const y = getYear(state);
  const d = getDay(state);
  const phase = state.phase === 1 ? `地球纪元 Y${y}` : `太空纪元 Y${y - EARTH_COUNTDOWN_YEARS}`;
  return `${phase} · 第 ${d} 日`;
}

function calcDiversity(state) {
  const groups = new Set(state.pops.map(p => p.geneGroup));
  const base = groups.size / GENE_GROUPS.length;
  const lawImm = LAW_GROUPS.immigration.options[state.laws.immigration];
  return clamp(base + (lawImm.diversity || 0), 0, 1);
}

function aggregateStats(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return { total: 0, morale: 0, loyalty: 0, radical: 0, diversity: 0, stability: 0, birthRate: 0, deathRate: 0 };

  const w = (fn) => state.pops.reduce((s, p) => s + fn(p) * p.count, 0) / total;
  const diversity = calcDiversity(state);

  return {
    total,
    morale: w(p => p.morale),
    loyalty: w(p => p.loyalty),
    radical: w(p => p.radicalism),
    diversity,
    stability: w(p => p.loyalty * 0.4 + p.morale * 0.4 + (100 - p.radicalism) * 0.2),
    birthRate: calcBirthRate(state),
    deathRate: calcDeathRate(state),
  };
}

function calcBirthRate(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return 0;
  const foodOk = state.resources.food > total * 0.05 ? 1 : 0.3;
  const div = calcDiversity(state);
  return 0.0008 * foodOk * (0.7 + div * 0.5);
}

function calcDeathRate(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return 0;
  const lawLabor = LAW_GROUPS.labor.options[state.laws.labor];
  const lawGen = LAW_GROUPS.genetics.options[state.laws.genetics];
  let rate = 0.0004;
  if (state.resources.food < total * 0.03) rate *= 2.5;
  if (state.resources.volatiles < total * 0.02) rate *= 2;
  rate *= (lawLabor.deathRate || 1) * (lawGen.deathRate || 1) * state.inbreedRisk;
  return rate;
}

function getLawModifiers(state) {
  const m = { foodCost: 1, output: 1, morale: 0, research: 1, buildSpeed: 1, lawCost: 1, volatility: 1 };
  Object.entries(state.laws).forEach(([group, key]) => {
    const opt = LAW_GROUPS[group]?.options[key];
    if (!opt) return;
    if (opt.foodCost) m.foodCost *= opt.foodCost;
    if (opt.output) m.output *= opt.output;
    if (opt.morale) m.morale += opt.morale;
    if (opt.research) m.research *= opt.research;
    if (opt.buildSpeed) m.buildSpeed *= opt.buildSpeed;
    if (opt.lawCost) m.lawCost *= opt.lawCost;
    if (opt.volatility) m.volatility *= opt.volatility;
  });
  if (state.outputPenaltyTicks > 0) m.output *= state.outputPenalty;
  return m;
}

function tickCompartments(state) {
  const lm = getLawModifiers(state);
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  const profCounts = {};
  state.pops.forEach(p => { profCounts[p.profession] = (profCounts[p.profession] || 0) + p.laborForce; });

  let energy = 0, food = 0, ore = 0;
  const counts = state.compartments;

  const agriSlots = counts.agriculture * COMPARTMENTS.agriculture.slots;
  const agriStaff = Math.min(profCounts.eco_engineer || 0, agriSlots * 50);
  food += (agriStaff / 50) * COMPARTMENTS.agriculture.output.food * lm.output;

  const reactSlots = counts.reactor * COMPARTMENTS.reactor.slots;
  const reactStaff = Math.min(profCounts.nuclear_ops || 0, reactSlots * 40);
  energy += (reactStaff / 40) * COMPARTMENTS.reactor.output.energy * lm.output;

  const mineSlots = counts.shipyard * COMPARTMENTS.shipyard.slots;
  const mineStaff = Math.min(profCounts.miner || 0, mineSlots * 50);
  ore += (mineStaff / 50) * COMPARTMENTS.shipyard.output.ore * lm.output;
  energy -= (mineStaff / 50) * 2;

  const labSlots = counts.lab * COMPARTMENTS.lab.slots;
  const labStaff = Math.min(profCounts.scholar || 0, labSlots * 30);
  const gov = LAW_GROUPS.governance.options[state.laws.governance];
  state.research = clamp(state.research + (labStaff / 30) * 0.0003 * lm.research * (gov.research || 1), 0, 1);
  energy -= labStaff / 30;

  energy -= total * 0.008;
  food -= total * 0.012 * lm.foodCost;
  state.resources.volatiles -= state.leakRate * lm.volatility;
  state.resources.volatiles -= total * 0.003;

  state.resources.energy = clamp(state.resources.energy + energy, 0, 500);
  state.resources.food = clamp(state.resources.food + food, 0, 500);
  state.resources.ore = clamp(state.resources.ore + ore, 0, 500);
  state.resources.volatiles = clamp(state.resources.volatiles, 0, 500);

  if (state.phase === 2 && state.research > 0.5) {
    state.shipProgress = clamp(state.shipProgress + ore * 0.0001, 0, 1);
  }
}

function tickPops(state) {
  const lm = getLawModifiers(state);
  const stats = aggregateStats(state);
  const birth = calcBirthRate(state);
  const death = calcDeathRate(state);

  state.pops.forEach(p => {
    const births = Math.floor(p.count * birth * (p.profession === 'colonist' ? 1.2 : 0.8));
    const deaths = Math.floor(p.count * death * (p.morale < 30 ? 1.3 : 1));
    p.count = Math.max(0, p.count + births - deaths);
    p.laborForce = Math.floor(p.count * 0.75);
    p.dependents = p.count - p.laborForce;

    p.morale = clamp(p.morale + lm.morale * 0.01 + (state.resources.food > stats.total * 0.04 ? 0.05 : -0.15), 0, 100);
    p.loyalty = clamp(p.loyalty + (stats.stability > 50 ? 0.02 : -0.08), 0, 100);
    p.radicalism = clamp(p.radicalism + (p.morale < 35 ? 0.1 : -0.03) + lm.morale * -0.005, 0, 100);
  });

  state.pops = state.pops.filter(p => p.count > 0);

  if (state.phase === 1 && !state.immigrationClosed && state.tick % (TICKS_PER_MONTH * 6) === 0 && getYear(state) < 48) {
    const imm = LAW_GROUPS.immigration.options[state.laws.immigration];
    const batch = state.laws.immigration === 'open' ? rand(30, 80) : state.laws.immigration === 'selective' ? rand(10, 30) : rand(5, 20);
    state.pops.push(createPop('colonist', batch, { geneGroup: pick(GENE_GROUPS), morale: 45 }));
    addLog(state, `地球移民批次抵达：+${batch} 人`, 'important');
  }
}

function applyDelayedModifiers(state) {
  state.modifiers = state.modifiers.filter(m => {
    m.ticksLeft--;
    if (m.ticksLeft <= 0) {
      if (m.revert) m.revert(state);
      return false;
    }
    return true;
  });
  if (state.outputPenaltyTicks > 0) {
    state.outputPenaltyTicks--;
    if (state.outputPenaltyTicks <= 0) state.outputPenalty = 1;
  }
}

function checkPhaseTransition(state) {
  if (state.phase === 1 && state.tick >= IMPACT_TICK) {
    state.phase = 2;
    state.resources.food += 30;
    addLog(state, '小行星撞击地球。地球纪元结束，太空纪元开始。补给永久归零。', 'danger');
    archiveDecision(state, 'phase', '地球毁灭，进入太空纪元');
  }
}

function addLog(state, text, type = '') {
  state.log.unshift({ tick: state.tick, text, type, date: formatDate(state) });
  if (state.log.length > 80) state.log.pop();
}

function archiveDecision(state, eventId, summary, detail = '') {
  state.archive.decisions.push({
    tick: state.tick, date: formatDate(state), eventId, summary, detail,
    laws: { ...state.laws }, stats: aggregateStats(state),
  });
}

function archiveSnapshot(state) {
  if (state.tick % 30 !== 0) return;
  state.archive.snapshots.push({
    tick: state.tick, year: getYear(state),
    ...aggregateStats(state),
    resources: { ...state.resources },
    research: state.research,
    phase: state.phase,
  });
}

function enactLaw(state, group, optionKey, reason) {
  const old = state.laws[group];
  if (old === optionKey) return false;
  const lm = getLawModifiers(state);
  const cost = Math.floor(15 * (LAW_GROUPS[group].options[optionKey]?.lawCost || lm.lawCost || 1));
  if (state.political < cost) return false;

  state.political -= cost;
  state.laws[group] = optionKey;
  const name = LAW_GROUPS[group].options[optionKey].name;
  addLog(state, `法律修订：${LAW_GROUPS[group].name} → ${name}`, 'important');
  state.archive.laws.push({ tick: state.tick, date: formatDate(state), group, from: old, to: optionKey, reason });
  archiveDecision(state, 'law', `${LAW_GROUPS[group].name}：${name}`, reason);

  state.pops.forEach(p => {
    if (p.ideology === 'faith' && group === 'genetics') p.radicalism += 8;
    if (p.ideology === 'union' && group === 'labor') p.radicalism += 6;
    p.loyalty += rand(-5, 3);
  });
  return true;
}

/** AI 评分选择 */
function scoreChoice(choice, state, profile) {
  const w = AI_PROFILES[profile].weights;
  let score = 0;
  const s = choice.score || {};
  Object.entries(s).forEach(([k, v]) => {
    const weight = w[k] || w.resources || 1;
    score += v * weight;
  });
  score += (Math.random() - 0.5) * 0.3;
  return score;
}

function aiChoose(choices, state) {
  const profile = state.aiProfile;
  let best = choices[0];
  let bestScore = -Infinity;
  choices.forEach(c => {
    const sc = scoreChoice(c, state, profile);
    if (sc > bestScore) { bestScore = sc; best = c; }
  });
  return { choice: best, score: bestScore, profile: AI_PROFILES[profile].name };
}

function applyChoiceEffects(state, choice) {
  const e = choice.effects || {};
  if (e.pop) {
    const n = Math.abs(e.pop);
    if (e.pop > 0) state.pops.push(createPop('colonist', e.pop));
    else {
      let rem = n;
      for (const p of state.pops) {
        const d = Math.min(p.count, rem);
        p.count -= d;
        rem -= d;
        if (!rem) break;
      }
    }
  }
  ['food', 'energy', 'ore', 'volatiles'].forEach(r => {
    if (e[r] !== undefined) state.resources[r] = clamp(state.resources[r] + e[r], 0, 500);
  });
  if (e.diversity) state.pops.forEach(p => { if (Math.random() < 0.1) p.geneGroup = pick(GENE_GROUPS); });
  if (e.morale) state.pops.forEach(p => { p.morale = clamp(p.morale + e.morale, 0, 100); });
  if (e.radical) state.pops.forEach(p => { p.radicalism = clamp(p.radicalism + e.radical, 0, 100); });
  if (e.loyalty) state.pops.forEach(p => { p.loyalty = clamp(p.loyalty + e.loyalty, 0, 100); });
  if (e.leakRate) state.leakRate *= e.leakRate;
  if (e.inbreedRisk) state.inbreedRisk *= e.inbreedRisk;
  if (e.immigrationClosed) state.immigrationClosed = true;
  if (e.outputPenalty) {
    state.outputPenalty = e.outputPenalty;
    state.outputPenaltyTicks = e.duration || 5;
  }
  if (e.meltdownRisk && Math.random() < e.meltdownRisk) {
    addLog(state, '反应堆熔毁！能源舱损毁。', 'danger');
    state.compartments.reactor = Math.max(0, state.compartments.reactor - 1);
    state.pops.forEach(p => { if (p.profession === 'nuclear_ops') p.count = Math.floor(p.count * 0.6); });
  }
  if (e.law) Object.entries(e.law).forEach(([g, o]) => enactLaw(state, g, o, '事件驱动'));
  if (e.ending) state.ending = e.ending;
  if (e.political) state.political = clamp(state.political + e.political, 0, 100);
  if (e.deathRate) state.modifiers.push({ ticksLeft: 30, deathRate: e.deathRate });
}

function resolveEvent(state, event) {
  const { choice, score, profile } = aiChoose(event.choices, state);
  applyChoiceEffects(state, choice);
  const decision = {
    event: event.title,
    choice: choice.label,
    reason: `AI「${profile}」策略评分 ${score.toFixed(2)}`,
    tick: state.tick,
  };
  state.lastAIDecision = decision;
  archiveDecision(state, event.id, `${event.title}：${choice.label}`, decision.reason);
  addLog(state, `[AI] ${event.title} → ${choice.label}（${decision.reason}）`, 'important');
  state.currentEvent = { ...event, resolved: choice };
  state.triggeredEvents.add(event.id);
}

function getEligibleEvents(state) {
  const stats = aggregateStats(state);
  return EVENTS.filter(ev => {
    if (ev.once && state.triggeredEvents.has(ev.id)) return false;
    if (ev.phase && ev.phase !== state.phase) return false;
    if (ev.minYear && getYear(state) < ev.minYear) return false;
    const t = ev.trigger || {};
    if (t.volatilesBelow && state.resources.volatiles >= t.volatilesBelow) return false;
    if (t.foodBelow && state.resources.food >= t.foodBelow) return false;
    if (t.moraleBelow && stats.morale >= t.moraleBelow) return false;
    if (t.researchAbove && state.research < t.researchAbove) return false;
    if (t.diversityBelow && stats.diversity >= t.diversityBelow) return false;
    if (!ev.trigger && !ev.minYear && Math.random() > 0.08) return false;
    return true;
  });
}

function aiConsiderLaws(state) {
  const stats = aggregateStats(state);
  for (const cand of LAW_REVISION_CANDIDATES) {
    if (cand.profile && !cand.profile.includes(state.aiProfile)) continue;
    if (state.laws[cand.group] === cand.to) continue;
    const w = cand.when;
    let ok = true;
    if (w.foodBelow && state.resources.food >= w.foodBelow) ok = false;
    if (w.moraleBelow && stats.morale >= w.moraleBelow) ok = false;
    if (w.diversityBelow && stats.diversity >= w.diversityBelow) ok = false;
    if (w.researchBelow && state.research >= w.researchBelow) ok = false;
    if (w.phase && w.phase !== state.phase) ok = false;
    if (!ok) continue;
    if (enactLaw(state, cand.group, cand.to, `AI 响应局势：${AI_PROFILES[state.aiProfile].name}`)) break;
  }
}

function aiConsiderBuild(state) {
  if (state.tick % TICKS_PER_MONTH !== 0) return;
  const stats = aggregateStats(state);
  if (state.resources.ore < 15) return;

  let target = null;
  if (state.resources.food < stats.total * 0.08) target = 'agriculture';
  else if (state.resources.energy < stats.total * 0.05) target = 'reactor';
  else if (state.resources.ore < 40 && state.phase === 2) target = 'shipyard';
  else if (state.research < 0.6 && state.compartments.lab < 3) target = 'lab';
  else if (stats.total > state.compartments.habitat * 400) target = 'habitat';

  if (!target) return;
  const cost = COMPARTMENTS[target].buildCost;
  if (!cost) return;
  const can = Object.entries(cost).every(([k, v]) => state.resources[k] >= v);
  if (!can) return;

  Object.entries(cost).forEach(([k, v]) => { state.resources[k] -= v; });
  state.compartments[target] = (state.compartments[target] || 0) + 1;
  addLog(state, `AI 下令扩建：${COMPARTMENTS[target].name}`, 'success');
}

function checkEnding(state) {
  const stats = aggregateStats(state);
  if (state.ending) { state.gameOver = true; return state.ending; }

  if (stats.total <= 0) { state.ending = 'extinction'; state.gameOver = true; return 'extinction'; }
  if (state.resources.volatiles <= 0 && state.resources.food <= 0 && state.phase === 2) {
    state.ending = 'extinction'; state.gameOver = true; return 'extinction';
  }
  if (state.phase === 1 && state.tick >= IMPACT_TICK + TICKS_PER_YEAR && stats.total < 500) {
    state.ending = 'extinction'; state.gameOver = true; return 'extinction';
  }
  if (state.phase === 2 && state.research >= 1 && state.shipProgress >= 1 && !state.triggeredEvents.has('launch_decision')) {
    const ev = EVENTS.find(e => e.id === 'launch_decision');
    if (ev) resolveEvent(state, ev);
  }
  if (state.phase === 2 && state.tick > IMPACT_TICK + TICKS_PER_YEAR * 30 && stats.stability > 55 && state.research < 0.95) {
    state.ending = 'solar'; state.gameOver = true; return 'solar';
  }
  return null;
}

function simulateTick(state) {
  if (state.gameOver) return state;

  state.tick++;
  checkPhaseTransition(state);
  tickCompartments(state);
  tickPops(state);
  applyDelayedModifiers(state);
  state.political = clamp(state.political + 0.02, 0, 100);
  archiveSnapshot(state);

  const events = getEligibleEvents(state);
  if (events.length) resolveEvent(state, pick(events));

  aiConsiderLaws(state);
  aiConsiderBuild(state);
  checkEnding(state);

  return state;
}

function fastForwardToEnd(state, maxTicks = 50000) {
  let i = 0;
  while (!state.gameOver && i < maxTicks) {
    simulateTick(state);
    i++;
  }
  return state;
}

/** 分块极速推演，避免阻塞 UI 线程 */
function fastForwardChunked(state, maxTicks = 50000, chunkSize = 800) {
  return new Promise((resolve) => {
    let i = 0;
    function runChunk() {
      const limit = Math.min(i + chunkSize, maxTicks);
      while (i < limit && !state.gameOver) {
        simulateTick(state);
        i++;
      }
      if (!state.gameOver && i < maxTicks) {
        setTimeout(runChunk, 0);
      } else {
        resolve(state);
      }
    }
    runChunk();
  });
}

function generateReport(state) {
  const stats = aggregateStats(state);
  const end = ENDINGS[state.ending] || ENDINGS.extinction;
  const decisions = state.archive.decisions.slice(-15).map(d => `  [${d.date}] ${d.summary}`).join('\n');
  const lawHistory = state.archive.laws.map(l =>
    `  [${l.date}] ${LAW_GROUPS[l.group].name}：${LAW_GROUPS[l.group].options[l.to].name}（${l.reason}）`
  ).join('\n');

  return {
    title: end.title,
    desc: end.desc,
    years: getYear(state),
    population: stats.total,
    diversity: (stats.diversity * 100).toFixed(1) + '%',
    stability: stats.stability.toFixed(1),
    research: (state.research * 100).toFixed(1) + '%',
    aiProfile: AI_PROFILES[state.aiProfile].name,
    phase: state.phase === 2 ? '太空纪元' : '地球纪元（未完结）',
    decisions,
    lawHistory,
    finalLaws: Object.entries(state.laws).map(([g, k]) =>
      `${LAW_GROUPS[g].name}：${LAW_GROUPS[g].options[k].name}`
    ).join(' · '),
  };
}
