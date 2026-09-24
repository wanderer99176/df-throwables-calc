/** 干员 → 仅该干员道具 + 游戏内技能属性面板 */

import { LUNA_ARROW_OFFSET_DEG, LUNA_ARROW_V0, type ThrowParams } from './physics'

export type OperatorId = 'luna' | 'uluru' | 'shepherd' | 'weilong' | 'gu'
export type ThrowableKind = 'generic' | 'special'
export type BallisticModel = 'standard' | 'luna_arrow' | 'cruise_missile' | 'short_fuse'

export interface SkillStatRow {
  group: string
  name: string
  value: string
  note?: string
}

export interface ThrowableDef {
  id: string
  name: string
  kind: ThrowableKind
  model: BallisticModel
  blurb?: string
  /** 覆盖默认初速；不填则用手雷 27 */
  v0?: number
  /** 覆盖准星补角；电箭为 0，手雷默认 +7.5 */
  offsetDeg?: number
  /** 目标距离滑块建议上限（米） */
  targetMaxM?: number
  /** true=机制表可看，弹道反解尚未拟合 */
  ballisticPending?: boolean
  /** 落点效果圈文案（默认「杀伤半径」） */
  blastLabel?: string
  /** 引信总时长（秒）；无引信道具不填 */
  fuseS?: number
  /** 有效爆炸/伤害半径（米）；落点 &lt; 此值时可能自伤 */
  blastRadiusM?: number
  /** 拉环/拉栓声传播半径（米）；以抛出点为圆心，非爆点 */
  pinSoundRadiusM?: number
  /** 游戏内实际效果面板 */
  skillStats?: SkillStatRow[]
}

export interface TacticCard {
  title: string
  condition: string
  detail: string
}

export interface OperatorDef {
  id: OperatorId
  name: string
  throwables: ThrowableDef[]
  tactics: TacticCard[]
}

const SHARED_BALLISTIC_STATS: SkillStatRow[] = [
  { group: '时间/物理', name: '基础初速度 v₀', value: '27 m/s', note: '无位移离手初速' },
  { group: '时间/物理', name: '重力 g', value: '9.8 m/s²', note: '与投射表一致' },
  { group: '时间/物理', name: '隐藏仰角补角', value: '+7.5°', note: '实际抛角 θ = α + 7.5°' },
  { group: '时间/物理', name: '出手高度 h₀', value: '趴0.3 / 蹲1.0 / 站1.8 / 跳2.4', note: '随动作切换，米' },
  { group: '时间/物理', name: '前移叠速', value: '爬1.15 / 蹲2.3 / 站3.8', note: 'm/s，叠到水平初速' },
]

const LUNA_ARROW_MECH_STATS: SkillStatRow[] = [
  { group: '定位特点', name: '武器类型', value: '特殊技能箭矢', note: '侦察 / 电击控制' },
  { group: '机制属性', name: '充能时间', value: '50 s / 支', note: '沙发PTT 等社区测算口径' },
  { group: '机制属性', name: '出伤延迟', value: '0.33 s', note: '命中后开始结算伤害' },
  { group: '机制属性', name: '硬表持续时间', value: '3.5 s', note: '命中硬质表面后电场持续' },
  { group: '机制属性', name: '打断 / 沉默', value: '打断举箭 · 沉默 10s', note: '已击发电箭效果不因沉默失效；被动会因沉默/倒地失效' },
  { group: '爆炸伤害', name: '伤害范围', value: '半径 5 m', note: '落点水平圆；图上以落地为圆心' },
  { group: '爆炸伤害', name: '对角色伤害', value: '7 / 秒', note: '玩家' },
  { group: '爆炸伤害', name: '对 AI 伤害', value: '25 / 跳', note: '人机每跳' },
  {
    group: '爆炸伤害',
    name: '重伤（治疗减速）',
    value: '+46.2% 治疗道具时间',
    note: '离开电场约 1s 后失去重伤',
  },
  {
    group: '爆炸伤害',
    name: '腹部破坏',
    value: '电击 ≥3s',
    note: '扣 10 点血上限，并延长部分药品 0.2s',
  },
]

const LUNA_ARROW_TAP_BALLISTIC: SkillStatRow[] = [
  { group: '机制属性', name: '射击模式', value: '不蓄力 / 点射', note: '与蓄力抛物线不同' },
  { group: '机制属性', name: '准星补角', value: '0°', note: 'θ = α，无手雷 +7.5°' },
  { group: '时间/物理', name: '初速度 v₀', value: '≈45 m/s', note: '站立点射多点拟合暂定' },
  { group: '时间/物理', name: '重力 g', value: '9.8 m/s²', note: '无阻力抛物线' },
  { group: '时间/物理', name: '出手高度 h₀', value: '趴0.3 / 蹲1.0 / 站1.8 / 跳2.4', note: '沿用身位' },
  { group: '时间/物理', name: '仰角上限', value: '趴45° / 其余79.5°', note: '与手雷相同' },
  {
    group: '时间/物理',
    name: '拟合锚点（落点）',
    value: '10°≈70 · 15°≈106 · 74.5°≈112 · 79.5°≈77',
    note: '站立点射；平射/5°旧数据已弃用',
  },
  {
    group: '时间/物理',
    name: '飞行时间说明',
    value: '79.5°≈77m · 社区约 14s',
    note: '无阻力模型同锚点约 9s，偏短；高抛掐时以实战/社区秒表为准，仰角仍按落点表',
  },
  { group: '时间/物理', name: '引信', value: '无', note: '侧栏显飞行时间，非掐雷' },
]

const LUNA_ARROW_CHARGE_STATS: SkillStatRow[] = [
  ...LUNA_ARROW_MECH_STATS,
  { group: '机制属性', name: '射击模式', value: '蓄力满射', note: '抛物线与点射不同' },
  { group: '机制属性', name: '准星补角', value: '0°（预期）', note: '与点射相同读角习惯' },
  {
    group: '时间/物理',
    name: '弹道模型',
    value: '待补测',
    note: '满蓄落点表未拟合；请先用不蓄力算仰角',
  },
]

const LUNA_FRAG_STATS: SkillStatRow[] = [
  { group: '定位特点', name: '武器类型', value: '高爆发伤害投掷物', note: '伤害与引信把控为击杀关键' },
  { group: '机制属性', name: '最多储存', value: '2 颗', note: '露娜专属技能投掷物' },
  { group: '机制属性', name: '充能时间', value: '45 s', note: '使用后 CD 自动充能' },
  { group: '爆炸伤害', name: '有效爆炸半径', value: '8 m', note: '中心向外线性衰减' },
  { group: '爆炸伤害', name: '伤害区间', value: '1 ~ 110', note: '中心最高 110，边缘最低 1' },
  { group: '爆炸伤害', name: '被动联动', value: '敌方位置标记', note: '命中触发透视标记' },
  { group: '时间/物理', name: '引信总时长', value: '5.0 s', note: '拉栓即开始倒计时' },
  { group: '时间/物理', name: '拉栓/捏雷', value: '0.33 s', note: '极限捏雷约 4.7 s' },
  { group: '时间/物理', name: '空爆节点', value: '4.7 s', note: '飞行达 4.7s 可空中起爆' },
  { group: '时间/物理', name: '落地滑行/反弹', value: '0.3 s / +3 m', note: '未空爆时落地延伸' },
  ...SHARED_BALLISTIC_STATS,
  { group: '声音感知', name: '拉环声范围', value: '30 m', note: '受听力 Buff 影响' },
]

/** 露娜 5s 型手雷（通用弹道主算） */
const FRAG_5S: ThrowableDef = {
  id: 'frag-5s',
  name: '5s型手雷',
  kind: 'generic',
  model: 'standard',
  fuseS: 5,
  blastRadiusM: 8,
  pinSoundRadiusM: 30,
  blurb: '引信约 5s · v0=27 · 补角+7.5°',
  skillStats: LUNA_FRAG_STATS,
}

export const OPERATORS: OperatorDef[] = [
  {
    id: 'luna',
    name: '露娜',
    throwables: [
      FRAG_5S,
      {
        id: 'luna-arrow',
        name: '电击箭矢不蓄力',
        kind: 'special',
        model: 'luna_arrow',
        v0: LUNA_ARROW_V0,
        offsetDeg: LUNA_ARROW_OFFSET_DEG,
        targetMaxM: 180,
        blastRadiusM: 5,
        blastLabel: '伤害范围',
        blurb: '点射 v₀≈45 · 无补角 · 落点拟合暂定 · 高抛飞行社区约14s（模型偏短）',
        skillStats: [...LUNA_ARROW_MECH_STATS, ...LUNA_ARROW_TAP_BALLISTIC],
      },
      {
        id: 'luna-arrow-charge',
        name: '电击箭矢蓄力',
        kind: 'special',
        model: 'luna_arrow',
        ballisticPending: true,
        targetMaxM: 180,
        blastRadiusM: 5,
        blastLabel: '伤害范围',
        blurb: '蓄力弹道尚未拟合 · 仅机制表；请用不蓄力算仰角',
        skillStats: LUNA_ARROW_CHARGE_STATS,
      },
    ],
    tactics: [
      {
        title: '电击箭矢 · 不蓄力（暂定）',
        condition: 'v₀≈45 · 无补角 · 伤害圈 5m',
        detail:
          '以上方准星读 α；落点 10°≈70、15°≈106、74.5°≈112、79.5°≈77。高抛飞行社区约 14s。蓄力另选道具。',
      },
      {
        title: '电击箭矢 · 蓄力',
        condition: '弹道待测',
        detail: '机制同电箭；满蓄落点/初速未建模，勿用当前反解。',
      },
      {
        title: '72 米空爆 / 平弧',
        condition: '落地弹地关闭（默认）· 5s 手雷',
        detail: '掐雷落地即炸；趴满 45° 空爆，站立静止约 27° 落地，实战常用。',
      },
      {
        title: '75 米落地弹地',
        condition: '开启落地弹地 · 拉栓即投 · 5s 手雷',
        detail: '瞄准落地约 72m，反弹 +3m / 0.3s 至 75m；快捷 75m 会自动勾选。',
      },
      {
        title: '83 / 88～95 米',
        condition: '叠加速度 / 跳投 · 5s 手雷',
        detail: '蹲走 +2.3 或站走 +3.8；极限靠前跳，见动态方案表。',
      },
    ],
  },
  {
    id: 'uluru',
    name: '乌鲁鲁',
    throwables: [
      {
        id: 'molotov',
        name: '燃烧瓶',
        kind: 'special',
        model: 'standard',
        blurb: '触地燃烧 · 弹道同通用抛物线对照',
        skillStats: [
          { group: '定位特点', name: '武器类型', value: '燃烧瓶', note: '区域封锁 / 持续燃烧' },
          { group: '机制属性', name: '起爆方式', value: '触地即燃', note: '无空爆掐雷窗口' },
          { group: '爆炸伤害', name: '效果类型', value: '燃烧 Dot + 区域控制', note: '以游戏内面板为准' },
          ...SHARED_BALLISTIC_STATS,
          { group: '时间/物理', name: '引信', value: '无（触地）', note: '掐雷时间显示为 —' },
        ],
      },
    ],
    tactics: [
      {
        title: '72 米触地',
        condition: '趴下 45°',
        detail: '约 4.4s 落地起火。',
      },
      {
        title: '远距叠速',
        condition: '蹲走 / 站走',
        detail: '见同爆点多方案表。',
      },
    ],
  },
  {
    id: 'shepherd',
    name: '牧羊人',
    throwables: [
      {
        id: 'frag-2s',
        name: '2s型手雷',
        kind: 'generic',
        model: 'short_fuse',
        fuseS: 2,
        blastRadiusM: 8,
        blurb: '短引信约 2s · 弹道同通用抛物线，注意飞行窗口更短',
        skillStats: [
          { group: '定位特点', name: '武器类型', value: '短引信手雷', note: '近距快杀 / 窗口极短' },
          { group: '机制属性', name: '引信总时长', value: '2.0 s', note: '飞行必须明显短于 2s' },
          { group: '爆炸伤害', name: '伤害逻辑', value: '破片爆炸', note: '半径/数值以游戏面板为准' },
          ...SHARED_BALLISTIC_STATS,
          { group: '时间/物理', name: '实战要点', value: '优先低抛 / 叠速', note: '缩短飞行，避免空中超时' },
        ],
      },
    ],
    tactics: [
      {
        title: '近距快雷',
        condition: '飞行须 < 引信',
        detail: '优先低抛、叠速缩短飞行时间。',
      },
    ],
  },
  {
    id: 'weilong',
    name: '威龙',
    throwables: [
      {
        id: 'tiger-cannon',
        name: '虎蹲炮',
        kind: 'special',
        model: 'cruise_missile',
        blurb: '非抛物线主算式 · 角度/缝隙限定，尺子仅作仰角对照',
        skillStats: [
          { group: '定位特点', name: '武器类型', value: '虎蹲炮', note: '破口 / 穿缝特种火力' },
          { group: '机制属性', name: '使用限制', value: '缝隙 / 角度限定', note: '非自由抛物线投掷' },
          { group: '时间/物理', name: '弹道模型', value: '非抛物线主算', note: '本计算器仰角仅作读角对照' },
          { group: '时间/物理', name: '建议用法', value: '火控镜读角', note: '以游戏内弹着为准' },
        ],
      },
    ],
    tactics: [
      {
        title: '虎蹲炮读角',
        condition: '火控镜',
        detail: '以游戏内生效为准，本表仰角仅作参考。',
      },
    ],
  },
  {
    id: 'gu',
    name: '蛊',
    throwables: [
      {
        id: 'blind-smoke',
        name: '致盲烟',
        kind: 'special',
        model: 'standard',
        blurb: '弹道同通用抛物线对照',
        skillStats: [
          { group: '定位特点', name: '武器类型', value: '致盲烟', note: '视觉干扰 / 遮挡' },
          { group: '机制属性', name: '效果类型', value: '致盲 + 烟雾遮蔽', note: '以游戏内持续时长为准' },
          ...SHARED_BALLISTIC_STATS,
          { group: '时间/物理', name: '引信', value: '无（投放型）', note: '掐雷时间显示为 —' },
        ],
      },
    ],
    tactics: [
      {
        title: '72 米定点',
        condition: '多方案表',
        detail: '通用落点对照。',
      },
    ],
  },
]

export function getOperator(id: OperatorId): OperatorDef {
  return OPERATORS.find((o) => o.id === id) ?? OPERATORS[0]
}

export interface UniversalPreset {
  id: string
  title: string
  targetM: number
  note: string
}

export const UNIVERSAL_72: UniversalPreset[] = [
  { id: 'p72', title: '72m 标定点', targetM: 72, note: '关落地弹地 · 落地即炸' },
  { id: 'p75', title: '75m 落地弹地', targetM: 75, note: '自动开落地弹地 · 瞄 72 落' },
  { id: 'p83', title: '83m 远距压制', targetM: 83, note: '蹲走 / 站走' },
  { id: 'p90', title: '88～95m 极限', targetM: 90, note: '站走 / 前跳' },
]

/** 电击箭矢点射快捷距离（拟合暂定） */
export const ARROW_PRESETS: UniversalPreset[] = [
  { id: 'a70', title: '70m 点射', targetM: 70, note: '站立静止约 10°' },
  { id: 'a100', title: '100m 点射', targetM: 100, note: '约 15° 一带' },
  { id: 'a112', title: '112m 高抛', targetM: 112, note: '约 74.5° 实测锚点' },
  { id: 'a77', title: '77m 接近垂直', targetM: 77, note: '约 79.5° 满角' },
]

export function presetsForThrowable(th: ThrowableDef): UniversalPreset[] {
  if (th.model === 'luna_arrow' && !th.ballisticPending) return ARROW_PRESETS
  if (th.ballisticPending) return []
  return UNIVERSAL_72
}

/** 写入 ThrowParams 的弹道覆盖（未定义则沿用 physics 默认） */
export function ballisticOf(th: ThrowableDef): Pick<ThrowParams, 'v0' | 'offsetDeg'> {
  if (th.ballisticPending) return {}
  const out: Pick<ThrowParams, 'v0' | 'offsetDeg'> = {}
  if (th.v0 != null) out.v0 = th.v0
  if (th.offsetDeg != null) out.offsetDeg = th.offsetDeg
  return out
}
