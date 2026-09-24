/** 地图射程圈：各动作最大水平射程（平射 Δh=0） */

import { type ActionModeId } from './actionModes'
import { findMaxRangeAngle, type ThrowParams } from './physics'

export interface MapRingLayer {
  id: string
  /** 对应动作 */
  actionId: ActionModeId
  label: string
  /** 描边色 */
  stroke: string
  /** 填充色 */
  fill: string
  /** 是否默认显示 */
  defaultOn: boolean
}

/** 默认静止；蹲姿 / 跳投可选叠加 */
export const MAP_RING_LAYERS: MapRingLayer[] = [
  {
    id: 'still',
    actionId: 'stand_still',
    label: '站立静止',
    stroke: 'rgba(109, 255, 154, 0.95)',
    fill: 'rgba(109, 255, 154, 0.08)',
    defaultOn: true,
  },
  {
    id: 'crouch',
    actionId: 'crouch_move',
    label: '蹲姿向前',
    stroke: 'rgba(255, 196, 72, 0.95)',
    fill: 'rgba(255, 196, 72, 0.07)',
    defaultOn: false,
  },
  {
    id: 'jump',
    actionId: 'jump_move',
    label: '向前跳投',
    stroke: 'rgba(255, 120, 90, 0.95)',
    fill: 'rgba(255, 120, 90, 0.07)',
    defaultOn: false,
  },
]

export function maxRangeForAction(
  actionId: ActionModeId,
  deltaH = 0,
  ballistic: Pick<ThrowParams, 'v0' | 'offsetDeg'> = {},
): { rangeM: number; alpha: number } {
  const params: ThrowParams = {
    actionId,
    heightMode: 'action',
    deltaH,
    ...ballistic,
  }
  const { alpha, result } = findMaxRangeAngle(params)
  return { rangeM: result.range, alpha }
}
