/**
 * 太空基地 Spacebase — 模拟引擎：Pop、法律、AI、档案
 */

let _rngState = 1;
let _popCounter = 0;

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initRng(seed) {
  _rngState = (seed >>> 0) || 1;
}

function rng() {
  _rngState |= 0;
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

function createPop(profession, count, opts = {}) {
  return {
    id: `${profession}_${opts.geneGroup || 'A'}_${_popCounter++}`,
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

function getProfileEconomy(state) {
  return AI_PROFILES[state.aiProfile]?.economy || {};
}

function createInitialState(profileOrOpts = 'survival') {
  const opts = typeof profileOrOpts === 'string'
    ? { aiProfile: profileOrOpts, gameMode: 'ai', baseId: 'frontier' }
    : (profileOrOpts || {});
  const aiProfile = opts.aiProfile || 'survival';
  const gameMode = opts.gameMode || 'ai';
  const baseId = opts.baseId || 'frontier';
  const base = STARTING_BASES[baseId] || STARTING_BASES.frontier;

  const simSeed = gameMode === 'ai'
    ? hashString(aiProfile)
    : hashString(`player_${baseId}_${opts.seed ?? 0}`);

  initRng(simSeed);
  _popCounter = 0;

  const laws = {};
  Object.entries(LAW_GROUPS).forEach(([k, g]) => { laws[k] = g.default; });
  if (base.laws) Object.assign(laws, base.laws);

  const pops = [
    createPop('eco_engineer', 300, { geneGroup: 'A', skillTier: 4 }),
    createPop('nuclear_ops', 200, { geneGroup: 'B', skillTier: 4 }),
    createPop('miner', 180, { geneGroup: 'C', ideology: 'frontier' }),
    createPop('scholar', 90, { geneGroup: 'D', ideology: 'technocrat', skillTier: 5 }),
    createPop('medic', 70, { geneGroup: 'A', skillTier: 4 }),
    createPop('admin', 40, { geneGroup: 'E' }),
    createPop('colonist', 380, { geneGroup: pick(GENE_GROUPS), morale: 55 }),
  ];
  Object.entries(base.popAdjust || {}).forEach(([prof, delta]) => {
    if (prof === 'colonist') {
      const c = pops.find(p => p.profession === 'colonist');
      if (c) c.count = Math.max(0, c.count + delta);
      return;
    }
    const p = pops.find(x => x.profession === prof);
    if (p) p.count = Math.max(0, p.count + delta);
    else if (delta > 0) pops.push(createPop(prof, delta, { skillTier: 3 }));
  });

  const compartments = { ...base.compartments };

  const state = {
    tick: 0,
    phase: 1,
    aiProfile,
    gameMode,
    baseId,
    baseName: base.name,
    baseCode: base.code,
    simSeed,
    laws,
    pops,
    compartments,
    resources: { ...base.resources },
    research: 0,
    political: 50,
    flags: {},
    triggeredEvents: new Set(),
    modifiers: [],
    leakRate: 0.08,
    outputPenalty: 1,
    outputPenaltyTicks: 0,
    meltdownRisk: 0,
    inbreedRisk: 1,
    immigrationClosed: false,
    ending: null,
    endingCause: null,
    archive: { snapshots: [], decisions: [], laws: [], milestones: [], initial: null },
    currentEvent: null,
    pendingEvent: null,
    lastAIDecision: null,
    log: [],
    gameOver: false,
    shipProgress: 0,
    peakPopulation: 0,
    peakPopulationYear: 0,
    resourceCrisisTicks: 0,
    populationDeclineMonths: 0,
    lastMonthPopulation: 0,
    netFood: 0,
    netEnergy: 0,
    agriBoost: 1,
    stableMonths: 0,
  };

  state.archive.initial = captureStateSnapshot(state);
  const initPop = state.pops.reduce((s, p) => s + p.count, 0);
  state.peakPopulation = initPop;
  state.peakPopulationYear = 0;
  state.lastMonthPopulation = initPop;
  recordMilestone(state, 'baseline', `${base.name}（${base.code}）建成`,
    `首批移民 ${initPop} 人入驻，地球倒计时 ${EARTH_COUNTDOWN_YEARS} 年开始`);

  return state;
}

function queuePlayerEvent(state, event) {
  state.pendingEvent = event;
  state.currentEvent = { ...event, awaitingChoice: true };
  addLog(state, `⚠ 待决事件：${event.title}`, 'important');
}

function captureStateSnapshot(state) {
  const stats = aggregateStats(state);
  return {
    tick: state.tick,
    year: getYear(state),
    date: formatDate(state),
    phase: state.phase,
    population: stats.total,
    morale: stats.morale,
    diversity: stats.diversity,
    stability: stats.stability,
    radical: stats.radical,
    resources: { ...state.resources },
    research: state.research,
    shipProgress: state.shipProgress,
    political: state.political,
    compartments: { ...state.compartments },
    laws: { ...state.laws },
  };
}

function recordMilestone(state, category, title, detail = '', delta = null) {
  state.archive.milestones.push({
    tick: state.tick,
    year: getYear(state),
    date: formatDate(state),
    category,
    title,
    detail,
    delta,
    snapshot: captureStateSnapshot(state),
  });
  if (state.archive.milestones.length > 120) state.archive.milestones.shift();
}

function setEnding(state, endingId, causeId, context = {}) {
  if (state.gameOver) return;
  state.ending = endingId;
  state.endingCause = { id: causeId, ...context };
  state.gameOver = true;
  const cause = ENDING_CAUSES[causeId];
  recordMilestone(state, 'ending', cause?.title || '文明终结', cause?.desc || '', context);
  addLog(state, `结局锁定：${ENDINGS[endingId].title} — ${cause?.title || causeId}`, 'danger');
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

function calcResourceHealth(state, total) {
  if (!total) return 0;
  const foodR = clamp(state.resources.food / (total * 0.05), 0, 1);
  const energyR = clamp(state.resources.energy / (total * 0.04), 0, 1);
  const volR = clamp(state.resources.volatiles / (total * 0.03), 0, 1);
  return (foodR + energyR + volR) / 3;
}

function isEcologicallyViable(state) {
  const stats = aggregateStats(state);
  const total = stats.total;
  if (!total) return false;
  return (
    state.resources.food > total * 0.03 &&
    state.resources.energy > total * 0.02 &&
    state.resources.volatiles > total * 0.01
  );
}

function isPopulationStable(state) {
  const stats = aggregateStats(state);
  if (!stats.total) return false;
  if (state.peakPopulation > 0 && stats.total < state.peakPopulation * 0.45) return false;
  return stats.birthRate >= stats.deathRate * 0.9;
}

function aggregateStats(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return { total: 0, morale: 0, loyalty: 0, radical: 0, diversity: 0, stability: 0, birthRate: 0, deathRate: 0, resourceHealth: 0 };

  const w = (fn) => state.pops.reduce((s, p) => s + fn(p) * p.count, 0) / total;
  const diversity = calcDiversity(state);
  const resourceHealth = calcResourceHealth(state, total);
  const social = w(p => p.loyalty * 0.4 + p.morale * 0.4 + (100 - p.radicalism) * 0.2);

  return {
    total,
    morale: w(p => p.morale),
    loyalty: w(p => p.loyalty),
    radical: w(p => p.radicalism),
    diversity,
    resourceHealth,
    stability: social * (0.35 + 0.65 * resourceHealth),
    birthRate: calcBirthRate(state),
    deathRate: calcDeathRate(state),
  };
}

function calcBirthRate(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return 0;
  const foodOk = state.resources.food > total * 0.05 ? 1 : 0.3;
  const div = calcDiversity(state);
  return 0.0005 * foodOk * (0.7 + div * 0.5);
}

function calcDeathRate(state) {
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  if (!total) return 0;
  const lawLabor = LAW_GROUPS.labor.options[state.laws.labor];
  const lawGen = LAW_GROUPS.genetics.options[state.laws.genetics];
  let rate = 0.0004;
  if (state.resources.food < total * 0.05) rate *= 2;
  if (state.resources.food < total * 0.02) rate *= 2.5;
  if (state.resources.food <= 0) rate *= 3;
  if (state.resources.energy < total * 0.02) rate *= 1.8;
  if (state.resources.energy <= 0) rate *= 2;
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
  const pe = getProfileEconomy(state);
  const total = state.pops.reduce((s, p) => s + p.count, 0);
  const profCounts = {};
  state.pops.forEach(p => { profCounts[p.profession] = (profCounts[p.profession] || 0) + p.laborForce; });

  let energy = 0, food = 0, ore = 0;
  const counts = state.compartments;
  const foodMult = (pe.food || 1) * state.agriBoost * (pe.output || 1);
  const energyMult = (pe.energy || 1) * (pe.output || 1);

  // 人居舱基础生命维持能源
  energy += counts.habitat * 3;

  const agriSlots = counts.agriculture * COMPARTMENTS.agriculture.slots;
  const agriStaff = Math.min(profCounts.eco_engineer || 0, agriSlots * 50);
  const energyFactor = state.resources.energy > 10 ? 1 : state.resources.energy > 0 ? 0.4 : 0.1;
  food += (agriStaff / 50) * COMPARTMENTS.agriculture.output.food * lm.output * foodMult * energyFactor;

  const reactSlots = counts.reactor * COMPARTMENTS.reactor.slots;
  const reactStaff = Math.min(profCounts.nuclear_ops || 0, reactSlots * 40);
  energy += (reactStaff / 40) * COMPARTMENTS.reactor.output.energy * lm.output * energyMult;

  const mineSlots = counts.shipyard * COMPARTMENTS.shipyard.slots;
  const mineStaff = Math.min(profCounts.miner || 0, mineSlots * 50);
  ore += (mineStaff / 50) * COMPARTMENTS.shipyard.output.ore * lm.output;
  energy -= (mineStaff / 50) * 1.5;

  const labSlots = counts.lab * COMPARTMENTS.lab.slots;
  const labStaff = Math.min(profCounts.scholar || 0, labSlots * 30);
  const gov = LAW_GROUPS.governance.options[state.laws.governance];
  const researchMult = (pe.research || 1) * (gov.research || 1);
  const prevResearch = state.research;
  state.research = clamp(state.research + (labStaff / 30) * 0.00035 * lm.research * researchMult, 0, 1);
  if (state.research >= 0.25 && prevResearch < 0.25 && !state.flags.agriV2) {
    state.flags.agriV2 = true;
    state.agriBoost = 1.2;
    recordMilestone(state, 'tech', '闭环农业 V2', '科研突破：农业产出 +20%');
  }
  energy -= labStaff / 30;

  const foodUse = total * 0.0075 * lm.foodCost;
  const energyUse = total * 0.0045;
  energy -= energyUse;
  food -= foodUse;
  state.resources.volatiles -= state.leakRate * lm.volatility * (pe.volatiles ? 2 - pe.volatiles : 1);
  state.resources.volatiles -= total * 0.0012;

  // 太空纪元：船坞稳态挥发物回收
  if (state.phase === 2 && counts.shipyard > 0) {
    state.resources.volatiles += counts.shipyard * 0.35 * lm.output;
  }

  state.netFood = food;
  state.netEnergy = energy;

  if (state.tick % TICKS_PER_MONTH === 0) {
    if (food >= 0 && energy >= 0) state.stableMonths++;
    else state.stableMonths = Math.max(0, state.stableMonths - 2);
  }

  state.resources.energy = clamp(state.resources.energy + energy, 0, 600);
  state.resources.food = clamp(state.resources.food + food, 0, 600);
  state.resources.ore = clamp(state.resources.ore + ore, 0, 600);
  state.resources.volatiles = clamp(state.resources.volatiles, 0, 600);

  if (state.phase === 2 && state.research > 0.5) {
    state.shipProgress = clamp(state.shipProgress + ore * 0.00012, 0, 1);
  }
}

function tickPops(state) {
  const lm = getLawModifiers(state);
  const stats = aggregateStats(state);
  const birth = calcBirthRate(state);
  const death = calcDeathRate(state);

  state.pops.forEach(p => {
    const births = Math.floor(p.count * birth * (p.profession === 'colonist' ? 1.2 : 0.8));
    let deaths = Math.floor(p.count * death * (p.morale < 30 ? 1.3 : 1)
      * (CRITICAL_PROFESSIONS[p.profession] ? 0.55 : 1));
    const profFloor = CRITICAL_PROFESSIONS[p.profession]?.floor;
    if (profFloor) deaths = Math.min(deaths, Math.max(0, p.count - profFloor));
    p.count = Math.max(0, p.count + births - deaths);
    p.laborForce = Math.floor(p.count * 0.75);
    p.dependents = p.count - p.laborForce;

    const starving = state.resources.food < stats.total * 0.03;
    const energyCrisis = state.resources.energy < stats.total * 0.02;
    let moraleDelta = lm.morale * 0.01;
    if (state.resources.food > stats.total * 0.05) moraleDelta += 0.05;
    else if (starving) moraleDelta -= 0.35;
    else moraleDelta -= 0.15;
    if (energyCrisis) moraleDelta -= 0.15;
    p.morale = clamp(p.morale + moraleDelta, 0, 100);
    p.loyalty = clamp(p.loyalty + (stats.stability > 50 ? 0.02 : -0.08), 0, 100);
    p.radicalism = clamp(p.radicalism + (p.morale < 35 ? 0.1 : -0.03) + lm.morale * -0.005, 0, 100);
  });

  state.pops = state.pops.filter(p => p.count > 0);
  maintainCriticalProfessions(state);

  const newTotal = state.pops.reduce((s, p) => s + p.count, 0);
  if (newTotal > state.peakPopulation) {
    state.peakPopulation = newTotal;
    state.peakPopulationYear = getYear(state);
  }

  if (state.tick % TICKS_PER_MONTH === 0) {
    if (state.lastMonthPopulation > 0 && newTotal < state.lastMonthPopulation * 0.97) {
      state.populationDeclineMonths++;
    } else {
      state.populationDeclineMonths = Math.max(0, state.populationDeclineMonths - 1);
    }
    state.lastMonthPopulation = newTotal;
  }

  if (state.phase === 1 && !state.immigrationClosed && state.tick % (TICKS_PER_MONTH * 6) === 0
      && getYear(state) >= 3 && getYear(state) < 46) {
    const dailyFoodNeed = newTotal * 0.0075 * getLawModifiers(state).foodCost;
    const foodDays = dailyFoodNeed > 0 ? state.resources.food / dailyFoodNeed : 0;
    if (foodDays < 150) return;
    if (state.resources.energy < newTotal * 0.035) return;
    if (state.netFood < 0 || state.netEnergy < 0) return;

    const batch = state.laws.immigration === 'open' ? rand(10, 25)
      : state.laws.immigration === 'selective' ? rand(5, 12) : rand(2, 6);
    const skilled = state.laws.immigration === 'selective' ? rand(2, 6) : rand(0, 3);
    if (skilled > 0) {
      state.pops.push(createPop('eco_engineer', Math.ceil(skilled / 2), { skillTier: 3 }));
      state.pops.push(createPop('nuclear_ops', Math.floor(skilled / 2), { skillTier: 3 }));
    }
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
    state.resources.food += 100;
    state.resources.volatiles += 50;
    state.resources.ore += 30;
    addLog(state, '小行星撞击地球。地球纪元结束，太空纪元开始。轨道应急储备已启用。', 'danger');
    archiveDecision(state, 'phase', '地球毁灭，进入太空纪元');
    const stats = aggregateStats(state);
    recordMilestone(state, 'phase', '小行星撞击地球 · 太空纪元开始',
      `人口 ${stats.total}，食物 ${Math.floor(state.resources.food)}，挥发物 ${Math.floor(state.resources.volatiles)}`);
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
  const snap = captureStateSnapshot(state);
  state.archive.snapshots.push(snap);

  const prev = state.archive.snapshots[state.archive.snapshots.length - 2];
  if (prev) {
    const popDrop = (prev.population - snap.population) / Math.max(prev.population, 1);
    if (popDrop > 0.15) {
      recordMilestone(state, 'crisis', '人口骤降',
        `${prev.population} → ${snap.population}（-${Math.round(popDrop * 100)}%）`);
    }
    if (snap.resources.food < snap.population * 0.03 && prev.resources.food >= prev.population * 0.03) {
      recordMilestone(state, 'crisis', '食物危机', `储备 ${Math.floor(snap.resources.food)}，低于人口需求`);
    }
    if (snap.resources.volatiles < 15 && prev.resources.volatiles >= 15) {
      recordMilestone(state, 'crisis', '挥发物告急', `剩余 ${Math.floor(snap.resources.volatiles)}`);
    }
    if (snap.research >= 0.5 && prev.research < 0.5) {
      recordMilestone(state, 'tech', '科研突破 50%', `研发进度 ${(snap.research * 100).toFixed(0)}%`);
    }
    if (snap.research >= 1 && prev.research < 1) {
      recordMilestone(state, 'tech', '科研完全体', '世代飞船技术理论完备');
    }
    if (snap.shipProgress >= 0.5 && (prev.shipProgress ?? 0) < 0.5) {
      recordMilestone(state, 'tech', '世代飞船船体 50%', `建造进度 ${(snap.shipProgress * 100).toFixed(0)}%`);
    }
    if (snap.shipProgress >= 1 && (prev.shipProgress ?? 0) < 1) {
      recordMilestone(state, 'tech', '世代飞船竣工', '聚变推进世代飞船待命发射');
    }
  }
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
  recordMilestone(state, 'law', `法律修订：${name}`,
    `${LAW_GROUPS[group].options[old]?.name || old} → ${name}（${reason}）`);

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
  score += (rng() - 0.5) * 0.3;
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
  if (e.diversity) state.pops.forEach(p => { if (rng() < 0.1) p.geneGroup = pick(GENE_GROUPS); });
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
  if (e.meltdownRisk && rng() < e.meltdownRisk) {
    addLog(state, '反应堆熔毁！能源舱损毁。', 'danger');
    state.compartments.reactor = Math.max(0, state.compartments.reactor - 1);
    state.pops.forEach(p => { if (p.profession === 'nuclear_ops') p.count = Math.floor(p.count * 0.6); });
  }
  if (e.law) Object.entries(e.law).forEach(([g, o]) => enactLaw(state, g, o, '事件驱动'));
  if (e.political) state.political = clamp(state.political + e.political, 0, 100);
  if (e.deathRate) state.modifiers.push({ ticksLeft: 30, deathRate: e.deathRate });
}

const ENDING_FROM_EVENT = {
  stellar: { cause: 'stellar_launch' },
  solar: { cause: 'solar_chosen' },
  schism: { cause: 'schism_ntr' },
};

function resolveEventWithChoice(state, event, choice, meta = {}) {
  applyChoiceEffects(state, choice);
  if (choice.effects?.ending) {
    const metaEnd = ENDING_FROM_EVENT[choice.effects.ending] || { cause: 'event_choice' };
    setEnding(state, choice.effects.ending, metaEnd.cause, {
      event: event.title,
      choice: choice.label,
    });
  }
  const reason = meta.reason || (meta.actor === 'player' ? '玩家手动抉择' : '自动决策');
  const decision = {
    event: event.title,
    choice: choice.label,
    reason,
    tick: state.tick,
  };
  state.lastAIDecision = decision;
  archiveDecision(state, event.id, `${event.title}：${choice.label}`, reason);
  const prefix = meta.actor === 'player' ? '[玩家]' : '[AI]';
  addLog(state, `${prefix} ${event.title} → ${choice.label}`, 'important');
  state.currentEvent = { ...event, resolved: choice };
  state.pendingEvent = null;
  state.triggeredEvents.add(event.id);
}

function resolveEvent(state, event) {
  const { choice, score, profile } = aiChoose(event.choices, state);
  resolveEventWithChoice(state, event, choice, {
    actor: 'ai',
    reason: `AI「${profile}」策略评分 ${score.toFixed(2)}`,
  });
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
    if (t.energyBelow && state.resources.energy >= t.energyBelow) return false;
    if (t.moraleBelow && stats.morale >= t.moraleBelow) return false;
    if (t.researchAbove && state.research < t.researchAbove) return false;
    if (t.diversityBelow && stats.diversity >= t.diversityBelow) return false;
    if (!ev.trigger && !ev.minYear && rng() > 0.08) return false;
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

function aiEmergencyProtocols(state) {
  if (state.tick % TICKS_PER_MONTH !== 0) return;
  const stats = aggregateStats(state);
  const foodDays = state.resources.food / Math.max(stats.total * 0.0075, 0.1);

  if (foodDays < 50 && state.laws.welfare !== 'austerity') {
    enactLaw(state, 'welfare', 'austerity', '紧急存续协议：自动削减配给');
  }
  if (foodDays < 25 && state.laws.immigration !== 'closed' && state.laws.immigration !== 'selective') {
    enactLaw(state, 'immigration', 'closed', '紧急存续协议：关闭边境');
  }
  if (state.resources.energy < stats.total * 0.03 && state.laws.labor !== 'shift' && state.aiProfile !== 'humanitarian') {
    enactLaw(state, 'labor', 'shift', '紧急存续协议：轮班加班维持能源');
  }
}

const CRITICAL_PROFESSIONS = {
  eco_engineer: { floor: 120, trainRate: 8 },
  nuclear_ops: { floor: 80, trainRate: 6 },
  scholar: { floor: 40, trainRate: 3 },
  medic: { floor: 30, trainRate: 2 },
};

function maintainCriticalProfessions(state) {
  if (state.tick % TICKS_PER_MONTH !== 0) return;
  const colonists = state.pops.filter(p => p.profession === 'colonist');
  let colonistPool = colonists.reduce((s, p) => s + p.count, 0);

  Object.entries(CRITICAL_PROFESSIONS).forEach(([prof, cfg]) => {
    const current = state.pops.filter(p => p.profession === prof).reduce((s, p) => s + p.count, 0);
    if (current >= cfg.floor || colonistPool < cfg.trainRate) return;
    const need = Math.min(cfg.trainRate, cfg.floor - current, colonistPool);
    if (need <= 0) return;

    let rem = need;
    for (const p of colonists) {
      const take = Math.min(p.count, rem);
      p.count -= take;
      rem -= take;
      colonistPool -= take;
      if (!rem) break;
    }
    const existing = state.pops.find(p => p.profession === prof);
    if (existing) existing.count += need;
    else state.pops.push(createPop(prof, need, { skillTier: 3 }));
  });

  state.pops = state.pops.filter(p => p.count > 0);
}

function getStaffCapacity(state) {
  const profCounts = {};
  state.pops.forEach(p => { profCounts[p.profession] = (profCounts[p.profession] || 0) + p.laborForce; });
  const agriCap = Math.max(3, Math.ceil((profCounts.eco_engineer || 0) / 45) + 1);
  const reactCap = Math.max(2, Math.ceil((profCounts.nuclear_ops || 0) / 35) + 1);
  return { profCounts, agriCap, reactCap };
}

function aiConsiderBuild(state) {
  if (state.tick % TICKS_PER_MONTH !== 0) return;
  const stats = aggregateStats(state);
  const pe = getProfileEconomy(state);
  const { agriCap, reactCap } = getStaffCapacity(state);
  const oreMin = 12 * (pe.buildOre || 1);
  if (state.resources.ore < oreMin) return;

  const epc = state.resources.energy / Math.max(stats.total, 1);
  const fpc = state.resources.food / Math.max(stats.total, 1);
  const counts = state.compartments;

  let target = null;
  const needReactors = Math.max(1, Math.ceil((counts.agriculture || 0) / 3));
  const urgentPreImpact = state.phase === 1 && getYear(state) >= 40;
  if (counts.reactor < needReactors || counts.reactor < reactCap * 0.6) target = 'reactor';
  else if (epc < 0.06 || state.resources.energy < 25 || state.netEnergy < -1) target = 'reactor';
  else if ((fpc < 0.1 || state.netFood < 0) && counts.agriculture < agriCap) target = 'agriculture';
  else if (state.netFood < -5 && counts.agriculture < agriCap + 4) target = 'agriculture';
  else if (urgentPreImpact && state.netFood < 5 && counts.agriculture < agriCap + 2) target = 'agriculture';
  else if (urgentPreImpact && state.netEnergy < 5 && counts.reactor < reactCap + 2) target = 'reactor';
  else if (state.phase === 2 && state.resources.ore < 40 && counts.shipyard < 2) target = 'shipyard';
  else if (state.research < 0.55 && counts.lab < 2 && epc > 0.08) target = 'lab';
  else if (stats.total > counts.habitat * 420) target = 'habitat';
  else if (state.research < 0.5 && counts.lab < 3) target = 'lab';

  if (!target) return;
  if (target === 'agriculture' && counts.agriculture >= agriCap && state.netFood >= -2) return;
  if (target === 'reactor' && counts.reactor >= reactCap + 2) return;
  // 食物赤字时允许突破农业舱上限
  if (target === 'agriculture' && counts.agriculture >= agriCap + 3) return;
  const cost = COMPARTMENTS[target].buildCost;
  if (!cost) return;
  const can = Object.entries(cost).every(([k, v]) => state.resources[k] >= v);
  if (!can) return;

  Object.entries(cost).forEach(([k, v]) => { state.resources[k] -= v; });
  state.compartments[target] = (state.compartments[target] || 0) + 1;
  addLog(state, `AI 下令扩建：${COMPARTMENTS[target].name}`, 'success');
  recordMilestone(state, 'build', `扩建 ${COMPARTMENTS[target].name}`,
    `当前数量 ${state.compartments[target]}，矿石 -${cost.ore || 0}`);
}

function inferExtinctionCause(state, stats) {
  if (state.resources.food <= 0 && state.resources.energy <= 0) return 'ecosystem_collapse';
  if (state.resources.food <= 0 && state.resources.volatiles <= 0) return 'ecosystem_collapse';
  if (state.resources.food <= 5 || stats.morale < 15) return 'starvation';
  if (state.resources.volatiles <= 5) return 'volatiles_depleted';
  if (stats.radical > 70 && stats.stability < 25) return 'social_collapse';
  if (state.peakPopulation > 0 && stats.total < state.peakPopulation * 0.2) return 'starvation';
  return 'population_zero';
}

function checkEnding(state) {
  const stats = aggregateStats(state);
  if (state.gameOver) return state.ending;

  if (stats.total <= 0) {
    setEnding(state, 'extinction', inferExtinctionCause(state, stats));
    return 'extinction';
  }

  const foodZero = state.resources.food <= 0;
  const energyZero = state.resources.energy <= 0;
  const productionCollapsed = state.netFood < -1 && state.netEnergy < -1;
  if (foodZero && energyZero && productionCollapsed) {
    state.resourceCrisisTicks++;
    if (state.resourceCrisisTicks >= TICKS_PER_MONTH * 4) {
      setEnding(state, 'extinction', 'ecosystem_collapse', {
        food: state.resources.food, energy: state.resources.energy,
      });
      return 'extinction';
    }
  } else {
    state.resourceCrisisTicks = Math.max(0, state.resourceCrisisTicks - 1);
  }

  if (state.resources.volatiles <= 0 && state.resources.food <= 0 && state.phase === 2) {
    setEnding(state, 'extinction', 'ecosystem_collapse');
    return 'extinction';
  }

  if (state.phase === 1 && state.tick >= IMPACT_TICK + TICKS_PER_YEAR && stats.total < 500) {
    setEnding(state, 'extinction', 'pre_impact_underpop', { population: stats.total });
    return 'extinction';
  }

  if (state.phase === 2 && state.research >= 1 && state.shipProgress >= 1
      && state.tick >= IMPACT_TICK + TICKS_PER_MONTH * 3
      && !state.triggeredEvents.has('launch_decision')) {
    const ev = EVENTS.find(e => e.id === 'launch_decision');
    if (ev) {
      if (state.gameMode === 'player' && !state.pendingEvent) queuePlayerEvent(state, ev);
      else resolveEvent(state, ev);
    }
    if (state.gameOver) return state.ending;
  }

  if (state.phase === 2 && !state.gameOver && state.tick >= IMPACT_TICK + TICKS_PER_YEAR * 20
      && state.stableMonths >= 60 && stats.total >= 250 && isEcologicallyViable(state)) {
    setEnding(state, 'solar', 'solar_stable', {
      stability: stats.stability,
      research: state.research,
      population: stats.total,
      resourceHealth: stats.resourceHealth,
    });
    return 'solar';
  }

  if (stats.total > 0 && stats.total < 80 && state.populationDeclineMonths >= 18) {
    setEnding(state, 'extinction', 'population_zero', { population: stats.total });
    return 'extinction';
  }

  const solarWindow = state.tick > IMPACT_TICK + TICKS_PER_YEAR * 8;
  const canSolar = solarWindow
    && stats.stability > 42
    && (state.research < 0.95 || state.shipProgress < 0.85)
    && isEcologicallyViable(state)
    && (isPopulationStable(state) || state.stableMonths >= 36)
    && stats.total >= 250
    && state.populationDeclineMonths < 12
    && stats.resourceHealth > 0.28
    && state.stableMonths >= 24;

  if (state.phase === 2 && canSolar) {
    setEnding(state, 'solar', 'solar_stable', {
      stability: stats.stability,
      research: state.research,
      population: stats.total,
      resourceHealth: stats.resourceHealth,
    });
    return 'solar';
  }

  if (!state.gameOver && state.tick >= SIM_MAX_TICKS - 1) {
    if (stats.total >= 200 && isEcologicallyViable(state) && state.stableMonths >= 24) {
      setEnding(state, 'solar', 'solar_stable', {
        stability: stats.stability, research: state.research,
        population: stats.total, resourceHealth: stats.resourceHealth,
      });
      return 'solar';
    }
    if (stats.total <= 0) {
      setEnding(state, 'extinction', inferExtinctionCause(state, stats));
      return 'extinction';
    }
  }

  return null;
}

function simulateTick(state) {
  if (state.gameOver || state.pendingEvent) return state;

  state.tick++;
  checkPhaseTransition(state);
  tickCompartments(state);
  tickPops(state);
  applyDelayedModifiers(state);
  state.political = clamp(state.political + 0.02, 0, 100);
  archiveSnapshot(state);

  const events = getEligibleEvents(state);
  if (events.length) {
    const event = pick(events);
    if (state.gameMode === 'player') {
      queuePlayerEvent(state, event);
      return state;
    }
    resolveEvent(state, event);
  }

  if (state.gameMode !== 'player') {
    aiConsiderLaws(state);
    aiEmergencyProtocols(state);
    aiConsiderBuild(state);
  }
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

/** 统一推演入口：单局极速与批量共用，保证同人格结果一致 */
function runProfileSimulation(profile, maxTicks = SIM_MAX_TICKS) {
  const state = createInitialState(profile);
  fastForwardToEnd(state, maxTicks);
  return state;
}

function createPlayerState(baseId, seed) {
  return createInitialState({ gameMode: 'player', baseId, seed: seed ?? (Date.now() & 0xfffffff) });
}

async function runProfileSimulationAsync(profile, maxTicks = SIM_MAX_TICKS) {
  const state = createInitialState(profile);
  await fastForwardChunked(state, maxTicks);
  return state;
}

function analyzeContributingFactors(state) {
  const stats = aggregateStats(state);
  const factors = [];
  const init = state.archive.initial;

  if (init) {
    factors.push(`人口 初始 ${init.population} → 峰值 ${state.peakPopulation}（Y${state.peakPopulationYear}）→ 终局 ${stats.total}`);
    factors.push(`基因多样性 ${(init.diversity * 100).toFixed(0)}% → ${(stats.diversity * 100).toFixed(0)}%`);
    factors.push(`社会稳定 ${init.stability.toFixed(0)} → ${stats.stability.toFixed(0)} · 生态健康 ${(stats.resourceHealth * 100).toFixed(0)}%`);
  }

  if (state.peakPopulation > stats.total * 1.15) {
    const drop = ((1 - stats.total / state.peakPopulation) * 100).toFixed(0);
    factors.push(`人口自峰值萎缩 ${drop}%（${state.peakPopulation} → ${stats.total}）`);
  }

  if (state.resources.food <= 0) factors.push('终局食物储备归零，农业系统停摆');
  else if (state.resources.food < 20) factors.push(`终局食物储备偏低（${Math.floor(state.resources.food)}）`);
  if (state.resources.energy <= 0) factors.push('终局能源耗尽，舱室无法满负荷运转');
  if (state.resources.volatiles < 20) factors.push(`终局挥发物不足（${Math.floor(state.resources.volatiles)}）`);
  if (stats.morale < 40) factors.push(`士气低迷（均值 ${stats.morale.toFixed(0)}）`);
  if (stats.radical > 55) factors.push(`激进度过高（${stats.radical.toFixed(0)}），派系动荡`);
  if (state.populationDeclineMonths >= 6) factors.push(`连续 ${state.populationDeclineMonths} 个月人口净下降`);
  if (state.archive.laws.length > 5) factors.push(`经历 ${state.archive.laws.length} 次法律修订`);

  const crises = state.archive.milestones.filter(m => m.category === 'crisis');
  if (crises.length) factors.push(`记录 ${crises.length} 次危机事件`);

  if (state.endingCause?.event) {
    factors.push(`关键抉择：${state.endingCause.event} → ${state.endingCause.choice || ''}`);
  }

  return factors;
}

function buildStateChangeTable(state) {
  const rows = [];
  const init = state.archive.initial;
  const final = captureStateSnapshot(state);
  const stats = aggregateStats(state);

  if (init) {
    rows.push({
      label: '人口（初始）', initial: init.population, final: init.population, unit: '人', isAnchor: true,
    });
    rows.push({
      label: '人口（峰值）', initial: state.peakPopulation, final: state.peakPopulation,
      unit: `人 · Y${state.peakPopulationYear}`, isPeak: true,
    });
    rows.push({
      label: '人口（终局）', initial: init.population, final: final.population, unit: '人',
    });
    RESOURCES.forEach(r => {
      rows.push({
        label: RES_LABELS[r],
        initial: Math.floor(init.resources[r]),
        final: Math.floor(final.resources[r]),
        unit: '',
      });
    });
    rows.push({
      label: '科研进度',
      initial: (init.research * 100).toFixed(0) + '%',
      final: (final.research * 100).toFixed(0) + '%',
      unit: '',
      isText: true,
    });
    rows.push({
      label: '基因多样性',
      initial: (init.diversity * 100).toFixed(0) + '%',
      final: (final.diversity * 100).toFixed(0) + '%',
      unit: '',
      isText: true,
    });
    rows.push({
      label: '社会稳定',
      initial: init.stability.toFixed(0),
      final: final.stability.toFixed(0),
      unit: '',
      isText: true,
    });
    rows.push({
      label: '生态健康',
      initial: (calcResourceHealth({ resources: init.resources }, init.population) * 100).toFixed(0) + '%',
      final: (stats.resourceHealth * 100).toFixed(0) + '%',
      unit: '',
      isText: true,
    });
  }

  return rows;
}

function generateReport(state) {
  const stats = aggregateStats(state);
  const end = ENDINGS[state.ending] || ENDINGS.extinction;
  const causeId = state.endingCause?.id || 'population_zero';
  const cause = ENDING_CAUSES[causeId] || ENDING_CAUSES.population_zero;

  const decisions = state.archive.decisions.slice(-15).map(d => `  [${d.date}] ${d.summary}`).join('\n');
  const lawHistory = state.archive.laws.map(l =>
    `  [${l.date}] ${LAW_GROUPS[l.group].name}：${LAW_GROUPS[l.group].options[l.to].name}（${l.reason}）`
  ).join('\n');

  const timeline = state.archive.milestones.map(m => ({
    date: m.date,
    category: m.category,
    title: m.title,
    detail: m.detail,
  }));

  const snapshots = state.archive.snapshots;
  const chartData = {
    years: snapshots.map(s => s.year),
    population: snapshots.map(s => s.population ?? s.total ?? 0),
    food: snapshots.map(s => s.resources?.food ?? 0),
    stability: snapshots.map(s => s.stability ?? 0),
  };

  return {
    title: end.title,
    desc: end.desc,
    causeTitle: cause.title,
    causeDesc: cause.desc,
    contributingFactors: analyzeContributingFactors(state),
    stateChanges: buildStateChangeTable(state),
    timeline,
    chartData,
    years: getYear(state),
    population: stats.total,
    peakPopulation: state.peakPopulation,
    peakPopulationYear: state.peakPopulationYear,
    resourceHealth: (stats.resourceHealth * 100).toFixed(0) + '%',
    finalResources: { ...state.resources },
    diversity: (stats.diversity * 100).toFixed(1) + '%',
    stability: stats.stability.toFixed(1),
    research: (state.research * 100).toFixed(1) + '%',
    aiProfile: state.gameMode === 'player' ? '玩家执政' : AI_PROFILES[state.aiProfile].name,
    baseName: state.baseName || STARTING_BASES.frontier.name,
    simSeed: state.simSeed,
    phase: state.phase === 2 ? '太空纪元' : '地球纪元（未完结）',
    endingId: state.ending,
    decisions,
    lawHistory,
    finalLaws: Object.entries(state.laws).map(([g, k]) =>
      `${LAW_GROUPS[g].name}：${LAW_GROUPS[g].options[k].name}`
    ).join(' · '),
  };
}
