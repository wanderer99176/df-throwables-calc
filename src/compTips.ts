/** 参数区感叹号说明（顶栏不再铺补偿条） */

export interface CompTip {
  id: string
  label: string
  value: string
  detail: string
}

export const COMPENSATION_TIPS: CompTip[] = [
  {
    id: 'range',
    label: '目标距离 R',
    value: '水平距离 (m)',
    detail:
      '此处 R 按水平距离输入。若游戏测距是斜距（斜边），先换算：水平距离 = √(斜距² − Δh²)。',
  },
  {
    id: 'deltaH',
    label: '高低差 Δh',
    value: '目标相对高度 (m)',
    detail:
      'Δh 是目标相对出手点的高度差，直接进入落点方程。正值=目标更高。它不是「再给趴姿加 0.3」——趴姿的 0.3m 已在出手高度 h₀ 里。',
  },
  {
    id: 'offset',
    label: '视角补偿 · 出手高度',
    value: 'θ=α+7.5° · h₀ 随动作',
    detail:
      '【视角补偿】准星 α 不是物理抛角，计算用 θ=α+7.5°（各身位相同）。趴下视角上限约 45°，站/蹲/跳约 79.5°。\n\n【出手高度 h₀】趴 0.3 m · 蹲 1.0 m · 站 1.8 m · 跳约 2.4 m，随左侧所选动作切换。站立静止打 72m 约 27°；趴满 45° 约 72m。',
  },
  {
    id: 'vmov',
    label: '向前位移叠速',
    value: '趴爬 1.15 · 蹲走 2.3 · 站走 3.8',
    detail:
      '仅「向前位移 / 向前跳投」会叠加速度（单位 m/s）：趴着爬行 +1.15，蹲着走 +2.3，站着走 +3.8；静止与原地跳投为 0。公式：水平速度 = v₀·cosθ + v_move。',
  },
]

export function getCompTip(id: string): CompTip | undefined {
  return COMPENSATION_TIPS.find((t) => t.id === id)
}
