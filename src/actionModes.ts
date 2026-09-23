/** 动作与移动状态（身位 + 是否前移/跳投） */

export type ActionModeId =
  | 'stand_still'
  | 'crouch_still'
  | 'prone_still'
  | 'stand_move'
  | 'crouch_move'
  | 'prone_move'
  | 'jump_still'
  | 'jump_move'
  | 'jump_run'

export type StanceLabel = '站立' | '蹲姿' | '趴下'
export type MotionLabel = '静止' | '向前移动' | '原地起跳' | '向前走跳' | '向前跑跳'

export interface ActionModeDef {
  id: ActionModeId
  group: 'still' | 'move' | 'jump'
  /** 姿态列 */
  stance: StanceLabel
  /** 移动/动作状态列 */
  motion: MotionLabel
  /** 左侧芯片短标题 */
  title: string
  detail: string
  h0: number
  vMove: number
  maxAlpha: number
}

/** 趴爬实测约 1.1～1.2，取 1.15 */
export const V_MOVE_PRONE = 1.15
export const V_MOVE_CROUCH = 2.3
export const V_MOVE_STAND = 3.8
/** 站姿冲刺叠跳（约值，高于走跳） */
export const V_MOVE_RUN = 5.5

export const H0_PRONE = 0.3
export const H0_CROUCH = 1.0
export const H0_STAND = 1.8
export const H0_JUMP = 2.4

export const ACTION_MODES: ActionModeDef[] = [
  {
    id: 'stand_still',
    group: 'still',
    stance: '站立',
    motion: '静止',
    title: '站立静止',
    detail: '原地站立投掷 · v=0 · h=1.8m',
    h0: H0_STAND,
    vMove: 0,
    maxAlpha: 79.5,
  },
  {
    id: 'crouch_still',
    group: 'still',
    stance: '蹲姿',
    motion: '静止',
    title: '蹲姿静止',
    detail: '原地蹲姿投掷 · v=0 · h=1.0m',
    h0: H0_CROUCH,
    vMove: 0,
    maxAlpha: 79.5,
  },
  {
    id: 'prone_still',
    group: 'still',
    stance: '趴下',
    motion: '静止',
    title: '趴下静止',
    detail: '原地趴下投掷 · v=0 · h=0.3m',
    h0: H0_PRONE,
    vMove: 0,
    maxAlpha: 45,
  },
  {
    id: 'stand_move',
    group: 'move',
    stance: '站立',
    motion: '向前移动',
    title: '站立向前',
    detail: '站立前走投掷 · +3.8 m/s · h=1.8m',
    h0: H0_STAND,
    vMove: V_MOVE_STAND,
    maxAlpha: 79.5,
  },
  {
    id: 'crouch_move',
    group: 'move',
    stance: '蹲姿',
    motion: '向前移动',
    title: '蹲姿向前',
    detail: '蹲走投掷 · +2.3 m/s · h=1.0m',
    h0: H0_CROUCH,
    vMove: V_MOVE_CROUCH,
    maxAlpha: 79.5,
  },
  {
    id: 'prone_move',
    group: 'move',
    stance: '趴下',
    motion: '向前移动',
    title: '趴下向前',
    detail: '匍匐爬行投掷 · +1.15 m/s · h=0.3m',
    h0: H0_PRONE,
    vMove: V_MOVE_PRONE,
    maxAlpha: 45,
  },
  {
    id: 'jump_still',
    group: 'jump',
    stance: '站立',
    motion: '原地起跳',
    title: '原地跳投',
    detail: '原地起跳高度补偿 · v≈0 · h=2.4m',
    h0: H0_JUMP,
    vMove: 0,
    maxAlpha: 79.5,
  },
  {
    id: 'jump_move',
    group: 'jump',
    stance: '站立',
    motion: '向前走跳',
    title: '向前走跳',
    detail: '走跳叠初速 · +3.8 m/s · h=2.4m',
    h0: H0_JUMP,
    vMove: V_MOVE_STAND,
    maxAlpha: 79.5,
  },
  {
    id: 'jump_run',
    group: 'jump',
    stance: '站立',
    motion: '向前跑跳',
    title: '向前跑跳',
    detail: '跑跳叠冲刺初速 · +5.5 m/s · h=2.4m',
    h0: H0_JUMP,
    vMove: V_MOVE_RUN,
    maxAlpha: 79.5,
  },
]

export function getActionMode(id: ActionModeId): ActionModeDef {
  return ACTION_MODES.find((m) => m.id === id) ?? ACTION_MODES[0]
}

export const GROUP_LABEL: Record<ActionModeDef['group'], string> = {
  still: '静止状态',
  move: '向前位移',
  jump: '动态起跳',
}
