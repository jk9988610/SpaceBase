/**
 * 星港余烬 - SpaceBase
 * 太空站生存文字游戏
 */

const ROLES = {
  engineer: { name: '工程师', desc: '修缮效率 +30%' },
  medic: { name: '医护员', desc: '治疗消耗 -1 药品' },
  scout: { name: '侦察兵', desc: '搜刮成功率 +20%' },
};

const SCAVENGE_LOCATIONS = [
  { id: 'cargo', name: '货运舱', risk: 0.2, loot: { food: [1, 3], water: [1, 2], scrap: [0, 2] } },
  { id: 'medbay', name: '医疗舱', risk: 0.35, loot: { medicine: [1, 3], water: [0, 1] } },
  { id: 'reactor', name: '反应堆区', risk: 0.5, loot: { scrap: [2, 4], oxygen: [0, 1] } },
  { id: 'comms', name: '通讯塔', risk: 0.4, loot: { scrap: [1, 2], food: [0, 1] }, special: 'signal' },
];

const DAY_EVENTS = [
  {
    id: 'refugee',
    title: '敲门声',
    text: '气闸外传来敲击声。监控显示一名受伤的平民漂浮在舱壁外，氧气即将耗尽。',
    choices: [
      { label: '打开气闸，接纳难民', effect: () => {
        addSurvivor('难民·艾拉', 'medic');
        modifyResource('food', -2);
        modifyResource('oxygen', -1);
        return '艾拉被拉了进来。她颤抖着道谢，承诺帮忙照料伤员。';
      }},
      { label: '无视信号，节省氧气', effect: () => {
        modifyAllMood(-15);
        return '通讯频道归于寂静。没有人再说话，但你能感到目光中的寒意。';
      }},
    ],
  },
  {
    id: 'leak',
    title: '管道破裂',
    text: '警报尖啸——主氧气管道出现裂缝，气体正在泄漏。',
    choices: [
      { label: '紧急封堵（消耗 2 废料）', cost: { scrap: 2 }, effect: () => '工程师用临时补丁封住了裂口，泄漏停止了。' },
      { label: '放任泄漏，节约材料', effect: () => {
        modifyResource('oxygen', -3);
        modifyAllMood(-10);
        return '氧气存量骤降。有人开始恐慌。';
      }},
    ],
  },
  {
    id: 'cache',
    title: '隐藏储藏',
    text: '修缮舱壁时，你发现了一个被封死的检修口，里面似乎有物资。',
    choices: [
      { label: '撬开检修口', effect: () => {
        modifyResource('food', rand(2, 4));
        modifyResource('water', rand(1, 3));
        return '罐头、水袋、还有半盒药品——像是有人刻意藏起来的。';
      }},
      { label: '封死入口，避免惊动结构', effect: () => '你选择了稳妥。也许错过什么，但至少舱体安全。' },
    ],
  },
  {
    id: 'fight',
    title: '内部冲突',
    text: '两名幸存者因为食物配给发生争执，其中一人推倒了另一人。',
    choices: [
      { label: '公平分配额外一份食物', cost: { food: 1 }, effect: () => {
        modifyAllMood(10);
        return '争端平息了。大家明白规则还在。';
      }},
      { label: '严厉警告，维持配给', effect: () => {
        modifyAllMood(-8);
        return '服从了，但怨气在蔓延。';
      }},
    ],
  },
  {
    id: 'signal',
    title: '微弱信号',
    text: '通讯阵列捕捉到一段断断续续的求救信号，来自附近一艘弃船。',
    choices: [
      { label: '记录坐标，准备搜刮', effect: () => {
        state.flags.derelict = true;
        return '坐标已锁定。今晚可以派人前往那艘弃船。';
      }},
      { label: '忽略信号，避免暴露位置', effect: () => '信号消失在静电中。安全，但孤独。' },
    ],
  },
];

const state = {
  day: 1,
  phase: 'day',
  resources: { oxygen: 10, food: 8, water: 8, medicine: 3, scrap: 5 },
  survivors: [],
  log: [],
  currentEvent: null,
  shelterMood: '紧张',
  gameOver: false,
  flags: {},
  actionsToday: 0,
  maxActionsPerDay: 3,
  scavengeTonight: null,
};

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function initSurvivors() {
  state.survivors = [
    createSurvivor('林远', 'engineer'),
    createSurvivor('苏晴', 'medic'),
    createSurvivor('陈默', 'scout'),
  ];
}

function createSurvivor(name, role) {
  return {
    id: Date.now() + Math.random(),
    name,
    role,
    health: 80,
    hunger: 30,
    mood: 60,
    alive: true,
    scavenging: false,
    sick: false,
  };
}

function addSurvivor(name, role) {
  if (state.survivors.filter(s => s.alive).length >= 5) return;
  state.survivors.push(createSurvivor(name, role));
}

function modifyResource(key, amount) {
  state.resources[key] = Math.max(0, state.resources[key] + amount);
}

function modifyAllMood(amount) {
  state.survivors.forEach(s => {
    if (s.alive) s.mood = clamp(s.mood + amount, 0, 100);
  });
  updateShelterMood();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function updateShelterMood() {
  const alive = state.survivors.filter(s => s.alive);
  if (!alive.length) return;
  const avg = alive.reduce((a, s) => a + s.mood, 0) / alive.length;
  if (avg >= 70) state.shelterMood = '稳定';
  else if (avg >= 45) state.shelterMood = '紧张';
  else if (avg >= 25) state.shelterMood = '绝望';
  else state.shelterMood = '崩溃边缘';
}

function addLog(text, type = '') {
  state.log.unshift({ text, type, day: state.day });
  if (state.log.length > 50) state.log.pop();
  renderLog();
}

function canAfford(cost) {
  if (!cost) return true;
  return Object.entries(cost).every(([k, v]) => state.resources[k] >= v);
}

function payCost(cost) {
  if (!cost) return;
  Object.entries(cost).forEach(([k, v]) => modifyResource(k, -v));
}

// ===== 游戏循环 =====

function startGame() {
  Object.assign(state, {
    day: 1,
    phase: 'day',
    resources: { oxygen: 10, food: 8, water: 8, medicine: 3, scrap: 5 },
    log: [],
    currentEvent: null,
    shelterMood: '紧张',
    gameOver: false,
    flags: {},
    actionsToday: 0,
    maxActionsPerDay: 3,
    scavengeTonight: null,
  });
  initSurvivors();
  showScreen('game-screen');
  addLog('第 1 天。轨道站 Ω-7 与外界失联。', 'important');
  setNarrative('气密舱', '红暗的应急灯照亮了幸存者的脸。远处舱段传来金属呻吟，像这座站仍在垂死挣扎。');
  render();
}

function endDay() {
  consumeDailyResources();
  processNightScavenge();
  checkDeaths();

  if (checkGameOver()) return;

  state.day++;
  state.phase = 'day';
  state.actionsToday = 0;
  state.scavengeTonight = null;
  state.currentEvent = null;

  addLog(`—— 第 ${state.day} 天 ——`, 'important');

  triggerRandomEvent();
  setNarrative('新的一天', `太阳从舷窗外掠过——如果那还算太阳的话。第 ${state.day} 天开始了。`);
  render();
}

function consumeDailyResources() {
  const alive = state.survivors.filter(s => s.alive);
  const count = alive.length;
  if (!count) return;

  modifyResource('oxygen', -count);
  modifyResource('food', -count);
  modifyResource('water', -count);

  alive.forEach(s => {
    s.hunger = clamp(s.hunger + 12, 0, 100);
    if (s.hunger > 70) {
      s.health = clamp(s.health - 8, 0, 100);
      s.mood = clamp(s.mood - 5, 0, 100);
    }
    if (s.sick) {
      s.health = clamp(s.health - 10, 0, 100);
    }
    if (state.resources.food < count) s.mood = clamp(s.mood - 10, 0, 100);
    if (state.resources.oxygen < count) {
      s.health = clamp(s.health - 15, 0, 100);
      s.mood = clamp(s.mood - 15, 0, 100);
    }
  });

  updateShelterMood();
  addLog(`消耗：氧气 -${count}，食物 -${count}，净水 -${count}`);
}

function processNightScavenge() {
  if (!state.scavengeTonight) return;

  const { survivor, location } = state.scavengeTonight;
  survivor.scavenging = false;

  if (!survivor.alive) return;

  const bonus = survivor.role === 'scout' ? 0.2 : 0;
  const success = Math.random() > (location.risk - bonus);

  if (success) {
    const loot = [];
    Object.entries(location.loot).forEach(([res, [min, max]]) => {
      const amount = rand(min, max);
      if (amount > 0) {
        modifyResource(res, amount);
        loot.push(`${resLabel(res)} +${amount}`);
      }
    });
    survivor.mood = clamp(survivor.mood + 8, 0, 100);
    addLog(`${survivor.name} 从${location.name}归来：${loot.join('，')}`, 'success');
  } else {
    const dmg = rand(15, 35);
    survivor.health = clamp(survivor.health - dmg, 0, 100);
    survivor.mood = clamp(survivor.mood - 12, 0, 100);
    if (Math.random() < 0.3) survivor.sick = true;
    addLog(`${survivor.name} 在${location.name}遇险，受伤 ${dmg}`, 'danger');
  }
}

function checkDeaths() {
  state.survivors.forEach(s => {
    if (s.alive && s.health <= 0) {
      s.alive = false;
      modifyAllMood(-20);
      addLog(`${s.name} 没能撑过这一夜。`, 'danger');
    }
  });
}

function checkGameOver() {
  const alive = state.survivors.filter(s => s.alive);
  if (!alive.length) {
    showEnd('全员阵亡', '轨道站陷入死寂。救援信号再未响起。');
    return true;
  }
  if (state.day >= 15 && state.flags.rescue) {
    showEnd('救援抵达', `在第 ${state.day} 天，救援舰队终于破开封锁。${alive.length} 名幸存者踏上了返航的舰船。`);
    return true;
  }
  if (state.resources.oxygen <= 0 && state.day > 3) {
    showEnd('氧气耗尽', '最后的警报熄灭。舱内陷入永恒的沉默。');
    return true;
  }
  return false;
}

function triggerRandomEvent() {
  if (Math.random() < 0.55) {
    const event = pick(DAY_EVENTS);
    state.currentEvent = event;
    setNarrative(event.title, event.text);
    renderEventChoices(event);
  }
}

// ===== 行动 =====

const DAY_ACTIONS = [
  {
    id: 'repair',
    name: '修缮气密舱',
    desc: '加固舱壁，减少泄漏',
    cost: { scrap: 1 },
    effect: () => {
      modifyResource('oxygen', 2);
      addLog('修缮完成，氧气存量恢复 +2', 'success');
      setNarrative('修缮', '废料被焊接在裂缝上。舱压稳定了，呼吸也轻快了些。');
    },
  },
  {
    id: 'cook',
    name: '配给食物',
    desc: '每人恢复心情',
    cost: { food: 1 },
    effect: () => {
      modifyAllMood(12);
      state.survivors.filter(s => s.alive).forEach(s => {
        s.hunger = clamp(s.hunger - 20, 0, 100);
      });
      addLog('一顿热食让士气回升', 'success');
      setNarrative('配给', '合成分解后飘出淡淡的香气。有人露出了久违的笑容。');
    },
  },
  {
    id: 'heal',
    name: '治疗伤员',
    desc: '恢复一名幸存者生命（医护员在场时免药品）',
    cost: null,
    effect: () => {
      const target = state.survivors.filter(s => s.alive && (s.health < 70 || s.sick))
        .sort((a, b) => a.health - b.health)[0];
      if (!target) {
        addLog('没有需要治疗的人');
        return false;
      }
      const hasMedic = state.survivors.some(s => s.alive && s.role === 'medic');
      if (!hasMedic && state.resources.medicine < 1) {
        addLog('药品不足');
        return false;
      }
      if (!hasMedic) modifyResource('medicine', -1);
      target.health = clamp(target.health + 25, 0, 100);
      target.sick = false;
      addLog(`${target.name} 接受治疗，生命恢复`, 'success');
      setNarrative('医疗舱', `${target.name} 的呼吸平稳下来。苏晴放下注射器，微微点头。`);
      return true;
    },
  },
  {
    id: 'craft',
    name: '制作滤水器',
    desc: '净水 +3',
    cost: { scrap: 2 },
    effect: () => {
      modifyResource('water', 3);
      addLog('滤水器运转，净水 +3', 'success');
      setNarrative('工坊', '冷凝水顺着自制滤芯滴落。每一滴都弥足珍贵。');
    },
  },
  {
    id: 'broadcast',
    name: '发送救援信号',
    desc: '需要 3 废料，累计 3 次可获救援',
    cost: { scrap: 3 },
    effect: () => {
      state.flags.signalCount = (state.flags.signalCount || 0) + 1;
      addLog(`救援信号已发送（${state.flags.signalCount}/3）`, 'important');
      if (state.flags.signalCount >= 3) {
        state.flags.rescue = true;
        addLog('收到回应！救援舰队正在路上！', 'success');
      }
      setNarrative('通讯塔', '信号穿越封锁线，射向深空。只能祈祷有人听见。');
    },
  },
];

function performAction(action) {
  if (state.phase !== 'day') return;
  if (state.currentEvent) return;
  if (state.actionsToday >= state.maxActionsPerDay) return;
  if (!canAfford(action.cost)) return;

  if (action.id === 'heal') {
    const target = state.survivors.filter(s => s.alive && (s.health < 70 || s.sick))[0];
    if (!target) return;
    const hasMedic = state.survivors.some(s => s.alive && s.role === 'medic');
    if (!hasMedic && state.resources.medicine < 1) return;
  }

  if (action.cost) payCost(action.cost);
  const result = action.effect();
  if (result === false) return;

  state.actionsToday++;
  render();
}

function startNightPhase() {
  state.phase = 'night';
  state.currentEvent = null;
  setNarrative('夜幕降临', '站体进入阴影区。应急灯转为幽蓝。该决定谁去危险的舱段了。');
  addLog('进入夜晚阶段');
  render();
}

function assignScavenge(survivor, location) {
  if (state.phase !== 'night') return;
  if (!survivor.alive || survivor.health < 30) return;

  state.scavengeTonight = { survivor, location };
  survivor.scavenging = true;
  addLog(`${survivor.name} 前往 ${location.name} 搜刮`);
  endDay();
}

function resolveEventChoice(choice) {
  if (!canAfford(choice.cost)) return;
  const eventTitle = state.currentEvent?.title;
  payCost(choice.cost);
  const result = choice.effect();
  const text = typeof result === 'string' ? result : '';
  if (text) {
    const el = document.getElementById('narrative-text');
    el.innerHTML += `<p>${text}</p>`;
  }
  state.currentEvent = null;
  document.getElementById('event-choices').innerHTML = '';
  addLog(`事件：${eventTitle || '已处理'}`, 'important');
  render();
  checkGameOver();
}

// ===== 渲染 =====

function resLabel(key) {
  const map = { oxygen: '氧气', food: '食物', water: '净水', medicine: '药品', scrap: '废料' };
  return map[key] || key;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showEnd(title, message) {
  state.gameOver = true;
  const alive = state.survivors.filter(s => s.alive).length;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-message').textContent = message;
  document.getElementById('end-stats').innerHTML =
    `存活 ${alive} 人 · 坚持 ${state.day} 天<br>` +
    `氧气 ${state.resources.oxygen} · 食物 ${state.resources.food} · 净水 ${state.resources.water}`;
  showScreen('end-screen');
}

function setNarrative(title, text) {
  document.getElementById('scene-title').textContent = title;
  document.getElementById('narrative-text').innerHTML = `<p>${text}</p>`;
}

function render() {
  document.getElementById('day-count').textContent = state.day;
  const phaseBadge = document.getElementById('phase-badge');
  phaseBadge.textContent = state.phase === 'day' ? '白昼' : '夜晚';
  phaseBadge.className = `phase-badge ${state.phase}`;

  Object.entries(state.resources).forEach(([key, val]) => {
    const el = document.getElementById(`res-${key}`);
    if (!el) return;
    el.textContent = val;
    const parent = el.closest('.resource');
    parent.classList.remove('low', 'critical');
    if (val <= 2) parent.classList.add('critical');
    else if (val <= 4) parent.classList.add('low');
  });

  document.getElementById('shelter-mood').textContent = `气氛：${state.shelterMood}`;
  renderSurvivors();
  renderActions();
}

function renderSurvivors() {
  const container = document.getElementById('survivors-list');
  container.innerHTML = state.survivors.map(s => {
    const role = ROLES[s.role];
    const status = !s.alive ? '已故' : s.scavenging ? '搜刮中...' : s.sick ? '患病' : s.health < 30 ? '重伤' : '';
    return `
      <div class="survivor-card ${!s.alive ? 'dead' : ''} ${s.scavenging ? 'scavenging' : ''}">
        <div class="survivor-name">${s.name}</div>
        <div class="survivor-role">${role.name} · ${role.desc}</div>
        <div class="stat-bars">
          ${statBar('生命', s.health, 'health')}
          ${statBar('饥饿', s.hunger, 'hunger')}
          ${statBar('心情', s.mood, 'mood')}
        </div>
        ${status ? `<div class="survivor-status">${status}</div>` : ''}
      </div>`;
  }).join('');
}

function statBar(label, value, type) {
  const cls = value <= 25 ? 'critical' : value <= 50 ? 'low' : '';
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <div class="stat-bar"><div class="stat-fill ${type} ${cls}" style="width:${value}%"></div></div>
      <span class="stat-value">${value}</span>
    </div>`;
}

function renderActions() {
  const container = document.getElementById('actions-list');
  const nightNote = document.getElementById('night-note');
  container.innerHTML = '';

  if (state.currentEvent) {
    nightNote.hidden = true;
    return;
  }

  if (state.phase === 'day') {
    nightNote.hidden = true;
    DAY_ACTIONS.forEach(action => {
      const affordable = canAfford(action.cost);
      const disabled = !affordable || state.actionsToday >= state.maxActionsPerDay;
      const costStr = action.cost
        ? Object.entries(action.cost).map(([k, v]) => `${resLabel(k)} ${v}`).join(' · ')
        : '';
      const btn = document.createElement('button');
      btn.className = 'btn btn-action';
      btn.disabled = disabled;
      btn.innerHTML = `<span>${action.name}</span><span class="action-cost">${costStr}</span><span class="action-desc">${action.desc}</span>`;
      btn.onclick = () => performAction(action);
      container.appendChild(btn);
    });

    const endBtn = document.createElement('button');
    endBtn.className = 'btn btn-action btn-scavenge';
    endBtn.innerHTML = `<span>结束白天 → 进入夜晚</span><span class="action-desc">消耗每日资源，执行搜刮</span>`;
    endBtn.onclick = () => startNightPhase();
    container.appendChild(endBtn);
  } else {
    nightNote.hidden = false;
    const alive = state.survivors.filter(s => s.alive && !s.scavenging);
    alive.forEach(survivor => {
      SCAVENGE_LOCATIONS.forEach(loc => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-action btn-scavenge';
        btn.disabled = survivor.health < 30;
        const riskLabel = loc.risk <= 0.25 ? '低' : loc.risk <= 0.4 ? '中' : '高';
        btn.innerHTML = `<span>${survivor.name} → ${loc.name}</span><span class="action-cost">风险：${riskLabel}</span>`;
        btn.onclick = () => assignScavenge(survivor, loc);
        container.appendChild(btn);
      });
    });
  }
}

function renderEventChoices(event) {
  const container = document.getElementById('event-choices');
  container.innerHTML = '';
  event.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-choice';
    const costStr = choice.cost
      ? '（' + Object.entries(choice.cost).map(([k, v]) => `${resLabel(k)} -${v}`).join('，') + '）'
      : '';
    btn.textContent = choice.label + costStr;
    btn.disabled = !canAfford(choice.cost);
    btn.onclick = () => resolveEventChoice(choice);
    container.appendChild(btn);
  });
}

function renderLog() {
  const container = document.getElementById('log-entries');
  container.innerHTML = state.log.map(e =>
    `<div class="log-entry ${e.type}">[D${e.day}] ${e.text}</div>`
  ).join('');
}

// ===== 初始化 =====
document.getElementById('btn-start').onclick = startGame;
document.getElementById('btn-restart').onclick = () => {
  showScreen('start-screen');
};
