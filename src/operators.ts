/** 干员 → 仅该干员道具 + 游戏内技能属性面板 */

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
  /** 引信总时长（秒）；无引信道具不填 */
  fuseS?: number
  /** 有效爆炸半径（米）；落点 &lt; 此值时可能自伤 */
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
        name: '电击箭矢',
        kind: 'special',
        model: 'luna_arrow',
        blurb: '站立拉满约 77m（不蓄力）',
        skillStats: [
          { group: '定位特点', name: '武器类型', value: '特殊技能箭矢', note: '侦察 / 电击控制' },
          { group: '机制属性', name: '站立拉满射程', value: '约 77 m', note: '不蓄力口径' },
          { group: '时间/物理', name: '弹道模型', value: '特殊算式', note: '非手雷主算，尺子仰角仅对照' },
          { group: '时间/物理', name: '隐藏仰角补角', value: '+7.5°（参考）', note: '若沿用通用读角习惯' },
        ],
      },
    ],
    tactics: [
      {
        title: '72 米空爆 / 平弧',
        condition: '落地弹地关闭（默认）',
        detail: '掐雷落地即炸；趴满 45° 空爆，站立静止约 27° 落地，实战常用。',
      },
      {
        title: '75 米落地弹地',
        condition: '开启落地弹地 · 拉栓即投',
        detail: '瞄准落地约 72m，反弹 +3m / 0.3s 至 75m；快捷 75m 会自动勾选。',
      },
      {
        title: '83 / 88～95 米',
        condition: '叠加速度 / 跳投',
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
