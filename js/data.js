/**
 * 太空基地 Spacebase — 静态数据：法律、事件、舱室、AI人格、结局
 */

/** 构建版本号：更新资源缓存 */
const BUILD_VERSION = '20260812-law-pop-v3';

/** 聚变启航最低人口（低于此无法达成双星文明结局） */
const MIN_LAUNCH_POPULATION = 500;

const TICKS_PER_MONTH = 30;
const TICKS_PER_YEAR = 365;
const EARTH_COUNTDOWN_YEARS = 50;
const IMPACT_TICK = EARTH_COUNTDOWN_YEARS * TICKS_PER_YEAR;
/** 单局/批量/极速推演统一上限 */
const SIM_MAX_TICKS = 40000;

const RESOURCES = ['energy', 'food', 'ore', 'volatiles'];

const RES_LABELS = {
  energy: '能源', food: '食物', ore: '矿石', volatiles: '挥发物',
};

const PROFESSIONS = {
  eco_engineer: { name: '生态工程师', compartment: 'agriculture' },
  nuclear_ops: { name: '核运维', compartment: 'reactor' },
  miner: { name: '采矿技师', compartment: 'shipyard' },
  scholar: { name: '档案学者', compartment: 'lab' },
  medic: { name: '医护', compartment: 'medical' },
  admin: { name: '行政人员', compartment: 'immigration' },
  colonist: { name: '普通移民', compartment: null },
};

const COMPARTMENTS = {
  habitat: { name: '人居舱', slots: 0, buildCost: { ore: 5 }, capacity: 500 },
  agriculture: { name: '农业舱', slots: 3, buildCost: { ore: 8, volatiles: 3 }, output: { food: 5.5, energy: -1 } },
  reactor: { name: '裂变能源舱', slots: 2, buildCost: { ore: 12 }, output: { energy: 12, ore: -0.1 } },
  shipyard: { name: '小行星船坞', slots: 3, buildCost: { ore: 10, energy: 2 }, output: { ore: 3, energy: -2 } },
  lab: { name: '科研实验室', slots: 2, buildCost: { ore: 8, energy: 1 }, output: { energy: -1 } },
  medical: { name: '医疗舱', slots: 2, buildCost: { ore: 6, volatiles: 2 }, output: { energy: -1 } },
  archive: { name: '档案统计中心', slots: 1, buildCost: { ore: 4 }, output: { energy: -0.5 } },
  immigration: { name: '移民选拔中心', slots: 1, buildCost: { ore: 5 }, output: {}, earthOnly: true },
};

/** 维多利亚3式法律：每系互斥多选一 */
const LAW_GROUPS = {
  immigration: {
    name: '移民政策',
    options: {
      open: { name: '开放边境', diversity: 0.08, foodCost: 1.15, loyalty: -3, radical: 2 },
      selective: { name: '精英筛选', diversity: -0.04, skillBonus: 0.1, radical: 4 },
      quota: { name: '配额管制', diversity: 0.02, foodCost: 1.05 },
      closed: { name: '关闭边境', diversity: -0.1, loyalty: 5, radical: 6 },
    },
    default: 'quota',
  },
  labor: {
    name: '劳动体制',
    options: {
      standard: { name: '八小时制', morale: 5, output: 0.9 },
      shift: { name: '轮班加班', morale: -4, output: 1.15, deathRate: 1.1 },
      forced: { name: '强制劳动', morale: -12, output: 1.3, deathRate: 1.25, radical: 8 },
      merit: { name: '岗位竞聘', morale: -2, output: 1.05, skillMatch: 1.2 },
    },
    default: 'standard',
  },
  welfare: {
    name: '福利配给',
    options: {
      needs: { name: '按需分配', morale: 8, foodCost: 1.2 },
      ration: { name: '定额配给', morale: 0, foodCost: 1.0 },
      merit: { name: '功勋优先', morale: -5, foodCost: 0.95, scholarMorale: 10 },
      austerity: { name: '配给削减', morale: -10, foodCost: 0.8, radical: 10 },
    },
    default: 'ration',
  },
  genetics: {
    name: '基因伦理',
    options: {
      mandatory: { name: '强制筛查', diversityGain: 0.03, radical: 6, deathRate: 0.95 },
      voluntary: { name: '自愿原则', loyalty: 4, inbreedRisk: 1.15 },
      enhance: { name: '基因优化', skillBonus: 0.08, radical: 8, diversityGain: -0.02 },
      free: { name: '禁止干预', loyalty: 2, inbreedRisk: 1.25 },
    },
    default: 'voluntary',
  },
  governance: {
    name: '治理结构',
    options: {
      council: { name: '理事会共和', stability: 1.1, buildSpeed: 0.9 },
      technocrat: { name: '技术官僚', research: 1.2, morale: -3 },
      emergency: { name: '紧急状态', buildSpeed: 1.25, loyalty: -6, lawCost: 0.7 },
      federal: { name: '派系自治', stability: 0.85, schismRisk: 1.4 },
    },
    default: 'council',
  },
  economy: {
    name: '资源经济',
    options: {
      planned: { name: '计划经济', volatility: 0.8, morale: 2 },
      market: { name: '市场调剂', output: 1.1, volatility: 1.2 },
      voucher: { name: '配给券制', output: 1.05, eventRisk: 1.3 },
      wartime: { name: '战时共产主义', output: 1.2, morale: -8, foodCost: 0.85 },
    },
    default: 'planned',
  },
};

/** 开局太空基地模板（类 HOI4 选国家） */
const STARTING_BASES = {
  frontier: {
    name: '开拓者前哨站',
    code: 'Ω-1',
    tagline: '均衡存续',
    desc: '军民比例适中，资源储备均衡。推荐首次执政。',
    difficulty: '推荐',
    resources: { energy: 140, food: 180, ore: 80, volatiles: 120 },
    compartments: { habitat: 2, agriculture: 3, reactor: 3, shipyard: 1, lab: 1, medical: 1, archive: 1, immigration: 1 },
    popAdjust: {},
    laws: null,
  },
  industrial: {
    name: '小行星工业枢纽',
    code: 'Σ-7',
    tagline: '矿石能源',
    desc: '反应堆与船坞占优，农业偏弱。适合工业扩张路线。',
    difficulty: '中等',
    resources: { energy: 165, food: 115, ore: 130, volatiles: 95 },
    compartments: { habitat: 2, agriculture: 2, reactor: 4, shipyard: 2, lab: 1, medical: 1, archive: 1, immigration: 1 },
    popAdjust: { miner: 80, eco_engineer: -30 },
    laws: { economy: 'market', labor: 'shift' },
  },
  arboretum: {
    name: '生态方舟',
    code: 'Ψ-3',
    tagline: '农业闭环',
    desc: '农业舱与挥发物储备充足，医护编制强化。适合人道存续。',
    difficulty: '简单',
    resources: { energy: 115, food: 230, ore: 55, volatiles: 155 },
    compartments: { habitat: 2, agriculture: 4, reactor: 2, shipyard: 1, lab: 1, medical: 2, archive: 1, immigration: 1 },
    popAdjust: { eco_engineer: 50, medic: 40, miner: -40 },
    laws: { welfare: 'needs', immigration: 'selective' },
  },
  academy: {
    name: '科研先导站',
    code: 'Δ-9',
    tagline: '科技启航',
    desc: '实验室与学者占优，短期粮食紧张。适合星际远航结局。',
    difficulty: '困难',
    resources: { energy: 155, food: 95, ore: 75, volatiles: 105 },
    compartments: { habitat: 2, agriculture: 2, reactor: 3, shipyard: 1, lab: 3, medical: 1, archive: 2, immigration: 1 },
    popAdjust: { scholar: 70, colonist: -50 },
    laws: { governance: 'technocrat', genetics: 'mandatory' },
  },
};

const AI_PROFILES = {
  survival: {
    name: '生存优先',
    weights: { resources: 1.5, morale: 0.8, diversity: 0.6, research: 0.5, loyalty: 0.9, survival: 2.5 },
    economy: { food: 1.15, energy: 1.1, volatiles: 1.05 },
  },
  expansion: {
    name: '扩张优先',
    weights: { resources: 1.0, morale: 0.6, diversity: 0.7, research: 0.7, loyalty: 0.7, population: 1.4 },
    economy: { food: 1.0, energy: 1.05, buildOre: 0.85 },
  },
  humanitarian: {
    name: '人道主义',
    weights: { resources: 0.7, morale: 1.5, diversity: 1.2, research: 0.6, loyalty: 1.0 },
    economy: { food: 1.08, energy: 1.0, morale: 1.1 },
  },
  authoritarian: {
    name: '威权稳定',
    weights: { resources: 1.0, morale: 0.5, diversity: 0.4, research: 0.8, loyalty: 1.5, radical: -1.2, survival: 1.8 },
    economy: { food: 1.12, energy: 1.15, output: 1.1 },
  },
  technocrat: {
    name: '科技至上',
    weights: { resources: 0.9, morale: 0.6, diversity: 0.8, research: 1.6, loyalty: 0.8 },
    economy: { food: 0.95, energy: 1.15, research: 1.25 },
  },
};

const ENDINGS = {
  extinction: { title: '文明种子：熄灭', desc: '基地陷入死寂。档案记录的最后一条日志再未更新。' },
  solar: { title: '太阳系公民', desc: '人类在太阳系建立了可持续的太空文明，但未踏上星际航程。' },
  stellar: { title: '双星文明', desc: '聚变世代飞船驶向比邻星。太阳系母文明继续存续。' },
  schism: { title: '断裂的方舟', desc: '派系撕裂了殖民地。一艘低成功率核热飞船消失在深空。' },
};

/** 结局原因定义 */
const ENDING_CAUSES = {
  population_zero: {
    title: '人口灭绝',
    desc: '全部 Pop 实例人口归零，基地失去任何劳动力与延续可能。',
  },
  starvation: {
    title: '饥荒失控',
    desc: '食物产出长期低于消耗，营养不良引发死亡率超过出生率。',
  },
  volatiles_depleted: {
    title: '挥发物耗尽',
    desc: '水/氮等挥发物泄漏与消耗失衡，生态闭环彻底断裂。',
  },
  ecosystem_collapse: {
    title: '生态级联崩溃',
    desc: '食物与挥发物同时枯竭，农业舱与生命维持系统相继停摆。',
  },
  pre_impact_underpop: {
    title: '撞击前文明种子不足',
    desc: '小行星撞击后第一年内人口不足 500，联盟评估文明保存失败。',
  },
  social_collapse: {
    title: '社会体系崩溃',
    desc: '士气与忠诚度跌至临界点，激进派系瓦解生产秩序。',
  },
  solar_chosen: {
    title: '主动放弃星际远航',
    desc: 'AI 决策保留太阳系建设，拒绝发射世代飞船。',
  },
  solar_stable: {
    title: '太阳系自主存续达标',
    desc: '太空纪元 30 年后社会稳定、生态自持，未达远航科技门槛。',
  },
  stellar_launch: {
    title: '聚变世代飞船启航',
    desc: '科研达标且飞船建造完成，按基因与技能选拔乘员奔赴比邻星。',
  },
  schism_ntr: {
    title: '派系强行核热发射',
    desc: '激进派系绕过理事会，强行启动低成功率核热慢速世代飞船。',
  },
};

/** 玩家模式：仅 node:true 的事件会暂停并要求抉择 */
const PLAYER_AUTO_PROFILE = 'survival';

/** 事件库：AI 自动裁决；node:true 表示玩家模式关键节点 */
const EVENTS = [
  {
    id: 'node_y5_policy',
    title: '五年执政纲领',
    phase: 1,
    once: true,
    minYear: 5,
    node: true,
    text: '基地运转满五年。理事会要求你确立下一阶段优先方向——这将影响移民、劳动与资源策略。',
    choices: [
      { id: 'survival', label: '存续优先：收紧移民、保障粮储', effects: { law: { immigration: 'closed', welfare: 'austerity' } }, score: { resources: 2, survival: 2 } },
      { id: 'growth', label: '扩张优先：开放边境、加速建设', effects: { law: { immigration: 'open', labor: 'shift' } }, score: { population: 2, resources: 0.5 } },
      { id: 'balance', label: '均衡路线：维持配额、稳步发展', effects: { law: { immigration: 'quota', welfare: 'ration' }, political: 10 }, score: { loyalty: 1.5, morale: 1 } },
    ],
  },
  {
    id: 'last_quota',
    title: '最后配额',
    phase: 1,
    minYear: 42,
    once: true,
    node: true,
    text: '地球联盟通知：最后一艘移民船可载 300 人，或同吨位生命维持物资。',
    choices: [
      { id: 'people', label: '载移民', effects: { pop: 300, food: -20, diversity: 0.05 }, score: { population: 2, diversity: 1, resources: -1 } },
      { id: 'supplies', label: '载物资', effects: { food: 40, volatiles: 30, diversity: -0.08 }, score: { resources: 2, diversity: -1 } },
      { id: 'scrap', label: '拆船换矿石', effects: { ore: 50, immigrationClosed: true, radical: 15 }, score: { resources: 1.5, loyalty: -2 } },
    ],
  },
  {
    id: 'leak',
    title: '挥发物泄漏',
    text: '主储罐微裂，挥发物持续损耗。修复需停工三天。',
    trigger: { volatilesBelow: 60 },
    choices: [
      { id: 'repair', label: '停工抢修', effects: { volatiles: 20, outputPenalty: 0.5, duration: 3 }, score: { resources: 1.5 } },
      { id: 'reduce', label: '削减通风', effects: { morale: -15, volatiles: 5 }, score: { resources: 0.5, morale: -1 } },
      { id: 'ignore', label: '放任泄漏', effects: { leakRate: 1.5 }, score: { resources: -0.5 } },
    ],
  },
  {
    id: 'gene_dispute',
    title: '基因筛查争议',
    phase: 2,
    once: true,
    node: true,
    text: '医护要求强制筛查近亲婚配；宗教派系 Pop 抵制。',
    choices: [
      { id: 'force', label: '强制筛查', effects: { diversity: 0.04, radical: 20, law: { genetics: 'mandatory' } }, score: { diversity: 1.5, loyalty: -1 } },
      { id: 'voluntary', label: '维持自愿', effects: { loyalty: 8, inbreedRisk: 1.1 }, score: { loyalty: 1.2, diversity: -0.5 } },
      { id: 'purge', label: '驱逐抵制者', effects: { pop: -80, radical: -10, loyalty: -15 }, score: { loyalty: -2, population: -1 } },
    ],
  },
  {
    id: 'reactor',
    title: '反应堆异常',
    text: '裂变舱冷却棒异常，核运维申请紧急停堆检修。',
    choices: [
      { id: 'shutdown', label: '停堆检修', effects: { energy: -30, morale: 5, duration: 5 }, score: { resources: 0.5, morale: 0.5 } },
      { id: 'derate', label: '降功率维持', effects: { outputPenalty: 0.7, radiation: 5 }, score: { resources: 1 } },
      { id: 'push', label: '满功率硬撑', effects: { meltdownRisk: 0.3 }, score: { resources: 1.5, morale: -1, survival: -3 } },
    ],
  },
  {
    id: 'refugee',
    title: '轨道难民',
    phase: 1,
    once: true,
    minYear: 8,
    node: true,
    text: '一艘超载逃生舱请求对接。接纳将消耗大量挥发物。',
    choices: [
      { id: 'accept', label: '接纳难民', effects: { pop: 120, volatiles: -15, diversity: 0.03, morale: 5 }, score: { population: 1.5, diversity: 1, resources: -1 } },
      { id: 'reject', label: '拒绝停靠', effects: { morale: -12, loyalty: 3 }, score: { resources: 1, morale: -1.5 } },
      { id: 'select', label: '筛选接纳', effects: { pop: 50, volatiles: -8, radical: 5 }, score: { population: 0.8, resources: 0.3 } },
    ],
  },
  {
    id: 'food_riot',
    title: '配给骚乱',
    once: true,
    node: true,
    trigger: { moraleBelow: 35 },
    text: '食物储备不足引发舱段骚乱，激进派系煽动冲击仓库。',
    choices: [
      { id: 'extra', label: '增发配给', effects: { food: -25, morale: 15, radical: -10 }, score: { morale: 2, resources: -1.5 } },
      { id: 'suppress', label: '武力镇压', effects: { morale: -20, loyalty: 5, radical: 15, deathRate: 1.2 }, score: { loyalty: 1, morale: -2 } },
      { id: 'reform', label: '改革配给法', effects: { law: { welfare: 'needs' }, political: -15 }, score: { morale: 1.5, loyalty: 0.5 } },
    ],
  },
  {
    id: 'launch_decision',
    title: '是否发射？',
    phase: 2,
    once: true,
    node: true,
    trigger: { researchAbove: 0.95 },
    text: '聚变世代飞船完工，可载 40,000 人。当前总人口超过载客量。',
    choices: [
      { id: 'fusion', label: '选拔启航（聚变飞船）', effects: { ending: 'stellar' }, score: { research: 2, population: 0.5 } },
      { id: 'stay', label: '放弃远航', effects: { ending: 'solar' }, score: { loyalty: 1, morale: 1 } },
      { id: 'ntr', label: '激进派强行核热发射', effects: { ending: 'schism' }, score: { research: 0.5, loyalty: -2 } },
      { id: 'vote', label: '全民投票（耗时一年）', effects: { morale: -10, delay: 365 }, score: { loyalty: 1.5, morale: 0.5 } },
    ],
  },
  {
    id: 'ecosystem_collapse',
    title: '生态级联崩溃',
    once: true,
    node: true,
    trigger: { volatilesBelow: 10, foodBelow: 5 },
    text: '氧碳循环断裂，农业舱大面积枯死。',
    choices: [
      { id: 'emergency', label: '紧急封存舱段', effects: { pop: -200, food: 10, volatiles: 5 }, score: { resources: 1, population: -2 } },
      { id: 'ration_extreme', label: '极端配给', effects: { food: -5, morale: -25, deathRate: 1.5 }, score: { resources: -1, morale: -2 } },
    ],
  },
  {
    id: 'law_protest',
    title: '法案抵制',
    text: '新法案引发派系抗议，部分舱段停工。',
    choices: [
      { id: 'concede', label: '让步撤回', effects: { political: 10, morale: 8, radical: -8 }, score: { loyalty: 1.5, morale: 1 } },
      { id: 'enforce', label: '强制执行', effects: { loyalty: -10, radical: 12, outputPenalty: 0.6, duration: 10 }, score: { loyalty: -1, resources: 0.5 } },
      { id: 'negotiate', label: '派系谈判', effects: { political: -10, morale: 3, loyalty: 5 }, score: { loyalty: 1.2 } },
    ],
  },
  {
    id: 'earth_supply',
    title: '地球紧急补给',
    phase: 1,
    once: true,
    trigger: { foodBelow: 20, energyBelow: 15 },
    text: '地球联盟投送最后一批生存物资补给舱，这是存续协议的关键救援。',
    choices: [
      { id: 'accept', label: '接收补给', effects: { food: 80, energy: 50, volatiles: 40 }, score: { resources: 3 } },
    ],
  },
  {
    id: 'asteroid_volatiles',
    title: '小行星挥发物采集',
    phase: 2,
    trigger: { volatilesBelow: 40 },
    text: '采矿船坞从小行星冰核中提取挥发物，补充生态闭环储备。',
    choices: [
      { id: 'mine', label: '加大开采', effects: { volatiles: 25, energy: -10, ore: 8 }, score: { resources: 2 } },
      { id: 'steady', label: '稳态采集', effects: { volatiles: 15, energy: -5 }, score: { resources: 1.5, morale: 0.5 } },
    ],
  },
  {
    id: 'orbital_greenhouse',
    title: '轨道温室扩建',
    phase: 2,
    once: true,
    trigger: { foodBelow: 30 },
    text: '科研团队提出轨道温室方案，利用撞击后散落的小行星碎片搭建临时农业模块。',
    choices: [
      { id: 'build', label: '投入建设', effects: { food: 40, volatiles: -10, ore: -15 }, score: { resources: 2 } },
      { id: 'defer', label: '暂缓', effects: { morale: -5 }, score: { morale: -0.5 } },
    ],
  },
  {
    id: 'node_impact_briefing',
    title: '撞击后存续方针',
    phase: 2,
    once: true,
    minYear: 50,
    node: true,
    text: '地球毁灭，太空纪元开始。理事会必须在孤立状态下选定文明存续的总方针。',
    choices: [
      { id: 'solar_path', label: '太阳系自给：深耕基地闭环', effects: { food: 30, volatiles: 20, morale: 5 }, score: { resources: 2, loyalty: 1 } },
      { id: 'stellar_path', label: '星际远航：倾斜科研与船坞', effects: { research: 0.08, ore: 25, morale: -5 }, score: { research: 2 } },
      { id: 'consolidate', label: '收缩整顿：削减人口换稳定', effects: { pop: -150, food: 50, energy: 40, morale: 10 }, score: { survival: 2, morale: 1 } },
    ],
  },
  {
    id: 'radiation',
    title: '辐射泄漏',
    phase: 2,
    text: '裂变舱屏蔽层老化，微量辐射扩散至相邻人居舱段。',
    choices: [
      { id: 'shield', label: '投入矿石加固屏蔽', effects: { ore: -25, morale: 3 }, score: { resources: 1, morale: 0.5 } },
      { id: 'evacuate', label: '疏散舱段', effects: { pop: -60, morale: -8 }, score: { population: -1, morale: -0.5 } },
      { id: 'ignore', label: '维持运转', effects: { deathRate: 1.3, radical: 10 }, score: { resources: 1.5, morale: -1.5 } },
    ],
  },
  {
    id: 'mining_strike',
    title: '采矿舱罢工',
    trigger: { moraleBelow: 40 },
    text: '采矿技师 Pop 拒绝进入小行星船坞，抗议劳动法案。',
    choices: [
      { id: 'reform_labor', label: '修订劳动法案', effects: { law: { labor: 'standard' }, political: -12 }, score: { morale: 1.5, loyalty: 1 } },
      { id: 'crackdown', label: '强制复工', effects: { morale: -15, ore: 10, radical: 15 }, score: { loyalty: -1, resources: 1 } },
    ],
  },
];

/**
 * 法律演进序位（索引越大越「先进」）。
 * AI 立法只许沿序位前进；危机用紧急法令（modifiers）临时应对，不撤回法案。
 */
const LAW_PROGRESS_ORDER = {
  immigration: ['closed', 'quota', 'selective', 'open'],
  labor: ['forced', 'shift', 'standard', 'merit'],
  welfare: ['austerity', 'merit', 'ration', 'needs'],
  genetics: ['mandatory', 'enhance', 'voluntary', 'free'],
  governance: ['emergency', 'federal', 'council', 'technocrat'],
  economy: ['wartime', 'planned', 'voucher', 'market'],
};

/** AI 立法议程：条件满足时沿 LAW_PROGRESS_ORDER 推进一步 */
const LAW_REVISION_CANDIDATES = [
  { group: 'welfare', to: 'merit', when: { researchBelow: 0.35 }, profile: ['technocrat', 'survival'] },
  { group: 'welfare', to: 'needs', when: { moraleBelow: 42 }, profile: ['humanitarian'] },
  { group: 'welfare', to: 'ration', when: { phase: 2 }, profile: ['survival', 'authoritarian', 'expansion'] },
  { group: 'labor', to: 'shift', when: { energyBelow: 35 }, profile: ['survival', 'expansion', 'authoritarian'] },
  { group: 'labor', to: 'merit', when: { researchBelow: 0.55 }, profile: ['technocrat', 'expansion'] },
  { group: 'immigration', to: 'selective', when: { diversityBelow: 0.48 }, profile: ['technocrat', 'survival', 'authoritarian'] },
  { group: 'immigration', to: 'open', when: { diversityBelow: 0.38 }, profile: ['humanitarian', 'expansion'] },
  { group: 'genetics', to: 'mandatory', when: { diversityBelow: 0.42 }, profile: ['technocrat', 'survival'] },
  { group: 'genetics', to: 'enhance', when: { researchBelow: 0.65 }, profile: ['technocrat'] },
  { group: 'genetics', to: 'free', when: { moraleBelow: 38 }, profile: ['humanitarian'] },
  { group: 'governance', to: 'technocrat', when: { researchBelow: 0.48 }, profile: ['technocrat'] },
  { group: 'governance', to: 'emergency', when: { phase: 2 }, profile: ['authoritarian', 'survival'] },
  { group: 'governance', to: 'federal', when: { moraleBelow: 32 }, profile: ['humanitarian', 'expansion'] },
  { group: 'economy', to: 'voucher', when: { phase: 2 }, profile: ['expansion', 'humanitarian'] },
  { group: 'economy', to: 'wartime', when: { phase: 2, researchBelow: 0.25 }, profile: ['survival', 'authoritarian'] },
  { group: 'economy', to: 'market', when: { researchBelow: 0.75 }, profile: ['expansion', 'technocrat'] },
];

const GENE_GROUPS = ['A', 'B', 'C', 'D', 'E'];
const IDEOLOGIES = ['technocrat', 'faith', 'frontier', 'union'];
